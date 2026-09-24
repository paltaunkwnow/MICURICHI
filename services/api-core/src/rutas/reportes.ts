import { randomUUID } from 'node:crypto';
import {
  CONFIG_DOMINIO,
  calcularSeveridad,
  coordenadaPublica,
  ReporteCrearSchema,
  ReporteFiltrosSchema,
} from 'contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Dependencias } from '../app.js';
import { requerirRol } from '../auth.js';
import { cacheDeListadoPublico } from '../cache.js';
import { listarReportes, MAX_OFFSET, obtenerReporte } from '../consultas.js';
import { consumirCuotaDeReporte } from '../cuota.js';
import {
  anotarResultado,
  ClaveIdempotenciaSchema,
  huellaDePayload,
  reclamarClave,
} from '../idempotencia.js';
import { ipHashDiario } from '../privacidad.js';
import { aFeature, vistaPublica, vistaTecnica } from '../vistas.js';

const IdParam = z.object({ id: z.uuid() });

/** Ventana en la que una `objeto_key` recién subida puede asociarse a un reporte. */
export const HORAS_VALIDEZ_FOTO = 24;

export function esTecnico(rol: string | undefined) {
  return rol === 'tecnico' || rol === 'admin';
}

/** «43 minutos», «1 minuto», «menos de un minuto»: para el mensaje de la cuota, en castellano. */
export function minutosRestantes(segundos: number): string {
  const m = Math.ceil(segundos / 60);
  if (m <= 0) return 'un momento';
  if (m === 1) return '1 minuto';
  return `${m} minutos`;
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
      preHandler: requerirRol('ciudadano', 'tecnico', 'admin'),
    },
    async (req, res) => {
      // `requerirRol` ya cortó si no hay sesión; esto es para el compilador y por si alguien
      // reordena los hooks en el futuro y se lleva la comprobación por delante.
      const autor = req.usuario;
      if (!autor)
        return res
          .status(401)
          .send({ codigo: 'SIN_SESION', mensaje: 'Iniciá sesión para enviar un reporte.' });
      const p = ReporteCrearSchema.safeParse(req.body);
      if (!p.success) {
        return res.status(400).send({
          codigo: 'PAYLOAD_INVALIDO',
          mensaje: 'Revisá los datos del reporte.',
          detalles: p.error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
        });
      }
      const d = p.data;
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
      const huella = huellaDePayload(d);

      const sev = calcularSeveridad(d);
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

        if (clave.success) {
          const estado = await reclamarClave(cliente, clave.data, huella);
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
            // Por la conexión que ya tenemos, no pidiendo otra al pool: ver más abajo.
            const yaCreado = await obtenerReporte(cliente, estado.reporteId);
            if (yaCreado) {
              res.header('Idempotent-Replay', 'true');
              return res
                .status(200)
                .send(
                  aFeature(vistaPublica(yaCreado, dep.cfg.urlPublica, dep.cfg.salJitter, true)),
                );
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
         * Cuota de la cuenta. Va AQUÍ y no antes por dos razones:
         *
         *  - después de la idempotencia, para que un reenvío del mismo formulario (doble toque,
         *    reintento tras un corte de red) devuelva el reporte ya creado en vez de gastar el
         *    turno de la persona por segunda vez;
         *  - dentro de la transacción, para que sea atómica de verdad y para que un fallo
         *    posterior —fotos que ya no están— devuelva también el turno.
         *
         * Es la autoridad: no hay ninguna otra comprobación de cuota que valga. Lo que la
         * interfaz muestre con `puede_reportar_desde` es una cortesía, y el servidor no se fía
         * de ella.
         */
        const cuota = await consumirCuotaDeReporte(cliente, autor.id, dep.cfg.minutosEntreReportes);
        if (!cuota.permitido) {
          await cliente.query('ROLLBACK');
          app.metricas.contar('curichi_cuota_reportes_rechazos_total');
          res.header('Retry-After', String(cuota.reintentarEnS));
          return res.status(429).send({
            codigo: 'CUOTA_DE_REPORTES',
            mensaje: `Ya enviaste un reporte hace poco. Vas a poder enviar otro en ${minutosRestantes(cuota.reintentarEnS)}.`,
            detalles: { disponible_en: cuota.disponibleEn.toISOString() },
          });
        }

        const ins = await cliente.query<{ id: string }>(
          `INSERT INTO reporte_inundacion (geom, geom_publico, evento_en, autor_id, distrito_id, unidad_vecinal_id, manzana_id, version_capa, resolucion_flags,
           ubicacion_metodo, precision_gps_m, ubicacion_tipo, descripcion, tirante_estimado, duracion_estimada, frecuencia, afectacion, causa_presunta,
           sumidero_cercano, sumidero_estado, agua_brota_sumidero, severidad_calculada, severidad_puntaje, severidad_version, estado, ip_hash, id)
         VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326), ST_SetSRID(ST_MakePoint($26, $27), 4326), $3, $4, $5, $6, $7, $8, $9::jsonb,
           $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, 'nuevo', $25, $28) RETURNING id`,
          [
            d.lon,
            d.lat,
            d.evento_en ?? null,
            // SIEMPRE de la sesión, nunca del cuerpo de la petición. `ReporteCrearSchema` ni
            // siquiera tiene un campo de autor, así que un `autor_id` (o `usuario_id`, `userId`,
            // `owner_id`…) enviado por el cliente se descarta al validar y jamás llega hasta aquí.
            autor.id,
            geo.distrito.id,
            geo.unidad_vecinal.id,
            geo.manzana?.id ?? null,
            geo.version_capa,
            JSON.stringify({
              en_limite: geo.en_limite,
              asignado_por_proximidad: geo.asignado_por_proximidad,
              distancia_m: geo.distancia_m,
              distrito_discrepante: geo.distrito_discrepante,
            }),
            d.ubicacion_metodo,
            d.precision_gps_m ?? null,
            d.ubicacion_tipo,
            d.descripcion,
            d.tirante_estimado,
            d.duracion_estimada,
            d.frecuencia,
            d.afectacion,
            d.causa_presunta,
            d.sumidero_cercano ?? null,
            d.sumidero_estado ?? null,
            d.agua_brota_sumidero ?? null,
            sev.banda,
            sev.puntaje,
            sev.version,
            ipHash,
            publico.lon,
            publico.lat,
            idNuevo,
          ],
        );
        const id = ins.rows[0]!.id;
        const claves = [...new Set(d.fotos)];
        if (claves.length) {
          // Solo se reclaman fotos sin dueño y recién subidas: la clave es un vale temporal
          // (CLAUDE.md §7.5), no un identificador permanente que sirva para siempre.
          const asociadas = await cliente.query(
            `UPDATE reporte_foto SET reporte_id = $1
             WHERE objeto_key = ANY($2::text[]) AND reporte_id IS NULL AND exif_sanitizado
               AND creado_en > now() - ($3 || ' hours')::interval`,
            [id, claves, String(HORAS_VALIDEZ_FOTO)],
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
              severidad: sev.banda,
              puntaje: sev.puntaje,
              reglas: sev.reglas,
            }),
          ],
        );
        if (clave.success) await anotarResultado(cliente, clave.data, id);
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
        const fila = await obtenerReporte(cliente, id);
        return res
          .status(201)
          .send(aFeature(vistaPublica(fila!, dep.cfg.urlPublica, dep.cfg.salJitter, true)));
      } catch (e) {
        // Con .catch(): si el ROLLBACK también falla (conexión ya caída), el error que sube
        // tiene que seguir siendo el original, no el del rollback, que no explica nada.
        await cliente.query('ROLLBACK').catch(() => {});
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
  app.get('/api/v1/reportes', limiteLectura, async (req, res) => {
    const f = leerFiltros(req.query);
    if (f.error) return res.status(400).send(f.error);
    const { filas, total, totalExacto } = await listarReportes(dep.pool, {
      filtros: f.datos,
      soloPublicos: true,
    });
    cacheDeListadoPublico(res);
    return {
      type: 'FeatureCollection',
      features: filas.map((r) => aFeature(vistaPublica(r, dep.cfg.urlPublica, dep.cfg.salJitter))),
      total,
      total_exacto: totalExacto,
      pagina: f.datos.pagina,
      limite: f.datos.limite,
    };
  });

  app.get('/api/v1/reportes/:id', limiteLectura, async (req, res) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success)
      return res.status(404).send({ codigo: 'NO_EXISTE', mensaje: 'Reporte no encontrado.' });
    const fila = await obtenerReporte(dep.pool, p.data.id);
    if (!fila || !['validado', 'resuelto'].includes(fila.estado))
      return res
        .status(404)
        .send({ codigo: 'NO_EXISTE', mensaje: 'Reporte no encontrado o aún no publicado.' });
    cacheDeListadoPublico(res);
    return aFeature(vistaPublica(fila, dep.cfg.urlPublica, dep.cfg.salJitter));
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
    const { filas, total, totalExacto } = await listarReportes(dep.pool, {
      filtros: f.datos,
      soloPublicos: false,
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
    const p = IdParam.safeParse(req.params);
    if (!p.success)
      return res.status(404).send({ codigo: 'NO_EXISTE', mensaje: 'Reporte no encontrado.' });
    const fila = await obtenerReporte(dep.pool, p.data.id);
    if (!fila)
      return res.status(404).send({ codigo: 'NO_EXISTE', mensaje: 'Reporte no encontrado.' });
    return aFeature(vistaTecnica(fila, dep.cfg.urlPublica));
  });
}

export { CONFIG_DOMINIO };
