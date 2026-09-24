import type { NextConfig } from 'next';

const API = process.env.API_CORE_URL ?? 'http://127.0.0.1:3001';
const GEO = process.env.GEO_SERVICE_URL ?? 'http://127.0.0.1:3002';
const desarrollo = process.env.NODE_ENV !== 'production';

/**
 * Misma política que la app pública (ver el comentario de `apps/web-ciudadano/next.config.ts`
 * para el porqué de cada origen y del 'unsafe-inline' en script-src), con dos diferencias:
 *  - el panel no usa la ubicación del dispositivo, así que `geolocation=()`;
 *  - no es una PWA, así que no necesita `manifest-src`.
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

// Solo detrás de HTTPS: anunciar HSTS sobre http deja el navegador sin poder volver atrás.
if (process.env.HSTS === '1')
  cabeceras.push({
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // El manual del repositorio es el CLAUDE.md de la raíz: Next no debe generar los suyos.
  agentRules: false,
  // El panel habla con los servicios por rutas relativas; Next las reenvía
  // (mismo origen → la cookie de sesión viaja sola y no hace falta CORS).
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API}/api/:path*` },
      { source: '/geo/:path*', destination: `${GEO}/geo/:path*` },
    ];
  },
  async headers() {
    return [{ source: '/(.*)', headers: cabeceras }];
  },
};

export default nextConfig;
