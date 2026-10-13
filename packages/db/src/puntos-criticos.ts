/**
 * Recurrencia espacial (CLAUDE.md §9.2): agrupa reportes validados/resueltos en puntos críticos.
 * Intenta ST_ClusterDBSCAN en PostGIS; si la build no lo tiene (PGlite experimental), usa un
 * DBSCAN equivalente en Node (minpoints = 1 ⇒ componentes conexas por distancia ≤ radio).
 *
 * UNA sola métrica en los tres caminos (este completo, su equivalente en Node y el incremental de
 * `puntos-criticos-entorno.ts`): distancia plana en metros sobre `ST_Transform(geom, <CRS
 * métrico>)`, con el CRS de `CRS_METRICO_EPSG` (por defecto UTM 20S). Antes el completo usaba
 * `eps` en grados (radio / 111 320) y el incremental geography: en Santa Cruz un grado de longitud
 * mide ~106 km, así que el completo solo unía de este a oeste hasta ~23,8 m mientras el incremental
 * unía hasta 25 m, y el mismo par de reportes daba uno o dos puntos críticos según qué camino
 * hubiera corrido último. `test/puntos-criticos-metrica.test.ts` fija la equivalencia.
 *
 * POR CATEGORÍA (M3, ADR 0009/0013): el agrupamiento es SIEMPRE dentro de una misma categoría. Se
 * lee la tabla `reporte` (no la vista `reporte_inundacion`, que solo ve inundación) y se hace una
 * pasada de DBSCAN por categoría presente en los datos, con el radio de recurrencia de SU
 * definición (`RegistroCategorias.obtener(slug).recurrenciaRadioM`). `ST_ClusterDBSCAN` toma un
 * `eps` escalar por llamada, así que una pasada por categoría es lo natural; el `OVER ()` agrupa
 * solo las filas que devuelve el `WHERE categoria = $n`, de modo que dos categorías nunca se mezclan
 * aunque sus puntos coincidan. Una categoría presente en los datos pero SIN definición en el
 * registro (y sin un radio explícito) NO se agrupa: sus reportes quedan sin punto crítico hasta que
 * la categoría se registre (fail-closed; `ResumenPuntosCriticos.categoriasSinDefinicion` lo informa).
 */
import {
  CONFIG_DOMINIO,
  distanciaAproximadaM,
  REGISTRO_CATEGORIAS,
  type RegistroCategorias,
} from 'contracts';
import { crsMetricoEpsg } from './configuracion.js';
import type { Ejecutor } from './ejecutor.js';

const ORDEN_SEVERIDAD: Record<string, number> = { baja: 0, media: 1, alta: 2, critica: 3 };

/**
 * Advisory lock que serializa TODO recálculo de puntos críticos, completo o incremental, entre
 * procesos. La clave es arbitraria pero tiene que ser la misma en los dos caminos: el completo
 * vacía la tabla y la reconstruye, así que si corre a la vez que un incremental (otra réplica
 * moderando un reporte) se pisan y quedan puntos duplicados o reportes sin grupo.
 */
export const CLAVE_LOCK_PUNTOS_CRITICOS = 4021;

export interface FilaReporte {
  id: string;
  lon: number;
  lat: number;
  /**
   * Coordenada publicable del reporte (`geom_publico`). El centroide que se publica se calcula
   * con estas y no con las exactas: con minpoints = 1 un reporte aislado forma su propio grupo,
   * así que el centroide exacto sería literalmente la coordenada de su vivienda (§13).
   * NULL mientras api-core no haya rellenado el punto publicable de ese reporte.
   */
  lon_publico: number | null;
  lat_publico: number | null;
  creado_en: string;
  severidad: string;
  /** Categoría del reporte (ADR 0009): el agrupamiento no cruza categorías. */
  categoria: string;
}

/** Columnas de reporte que necesita el agrupador, exactas y publicables, con su categoría. */
export const COLUMNAS_AGRUPACION = `id::text, ST_X(geom) AS lon, ST_Y(geom) AS lat,
        ST_X(geom_publico) AS lon_publico, ST_Y(geom_publico) AS lat_publico,
        creado_en::text, COALESCE(severidad_manual, severidad_calculada)::text AS severidad,
        categoria`;

