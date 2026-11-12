/**
 * El recálculo incremental tiene que dar EXACTAMENTE lo mismo que reconstruir la tabla entera.
 * Cada caso hace el cambio, recalcula solo la vecindad y compara la partición resultante con la
 * que produce el recálculo completo sobre el mismo estado.
 */
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ejecutorPg } from '../src/ejecutor.js';
import { listarMigraciones } from '../src/migrar.js';
import { recalcularPuntosCriticos } from '../src/puntos-criticos.js';
import { recalcularEntornoDeReporte } from '../src/puntos-criticos-entorno.js';
import {
  type BaseEfimera,
  cargarCapasDePrueba,
  insertarReporte,
  levantarBaseEfimera,
} from '../src/test-utils.js';

let base: BaseEfimera;
let pool: pg.Pool;

beforeAll(async () => {
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 2 });
  await cargarCapasDePrueba(ejecutorPg(pool));
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await base?.cerrar();
});

beforeEach(async () => {
  await limpiarInundaciones();
});

async function limpiarInundaciones() {
  await pool.query("DELETE FROM reporte WHERE categoria = 'inundacion'");
  await pool.query("DELETE FROM punto_critico WHERE categoria = 'inundacion'");
}

/** Inserta un reporte en (lon, lat). Por defecto validado, es decir, activo para la agrupación. */
async function crear(lon: number, lat: number, estado = 'validado'): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO reporte (categoria, geom, distrito_id, unidad_vecinal_id, ubicacion_metodo, ubicacion_tipo,
       descripcion, detalle, detalle_version, severidad_calculada,
       severidad_puntaje, severidad_version, estado, publicar_en)
     VALUES ('inundacion', ST_SetSRID(ST_MakePoint($1, $2), 4326), 'distrito_municipal:01', 'unidad_vecinal:A', 'manual',
       'via_publica', 'Reporte de prueba de agrupacion incremental', '{"profundidad_estimada":"rodilla","frecuencia":"ocasional","causa_presunta":"desconocida"}'::jsonb, 1,
       'media', 6, 2, $3::estado_reporte, now()) RETURNING id::text`,
    [lon, lat, estado],
  );
  return r.rows[0]!.id;
}

async function cambiarEstado(id: string, estado: string) {
  // Desde la migración 0018, rechazar o duplicar exige un motivo no vacío (lo que la API siempre
  // fija al moderar). El motivo no influye en la agrupación, que es lo único que prueba este
  // archivo; se pone uno fijo para que el fixture sea válido bajo el nuevo CHECK.
  await pool.query(
    "UPDATE reporte SET estado = $2::estado_reporte, estado_motivo = $3 WHERE categoria = 'inundacion' AND id = $1",
    [id, estado, 'Cambio de estado en prueba de recálculo'],
  );
}

/** Partición actual: conjuntos de ids que comparten punto crítico, en forma comparable. */
async function particion(): Promise<string[][]> {
  const r = await pool.query<{ pc: string | null; id: string }>(
    `SELECT punto_critico_id::text AS pc, id::text FROM reporte
     WHERE categoria = 'inundacion' AND estado IN ('validado','resuelto') ORDER BY id`,
  );
  const grupos = new Map<string, string[]>();
  for (const f of r.rows) {
    // Un reporte activo sin punto crítico sería un fallo: se agrupa aparte para que se vea.
    const clave = f.pc ?? `SIN_PUNTO:${f.id}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), f.id]);
  }
  return [...grupos.values()].map((g) => g.sort()).sort((a, b) => a[0]!.localeCompare(b[0]!));
}

/** La misma partición que produciría reconstruir la tabla completa. */
async function particionDeReferencia(): Promise<string[][]> {
  await recalcularPuntosCriticos(ejecutorPg(pool));
  return particion();
}

/** ~11 m en latitud: dentro del radio de 25 m. */
const CERCA = 0.0001;
/** ~111 m: fuera del radio. */
const LEJOS = 0.001;

