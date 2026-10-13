import { randomUUID } from 'node:crypto';
import {
  CODIGO_CATEGORIA_NO_DISPONIBLE,
  CONFIG_DOMINIO,
  coordenadaPublica,
  normalizarReporteCrear,
  ReporteFiltrosSchema,
} from 'contracts';
import type { FastifyInstance } from 'fastify';
import { type Dependencias, registroDe } from '../app.js';
import { requerirRol } from '../auth.js';
import { cacheDeListadoPublico } from '../cache.js';
import { categoriaPanel, categoriaPublica, limiteReportesDe } from '../categorias.js';
import { listarReportes, MAX_OFFSET, obtenerReporte, reportesDelAutor } from '../consultas.js';
import { reservarTurnoDeReporte } from '../cuota.js';
import { IdReporteParam, resolverIdReporte } from '../id-reporte.js';
import {
  anotarResultado,
  ClaveIdempotenciaSchema,
  claveDeCuenta,
  huellaDePayload,
  reclamarClave,
} from '../idempotencia.js';
import { ipHashDiario } from '../privacidad.js';
import { revisarDispositivo } from '../ubicacion-dispositivo.js';
import { condicionPublicado, condicionPublico } from '../visibilidad.js';
import { aFeature, vistaMiReporte, vistaPublica, vistaTecnica } from '../vistas.js';

/** Ventana en la que una `objeto_key` recién subida puede asociarse a un reporte. */
export const HORAS_VALIDEZ_FOTO = 24;

/**
 * Tope de tamaño del `detalle`, igual al CHECK `detalle_tope` de la migración 0020
 * (`packages/db/migraciones/0020_base_multicategoria.sql`: `octet_length(detalle::text) <= 8192`).
 * `contracts` no exporta la constante, así que vive acá citando el CHECK; si algún día la exporta, se
 * reemplaza por esa.
 */
const DETALLE_TOPE_BYTES = 8192;

/**
 * El mismo 400 para el `detalle` demasiado grande, lo detecte la comprobación previa
 * (`JSON.stringify`) o el CHECK `detalle_tope` dentro de la transacción (sobre `detalle::text`, que
 * agrega espacios de separador y puede superar el tope aunque el `JSON.stringify` no lo haga). Se
 * comparte para que las dos salidas sean idénticas.
 */
const RESPUESTA_DETALLE_GRANDE = {
  codigo: 'PAYLOAD_INVALIDO',
  mensaje: 'Revisá los datos del reporte.',
  detalles: [
    { campo: 'detalle', mensaje: `El detalle supera el tope de ${DETALLE_TOPE_BYTES} bytes.` },
  ],
} as const;

export function esTecnico(rol: string | undefined) {
  return rol === 'tecnico' || rol === 'admin';
}