export interface ResumenPuntosCriticos {
  puntos: number;
  reportes: number;
  motor: 'postgis' | 'node';
  /**
   * Categorías presentes en los datos que NO se agruparon porque no tienen definición en el
   * registro (ni se pasó un radio explícito). Solo se llena en la reconstrucción total; `undefined`
   * si todas las categorías presentes tenían radio.
   */
  categoriasSinDefinicion?: readonly string[];
}

/** Un grupo ya formado y el radio de recurrencia con el que se formó (se guarda en `radio_m`). */
interface GrupoAgrupado {
  miembros: FilaReporte[];
  radioM: number;
}

/** Categorías con al menos un reporte activo (validado/resuelto) en la tabla `reporte`. */
async function categoriasConReportesActivos(ex: Ejecutor): Promise<string[]> {
  const filas = await ex.consultar<{ categoria: string }>(
    `SELECT DISTINCT categoria FROM reporte WHERE estado IN ('validado', 'resuelto') ORDER BY categoria`,
  );
  return filas.map((f) => f.categoria);
}

/** Agrupa UNA categoría con ST_ClusterDBSCAN. Devuelve `null` solo si la build no trae la función. */
async function agruparCategoriaPostgis(
  ex: Ejecutor,
  categoria: string,
  radioM: number,
  crsMetrico: number,
): Promise<FilaReporte[][] | null> {
  try {
    // `eps` en metros porque la geometría va proyectada al CRS métrico (§9.2). El `::int` no es
    // decorativo: sin él, `ST_Transform(geometry, unknown)` es ambiguo con la variante de texto.
    // El `OVER ()` agrupa solo las filas del `WHERE categoria = $3`: el clustering no cruza categorías.
    const filas = await ex.consultar<FilaReporte & { cid: number }>(
      `SELECT ${COLUMNAS_AGRUPACION},
              ST_ClusterDBSCAN(ST_Transform(geom, $2::int), eps := $1, minpoints := 1) OVER () AS cid
       FROM reporte WHERE categoria = $3 AND estado IN ('validado', 'resuelto')`,
      [radioM, crsMetrico, categoria],
    );
    const porCid = new Map<number, FilaReporte[]>();
    for (const f of filas) {
      const g = porCid.get(f.cid) ?? [];
      g.push(f);
      porCid.set(f.cid, g);
    }
    return [...porCid.values()];
  } catch (e) {
    // Solo se cae al DBSCAN en Node si la build de PostGIS no trae la función (SQLSTATE 42883,
    // "undefined_function"). Cualquier otro fallo —conexión caída, permisos, tabla ausente— se
    // propaga: tragárselo convertía un problema de base en un escaneo silencioso en memoria.
    if ((e as { code?: string }).code !== '42883') throw e;
    return null;
  }
}

/** Agrupa UNA categoría en Node (build de PostGIS sin ST_ClusterDBSCAN): componentes conexas. */
async function agruparCategoriaNode(
  ex: Ejecutor,
  categoria: string,
  radioM: number,
  crsMetrico: number,
): Promise<FilaReporte[][]> {
  // Las mismas coordenadas proyectadas que usa ST_ClusterDBSCAN: la distancia en Node es la plana
  // en metros del CRS métrico, no una aproximación sobre grados.
  const filas = await ex.consultar<FilaReporte & { x: number; y: number }>(
    `SELECT ${COLUMNAS_AGRUPACION}, ST_X(geom_m) AS x, ST_Y(geom_m) AS y
     FROM (SELECT *, ST_Transform(geom, $1::int) AS geom_m FROM reporte
           WHERE categoria = $2 AND estado IN ('validado', 'resuelto')) AS r`,
    [crsMetrico, categoria],
  );
  // Union-find sobre pares a distancia ≤ radio. Prefiltro por celda de rejilla de tamaño radio.
  const padre = filas.map((_, i) => i);
  const buscar = (i: number): number => {
    let raiz = i;
    while (padre[raiz] !== raiz) raiz = padre[raiz]!;
    // compresión de caminos
    let actual = i;
    while (padre[actual] !== raiz) {
      const siguiente = padre[actual]!;
      padre[actual] = raiz;
      actual = siguiente;
    }
    return raiz;
  };
  const unir = (a: number, b: number) => {
    const ra = buscar(a);
    const rb = buscar(b);
    if (ra !== rb) padre[ra] = rb;
  };
  const celda = radioM;
  const rejilla = new Map<string, number[]>();
  const clave = (f: { x: number; y: number }) =>
    `${Math.floor(f.x / celda)}:${Math.floor(f.y / celda)}`;
  // `push` y no `set(k, [...viejo, i])`: lo segundo copia el array entero en CADA inserción, o
  // sea O(n²) sobre el número de puntos que caen en la misma celda. Con la densidad real de una
  // ciudad eso es el cuello de botella de todo el recálculo.
  filas.forEach((f, i) => {
    const k = clave(f);
    const celdaExistente = rejilla.get(k);
    if (celdaExistente) celdaExistente.push(i);
    else rejilla.set(k, [i]);
  });
  filas.forEach((f, i) => {
    const cx = Math.floor(f.x / celda);
    const cy = Math.floor(f.y / celda);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const j of rejilla.get(`${cx + dx}:${cy + dy}`) ?? []) {
          if (j <= i) continue;
          const g = filas[j]!;
          if (Math.hypot(f.x - g.x, f.y - g.y) <= radioM) unir(i, j);
        }
  });
  const grupos = new Map<number, FilaReporte[]>();
  filas.forEach((f, i) => {
    const r = buscar(i);
    const grupo = grupos.get(r);
    if (grupo) grupo.push(f);
    else grupos.set(r, [f]);
  });
  return [...grupos.values()];
}

