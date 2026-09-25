/**
 * Recálculo INCREMENTAL de puntos críticos (CLAUDE.md §9.2: "para la vecindad del reporte").
 *
 * Por qué es equivalente al recálculo completo: con `minpoints = 1`, DBSCAN produce exactamente
 * las **componentes conexas** del grafo cuyos vértices son los reportes activos y cuyas aristas
 * unen pares a menos de `radio`. Añadir o quitar un vértice solo puede fusionar o partir SU
 * componente; las demás quedan idénticas. Así que recalcular la componente afectada da el mismo
 * resultado que reconstruir la tabla entera, y cuesta lo que mide esa componente en vez de O(n).
 *
 * Medición del recálculo completo antes de este cambio (PGlite local, focos separados ~55 m):
 * 100 reportes 283 ms, 1000 reportes 1233 ms, 5000 reportes 5213 ms; es decir ~3,1 ms por punto
 * crítico, y corría dentro de la petición HTTP en cada validación.
 */
import { CONFIG_DOMINIO } from 'contracts';
import type { Ejecutor } from './ejecutor.js';
import {
  CLAVE_LOCK_PUNTOS_CRITICOS,
  COLUMNAS_AGRUPACION,
  construirPuntosCriticos,
  type FilaReporte,
  METROS_POR_GRADO,
} from './puntos-criticos.js';

/** Si la componente afectada supera este tamaño se recalcula todo: algo encadenó de más. */
export const MAX_AFECTADOS = 5000;

/** La MISMA clave que usa el recálculo completo: los dos tienen que excluirse mutuamente. */
const CLAVE_LOCK = CLAVE_LOCK_PUNTOS_CRITICOS;

export interface ResumenEntorno {
  /** Reportes cuya pertenencia se recalculó. */
  afectados: number;
  /** Puntos críticos creados para esos reportes. */
  puntos: number;
  /** Puntos críticos disueltos antes de reconstruir. */
  disueltos: number;
  /** true si hubo que caer al recálculo completo. */
  completo: boolean;
  /**
   * true si la componente conexa superó `MAX_AFECTADOS` y NO se recalculó: queda pendiente para
   * el trabajo de mantenimiento. Quien llama debería registrarlo, porque significa que hay una
   * zona donde los reportes están encadenando de más (§9.2, limitación conocida de DBSCAN).
   */
  desbordado?: boolean;
}

interface Arista {
  origen: string;
  vecino: string;
}

/**
 * Vecinos (a menos de `radioM`) de un conjunto de reportes, en una sola ida a la base.
 * El `&&` con ST_Expand es el que usa el índice GIST: `ST_DWithin(geom::geography, ...)` por sí
 * solo no puede, porque el cast a geography es una expresión y el índice está sobre `geom`.
 */
async function vecinosDe(ex: Ejecutor, ids: string[], radioM: number): Promise<Arista[]> {
  if (!ids.length) return [];
  // Un grado de longitud mide menos que uno de latitud fuera del ecuador, así que expandir el
  // mismo número de grados en ambos ejes siempre cubre de sobra el círculo real. 1,05 es margen.
  const grados = (radioM / METROS_POR_GRADO) * 1.05;
  return ex.consultar<Arista>(
    `SELECT a.id::text AS origen, b.id::text AS vecino
     FROM reporte_inundacion a
     JOIN reporte_inundacion b
       ON b.id <> a.id
      AND b.estado IN ('validado', 'resuelto')
      AND b.geom && ST_Expand(a.geom, $2)
      AND ST_DWithin(b.geom::geography, a.geom::geography, $3)
     WHERE a.id = ANY($1::uuid[])`,
    [ids, grados, radioM],
  );
}

/** Expande las semillas hasta cubrir sus componentes conexas completas. */
async function expandirComponentes(
  ex: Ejecutor,
  semillas: string[],
  radioM: number,
): Promise<{ nodos: Set<string>; aristas: Arista[]; desbordado: boolean }> {
  const nodos = new Set(semillas);
  const aristas: Arista[] = [];
  let frontera = [...semillas];
  while (frontera.length) {
    if (nodos.size > MAX_AFECTADOS) return { nodos, aristas, desbordado: true };
    const encontradas = await vecinosDe(ex, frontera, radioM);
    const siguiente: string[] = [];
    for (const a of encontradas) {
      aristas.push(a);
      if (!nodos.has(a.vecino)) {
        nodos.add(a.vecino);
        siguiente.push(a.vecino);
      }
    }
    frontera = siguiente;
  }
  return { nodos, aristas, desbordado: false };
}

/** Componentes conexas a partir de las aristas descubiertas (union-find con compresión). */
function componentes(nodos: string[], aristas: Arista[]): Map<string, string[]> {
  const padre = new Map<string, string>();
  for (const n of nodos) padre.set(n, n);
  const buscar = (x: string): string => {
    let r = x;
    while (padre.get(r) !== r) r = padre.get(r)!;
    let a = x;
    while (padre.get(a) !== r) {
      const sig = padre.get(a)!;
      padre.set(a, r);
      a = sig;
    }
    return r;
  };
  for (const { origen, vecino } of aristas) {
    if (!padre.has(origen) || !padre.has(vecino)) continue;
    const ra = buscar(origen);
    const rb = buscar(vecino);
    if (ra !== rb) padre.set(ra, rb);
  }
  const grupos = new Map<string, string[]>();
  for (const n of nodos) {
    const r = buscar(n);
    const g = grupos.get(r);
    if (g) g.push(n);
    else grupos.set(r, [n]);
  }
  return grupos;
}

