import path from 'node:path';
import type { NextConfig } from 'next';

const desarrollo = process.env.NODE_ENV !== 'production';

/**
 * Misma política que la app pública (ver el comentario de `apps/web-ciudadano/next.config.ts`
 * para el porqué de cada origen y del 'unsafe-inline' en script-src), con dos diferencias:
 *  - el panel no usa la ubicación del dispositivo, así que `geolocation=()`;
 *  - no es una PWA, así que no necesita `manifest-src`.
 *
 * Estas cabeceras no dependen de la instalación, así que pueden quedar fijadas al compilar. Lo
 * que sí depende (adónde se reenvían `/api` y `/geo`, y HSTS) va en `src/proxy.ts`, que lo lee
 * en cada petición: `rewrites()` y `headers()` se congelan en `next build`.
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${desarrollo ? " 'unsafe-eval'" : ''}`,
  "worker-src 'self' blob:",
  "connect-src 'self' https://tile.openstreetmap.org",
]
  .join('; ')
  .concat(desarrollo ? '' : '; upgrade-insecure-requests');

const cabeceras = [
  { key: 'Content-Security-Policy', value: csp },
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
