import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheCorta } from '../src/cache-corta.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
});

/** Cálculo que tarda `ms` en fake timers y devuelve `valor`. */
const lento = (ms: number, valor: number) => () =>
  new Promise<number>((resolver) => setTimeout(() => resolver(valor), ms));

describe('CacheCorta: la edad de la copia cuenta desde que EMPEZÓ el cálculo', () => {
  it('un cálculo de 50 s no le suma 50 s de vida a la copia', async () => {
    const cache = new CacheCorta<number>(100_000, 120_000);
    const pedido = cache.obtener(lento(50_000, 1));
    await vi.advanceTimersByTimeAsync(50_000);
    expect(await pedido).toBe(1);

    // Los datos son de t = 0: a los 100 s de ahí ya están viejos, aunque se guardaron en t = 50 s.
    vi.setSystemTime(100_000);
    expect(cache.vigente()).toBeNull();
    expect(cache.revalidable()).toBe(1);
    // Y a los 120 s de ahí ya no se sirven: nadie ve una cifra de más de la edad máxima.
    vi.setSystemTime(120_000);
    expect(cache.revalidable()).toBeNull();
  });

  it('un cálculo rápido sigue fresco durante el TTL', async () => {
    const cache = new CacheCorta<number>(100_000, 120_000);
    expect(await cache.obtener(async () => 7)).toBe(7);
    vi.setSystemTime(99_999);
    expect(cache.vigente()).toBe(7);
  });

  it('el recálculo por detrás marca la copia nueva con su propio inicio', async () => {
    const cache = new CacheCorta<number>(100_000, 120_000);
    await cache.obtener(async () => 1);
    vi.setSystemTime(110_000);
    // Copia vieja servible: se devuelve ya y el recálculo (30 s) va por detrás.
    expect(await cache.obtener(lento(30_000, 2))).toBe(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(cache.vigente()).toBe(2);
    // Empezó en t = 110 s: a los 210 s ya no está fresca, aunque terminó en t = 140 s.
    vi.setSystemTime(210_000);
    expect(cache.vigente()).toBeNull();
  });
});
