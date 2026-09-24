import type { NextConfig } from 'next';

const API = process.env.API_CORE_URL ?? 'http://127.0.0.1:3001';
const GEO = process.env.GEO_SERVICE_URL ?? 'http://127.0.0.1:3002';
const desarrollo = process.env.NODE_ENV !== 'production';

/**
 * Content-Security-Policy. Cada origen externo está aquí porque algo concreto lo necesita:
 *  - `tile.openstreetmap.org` en img-src: las teselas raster del mapa base (CLAUDE.md §14.3).
 *  - Los glifos de las etiquetas del mapa ya NO salen a internet: se sirven desde
 *    `public/glifos/` (ver `componentes/Mapa.tsx`), así que `demotiles.maplibre.org` salió de
 *    connect-src. Era el servidor de demostración de MapLibre y encima devolvía 404.
 *  - `tile.openstreetmap.org` TAMBIÉN en connect-src: MapLibre 6 pide las teselas raster con
 *    `fetch`, no con <img>. Con solo img-src, la CSP bloqueaba el mapa base entero y el mapa
 *    quedaba en negro (comprobado en el navegador: "Refused to connect" por cada tesela).
 *  - `worker-src 'self'`: MapLibre 6 carga su worker desde una URL, y acá se sirve desde
 *    `public/maplibre/` (ver `src/lib/worker-maplibre.ts`). `blob:` queda porque otras versiones
 *    y otras rutas de MapLibre sí lo crean desde un blob.
 *  - `data:`/`blob:` en img-src: miniaturas de las fotos antes de subirlas y el canvas del mapa.
 *
 * `script-src` lleva 'unsafe-inline' porque Next inyecta en la página el payload de hidratación
 * como <script> en línea. Quitarlo exige nonces por middleware, y el nonce obliga a renderizar
 * TODAS las páginas de forma dinámica: el mapa público dejaría de ser estático. Se asume ese
 * 'unsafe-inline' a sabiendas: esta app no renderiza HTML de terceros en ningún punto (React
 * escapa todo y no hay dangerouslySetInnerHTML), así que el vector que abre es estrecho, y el
 * resto de directivas sigue acotando a dónde podría salir un dato si algo se colara.
 * En desarrollo hace falta además 'unsafe-eval' para el refresco en caliente.
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
  "manifest-src 'self'",
]
  .join('; ')
  .concat(desarrollo ? '' : '; upgrade-insecure-requests');

const cabeceras = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  // El formulario usa la ubicación del dispositivo; nada más se necesita.
  {
    key: 'Permissions-Policy',
    value: 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()',
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
  // Las apps hablan con los servicios por rutas relativas; Next las reenvía (mismo origen → cookies y CORS simples).
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