export async function rutasReportes(app: FastifyInstance, dep: Dependencias) {
  /*
   * ───────────────────────────── Creación de reportes ─────────────────────────────
   *
   * Exige cuenta desde la Fase 5. El mapa NO: ver, navegar y consultar siguen siendo públicos
   * (ver más abajo). Lo que cambia es escribir.
   *
   * Por qué. El único freno que había era por IP, y una IP doméstica o móvil cambia sola: modo
   * avión y de vuelta, y el contador empieza de cero. Sin una identidad estable no hay nada a lo
   * que aplicar un límite que signifique algo. Con cuenta, el límite es de la persona y no de la
   * conexión, y crear cuentas también cuesta (freno por IP en /auth/registro).
   *
   * `requerirRol` con los tres roles = «cualquier sesión válida». No se escribe como «si hay
   * usuario» a propósito: así la lista de roles admitidos está escrita, y añadir un rol nuevo en
   * el futuro obliga a decidir explícitamente si puede reportar.
   */
  app.post(
    '/api/v1/reportes',
    {
      config: { rateLimit: { max: dep.cfg.rateLimitMax, timeWindow: dep.cfg.rateLimitVentanaMs } },
      preHandler: requerirRol('ciudadano', 'tecnico', 'admin', 'ejecutivo'),
    },
    async (req, res) => {
      // `requerirRol` ya cortó si no hay sesión; esto es para el compilador y por si alguien
      // reordena los hooks en el futuro y se lleva la comprobación por delante.
      const autor = req.usuario;
      if (!autor)
        return res
          .status(401)
          .send({ codigo: 'SIN_SESION', mensaje: 'Iniciá sesión para enviar un reporte.' });
      /*
       * Dos formas de entrada (0.20.0, ADR 0010, 0012): la PLANA de hoy (= inundación) y la NUEVA
       * `{ …núcleo, categoria, subtipo?, detalle }`. `normalizarReporteCrear` valida el núcleo con
       * el mismo Zod de siempre y deja todo en la forma por categoría; el `detalle` se valida
       * después, con el Zod ESTRICTO de la definición. La forma plana crea una inundación idéntica
       * a la de hoy.
       */
      const norm = normalizarReporteCrear(req.body);
      if (!norm.resultado.exito) {
        return res.status(400).send({
          codigo: 'PAYLOAD_INVALIDO',
          mensaje: 'Revisá los datos del reporte.',
          detalles: norm.resultado.error.issues.map((i) => ({
            campo: i.path.join('.'),
            mensaje: i.message,
          })),
        });
      }
      const datos = norm.resultado.datos;
      /*
       * Categoría: un valor desconocido queda en `null` al normalizar, y una categoría conocida
       * puede estar inactiva en el catálogo. Las dos dan 422 CATEGORIA_NO_DISPONIBLE ANTES de
       * resolver la ubicación y ANTES de gastar cupo (CA5). El contrato no valida la actividad: la
       * decide el catálogo (`app.categorias`).
       */
      const slug = datos.categoria;
      if (slug === null || !(await app.categorias.estaActiva(slug)))
        return res.status(422).send({
          codigo: CODIGO_CATEGORIA_NO_DISPONIBLE,
          mensaje: 'Esa categoría no está disponible para reportar.',
        });
      const registro = registroDe(dep);
      // Activa ⇒ tiene definición en el registro: `estaActiva` exige catálogo ∩ registro (regla 3).
      const def = registro.obtener(slug)!;
      /*
       * El `detalle` con el Zod ESTRICTO de la categoría: una clave de más o un valor fuera de
       * rango dan 400 con el mismo código de validación de siempre (PAYLOAD_INVALIDO); la base suma
       * el CHECK de objeto y el tope de 8192 bytes. Para inundación, `DetalleInundacionSchema`.
       */
      const pd = def.esquemaDetalle.safeParse(datos.detalle);
      if (!pd.success)
        return res.status(400).send({
          codigo: 'PAYLOAD_INVALIDO',
          mensaje: 'Revisá los datos del reporte.',
          detalles: pd.error.issues.map((i) => ({
            campo: `detalle.${i.path.join('.')}`,
            mensaje: i.message,
          })),
        });
      // El registro es heterogéneo (`DefinicionCategoriaCualquiera`, detalle `any`): el detalle
      // validado se maneja como objeto genérico para el INSERT y la severidad.
      const detalle = pd.data as Record<string, unknown>;
      /*
       * Tope de tamaño del `detalle`: el Zod de la categoría acota la FORMA, pero no el largo de un
       * texto libre. Sin esto, un `detalle` que supera el tope hace saltar el CHECK `detalle_tope`
       * DENTRO de la transacción del INSERT y la ruta responde 500. Se mide ACÁ —junto a la
       * validación del detalle y ANTES del PIP y del cupo— para devolver el mismo 400 PAYLOAD_INVALIDO
       * que el resto de la ruta sin gastar una llamada a geo-service ni un turno de la cuenta (CA5).
       * Se mide el JSON que se guarda (`JSON.stringify(detalle)`, lo mismo que va al INSERT); el CHECK
       * lo remide sobre `detalle::text`, que solo agrega espacios de separador, así que la diferencia
       * es de pocos bytes lejos del tope. El borde (JSON ≤ tope pero jsonb > tope) lo cierra el
       * CHECK `detalle_tope`, traducido también a este 400 en el catch del INSERT.
       */
      if (Buffer.byteLength(JSON.stringify(detalle), 'utf8') > DETALLE_TOPE_BYTES)
        return res.status(400).send(RESPUESTA_DETALLE_GRANDE);
      /*
       * La posición del teléfono (contracts 0.9.0). `dispositivo` no se usa más allá de esta
       * comprobación: no llega a la fila, ni a la auditoría, ni a la huella de idempotencia, ni al
       * log (§0 regla 8). El resto del núcleo (lat, lon, ubicacion_tipo…) va en `d`.
       */
      const { dispositivo, ...d } = datos;
      const ubicacion = revisarDispositivo(d, dispositivo, { aproximada: d.ubicacion_aproximada });
      if (!ubicacion.ok) {
        app.metricas.contar('curichi_reportes_fuera_de_radio_total', { codigo: ubicacion.codigo });
        // Solo el código y las cifras que se devuelven: ninguna coordenada.
        req.log.info(
          { codigo: ubicacion.codigo, detalles: ubicacion.detalles },
          'reporte rechazado por la ubicación del dispositivo',
        );
        return res.status(422).send({
          codigo: ubicacion.codigo,
          mensaje: ubicacion.mensaje,
          detalles: ubicacion.detalles,
        });
      }
      const geo = await dep.resolver.resolver(d.lat, d.lon, req.requestId);
      if (!geo.dentro_cobertura || !geo.unidad_vecinal || !geo.distrito) {
        return res.status(422).send({
          codigo: 'FUERA_DE_COBERTURA',
          mensaje:
            'Ese punto queda fuera del área del municipio o no cae en ninguna unidad vecinal.',
          detalles: geo,
        });
      }
      // Clave de idempotencia: opcional, para no romper a clientes que no la manden.
      const cabecera = req.headers['idempotency-key'];
      const clave = ClaveIdempotenciaSchema.safeParse(
        Array.isArray(cabecera) ? cabecera[0] : cabecera,
      );
      if (cabecera !== undefined && !clave.success)
        return res.status(400).send({
          codigo: 'CLAVE_IDEMPOTENCIA_INVALIDA',
          mensaje: 'La cabecera Idempotency-Key no tiene un formato aceptable.',
        });
      // Sin `dispositivo`: un reintento del mismo envío relee el GPS (otra antigüedad, otra
      // lectura) y tiene que devolver el mismo reporte, no un 409 por «otro contenido». `d` incluye
      // `categoria`, `subtipo` y `detalle`, así que la huella distingue envíos de categorías o
      // detalles distintos (idempotencia por categoría).
      const huella = huellaDePayload(d);

      // Severidad de la definición de la categoría (puntaje, banda y versión), no una función fija:
      // para inundación es la misma v2 de siempre; para otra categoría, la suya.
      const sev = def.severidad.calcular(detalle);
      const ipHash = ipHashDiario(req.ip, dep.cfg.salIp);
      // El id se genera aquí y no en la base porque el punto publicable se deriva de él: el
      // jitter va sembrado con `id|sal` para que el mismo reporte salga siempre en el mismo
      // sitio desplazado y no se pueda promediar entre peticiones (§13).
      const idNuevo = randomUUID();
      const publico = coordenadaPublica(
        d.lat,
        d.lon,
        idNuevo,
        dep.cfg.salJitter,
        d.ubicacion_tipo,
        CONFIG_DOMINIO.JITTER_PUBLICO_M,
        CONFIG_DOMINIO.PRECISION_PUBLICA_DECIMALES,
      );
      const cliente = await dep.pool.connect();
      try {
        await cliente.query('BEGIN');

        // Con el prefijo de la cuenta: la misma clave en dos cuentas son dos envíos distintos.
        const claveGuardada = clave.success ? claveDeCuenta(autor.id, clave.data) : null;
        if (claveGuardada) {
          const estado = await reclamarClave(cliente, claveGuardada, huella);
          if (estado.tipo === 'conflicto') {
            await cliente.query('ROLLBACK');
            return res.status(409).send({
              codigo: 'CLAVE_IDEMPOTENCIA_REUSADA',
              mensaje: 'Esa clave ya se usó para otro reporte distinto.',
            });
          }
          if (estado.tipo === 'repetida') {
            await cliente.query('ROLLBACK');
            if (!estado.reporteId)
              // La transacción que la reclamó sigue en curso: el cliente reintenta.
              return res.status(409).send({
                codigo: 'ENVIO_EN_CURSO',
                mensaje: 'Ese envío se está procesando. Esperá un momento antes de reintentar.',
              });
            // Por la conexión que ya tenemos, no pidiendo otra al pool: ver más abajo. Con el mismo
            // publicar_en que fijó el primer envío y los segundos que le quedan ahora.
            const yaCreado = await obtenerReporte(cliente, estado.reporteId, 'cualquiera');
            if (yaCreado) {
              res.header('Idempotent-Replay', 'true');
              return res.status(200).send(aFeature(vistaMiReporte(yaCreado, dep.cfg.urlPublica)));
            }
            // La clave apunta a un reporte que ya no está. Antes se seguía adelante, pero la
            // transacción ya estaba deshecha por el ROLLBACK de arriba: el INSERT posterior
            // corría fuera de transacción y se perdía el todo-o-nada. Se responde y se corta.
            return res.status(409).send({
              codigo: 'CLAVE_IDEMPOTENCIA_HUERFANA',
              mensaje: 'Ese envío ya no se puede recuperar. Volvé a enviarlo con una clave nueva.',
            });
          }
        }

        /*
         * Cupo diario de la cuenta. Va AQUÍ y no antes por dos razones:
         *
         *  - después de la idempotencia, para que un reenvío del mismo formulario (doble toque,
         *    reintento tras un corte de red) devuelva el reporte ya creado en vez de gastar el
         *    turno de la persona por segunda vez;
         *  - dentro de la transacción, para que sea atómico de verdad y para que un fallo
         *    posterior —fotos que ya no están— devuelva también el turno.
         *
         * Es la autoridad: lo que la interfaz muestre con `reportes_restantes_hoy` es una
         * cortesía, y el servidor no se fía de ella.
         */
        // El límite efectivo de la categoría: el override de instalación o el de su `ReglaCupo`.
        const limite = limiteReportesDe(def, dep.cfg.reportesPorDiaOverride);
        const cupo = await reservarTurnoDeReporte(cliente, autor.id, slug, {
          maximo: limite,
          zona: dep.cfg.zonaHoraria,
        });
        if (!cupo.permitido) {
          await cliente.query('ROLLBACK');
          app.metricas.contar('curichi_cuota_reportes_rechazos_total');
          res.header('Retry-After', String(cupo.espera.reintentarEnS));
          return res.status(429).send({
            codigo: 'CUOTA_DE_REPORTES',
            mensaje: `Ya enviaste los ${limite} reportes de hoy. Vas a poder enviar otro mañana.`,
            // El cupo es por categoría (ADR 0017): la respuesta dice de cuál se agotó.
            detalles: { disponible_en: cupo.espera.disponibleEn, categoria: slug },
          });
        }

        /*
         * La demora de publicación (ADR 0006): el 1.º reporte del día de la cuenta EN ESA CATEGORÍA
         * se ve 60 s después y los siguientes, 240 s. `n` sale del contador de arriba (la fila de la
         * categoría), en esta misma transacción, así que dos envíos simultáneos reciben 60 y 240 sin
         * carrera. La calcula la base con su reloj (el mismo de `creado_en` y del filtro
         * `publicar_en <= now()`), y ningún cliente la puede adelantar.
         */
        const demoraS = cupo.n === 1 ? dep.cfg.demoraPrimeroS : dep.cfg.demoraSiguientesS;
        /*
         * Las seis columnas planas de inundación salen del `detalle` validado (el disparador de la
         * 0020 rearma el `detalle` desde ellas en cada escritura de inundación); en otra categoría
         * van todas en NULL —`causa_presunta` explícito, porque su DEFAULT es 'desconocida'— para no
         * violar el CHECK `no_inundacion_sin_campos`. El INSERT es en la tabla `reporte` (todas las
         * categorías desde la 0020), no en la vista de compatibilidad.
         */
        const esInundacion = slug === 'inundacion';
        const planas = esInundacion
          ? {
              profundidad_estimada: detalle.profundidad_estimada ?? null,
              frecuencia: detalle.frecuencia ?? null,
              causa_presunta: detalle.causa_presunta ?? null,
              sumidero_cercano: detalle.sumidero_cercano ?? null,
              sumidero_estado: detalle.sumidero_estado ?? null,
              agua_brota_sumidero: detalle.agua_brota_sumidero ?? null,
            }
          : {
              profundidad_estimada: null,
              frecuencia: null,
              causa_presunta: null,
              sumidero_cercano: null,
              sumidero_estado: null,
              agua_brota_sumidero: null,
            };
        const ins = await cliente.query<{ id: string; publicar_en: Date }>(
          `INSERT INTO reporte (geom, geom_publico, evento_en, autor_id, distrito_id, unidad_vecinal_id, version_capa, resolucion_flags,
           ubicacion_metodo, precision_gps_m, ubicacion_tipo, descripcion,
           categoria, subtipo, detalle, detalle_version,
           profundidad_estimada, frecuencia, causa_presunta, sumidero_cercano, sumidero_estado, agua_brota_sumidero,
           severidad_calculada, severidad_puntaje, severidad_version, estado, ip_hash, id,
           distancia_dispositivo_m, publicar_en)
         VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326), ST_SetSRID(ST_MakePoint($27, $28), 4326), $3, $4, $5, $6, $7, $8::jsonb,
           $9, $10, $11, $12,
           $13, $14, $15::jsonb, $16,
           $17, $18, $19, $20, $21, $22,
           $23, $24, $25, 'nuevo', $26, $29,
           $30, now() + make_interval(secs => $31::int)) RETURNING id, publicar_en`,
          [
            d.lon,
            d.lat,
            d.evento_en ?? null,
            // SIEMPRE de la sesión, nunca del cuerpo de la petición. El esquema de creación ni
            // siquiera tiene un campo de autor, así que un `autor_id` (o `usuario_id`, `userId`,
            // `owner_id`…) enviado por el cliente se descarta al validar y jamás llega hasta aquí.
            autor.id,
            geo.distrito.id,
            geo.unidad_vecinal.id,
            geo.version_capa,
            JSON.stringify({
              en_limite: geo.en_limite,
              asignado_por_proximidad: geo.asignado_por_proximidad,
              distancia_m: geo.distancia_m,
              distrito_discrepante: geo.distrito_discrepante,
            }),
            // Los deriva el servidor desde 0.9.0; el cliente ya no los manda.
            ubicacion.metodo,
            ubicacion.precisionM,
            d.ubicacion_tipo,
            d.descripcion,
            // Plataforma multicategoría (0.20.0): categoría, subtipo y detalle. Para inundación, el
            // disparador de la 0020 reescribe `detalle` y `detalle_version` desde las columnas planas.
            slug,
            d.subtipo ?? null,
            JSON.stringify(detalle),
            def.detalleVersion,
            planas.profundidad_estimada,
            planas.frecuencia,
            planas.causa_presunta,
            planas.sumidero_cercano,
            planas.sumidero_estado,
            planas.agua_brota_sumidero,
            sev.banda,
            sev.puntaje,
            def.severidad.version,
            ipHash,
            publico.lon,
            publico.lat,
            idNuevo,
            ubicacion.distanciaM,
            demoraS,
          ],
        );
        const id = ins.rows[0]!.id;
        const publicarEn = new Date(ins.rows[0]!.publicar_en).toISOString();
        const claves = [...new Set(d.fotos)];
        if (claves.length) {
          // Solo se reclaman fotos sin reporte, recién subidas y SUBIDAS POR QUIEN REPORTA: la
          // clave es un vale temporal (CLAUDE.md §7.5), no un identificador que valga para
          // cualquiera. Sin `subido_por`, con la clave recién subida por otra cuenta se le podía
          // quitar la foto y pegarla a un reporte propio. Las anteriores a la 0012 no tienen autor
          // conocido y no se aceptan.
          const asociadas = await cliente.query(
            `UPDATE reporte_foto SET reporte_id = $1
             WHERE objeto_key = ANY($2::text[]) AND reporte_id IS NULL AND exif_sanitizado
               AND subido_por = $4
               AND creado_en > now() - ($3 || ' hours')::interval`,
            [id, claves, String(HORAS_VALIDEZ_FOTO), autor.id],
          );
          // Sin esta comprobación el reporte se guardaba sin las fotos y nadie se enteraba.
          if (asociadas.rowCount !== claves.length) {
            await cliente.query('ROLLBACK');
            return res.status(400).send({
              codigo: 'FOTOS_INVALIDAS',
              mensaje:
                'Alguna de las fotos ya no está disponible. Volvé a subirlas y enviá el reporte de nuevo.',
            });
          }
        }
        await cliente.query(
          'INSERT INTO auditoria (entidad, entidad_id, accion, actor_id, despues) VALUES ($1, $2, $3, $4, $5)',
          [
            'reporte',
            id,
            'crear',
            autor.id,
            JSON.stringify({
              estado: 'nuevo',
              // La categoría del reporte (0.20.0): la auditoría de creación la registra para poder
              // seguir el inventario por categoría.
              categoria: slug,
              // El método con que se fijó la coordenada (ADR 0007). Nunca la posición del
              // dispositivo: `ubicacion` solo trae método, distancia y precisión (§0 regla 8).
              ubicacion_metodo: ubicacion.metodo,
              severidad: sev.banda,
              puntaje: sev.puntaje,
              // Reglas de escalamiento de la definición (E1 de inundación con P = 4, §9.1): se anotan
              // cuando la categoría las devuelve. `undefined` para una categoría que no escala.
              reglas: sev.reglas,
              publicar_en: publicarEn,
            }),
          ],
        );
        if (claveGuardada) await anotarResultado(cliente, claveGuardada, id);
        await cliente.query('COMMIT');
        // Sin la etiqueta `anonimo`: ya no existe esa posibilidad. El rol sí sirve, para poder
        // separar lo que reporta el vecindario de lo que carga un técnico desde el panel.
        app.metricas.contar('curichi_reportes_creados_total', {
          severidad: sev.banda,
          rol: autor.rol,
        });
        // La relectura va por ESTA conexión, la que ya tenemos, y no pidiendo otra al pool.
        //
        // Antes era `obtenerReporte(dep.pool, id)`, y eso hacía que cada creación necesitara DOS
        // conexiones a la vez: la de la transacción, todavía tomada, más una segunda para leer.
        // Con un pool de N, a partir de N peticiones simultáneas todas tenían una y todas
        // esperaban la segunda: un bloqueo mutuo por agotamiento del pool, del que solo se salía
        // cuando vencía `connectionTimeoutMillis`.
        //
        // Medido contra PostgreSQL real con el pool en 8, y el corte es exactamente ahí:
        //   6 envíos simultáneos → 6 × 201 en 91 ms
        //   8 envíos simultáneos → 1 × 201 y 7 × 503, todos a los 10 071 ms (el timeout)
        //  12 envíos simultáneos → 1 × 201 y 11 × 503
        // Con PGlite no se veía: es de conexión única y serializa, así que nunca hay dos a la vez.
        // La vista del autor (contracts 0.11.0): coordenada exacta, publicar_en y los segundos que
        // faltan, calculados en la base; la cuenta regresiva de la interfaz parte de acá.
        const fila = await obtenerReporte(cliente, id, 'cualquiera');
        return res.status(201).send(aFeature(vistaMiReporte(fila!, dep.cfg.urlPublica)));
      } catch (e) {
        // Con .catch(): si el ROLLBACK también falla (conexión ya caída), el error que sube
        // tiene que seguir siendo el original, no el del rollback, que no explica nada.
        await cliente.query('ROLLBACK').catch(() => {});
        // Borde del tope del `detalle`: la comprobación previa mide `JSON.stringify`, pero el CHECK
        // `detalle_tope` mide `octet_length(detalle::text)` sobre el jsonb reserializado (con
        // espacios tras `:` y `,`), que puede superar el tope aunque el `JSON.stringify` no lo haga.
        // En ese caso el CHECK salta en el INSERT: se traduce al MISMO 400 PAYLOAD_INVALIDO que la
        // comprobación previa, con el turno ya devuelto por el ROLLBACK. Solo esa violación concreta
        // (23514 check_violation + la constraint por nombre); cualquier otro error sigue subiendo al
        // manejador general (503 si es la base, 500 si no), sin tragarse otras violaciones.
        const pe = e as { code?: string; constraint?: string };
        if (pe.code === '23514' && pe.constraint === 'detalle_tope')
          return res.status(400).send(RESPUESTA_DETALLE_GRANDE);
        throw e;
      } finally {
        cliente.release();
      }
    },
  );

  // El listado es la consulta pública más cara (conteo acotado + selección + jitter) y no tenía
  // ningún límite: `@fastify/rate-limit` se registra con `global: false`, así que solo limita las
  // rutas que lo declaran. Medido en la Fase 3 contra la pila local: 500 peticiones concurrentes
  // daban 500 respuestas 200 con p95 de 1,9 s, sin un solo 429.
  const limiteLectura = {
    config: {
      rateLimit: { max: dep.cfg.rateLimitLecturasPorMinuto, timeWindow: 60_000 },
    },
  };

  /** Filtros y paginación, comunes a las cuatro rutas de lectura. */
  function leerFiltros(query: unknown) {
    const q = ReporteFiltrosSchema.safeParse(query);
    if (!q.success)
      return {
        error: {
          codigo: 'FILTROS_INVALIDOS',
          mensaje: q.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        },
      } as const;
    if ((q.data.pagina - 1) * q.data.limite > MAX_OFFSET)
      return {
        error: {
          codigo: 'PAGINA_DEMASIADO_PROFUNDA',
          mensaje: 'Esa página queda demasiado atrás. Acotá la búsqueda con filtros o fechas.',
        },
      } as const;
    return { datos: q.data } as const;
  }

  /*
   * ───────────────────────── Lectura pública ─────────────────────────
   *
   * Estas dos rutas NO miran `req.usuario`. No es una omisión: es la corrección de un defecto de
   * diseño. Antes una sola ruta decidía qué representación devolver según si la petición traía
   * cookie de sesión, y eso significaba que la vista técnica —coordenada exacta y reportes aún sin
   * moderar— se activaba por una señal AMBIENTAL que nadie había pedido. Bastaba con que la cookie
   * llegara por accidente para publicar datos técnicos en una URL pública:
   *
   *   - las cookies no distinguen puertos, así que el panel y el mapa público en el mismo host
   *     compartían la sesión (comprobado: el mapa público mostraba 47 reportes exactos en vez de
   *     los 35 publicados);
   *   - cualquier caché intermedia podía guardar la respuesta de un técnico y servírsela a un
   *     anónimo, porque la URL era la misma;
   *   - cualquier reenvío futuro que arrastrase la cookie reabría el agujero en silencio.
   *
   * Ahora la intención va en la RUTA (`/api/v1/tecnico/...`), que es la parte que forma la clave
   * de caché y que un proxy puede distinguir de un vistazo. Aquí no hay rama que equivocarse:
   * este código es incapaz de construir una vista técnica.
   */
  const registro = registroDe(dep);

  /** 400 CATEGORIA_NO_DISPONIBLE de las rutas públicas (categoría desconocida, inactiva o `todas`). */
  const categoriaNoDisponible = {
    codigo: CODIGO_CATEGORIA_NO_DISPONIBLE,
    mensaje: 'Esa categoría no está disponible.',
  };

  app.get('/api/v1/reportes', limiteLectura, async (req, res) => {
    const f = leerFiltros(req.query);
    if (f.error) return res.status(400).send(f.error);
    // Público: exige UNA categoría activa. Sin el parámetro = inundacion (activa). `null`,
    // `todas` o una categoría inactiva → 400 CATEGORIA_NO_DISPONIBLE (ADR 0012).
    if (!(await categoriaPublica(app.categorias, f.datos.categoria)).ok)
      return res.status(400).send(categoriaNoDisponible);
    const { filas, total, totalExacto } = await listarReportes(dep.pool, {
      filtros: f.datos,
      soloPublicos: true,
      // `desde`/`hasta` son días de la ciudad de esta instalación. Sin pasarla, consultas.ts cae
      // en la del contrato (La Paz) y el listado contaba otros días que la exportación.
      zonaHoraria: dep.cfg.zonaHoraria,
    });
    cacheDeListadoPublico(res);
    return {
      type: 'FeatureCollection',
      features: filas.map((r) =>
        aFeature(vistaPublica(r, dep.cfg.urlPublica, dep.cfg.salJitter, registro)),
      ),
      total,
      total_exacto: totalExacto,
      pagina: f.datos.pagina,
      limite: f.datos.limite,
    };
  });

  app.get('/api/v1/reportes/:id', limiteLectura, async (req, res) => {
    const p = IdReporteParam.safeParse(req.params);
    if (!p.success)
      return res.status(404).send({ codigo: 'NO_EXISTE', mensaje: 'Reporte no encontrado.' });
    // Resuelve SOLO reportes públicos: un ID corto de uno oculto (en espera, rechazado o
    // duplicado) no resuelve y da el MISMO 404 que uno inexistente, sin delatar que existe.
    const uuid = await resolverIdReporte(dep.pool, p.data.id, condicionPublico(''));
    if (!uuid)
      return res.status(404).send({ codigo: 'NO_EXISTE', mensaje: 'Reporte no encontrado.' });
    const fila = await obtenerReporte(dep.pool, uuid, 'publico');
    // Sin `?categoria`: se acepta el reporte de cualquier categoría ACTIVA. Si el reporte es de una
    // categoría inactiva, 404 igual que uno oculto: no se delata su existencia (decisión M3.3).
    if (!fila || !(await app.categorias.estaActiva(fila.categoria)))
      return res
        .status(404)
        .send({ codigo: 'NO_EXISTE', mensaje: 'Reporte no encontrado o aún no publicado.' });
    cacheDeListadoPublico(res);
    return aFeature(vistaPublica(fila, dep.cfg.urlPublica, dep.cfg.salJitter, registro));
  });

  /*
   * ──────────────────────── Lectura técnica ────────────────────────
   *
   * Prefijo propio y rol exigido en el `preHandler`. Tres propiedades que la ruta compartida no
   * podía dar:
   *   1. la intención es explícita: nadie llega aquí por arrastrar una cookie;
   *   2. la clave de caché es distinta por construcción, así que ninguna caché puede confundir
   *      esta respuesta con la pública ni al revés;
   *   3. un proxy puede prohibir el almacenamiento de `/api/v1/tecnico/*` con una sola regla.
   * Sin sesión son 401 y con rol equivocado 403: nunca una vista pública silenciosa, que ocultaría
   * el error de configuración en vez de señalarlo.
   */
  const soloTecnico = {
    ...limiteLectura,
    preHandler: requerirRol('tecnico', 'admin'),
  };

  app.get('/api/v1/tecnico/reportes', soloTecnico, async (req, res) => {
    const f = leerFiltros(req.query);
    if (f.error) return res.status(400).send(f.error);
    // Panel: admite `todas` y cualquier categoría conocida, activa o no. Un slug desconocido
    // (`null`) es un filtro inválido, con el mismo código que los demás filtros de la ruta.
    if (!categoriaPanel(f.datos.categoria).ok)
      return res.status(400).send({
        codigo: 'FILTROS_INVALIDOS',
        mensaje: 'categoria: la categoría indicada no existe.',
      });
    const { filas, total, totalExacto } = await listarReportes(dep.pool, {
      filtros: f.datos,
      soloPublicos: false,
      zonaHoraria: dep.cfg.zonaHoraria,
    });
    return {
      type: 'FeatureCollection',
      features: filas.map((r) => aFeature(vistaTecnica(r, dep.cfg.urlPublica))),
      total,
      total_exacto: totalExacto,
      pagina: f.datos.pagina,
      limite: f.datos.limite,
    };
  });

  app.get('/api/v1/tecnico/reportes/:id', soloTecnico, async (req, res) => {
    const p = IdReporteParam.safeParse(req.params);
    if (!p.success)
      return res.status(404).send({ codigo: 'NO_EXISTE', mensaje: 'Reporte no encontrado.' });
    // Resuelve solo publicados: mientras espera su publicar_en tampoco lo ve el técnico (ADR 0006).
    const uuid = await resolverIdReporte(dep.pool, p.data.id, condicionPublicado(''));
    if (!uuid)
      return res.status(404).send({ codigo: 'NO_EXISTE', mensaje: 'Reporte no encontrado.' });
    const fila = await obtenerReporte(dep.pool, uuid, 'publicado');
    if (!fila)
      return res.status(404).send({ codigo: 'NO_EXISTE', mensaje: 'Reporte no encontrado.' });
    return aFeature(vistaTecnica(fila, dep.cfg.urlPublica));
  });

  /*
   * ──────────────────────────── Mis reportes ────────────────────────────
   *
   * Los reportes de la cuenta de la sesión, en cualquier estado: el vecino ve el suyo mientras
   * espera su publicación (con la cuenta regresiva) y también si lo rechazaron o lo fusionaron.
   * Filtra por el autor de la sesión, nunca por algo que venga en la petición. Queda con
   * `private, no-store` y `Vary: Cookie` por el valor por defecto de cache.ts.
   */
  app.get(
    '/api/v1/mis-reportes',
    { ...limiteLectura, preHandler: requerirRol('ciudadano', 'tecnico', 'admin', 'ejecutivo') },
    async (req) => {
      const filas = await reportesDelAutor(
        dep.pool,
        req.usuario!.id,
        CONFIG_DOMINIO.MIS_REPORTES_MAX,
      );
      return {
        type: 'FeatureCollection',
        features: filas.map((f) => aFeature(vistaMiReporte(f, dep.cfg.urlPublica))),
      };
    },
  );
}

export { CONFIG_DOMINIO };
