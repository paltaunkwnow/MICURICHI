/**
 * Regresión de la Fase 4: el recálculo de puntos críticos tiene que sobrevivir a un grupo grande.
 *
 * El fallo, visto al arrancar la pila en Docker contra PostgreSQL real con un millón de reportes:
 *
 *   RangeError: Maximum call stack size exceeded
 *       at diametroM (puntos-criticos.js:96)
 *       at construirPuntosCriticos (puntos-criticos.js:143)
 *
 * La causa era `Math.min(...lats)` con el array de miembros del grupo. El spread pasa cada
 * elemento como un argumento distinto, y V8 revienta a partir de unas decenas de miles. No es un
 * caso rebuscado: DBSCAN corre con `minpoints = 1` (CLAUDE.md §9.2), así que agrupa por cercanía
 * transitiva y en una ciudad densa un solo grupo puede encadenar cientos de miles de reportes. Es
 * decir, el código fallaba exactamente cuando más falta hacía que funcionara.
 *
 * El test no necesita base de datos: `construirPuntosCriticos` acepta los grupos ya formados, así
 * que basta un `Ejecutor` de mentira. Con un millón de filas reales tardaría minutos; así tarda
 * un segundo y comprueba lo mismo.
 */
import { describe, expect, it } from 'vitest';
import type { Ejecutor } from '../src/ejecutor.js';
import { construirPuntosCriticos, type FilaReporte } from '../src/puntos-criticos.js';

/** Ejecutor que no toca ninguna base: devuelve un id para el INSERT y nada para lo demás. */
function ejecutorDeMentira(): { ex: Ejecutor; inserciones: number } {
  const estado = { inserciones: 0 };
  const ex: Ejecutor = {
    async ejecutar() {},
    async consultar<T>(sql: string) {
      if (sql.includes('INSERT INTO punto_critico')) {
        estado.inserciones++;
        return [{ id: '11111111-1111-4111-8111-111111111111' }] as T[];
      }
      return [] as T[];
    },
    async transaccion<T>(fn: (e: Ejecutor) => Promise<T>) {
      return fn(ex);
    },
  };
  return {
    ex,
    get inserciones() {
      return estado.inserciones;
    },
  };
}

/** Un grupo de `n` reportes repartidos en una franja estrecha, como una calle larga. */
function grupoDe(n: number): FilaReporte[] {
  const filas: FilaReporte[] = [];
  for (let i = 0; i < n; i++) {
    const lon = -63.19 + i * 0.0000002;
    const lat = -17.79 + (i % 7) * 0.0000002;
    filas.push({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      lon,
      lat,
      lon_publico: Math.round(lon * 1e5) / 1e5,
      lat_publico: Math.round(lat * 1e5) / 1e5,
      creado_en: new Date(Date.UTC(2026, 0, 1, 0, 0, i % 60)).toISOString(),
      severidad: (['baja', 'media', 'alta', 'critica'] as const)[i % 4] as string,
    });
  }
  return filas;
}

describe('recálculo de puntos críticos con grupos grandes (§12)', () => {
  it('un grupo de 200 000 miembros no desborda la pila', async () => {
    // 200 000 está cómodamente por encima del punto donde el spread revienta (unas 125 000
    // argumentos en V8) y por debajo de lo que tardaría en hacer lento el test.
    const grupo = grupoDe(200_000);
    const { ex } = ejecutorDeMentira();
    const r = await construirPuntosCriticos(ex, 25, [grupo]);
    expect(r.puntos).toBe(1);
    expect(r.reportes).toBe(200_000);
  }, 60_000);

  it('el diámetro del grupo grande sale por la cota del bbox y es coherente', async () => {
    // El grupo va de lon -63.19 a -63.19 + 100 000·2e-7 = -63.17, o sea unos 2 km de ancho.
    // Lo que se comprueba es que el valor guardado tiene sentido y no es 0 ni NaN.
    const grupo = grupoDe(100_000);
    let diametroGuardado: number | null = null;
    const ex: Ejecutor = {
      async ejecutar() {},
      async consultar<T>(sql: string, params: unknown[] = []) {
        if (sql.includes('INSERT INTO punto_critico')) {
          diametroGuardado = params[7] as number;
          return [{ id: '11111111-1111-4111-8111-111111111111' }] as T[];
        }
        return [] as T[];
      },
      async transaccion<T>(fn: (e: Ejecutor) => Promise<T>) {
        return fn(ex);
      },
    };
    await construirPuntosCriticos(ex, 25, [grupo]);
    expect(diametroGuardado).not.toBeNull();
    expect(Number.isFinite(diametroGuardado as unknown as number)).toBe(true);
    // Unos 2 km de extensión: se acepta un margen amplio porque es una cota por bbox, no exacta.
    expect(diametroGuardado as unknown as number).toBeGreaterThan(1000);
    expect(diametroGuardado as unknown as number).toBeLessThan(5000);
  }, 60_000);
});