/**
 * Reconstruye los grupos de TODAS las categorías presentes, una pasada por categoría con su radio.
 * `radioExplicito`, si se pasa, fuerza ese radio para TODAS las categorías (lo usan las pruebas);
 * si no, cada categoría usa el radio de su definición en `registro`. Una categoría sin definición
 * (ni radio explícito) se omite y se devuelve en `sinDefinicion`.
 */
async function agruparTodo(
  ex: Ejecutor,
  radioExplicito: number | undefined,
  crsMetrico: number,
  registro: RegistroCategorias,
): Promise<{ grupos: GrupoAgrupado[]; motor: 'postgis' | 'node'; sinDefinicion: string[] }> {
  const categorias = await categoriasConReportesActivos(ex);
  const grupos: GrupoAgrupado[] = [];
  const sinDefinicion: string[] = [];
  let motor: 'postgis' | 'node' = 'postgis';
  for (const categoria of categorias) {
    const radioM = radioExplicito ?? registro.obtener(categoria)?.recurrenciaRadioM;
    if (radioM === undefined) {
      // Categoría presente en los datos pero sin definición en el registro: no hay un radio de
      // recurrencia seguro, así que NO se agrupa. Fail-closed a propósito (§9.2): preferimos dejar
      // sus reportes sin punto crítico (dato derivado) a inventar recurrencia con un radio ajeno.
      sinDefinicion.push(categoria);
      continue;
    }
    // Una vez que una categoría cae al DBSCAN en Node (42883), las demás van directo por Node.
    let delCategoria =
      motor === 'postgis' ? await agruparCategoriaPostgis(ex, categoria, radioM, crsMetrico) : null;
    if (motor === 'postgis' && delCategoria === null) motor = 'node';
    if (motor === 'node')
      delCategoria = await agruparCategoriaNode(ex, categoria, radioM, crsMetrico);
    for (const miembros of delCategoria ?? []) grupos.push({ miembros, radioM });
  }
  return { grupos, motor, sinDefinicion };
}

/** Límite a partir del cual el diámetro exacto (O(n²)) se sustituye por la diagonal del bbox. */
const MAX_MIEMBROS_DIAMETRO_EXACTO = 200;

