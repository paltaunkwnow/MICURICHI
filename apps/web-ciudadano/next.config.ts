import type { NextConfig } from 'next';

const API = process.env.API_CORE_URL ?? 'http://127.0.0.1:3001';
const GEO = process.env.GEO_SERVICE_URL ?? 'http://127.0.0.1:3002';

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
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default nextConfig;