describe('recálculo incremental de puntos críticos', () => {
  it('alta: un reporte aislado forma su propio punto crítico', async () => {
    const a = await crear(-63.195, -17.79);
    await recalcularEntornoDeReporte(ejecutorPg(pool), a);
    const incremental = await particion();
    expect(incremental).toEqual([[a]]);
    expect(await particionDeReferencia()).toEqual(incremental);
  });

  it('alta: un reporte cercano se une al grupo existente', async () => {
    const a = await crear(-63.195, -17.79);
    await recalcularEntornoDeReporte(ejecutorPg(pool), a);
    const b = await crear(-63.195, -17.79 + CERCA);
    await recalcularEntornoDeReporte(ejecutorPg(pool), b);
    const incremental = await particion();
    expect(incremental).toHaveLength(1);
    expect(incremental[0]).toEqual([a, b].sort());
    expect(await particionDeReferencia()).toEqual(incremental);
  });

  it('fusión: un reporte en medio une dos grupos que estaban separados', async () => {
    // A y C están a ~22 m entre sí pasando por B, pero a ~44 m directamente: sin B son 2 grupos.
    const a = await crear(-63.195, -17.79);
    const c = await crear(-63.195, -17.79 + 2 * CERCA * 2);
    await recalcularEntornoDeReporte(ejecutorPg(pool), a);
    await recalcularEntornoDeReporte(ejecutorPg(pool), c);
    expect(await particion()).toHaveLength(2);

    const b = await crear(-63.195, -17.79 + CERCA * 2);
    await recalcularEntornoDeReporte(ejecutorPg(pool), b);
    const incremental = await particion();
    expect(incremental).toHaveLength(1);
    expect(incremental[0]).toEqual([a, b, c].sort());
    expect(await particionDeReferencia()).toEqual(incremental);
  });

  it('división: quitar el reporte puente parte el grupo en dos', async () => {
    const a = await crear(-63.195, -17.79);
    const b = await crear(-63.195, -17.79 + CERCA * 2);
    const c = await crear(-63.195, -17.79 + CERCA * 4);
    await recalcularPuntosCriticos(ejecutorPg(pool));
    expect(await particion()).toHaveLength(1);

    await cambiarEstado(b, 'rechazado');
    await recalcularEntornoDeReporte(ejecutorPg(pool), b);
    const incremental = await particion();
    expect(incremental).toHaveLength(2);
    expect(incremental.flat().sort()).toEqual([a, c].sort());
    expect(await particionDeReferencia()).toEqual(incremental);

    // Y el reporte que salió queda sin punto crítico, no colgando del viejo.
    const r = await pool.query<{ pc: string | null }>(
      "SELECT punto_critico_id::text AS pc FROM reporte WHERE categoria = 'inundacion' AND id = $1",
      [b],
    );
    expect(r.rows[0]?.pc).toBeNull();
  });

  it('baja: quitar el último reporte disuelve el punto crítico', async () => {
    const a = await crear(-63.195, -17.79);
    await recalcularEntornoDeReporte(ejecutorPg(pool), a);
    await cambiarEstado(a, 'rechazado');
    await recalcularEntornoDeReporte(ejecutorPg(pool), a);
    const n = await pool.query<{ n: string }>('SELECT count(*)::text AS n FROM punto_critico');
    expect(n.rows[0]?.n).toBe('0');
  });

  it('no toca los grupos lejanos: sus puntos críticos conservan el mismo id', async () => {
    const lejano = await crear(-63.18, -17.785);
    await recalcularEntornoDeReporte(ejecutorPg(pool), lejano);
    const antes = await pool.query<{ pc: string }>(
      "SELECT punto_critico_id::text AS pc FROM reporte WHERE categoria = 'inundacion' AND id = $1",
      [lejano],
    );

    const cerca = await crear(-63.195, -17.79);
    await recalcularEntornoDeReporte(ejecutorPg(pool), cerca);

    const despues = await pool.query<{ pc: string }>(
      "SELECT punto_critico_id::text AS pc FROM reporte WHERE categoria = 'inundacion' AND id = $1",
      [lejano],
    );
    // Esta es la diferencia con el recálculo completo, que borraba y recreaba TODO.
    expect(despues.rows[0]?.pc).toBe(antes.rows[0]?.pc);
    expect(await particion()).toHaveLength(2);
  });

  it('coincide con el recálculo completo en un escenario con altas, bajas y cadenas', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) {
      // Tres cadenas de cuatro reportes, separadas entre sí más del radio.
      const cadena = Math.floor(i / 4);
      const paso = i % 4;
      ids.push(await crear(-63.195 + cadena * LEJOS, -17.79 + paso * CERCA * 2));
    }
    for (const id of ids) await recalcularEntornoDeReporte(ejecutorPg(pool), id);
    const trasAltas = await particion();
    expect(trasAltas).toHaveLength(3);

    // Se dan de baja dos puentes y se reactiva uno.
    await cambiarEstado(ids[1]!, 'rechazado');
    await recalcularEntornoDeReporte(ejecutorPg(pool), ids[1]!);
    await cambiarEstado(ids[6]!, 'duplicado');
    await recalcularEntornoDeReporte(ejecutorPg(pool), ids[6]!);
    await cambiarEstado(ids[1]!, 'resuelto');
    await recalcularEntornoDeReporte(ejecutorPg(pool), ids[1]!);

    const incremental = await particion();
    expect(await particionDeReferencia()).toEqual(incremental);
  });

  it('un reporte inexistente no rompe ni cambia nada', async () => {
    const a = await crear(-63.195, -17.79);
    await recalcularEntornoDeReporte(ejecutorPg(pool), a);
    const antes = await particion();
    const r = await recalcularEntornoDeReporte(
      ejecutorPg(pool),
      '00000000-0000-0000-0000-000000000000',
    );
    expect(r.afectados).toBe(0);
    expect(await particion()).toEqual(antes);
  });
});

