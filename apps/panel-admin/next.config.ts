import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * Cabeceras que no cambian entre peticiones ni entre instalaciones, así que pueden quedar fijadas
 * al compilar (`headers()` se congela en `next build`). El panel no usa la ubicación ni la
 * cámara: `geolocation=()` y `camera=()`.
 *
 * La Content-Security-Policy NO va aquí: lleva un nonce distinto en cada petición y la pone
 * `src/proxy.ts`, junto con lo que depende del despliegue (el reenvío de `/api` y `/geo`, y
 * HSTS). Una segunda CSP fija se aplicaría a la vez que esa y bloquearía los <script> de Next.
 */
const cabeceras = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value: 'geolocation=(), camera=(), microphone=(), payment=(), usb=()',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // El manual del repositorio es el CLAUDE.md de la raíz: Next no debe generar los suyos.
  agentRules: false,
  // Imagen de producción: `.next/standalone` con un `server.js` mínimo y solo las dependencias
  // que usa. Una misma imagen por ciudad; lo propio de cada instalación llega por entorno.
  output: 'standalone',
  // Raíz del monorepo: `contracts` y el almacén de pnpm viven fuera de esta carpeta y el
  // trazado no los copiaría a la salida.
  outputFileTracingRoot: path.join(__dirname, '..', '..'),
  experimental: {
    // Milisegundos sin actividad tras los que Next corta el reenvío de `src/proxy.ts` (por
    // defecto 30 000). Igual a `PLAZOS_MS.exportacion` de `src/lib/api.ts`: el panel espera
    // hasta ahí una exportación grande, que api-core puede tardar en empezar a mandar. El resto
    // de las llamadas las corta antes el propio panel (20 s), y al cortar el navegador se corta
    // también el reenvío.
    proxyTimeout: 180_000,
  },
  async headers() {
    return [{ source: '/(.*)', headers: cabeceras }];
  },
};

export default nextConfig;
