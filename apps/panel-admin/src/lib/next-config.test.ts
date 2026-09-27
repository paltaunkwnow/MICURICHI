import type { NextConfig } from 'next';
import { describe, expect, it, vi } from 'vitest';
import { PLAZOS_MS } from './api';

/**
 * `next.config.ts` se evalúa al compilar y queda serializado en la salida: todo lo que lea de
 * `process.env` se congela en la imagen. Una instalación por ciudad con la misma imagen exige que
 * no lea nada que cambie de un despliegue a otro. Misma prueba que en web-ciudadano.
 */
async function cargarConfig(variables: Record<string, string>): Promise<NextConfig> {
  const previas = Object.fromEntries(Object.keys(variables).map((v) => [v, process.env[v]]));
  Object.assign(process.env, variables);
  try {
    vi.resetModules();
    return (await import('../../next.config')).default;
  } finally {
    for (const [v, valor] of Object.entries(previas)) {
      if (valor === undefined) delete process.env[v];
      else process.env[v] = valor;
    }
  }
}

const DE_DESPLIEGUE = {
  API_CORE_URL: 'http://api-core:3001',
  GEO_SERVICE_URL: 'http://geo-service:3002',
  HSTS: '1',
};

async function reglasDeCabeceras(config: NextConfig) {
  return (await config.headers?.()) ?? [];
}

describe('next.config.ts no congela nada del despliegue', () => {
  it('produce una salida autocontenida para la imagen (output: standalone)', async () => {
    expect((await cargarConfig({})).output).toBe('standalone');
  });

  it('no mete ninguna variable en el JavaScript público', async () => {
    expect((await cargarConfig(DE_DESPLIEGUE)).env).toBeUndefined();
  });

  it('no fija al compilar adónde se reenvían /api y /geo (lo hace src/proxy.ts)', async () => {
    expect((await cargarConfig(DE_DESPLIEGUE)).rewrites).toBeUndefined();
  });

  it('no fija HSTS al compilar aunque HSTS=1 (lo decide src/proxy.ts en cada petición)', async () => {
    const reglas = await reglasDeCabeceras(await cargarConfig(DE_DESPLIEGUE));
    expect(JSON.stringify(reglas).toLowerCase()).not.toContain('strict-transport-security');
  });

  it('el reenvío espera una exportación tanto como el panel (no los 30 s de Next)', async () => {
    // Next corta el reenvío tras `proxyTimeout` ms sin actividad; por defecto, 30 s. El panel
    // espera la exportación hasta PLAZOS_MS.exportacion: con 30 s, una selección grande que
    // api-core tarda en empezar a mandar llegaba como «Internal Server Error».
    expect((await cargarConfig({})).experimental?.proxyTimeout).toBe(PLAZOS_MS.exportacion);
  });

  it('no fija ninguna CSP: la única es la de src/proxy.ts, con el nonce de cada petición', async () => {
    // Una segunda política sin el nonce se aplicaría junto con la del proxy y bloquearía los
    // <script> en línea de Next; una con 'unsafe-inline' dejaría el nonce sin efecto práctico.
    const cabeceras = await cabecerasFijas(await cargarConfig({ NODE_ENV: 'production' }));
    expect(cabeceras.has('content-security-policy')).toBe(false);
    expect(cabeceras.has('content-security-policy-report-only')).toBe(false);
  });

  it('conserva el resto de las cabeceras de seguridad', async () => {
    const cabeceras = await cabecerasFijas(await cargarConfig({}));
    expect(cabeceras.get('x-content-type-options')).toBe('nosniff');
    expect(cabeceras.get('x-frame-options')).toBe('DENY');
    expect(cabeceras.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(cabeceras.get('permissions-policy')).toContain('geolocation=()');
    expect(cabeceras.get('permissions-policy')).toContain('camera=()');
  });
});

async function cabecerasFijas(config: NextConfig): Promise<Map<string, string>> {
  const reglas = await reglasDeCabeceras(config);
  return new Map(reglas.flatMap((r) => r.headers.map((h) => [h.key.toLowerCase(), h.value])));
}
