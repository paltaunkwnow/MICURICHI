import { type APIRequestContext, expect } from '@playwright/test';

export const API = 'http://127.0.0.1:3001';
export const GEO = 'http://127.0.0.1:3002';
export const PANEL = 'http://localhost:3100';

/** Punto dentro de la cobertura municipal (plaza 24 de Septiembre, Santa Cruz de la Sierra). */
export const PUNTO_CENTRO = { lat: -17.7833, lon: -63.1821 };
/** Punto claramente fuera del municipio. */
export const PUNTO_FUERA = { lat: -17.5, lon: -63.0 };

export const CREDENCIALES_TECNICO = {
  email: process.env.E2E_TECNICO_EMAIL ?? 'tecnico@curichi.local',
  password: process.env.E2E_TECNICO_PASSWORD ?? 'curichi-tecnico-local',
};

export function reporteValido(marca: string) {
  return {
    lat: PUNTO_CENTRO.lat,
    lon: PUNTO_CENTRO.lon,
    ubicacion_metodo: 'manual' as const,
    ubicacion_tipo: 'via_publica' as const,
    descripcion: `Se junta agua hasta la rodilla cada vez que llueve fuerte. ${marca}`,
    tirante_estimado: 'rodilla' as const,
    duracion_estimada: '2h_12h' as const,
    frecuencia: 'cada_lluvia_fuerte' as const,
    afectacion: 'vehicular' as const,
    causa_presunta: 'sumidero_tapado' as const,
    sitio_web: '',
  };
}

/** Espera a que api-core y geo-service respondan antes de empezar. */
export async function esperarPila(request: APIRequestContext) {
  await expect
    .poll(async () => (await request.get(`${API}/ready`)).status(), {
      timeout: 120_000,
      intervals: [1000],
    })
    .toBe(200);
  await expect
    .poll(async () => (await request.get(`${GEO}/health`)).status(), { timeout: 30_000 })
    .toBe(200);
}

/** Inicia sesión como técnico sobre el contexto de request (guarda la cookie de sesión). */
export async function loginTecnico(request: APIRequestContext) {
  const r = await request.post(`${API}/api/v1/auth/login`, { data: CREDENCIALES_TECNICO });
  expect(r.status(), 'el técnico debe poder iniciar sesión con los usuarios del seed').toBe(200);
  return r.json();
}

export async function crearReportePorApi(request: APIRequestContext, marca: string) {
  const r = await request.post(`${API}/api/v1/reportes`, { data: reporteValido(marca) });
  expect(r.status()).toBe(201);
  const f = await r.json();
  return f.id as string;
}

/** Coordenadas de tesela (slippy map) para un punto y un zoom. */
export function tesela(lat: number, lon: number, z: number) {
  const x = Math.floor(((lon + 180) / 360) * 2 ** z);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
  return { x, y, z };
}

/** PNG 1×1 válido, para probar la subida de fotos sin depender de archivos del repo. */
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
