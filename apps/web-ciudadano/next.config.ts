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
 * La Content-Security-Policy tampoco va aquí: lleva un nonce distinto en cada petición y la pone
 * `src/proxy.ts`. Una segunda CSP fija se aplicaría a la vez que esa y bloquearía los <script> de
 * Next.
 */
const cabeceras = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  // El formulario usa la ubicación y la cámara (la foto se saca dentro de la página, con
  // getUserMedia); sin `camera=(self)` el navegador la niega aunque la persona diga que sí. Las dos
  // se piden solo al reportar, nunca al cargar. Nada más se necesita.
  {
    key: 'Permissions-Policy',
    value: 'geolocation=(self), camera=(self), microphone=(), payment=(), usb=()',
  },
];

/**
 * El worker de MapLibre (`public/maplibre/`) y los glifos (`public/glifos/`) se piden con `?v=`
 * (`src/lib/worker-maplibre.ts`, `src/lib/recursos-mapa.ts`): cuando cambia el contenido, cambia la
 * URL, así que se pueden guardar un año sin volver a preguntar. Sin `?v=` quedan con lo que pone
 * Next a `public/` (revalidar cada vez): una copia de un año sin versión no se renovaría nunca.
 */
const INMUTABLE = [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }];
const CON_VERSION = [{ type: 'query' as const, key: 'v' }];

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
    return [
      { source: '/(.*)', headers: cabeceras },
      { source: '/maplibre/:archivo*', has: CON_VERSION, headers: INMUTABLE },
      { source: '/glifos/:archivo*', has: CON_VERSION, headers: INMUTABLE },
    ];
  },
};

export default nextConfig;