/** Diámetro del grupo en metros. Exacto en grupos chicos; cota superior por bbox en los grandes. */
function diametroM(miembros: FilaReporte[]): number {
  if (miembros.length < 2) return 0;
  if (miembros.length > MAX_MIEMBROS_DIAMETRO_EXACTO) {
    // Recorrido en una pasada y NO `Math.min(...lats)`. El spread pasa cada elemento como un
    // argumento, y a partir de unas decenas de miles de argumentos revienta con
    // "Maximum call stack size exceeded". No es teórico: pasó en la Fase 4 al arrancar la pila
    // con un millón de reportes, y tumbó el recálculo entero de puntos críticos. Como DBSCAN con
    // minpoints=1 encadena por cercanía, en una ciudad densa un solo grupo puede tener cientos
    // de miles de miembros, que es justo cuando hace falta que esto funcione.
    let minLat = Number.POSITIVE_INFINITY;
    let minLon = Number.POSITIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;
    let maxLon = Number.NEGATIVE_INFINITY;
    for (const m of miembros) {
      if (m.lat < minLat) minLat = m.lat;
      if (m.lat > maxLat) maxLat = m.lat;
      if (m.lon < minLon) minLon = m.lon;
      if (m.lon > maxLon) maxLon = m.lon;
    }
    return distanciaAproximadaM(minLat, minLon, maxLat, maxLon);
  }
  let d = 0;
  for (let i = 0; i < miembros.length; i++)
    for (let j = i + 1; j < miembros.length; j++) {
      const a = miembros[i]!;
      const b = miembros[j]!;
      d = Math.max(d, distanciaAproximadaM(a.lat, a.lon, b.lat, b.lon));
    }
  return d;
}

/**
 * Inserta un punto crítico por grupo y vincula sus reportes. Debe llamarse DENTRO de una
 * transacción; quien llama ya se encargó de disolver los puntos que quedan obsoletos.
 *
 * `grupos = null` significa reconstrucción total: se recalculan todos los grupos (por categoría) y
 * se vacía la tabla antes de insertar. Es lo que usan el CLI de reparación y los seeds; en ese caso
 * `radioM` es el radio FORZADO para todas las categorías (`undefined` ⇒ el radio de cada definición
 * en `registro`). Con `grupos != null` (incremental, pruebas) los grupos ya están formados y son de
 * UNA categoría; `radioM` es el radio que se guarda en `radio_m`. `crsMetrico` solo se usa en la
 * reconstrucción total; por defecto, `CRS_METRICO_EPSG`.
 */
export async function construirPuntosCriticos(
  tx: Ejecutor,
  radioM: number | undefined,
  grupos: FilaReporte[][] | null,
  crsMetrico?: number,
  registro: RegistroCategorias = REGISTRO_CATEGORIAS,
): Promise<ResumenPuntosCriticos> {
  let motor: 'postgis' | 'node' = 'postgis';
  let sinDefinicion: string[] = [];
  let agrupados: GrupoAgrupado[];
  if (grupos === null) {
    const crs = crsMetrico ?? crsMetricoEpsg();
    const r = await agruparTodo(tx, radioM, crs, registro);
    motor = r.motor;
    sinDefinicion = r.sinDefinicion;
    agrupados = r.grupos;
    await tx.ejecutar(
      'UPDATE reporte SET punto_critico_id = NULL WHERE punto_critico_id IS NOT NULL',
    );
    await tx.ejecutar('DELETE FROM punto_critico');
  } else {
    // Grupos ya formados, de una sola categoría (incremental o pruebas). El radio que se guarda es
    // el que pasa quien llama; si no pasó ninguno, el de la definición de la categoría del grupo.
    agrupados = grupos.map((miembros) => {
      const categoria = miembros[0]?.categoria;
      const radio =
        radioM ?? (categoria ? registro.obtener(categoria)?.recurrenciaRadioM : undefined);
      if (radio === undefined)
        throw new Error(
          `construirPuntosCriticos: no hay radio para el grupo de categoría «${categoria ?? '(vacío)'}»; ` +
            'pasá un radioM explícito o registrá la categoría.',
        );
      return { miembros, radioM: radio };
    });
  }

  let reportes = 0;
  let puntos = 0;
  for (const { miembros, radioM: radioGrupo } of agrupados) {
    if (!miembros.length) continue;
    const categoria = miembros[0]!.categoria;
    const lon = miembros.reduce((s, m) => s + m.lon, 0) / miembros.length;
    const lat = miembros.reduce((s, m) => s + m.lat, 0) / miembros.length;
    // Centroide publicable: media de los puntos YA degradados de los miembros, no de los exactos.
    // Si a algún miembro todavía le falta su punto publicable, el del grupo queda NULL y
    // geo-service no lo publica: preferimos un punto de menos a revelar una vivienda (§13).
    const publicables = miembros.every((m) => m.lon_publico !== null && m.lat_publico !== null)
      ? {
          lon: miembros.reduce((s, m) => s + (m.lon_publico as number), 0) / miembros.length,
          lat: miembros.reduce((s, m) => s + (m.lat_publico as number), 0) / miembros.length,
        }
      : null;
    const diametro = diametroM(miembros);
    const fechas = miembros.map((m) => m.creado_en).sort();
    const severidadMax = miembros
      .map((m) => m.severidad)
      .sort((a, b) => (ORDEN_SEVERIDAD[b] ?? 0) - (ORDEN_SEVERIDAD[a] ?? 0))[0]!;
    const [pc] = await tx.consultar<{ id: string }>(
      `INSERT INTO punto_critico (geom, geom_publico, n_reportes, primer_reporte_en, ultimo_reporte_en, severidad_max, distrito_id, unidad_vecinal_id, radio_m, diametro_m, advertencia_diametro, categoria)
       SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326),
              CASE WHEN $10::float8 IS NULL THEN NULL
                   ELSE ST_SetSRID(ST_MakePoint(round($10::numeric, 5)::float8, round($11::numeric, 5)::float8), 4326) END,
              $3, $4::timestamptz, $5::timestamptz, $6::severidad,
              (SELECT id FROM geo.distrito_municipal_vigente d WHERE ST_Contains(d.geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)) ORDER BY id LIMIT 1),
              (SELECT id FROM geo.unidad_vecinal_vigente u WHERE ST_Contains(u.geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)) ORDER BY id LIMIT 1),
              $7, $8, $9, $12
       RETURNING id::text`,
      [
        lon,
        lat,
        miembros.length,
        fechas[0],
        fechas[fechas.length - 1],
        severidadMax,
        radioGrupo,
        Math.round(diametro * 10) / 10,
        diametro > CONFIG_DOMINIO.RECURRENCIA_DIAMETRO_ADVERTENCIA_M,
        publicables?.lon ?? null,
        publicables?.lat ?? null,
        categoria,
      ],
    );
    await tx.consultar('UPDATE reporte SET punto_critico_id = $1 WHERE id = ANY($2::uuid[])', [
      pc!.id,
      miembros.map((m) => m.id),
    ]);
    reportes += miembros.length;
    puntos++;
  }
  return {
    puntos,
    reportes,
    motor,
    categoriasSinDefinicion: sinDefinicion.length ? sinDefinicion : undefined,
  };
}

