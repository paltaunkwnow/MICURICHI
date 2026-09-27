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

  it('Permissions-Policy deja usar ubicación y cámara solo al propio origen, y nada más', async () => {
    const reglas = await reglasDeCabeceras(await cargarConfig(DE_DESPLIEGUE));
    const politica = reglas
      .flatMap((r) => r.headers)
      .find((h) => h.key.toLowerCase() === 'permissions-policy')?.value;
    const permisos = new Map(
      (politica ?? '').split(',').map((d) => {
        const [nombre = '', valor = ''] = d.trim().split('=');
        return [nombre, valor] as const;
      }),
    );
    // La cámara hace falta para «Sacar foto» dentro de la página; sin `(self)` getUserMedia
    // falla con NotAllowedError aunque la persona diga que sí.
    expect(permisos.get('camera')).toBe('(self)');
    expect(permisos.get('geolocation')).toBe('(self)');
    for (const cerrado of ['microphone', 'payment', 'usb']) {
      expect(permisos.get(cerrado), cerrado).toBe('()');
    }
  });

  it('no fija ninguna CSP: la única es la de src/proxy.ts, con el nonce de cada petición', async () => {
    // Una segunda política sin el nonce se aplicaría junto con la del proxy y bloquearía los
    // <script> en línea de Next; una con 'unsafe-inline' dejaría el nonce sin efecto práctico.
    for (const NODE_ENV of ['production', 'development']) {
      const reglas = await reglasDeCabeceras(await cargarConfig({ ...DE_DESPLIEGUE, NODE_ENV }));
      const claves = reglas.flatMap((r) => r.headers.map((h) => h.key.toLowerCase()));
      expect(claves, NODE_ENV).not.toContain('content-security-policy');
      expect(claves, NODE_ENV).not.toContain('content-security-policy-report-only');
    }
  });

  it('el worker de MapLibre y los glifos con ?v= se sirven immutable por un año', async () => {
    const reglas = await reglasDeCabeceras(await cargarConfig({}));
    const inmutable = 'public, max-age=31536000, immutable';
    for (const prefijo of ['/maplibre/', '/glifos/']) {
      const regla = reglas.find(
        (r) =>
          r.source.startsWith(prefijo) &&
          r.headers.some((h) => h.key.toLowerCase() === 'cache-control'),
      );
      expect(regla, prefijo).toBeDefined();
      expect(
        regla?.headers.find((h) => h.key.toLowerCase() === 'cache-control')?.value,
        prefijo,
      ).toBe(inmutable);
      // Solo con la versión en la URL: sin ella, la copia de un año no se podría renovar nunca.
      expect(regla?.has, prefijo).toEqual([{ type: 'query', key: 'v' }]);
    }
    // Nada más se marca immutable: ni el service worker, ni el manifiesto, ni las páginas.
    const conCacheControl = reglas.filter((r) =>
      r.headers.some((h) => h.key.toLowerCase() === 'cache-control'),
    );
    expect(conCacheControl.map((r) => r.source.split('/')[1]).sort()).toEqual([
      'glifos',
      'maplibre',
    ]);
  });

  it('conserva el resto de las cabeceras de seguridad en todas las rutas', async () => {
    const reglas = await reglasDeCabeceras(await cargarConfig(DE_DESPLIEGUE));
    const todas = reglas.find((r) => r.source === '/(.*)');
    const cabeceras = new Map(todas?.headers.map((h) => [h.key.toLowerCase(), h.value]));
    expect(cabeceras.get('x-content-type-options')).toBe('nosniff');
    expect(cabeceras.get('x-frame-options')).toBe('DENY');
    expect(cabeceras.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  });
});