describe('el coste no crece con el tamaño de la tabla', () => {
  it('con 2000 reportes solo toca la componente afectada, no la tabla entera', async () => {
    // Se mide el TRABAJO, no el tiempo: un test por reloj sería inestable en CI. Lo que detecta
    // una vuelta atrás al recálculo completo es que `afectados` crezca con el total de reportes.
    const filas: string[] = [];
    const params: unknown[] = [];
    for (let i = 0; i < 2000; i++) {
      const foco = Math.floor(i / 2);
      const lon = -63.1995 + (foco % 40) * 0.0005 + (i % 2) * 0.00002;
      const lat = -17.7995 + Math.floor(foco / 40) * 0.0005 + (i % 2) * 0.00002;
      const b = params.length;
      filas.push(
        `('inundacion', ST_SetSRID(ST_MakePoint($${b + 1}, $${b + 2}), 4326), 'distrito_municipal:01', 'unidad_vecinal:A', 'manual', 'via_publica', 'Reporte de prueba de escala del recalculo', '{"profundidad_estimada":"rodilla","frecuencia":"ocasional","causa_presunta":"desconocida"}'::jsonb, 1, 'media', 6, 2, 'validado', now())`,
      );
      params.push(lon, lat);
    }
    await pool.query(
      `INSERT INTO reporte (categoria, geom, distrito_id, unidad_vecinal_id, ubicacion_metodo, ubicacion_tipo, descripcion,
        detalle, detalle_version, severidad_calculada, severidad_puntaje, severidad_version, estado, publicar_en)
       VALUES ${filas.join(',')}`,
      params,
    );
    await recalcularPuntosCriticos(ejecutorPg(pool));
    const puntosAntes = await pool.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM punto_critico',
    );
    expect(Number(puntosAntes.rows[0]!.n)).toBeGreaterThan(500);

    const [uno] = (
      await pool.query<{ id: string }>(
        "SELECT id::text FROM reporte WHERE categoria = 'inundacion' LIMIT 1",
      )
    ).rows;
    const r = await recalcularEntornoDeReporte(ejecutorPg(pool), uno!.id);

    // Su foco tiene 2 reportes: se recalculan esos, no los 2000.
    expect(r.afectados).toBeLessThanOrEqual(10);
    expect(r.puntos).toBeLessThanOrEqual(10);
    expect(r.completo).toBe(false);

    // Y el resto de la tabla sigue en pie: el recálculo completo la vaciaba y la rehacía entera.
    const puntosDespues = await pool.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM punto_critico',
    );
    expect(Number(puntosDespues.rows[0]!.n)).toBe(Number(puntosAntes.rows[0]!.n));
  }, 180_000);
});

describe('concurrencia del recálculo', () => {
  it('cuatro recálculos simultáneos no se bloquean entre sí', async () => {
    // El recálculo toma `pg_advisory_xact_lock` dentro de su transacción. Con PGlite, que
    // multiplexa todas las conexiones sobre un único backend, un lock mal puesto podía dejar el
    // proceso entero esperándose a sí mismo. Este test existe para que eso no vuelva a colarse.
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) ids.push(await crear(-63.195 + i * 0.001, -17.79));

    const resultados = await Promise.all(
      ids.slice(0, 4).map((id) => recalcularEntornoDeReporte(ejecutorPg(pool), id)),
    );
    expect(resultados).toHaveLength(4);
    for (const r of resultados) expect(r.completo).toBe(false);

    // Y el resultado final coincide con el del recálculo completo: ninguna carrera dejó
    // puntos duplicados ni reportes sin agrupar.
    const incremental = await particion();
    expect(await particionDeReferencia()).toEqual(incremental);
  }, 60_000);
});