/**
 * Reconstruye TODA la tabla de puntos críticos. Es O(n) en reportes y O(g) en idas a la base,
 * así que **no** debe usarse en el camino de una petición: para eso está
 * `recalcularEntornoDeReporte`, que solo toca la componente afectada. Queda para el CLI de
 * reparación, los seeds y como red de seguridad cuando una componente crece demasiado.
 *
 * `radioM`, por defecto `undefined`: cada categoría presente se agrupa con el radio de su
 * definición en `registro` (por defecto `REGISTRO_CATEGORIAS`). Un `radioM` explícito fuerza ese
 * radio para TODAS las categorías (lo usan las pruebas de volumen y métrica).
 *
 * Se serializa dentro del proceso porque vacía y reconstruye la tabla entera: dos a la vez se
 * bloquearían mutuamente en la base y agotarían el pool de conexiones.
 */
let enCurso: Promise<unknown> = Promise.resolve();

export function recalcularPuntosCriticos(
  ex: Ejecutor,
  radioM?: number,
  crsMetrico?: number,
  registro: RegistroCategorias = REGISTRO_CATEGORIAS,
): Promise<ResumenPuntosCriticos> {
  const siguiente = enCurso
    .catch(() => {})
    .then(() => {
      // El CRS se resuelve aquí dentro y no como valor por defecto del parámetro: una variable
      // mal escrita tiene que llegar como promesa rechazada, no como excepción síncrona que se
      // salta el `.catch()` de quien llama (el mantenimiento de api-core).
      const crs = crsMetrico ?? crsMetricoEpsg();
      return ex.transaccion(async (tx) => {
        // `enCurso` solo serializa dentro de ESTE proceso. Con varias réplicas hace falta que la
        // exclusión viva en la base, y con la misma clave que usa el recálculo incremental.
        await tx.consultar('SELECT pg_advisory_xact_lock($1)', [CLAVE_LOCK_PUNTOS_CRITICOS]);
        return construirPuntosCriticos(tx, radioM, null, crs, registro);
      });
    });
  enCurso = siguiente;
  return siguiente;
}
