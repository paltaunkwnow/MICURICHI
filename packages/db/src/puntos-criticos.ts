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
 */
import { CONFIG_DOMINIO, distanciaAproximadaM } from 'contracts';
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
}

/** Columnas de reporte que necesita el agrupador, exactas y publicables. */
export const COLUMNAS_AGRUPACION = `id::text, ST_X(geom) AS lon, ST_Y(geom) AS lat,
        ST_X(geom_publico) AS lon_publico, ST_Y(geom_publico) AS lat_publico,
        creado_en::text, COALESCE(severidad_manual, severidad_calculada)::text AS severidad`;

export interface ResumenPuntosCriticos {
  puntos: number;
  reportes: number;
  motor: 'postgis' | 'node';
}

async function agruparEnPostgis(
  ex: Ejecutor,
  radioM: number,
  crsMetrico: number,
): Promise<Map<number, FilaReporte[]> | null> {
  try {
    // `eps` en metros porque la geometría va proyectada al CRS métrico (§9.2). El `::int` no es
    // decorativo: sin él, `ST_Transform(geometry, unknown)` es ambiguo con la variante de texto.
    const filas = await ex.consultar<FilaReporte & { cid: number }>(
      `SELECT ${COLUMNAS_AGRUPACION},
              ST_ClusterDBSCAN(ST_Transform(geom, $2::int), eps := $1, minpoints := 1) OVER () AS cid
       FROM reporte_inundacion WHERE estado IN ('validado', 'resuelto')`,
      [radioM, crsMetrico],
    );
    const grupos = new Map<number, FilaReporte[]>();
    for (const f of filas) {
      const g = grupos.get(f.cid) ?? [];
      g.push(f);
      grupos.set(f.cid, g);
    }
    return grupos;
  } catch (e) {
    // Solo se cae al DBSCAN en Node si la build de PostGIS no trae la función (SQLSTATE 42883,
    // "undefined_function"). Cualquier otro fallo —conexión caída, permisos, tabla ausente— se
    // propaga: tragárselo convertía un problema de base en un escaneo silencioso en memoria.
    if ((e as { code?: string }).code !== '42883') throw e;
    return null;
  }
}

async function agruparEnNode(
  ex: Ejecutor,
  radioM: number,
  crsMetrico: number,
): Promise<Map<number, FilaReporte[]>> {
  // Las mismas coordenadas proyectadas que usa ST_ClusterDBSCAN: la distancia en Node es la plana
  // en metros del CRS métrico, no una aproximación sobre grados.
  const filas = await ex.consultar<FilaReporte & { x: number; y: number }>(
    `SELECT ${COLUMNAS_AGRUPACION}, ST_X(geom_m) AS x, ST_Y(geom_m) AS y
     FROM (SELECT *, ST_Transform(geom, $1::int) AS geom_m FROM reporte_inundacion
           WHERE estado IN ('validado', 'resuelto')) AS r`,
    [crsMetrico],
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
  return grupos;
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
 * `grupos = null` significa reconstrucción total: se recalculan todos los grupos y se vacía la
 * tabla antes de insertar. Es lo que usan el CLI de reparación y los seeds. `crsMetrico` solo se
 * usa en ese caso; por defecto, `CRS_METRICO_EPSG`.
 */
export async function construirPuntosCriticos(
  tx: Ejecutor,
  radioM: number,
  grupos: FilaReporte[][] | null,
  crsMetrico?: number,
): Promise<ResumenPuntosCriticos> {
  let motor: 'postgis' | 'node' = 'postgis';
  let porGrupo = grupos;
  if (porGrupo === null) {
    const crs = crsMetrico ?? crsMetricoEpsg();
    let calculados = await agruparEnPostgis(tx, radioM, crs);
    if (!calculados) {
      motor = 'node';
      calculados = await agruparEnNode(tx, radioM, crs);
    }
    porGrupo = [...calculados.values()];
    await tx.ejecutar(
      'UPDATE reporte_inundacion SET punto_critico_id = NULL WHERE punto_critico_id IS NOT NULL',
    );
    await tx.ejecutar('DELETE FROM punto_critico');
  }

  let reportes = 0;
  let puntos = 0;
  for (const miembros of porGrupo) {
    if (!miembros.length) continue;
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
      `INSERT INTO punto_critico (geom, geom_publico, n_reportes, primer_reporte_en, ultimo_reporte_en, severidad_max, distrito_id, unidad_vecinal_id, radio_m, diametro_m, advertencia_diametro)
       SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326),
              CASE WHEN $10::float8 IS NULL THEN NULL
                   ELSE ST_SetSRID(ST_MakePoint(round($10::numeric, 5)::float8, round($11::numeric, 5)::float8), 4326) END,
              $3, $4::timestamptz, $5::timestamptz, $6::severidad,
              (SELECT id FROM geo.distrito_municipal_vigente d WHERE ST_Contains(d.geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)) ORDER BY id LIMIT 1),
              (SELECT id FROM geo.unidad_vecinal_vigente u WHERE ST_Contains(u.geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)) ORDER BY id LIMIT 1),
              $7, $8, $9
       RETURNING id::text`,
      [
        lon,
        lat,
        miembros.length,
        fechas[0],
        fechas[fechas.length - 1],
        severidadMax,
        radioM,
        Math.round(diametro * 10) / 10,
        diametro > CONFIG_DOMINIO.RECURRENCIA_DIAMETRO_ADVERTENCIA_M,
        publicables?.lon ?? null,
        publicables?.lat ?? null,
      ],
    );
    await tx.consultar(
      'UPDATE reporte_inundacion SET punto_critico_id = $1 WHERE id = ANY($2::uuid[])',
      [pc!.id, miembros.map((m) => m.id)],
    );
    reportes += miembros.length;
    puntos++;
  }
  return { puntos, reportes, motor };
}

/**
 * Reconstruye TODA la tabla de puntos críticos. Es O(n) en reportes y O(g) en idas a la base,
 * así que **no** debe usarse en el camino de una petición: para eso está
 * `recalcularEntornoDeReporte`, que solo toca la componente afectada. Queda para el CLI de
 * reparación, los seeds y como red de seguridad cuando una componente crece demasiado.
 *
 * Se serializa dentro del proceso porque vacía y reconstruye la tabla entera: dos a la vez se
 * bloquearían mutuamente en la base y agotarían el pool de conexiones.
 */
let enCurso: Promise<unknown> = Promise.resolve();

export function recalcularPuntosCriticos(
  ex: Ejecutor,
  radioM = CONFIG_DOMINIO.RECURRENCIA_RADIO_M,
  crsMetrico?: number,
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
        return construirPuntosCriticos(tx, radioM, null, crs);
      });
    });
  enCurso = siguiente;
  return siguiente;
}