describe('M10.5: recurrencia vigente sobre tabla física', () => {
  it('M10.5: INSERT, UPDATE y lecturas propias usan reporte con filtro flood y base latest', async () => {
    const espia = vi.spyOn(pool, 'query');
    try {
      const id = await crear(-63.195, -17.79);
      await cambiarEstado(id, 'resuelto');
      await particion();
      const sql = espia.mock.calls
        .map((c) => c[0])
        .filter((q): q is string => typeof q === 'string');
      expect(sql).toHaveLength(3);
      expect(sql.every((q) => !q.includes('reporte_inundacion'))).toBe(true);
      expect(sql[0]).toMatch(/INSERT INTO reporte\s*\(categoria,/);
      expect(sql[0]).toContain("'inundacion'");
      expect(sql[1]).toContain("categoria = 'inundacion'");
      expect(sql[2]).toContain("categoria = 'inundacion'");
    } finally {
      espia.mockRestore();
    }
    const registradas = await pool.query<{ nombre: string }>(
      'SELECT nombre FROM _migraciones ORDER BY nombre',
    );
    expect(registradas.rows.map((r) => r.nombre)).toEqual(listarMigraciones());
  });

  it('M10.5: otras tres categorías superpuestas conservan filas, estado y grupos al limpiar inundación', async () => {
    const ex = ejecutorPg(pool);
    const ids: string[] = [];
    let puntos: string[] = [];
    try {
      for (const categoria of ['bache', 'basura', 'area_verde']) {
        const id = await insertarReporte(ex, -63.195, -17.79, 'validado', 'media', categoria);
        ids.push(id);
        await recalcularEntornoDeReporte(ex, id);
      }
      const gruposAntes = await pool.query<{ id: string; categoria: string }>(
        'SELECT p.id::text, p.categoria FROM punto_critico p JOIN reporte r ON r.punto_critico_id = p.id WHERE r.id = ANY($1::uuid[]) ORDER BY p.id',
        [ids],
      );
      puntos = gruposAntes.rows.map((p) => p.id);
      expect(gruposAntes.rows).toHaveLength(3);
      expect(gruposAntes.rows.map((p) => p.categoria).sort()).toEqual([
        'area_verde',
        'bache',
        'basura',
      ]);
      const filasAntes = await pool.query(
        'SELECT to_jsonb(r) AS fila FROM reporte r WHERE id = ANY($1::uuid[]) ORDER BY id',
        [ids],
      );
      expect(filasAntes.rows).toHaveLength(3);
      const flood = await crear(-63.195, -17.79);
      const resumen = await recalcularEntornoDeReporte(ex, flood);
      expect(resumen.afectados).toBe(1);
      expect(await particion()).toEqual([[flood]]);
      for (const id of ids) await cambiarEstado(id, 'rechazado');
      expect(
        (
          await pool.query(
            'SELECT to_jsonb(r) AS fila FROM reporte r WHERE id = ANY($1::uuid[]) ORDER BY id',
            [ids],
          )
        ).rows,
      ).toEqual(filasAntes.rows);
      await limpiarInundaciones();
      expect(await particion()).toEqual([]);
      expect(
        (
          await pool.query(
            'SELECT to_jsonb(r) AS fila FROM reporte r WHERE id = ANY($1::uuid[]) ORDER BY id',
            [ids],
          )
        ).rows,
      ).toEqual(filasAntes.rows);
      const gruposDespues = await pool.query(
        'SELECT id::text, categoria FROM punto_critico WHERE id = ANY($1::uuid[]) ORDER BY id',
        [puntos],
      );
      expect(gruposDespues.rows).toEqual(gruposAntes.rows);
    } finally {
      // Sólo filas de esta prueba; no se amplía la limpieza de los casos históricos de flood.
      await pool.query('DELETE FROM reporte WHERE id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM punto_critico WHERE id = ANY($1::uuid[])', [puntos]);
    }
  });
});
