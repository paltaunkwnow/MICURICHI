import type { NextConfig } from 'next';
import { describe, expect, it, vi } from 'vitest';

/**
 * `next.config.ts` se evalúa al compilar y queda serializado en la salida: todo lo que lea de
 * `process.env` se congela en la imagen. Una instalación por ciudad con la misma imagen exige que
 * no lea nada que cambie de un despliegue a otro.
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
  PANEL_ADMIN_URL: 'https://panel.ejemplo.bo',
  HSTS: '1',
};

async function reglasDeCabeceras(config: NextConfig) {
  return (await config.headers?.()) ?? [];
}

describe('next.config.ts no congela nada del despliegue', () => {
  it('produce una salida autocontenida para la imagen (output: standalone)', async () => {
    expect((await cargarConfig({})).output).toBe('standalone');
  });

  it('no mete ninguna variable en el JavaScript público (la URL del panel llega por /auth/yo)', async () => {
    const config = await cargarConfig(DE_DESPLIEGUE);
    expect(config.env).toBeUndefined();
  });

  it('no fija al compilar adónde se reenvían /api y /geo (lo hace src/proxy.ts)', async () => {
    const config = await cargarConfig(DE_DESPLIEGUE);
    expect(config.rewrites).toBeUndefined();
  });

  it('no fija HSTS al compilar aunque HSTS=1 (lo decide src/proxy.ts en cada petición)', async () => {
    const reglas = await reglasDeCabeceras(await cargarConfig(DE_DESPLIEGUE));
    expect(JSON.stringify(reglas).toLowerCase()).not.toContain('strict-transport-security');
  });

  it('la CSP no abre orígenes nuevos: solo las teselas de OpenStreetMap', async () => {
    const reglas = await reglasDeCabeceras(await cargarConfig(DE_DESPLIEGUE));
    const csp = reglas
      .flatMap((r) => r.headers)
      .find((h) => h.key.toLowerCase() === 'content-security-policy')?.value;
    expect(csp).toBeDefined();
    const directivas = new Map(
      (csp ?? '').split(';').map((d) => {
        const [nombre = '', ...valores] = d.trim().split(/\s+/);
        return [nombre, valores] as const;
      }),
    );
    const origenes = [...directivas.values()].flat().filter((v) => /^(https?:|wss?:)/.test(v));
    expect(new Set(origenes)).toEqual(new Set(['https://tile.openstreetmap.org']));
    expect(directivas.get('connect-src')).toEqual(["'self'", 'https://tile.openstreetmap.org']);
    expect(directivas.get('default-src')).toEqual(["'self'"]);
  });
});
