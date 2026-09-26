import type { NextConfig } from 'next';

/**
 * Este archivo se evalúa al COMPILAR y Next serializa el resultado en la salida: nada de lo que
 * lea de `process.env` puede cambiar después sin volver a construir. Como Mi Curichi se instala una
 * vez por ciudad con la misma imagen, aquí no queda nada que dependa del despliegue:
 *
 *  - El reenvío de `/api/*` y `/geo/*` (`API_CORE_URL`, `GEO_SERVICE_URL`) y `HSTS` los resuelve
 *    `src/proxy.ts` en cada petición. Antes eran `rewrites` y `headers` de este archivo, y el
 *    `routes-manifest.json` de la imagen traía `http://127.0.0.1:3001` escrito.
 *  - La URL del panel ya no viaja en el JavaScript público (`env`): llega en `/auth/yo`, y solo a
 *    los roles del panel (`src/lib/panel.ts`).
 *  - La ciudad (centro, locale, zona horaria, nombre) llega de `GET /api/v1/configuracion`
 *    (`src/lib/ciudad-servidor.ts`).
 *
 * `NODE_ENV` sí se lee: distingue `next dev` de la imagen, no un despliegue de otro.
 */
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
 * api-core y geo-service no aparecen: el navegador les habla por `/api` y `/geo` en el propio
 * origen (`'self'`) y el reenvío lo hace el servidor.
 *
 * `script-src` lleva 'unsafe-inline' porque Next inyecta en la página el payload de hidratación
 * como <script> en línea. Quitarlo exige nonces por petición. Se asume ese 'unsafe-inline' a
 * sabiendas: esta app no renderiza HTML de terceros en ningún punto (React escapa todo y no hay
 * dangerouslySetInnerHTML), así que el vector que abre es estrecho, y el resto de directivas sigue
 * acotando a dónde podría salir un dato si algo se colara.
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

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // El manual del repositorio es el CLAUDE.md de la raíz: Next no debe generar los suyos.
  agentRules: false,
  /**
   * Imagen de producción: `.next/standalone` trae un `server.js` mínimo con solo las dependencias
   * que usa. En este monorepo la raíz del trazado es la del repositorio (Next la detecta por el
   * lockfile), así que el servidor queda en `.next/standalone/apps/web-ciudadano/server.js`, y
   * `public/` y `.next/static` se copian aparte (ver README).
   */
  output: 'standalone',
  async headers() {
    return [{ source: '/(.*)', headers: cabeceras }];
  },
};

export default nextConfig;