/**
 * Recalcula solo los puntos críticos que pudo alterar el cambio de estado de un reporte.
 * Devuelve `completo: true` si la componente era tan grande que convino rehacer la tabla entera.
 */
export async function recalcularEntornoDeReporte(
  ex: Ejecutor,
  reporteId: string,
  radioM: number = CONFIG_DOMINIO.RECURRENCIA_RADIO_M,
): Promise<ResumenEntorno> {
  return ex.transaccion(async (tx) => {
    // Un lock de transacción serializa los recálculos concurrentes también entre procesos:
    // sin él, dos validaciones sobre la misma zona leen el mismo grafo y crean puntos duplicados.
    await tx.consultar('SELECT pg_advisory_xact_lock($1)', [CLAVE_LOCK]);

    const [reporte] = await tx.consultar<{ punto_critico_id: string | null; activo: boolean }>(
      `SELECT punto_critico_id::text, (estado IN ('validado','resuelto')) AS activo
       FROM reporte_inundacion WHERE id = $1`,
      [reporteId],
    );
    if (!reporte) return { afectados: 0, puntos: 0, disueltos: 0, completo: false };

    // Semillas: el propio reporte (si sigue activo) y los que compartían su punto crítico,
    // que son justamente los que pueden quedar partidos si el reporte sale del grupo.
    const semillas = new Set<string>();
    if (reporte.activo) semillas.add(reporteId);
    if (reporte.punto_critico_id) {
      const companeros = await tx.consultar<{ id: string }>(
        `SELECT id::text FROM reporte_inundacion
         WHERE punto_critico_id = $1 AND id <> $2 AND estado IN ('validado','resuelto')`,
        [reporte.punto_critico_id, reporteId],
      );
      for (const c of companeros) semillas.add(c.id);
    }

    const { nodos, aristas, desbordado } = await expandirComponentes(tx, [...semillas], radioM);
    if (desbordado) {
      // Antes, aquí se lanzaba el recálculo COMPLETO de la tabla. Medido en la Fase 4 con 750 021
      // reportes publicables: **41,9 segundos**. Esto corre dentro de un `PATCH /estado`, con el
      // advisory lock global de puntos críticos tomado, así que durante esos cuarenta segundos
      // ninguna otra moderación avanza; y con `statement_timeout = 30s` la consulta muere a
      // medias, dejando al técnico un error 500 después de una espera larguísima.
      //
      // Lo correcto es no hacerlo aquí. El cambio de estado ya está confirmado —esta transacción
      // es aparte— así que la moderación es un éxito; lo único que queda pendiente es la
      // pertenencia a un punto crítico, que es un dato derivado y puede esperar al mantenimiento.
      // El reporte se queda sin `punto_critico_id`, y esa es justamente la señal que busca el
      // trabajo de fondo para saber que hay algo que rehacer.
      return { afectados: nodos.size, puntos: 0, disueltos: 0, completo: false, desbordado: true };
    }

    // Puntos críticos a disolver: el del reporte y los de todos los afectados. Si dos grupos se
    // fusionan, sus miembros están en `nodos` por conexidad, así que se disuelven ambos.
    const idsAfectados = [...nodos];
    const aBorrar = new Set<string>();
    if (reporte.punto_critico_id) aBorrar.add(reporte.punto_critico_id);
    if (idsAfectados.length) {
      const previos = await tx.consultar<{ pc: string }>(
        `SELECT DISTINCT punto_critico_id::text AS pc FROM reporte_inundacion
         WHERE id = ANY($1::uuid[]) AND punto_critico_id IS NOT NULL`,
        [idsAfectados],
      );
      for (const p of previos) aBorrar.add(p.pc);
    }
    // El FK lleva ON DELETE SET NULL: borrar el punto desvincula a sus reportes.
    if (aBorrar.size)
      await tx.consultar('DELETE FROM punto_critico WHERE id = ANY($1::uuid[])', [[...aBorrar]]);

    if (!idsAfectados.length)
      return { afectados: 0, puntos: 0, disueltos: aBorrar.size, completo: false };

    const filas = await tx.consultar<FilaReporte>(
      `SELECT ${COLUMNAS_AGRUPACION}
       FROM reporte_inundacion WHERE id = ANY($1::uuid[]) AND estado IN ('validado','resuelto')`,
      [idsAfectados],
    );
    const porId = new Map(filas.map((f) => [f.id, f]));
    const grupos = [
      ...componentes(
        filas.map((f) => f.id),
        aristas,
      ).values(),
    ].map((ids) => ids.map((i) => porId.get(i)!).filter(Boolean));
    const puntos = await construirPuntosCriticos(tx, radioM, grupos);
    return {
      afectados: filas.length,
      puntos: puntos.puntos,
      disueltos: aBorrar.size,
      completo: false,
    };
  });
}
