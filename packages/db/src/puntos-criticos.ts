/**
 * Recurrencia espacial (CLAUDE.md §9.2): agrupa reportes validados/resueltos en puntos críticos.
 * Intenta ST_ClusterDBSCAN en PostGIS; si la build no lo tiene (PGlite experimental), usa un
 * DBSCAN equivalente en Node (minpoints = 1 ⇒ componentes conexas por distancia ≤ radio).
 */
import { CONFIG_DOMINIO, distanciaAproximadaM } from 'contracts';
import type { Ejecutor } from './ejecutor.js';

const ORDEN_SEVERIDAD: Record<string, number> = { baja: 0, media: 1, alta: 2, critica: 3 };
const METROS_POR_GRADO = 111_320;

interface Fila {
  id: string;
  lon: number;
  lat: number;
  creado_en: string;
  severidad: string;
}

export interface ResumenPuntosCriticos {
  puntos: number;
  reportes: number;
  motor: 'postgis' | 'node';
}

async function agruparEnPostgis(ex: Ejecutor, radioM: number): Promise<Map<number, Fila[]> | null> {
  const epsGrados = radioM / METROS_POR_GRADO; // aproximación isotrópica; error ≤ 5 % en Santa Cruz (lat −17,8°)
  try {
    const filas = await ex.consultar<Fila & { cid: number }>(
      `SELECT id::text, ST_X(geom) AS lon, ST_Y(geom) AS lat, creado_en::text, COALESCE(severidad_manual, severidad_calculada)::text AS severidad,
              ST_ClusterDBSCAN(geom, eps := $1, minpoints := 1) OVER () AS cid
       FROM reporte_inundacion WHERE estado IN ('validado', 'resuelto')`,
      [epsGrados],
    );
    const grupos = new Map<number, Fila[]>();
    for (const f of filas) {
      const g = grupos.get(f.cid) ?? [];
      g.push(f);
      grupos.set(f.cid, g);
    }
    return grupos;
  } catch {
    return null;
  }
}

async function agruparEnNode(ex: Ejecutor, radioM: number): Promise<Map<number, Fila[]>> {
  const filas = await ex.consultar<Fila>(
    `SELECT id::text, ST_X(geom) AS lon, ST_Y(geom) AS lat, creado_en::text, COALESCE(severidad_manual, severidad_calculada)::text AS severidad
     FROM reporte_inundacion WHERE estado IN ('validado', 'resuelto')`,
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
  const celda = radioM / METROS_POR_GRADO;
  const rejilla = new Map<string, number[]>();
  const clave = (f: Fila) => `${Math.floor(f.lon / celda)}:${Math.floor(f.lat / celda)}`;
  filas.forEach((f, i) => {
    const k = clave(f);
    rejilla.set(k, [...(rejilla.get(k) ?? []), i]);
  });
  filas.forEach((f, i) => {
    const cx = Math.floor(f.lon / celda);
    const cy = Math.floor(f.lat / celda);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const j of rejilla.get(`${cx + dx}:${cy + dy}`) ?? []) {
          if (j <= i) continue;
          const g = filas[j]!;
          if (distanciaAproximadaM(f.lat, f.lon, g.lat, g.lon) <= radioM) unir(i, j);
        }
  });
  const grupos = new Map<number, Fila[]>();
  filas.forEach((f, i) => {
    const r = buscar(i);
    grupos.set(r, [...(grupos.get(r) ?? []), f]);
  });
  return grupos;
}

export async function recalcularPuntosCriticos(
  ex: Ejecutor,
  radioM = CONFIG_DOMINIO.RECURRENCIA_RADIO_M,
): Promise<ResumenPuntosCriticos> {
  let motor: 'postgis' | 'node' = 'postgis';
  let grupos = await agruparEnPostgis(ex, radioM);
  if (!grupos) {
    motor = 'node';
    grupos = await agruparEnNode(ex, radioM);
  }

  await ex.ejecutar('BEGIN');
  try {
    await ex.ejecutar(
      'UPDATE reporte_inundacion SET punto_critico_id = NULL WHERE punto_critico_id IS NOT NULL',
    );
    await ex.ejecutar('DELETE FROM punto_critico');
    let reportes = 0;
    for (const miembros of grupos.values()) {
      const lon = miembros.reduce((s, m) => s + m.lon, 0) / miembros.length;
      const lat = miembros.reduce((s, m) => s + m.lat, 0) / miembros.length;
      let diametro = 0;
      for (let i = 0; i < miembros.length; i++)
        for (let j = i + 1; j < miembros.length; j++) {
          const a = miembros[i]!;
          const b = miembros[j]!;
          diametro = Math.max(diametro, distanciaAproximadaM(a.lat, a.lon, b.lat, b.lon));
        }
      const fechas = miembros.map((m) => m.creado_en).sort();
      const severidadMax = miembros
        .map((m) => m.severidad)
        .sort((a, b) => (ORDEN_SEVERIDAD[b] ?? 0) - (ORDEN_SEVERIDAD[a] ?? 0))[0]!;
      const [pc] = await ex.consultar<{ id: string }>(
        `INSERT INTO punto_critico (geom, n_reportes, primer_reporte_en, ultimo_reporte_en, severidad_max, distrito_id, unidad_vecinal_id, radio_m, diametro_m, advertencia_diametro)
         SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326), $3, $4::timestamptz, $5::timestamptz, $6::severidad,
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
        ],
      );
      await ex.consultar(
        'UPDATE reporte_inundacion SET punto_critico_id = $1 WHERE id = ANY($2::uuid[])',
        [pc!.id, miembros.map((m) => m.id)],
      );
      reportes += miembros.length;
    }
    await ex.ejecutar('COMMIT');
    return { puntos: grupos.size, reportes, motor };
  } catch (e) {
    await ex.ejecutar('ROLLBACK');
    throw e;
  }
}
