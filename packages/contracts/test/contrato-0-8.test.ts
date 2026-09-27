import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONFIG_DOMINIO } from '../src/dominio/config.js';
import { FotoSubidaSchema } from '../src/esquemas/reporte.js';
import { construirOpenApi } from '../src/openapi.js';

/** Rutas (`a.b.c`) de los errores de un safeParse fallido; vacío si pasó. */
function rutasDeError(r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return r.error?.issues.map((i) => i.path.map(String).join('.')) ?? [];
}

type Operacion = {
  summary?: string;
  description?: string;
  security?: Record<string, unknown>[];
  parameters?: { name: string; in: string; schema?: { pattern?: string } }[];
  responses: Record<
    string,
    {
      description?: string;
      content?: Record<string, { schema?: { $ref?: string } }>;
      headers?: Record<string, { description?: string }>;
    }
  >;
};

type DocOpenApi = {
  paths: Record<string, Record<string, Operacion>>;
  components: { schemas: Record<string, { properties?: Record<string, Record<string, unknown>> }> };
};

const CLAVE = '0b6f9a57-3c1e-4d8a-9b2f-5e7c1a2d3f40';

const fotoSubida = {
  objeto_key: `${CLAVE}.webp`,
  url: `http://localhost:3001/api/v1/fotos/${CLAVE}.webp`,
  ancho: 1200,
  alto: 1600,
  bytes: 184_320,
  mime: 'image/webp',
  exif_sanitizado: true,
};

/** Resumen y descripción de una operación, juntos: el texto que lee quien consume el contrato. */
const textoDe = (op: Operacion | undefined) => `${op?.summary ?? ''} ${op?.description ?? ''}`;

describe('0.8.0: las fotos se guardan en WebP, con 1600 px por lado como máximo', () => {
  it('formato de salida image/webp con calidad 80', () => {
    expect(CONFIG_DOMINIO.FOTO_FORMATO_SALIDA).toBe('image/webp');
    expect(CONFIG_DOMINIO.FOTO_CALIDAD_WEBP).toBe(80);
  });

  it('el tope es por lado: 1600 px de ancho y 1600 px de alto', () => {
    expect(CONFIG_DOMINIO.FOTO_ANCHO_MAX_PX).toBe(1600);
    expect(CONFIG_DOMINIO.FOTO_ALTO_MAX_PX).toBe(1600);
  });

  it('FOTO_MIME_PERMITIDOS es lo que entra: JPEG, PNG y WebP; sale siempre WebP', () => {
    expect([...CONFIG_DOMINIO.FOTO_MIME_PERMITIDOS]).toStrictEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
    expect(CONFIG_DOMINIO.FOTO_MIME_PERMITIDOS).toContain(CONFIG_DOMINIO.FOTO_FORMATO_SALIDA);
  });
});

describe('0.8.0: FotoSubidaSchema.mime es image/webp', () => {
  it('acepta la respuesta de una foto guardada en WebP', () => {
    const r = FotoSubidaSchema.safeParse(fotoSubida);
    expect(r.success).toBe(true);
    expect(r.data?.mime).toBe('image/webp');
  });

  it('rechaza cualquier otro mime, señalando el campo', () => {
    for (const mime of ['image/jpeg', 'image/png', 'IMAGE/WEBP', 'image/webp ', '', 'image/heic'])
      expect(rutasDeError(FotoSubidaSchema.safeParse({ ...fotoSubida, mime }))).toEqual(['mime']);
  });

  it('exif_sanitizado sigue siendo obligatoriamente true', () => {
    expect(
      rutasDeError(FotoSubidaSchema.safeParse({ ...fotoSubida, exif_sanitizado: false })),
    ).toEqual(['exif_sanitizado']);
  });
});

describe('0.8.0: OpenAPI de las fotos', () => {
  const doc = construirOpenApi() as DocOpenApi;
  const subir = doc.paths['/api/v1/fotos']?.post;
  const servir = doc.paths['/api/v1/fotos/{key}']?.get;

  it('el componente FotoSubida fija mime en image/webp', () => {
    expect(doc.components.schemas.FotoSubida?.properties?.mime).toMatchObject({
      type: 'string',
      const: 'image/webp',
    });
  });

  it('POST /fotos dice qué entra y que se guarda en WebP, 1600 px por lado y sin metadatos', () => {
    const texto = textoDe(subir);
    for (const frase of ['JPEG, PNG o WebP', 'WebP', '1600 px por lado', 'sin metadatos'])
      expect(texto).toContain(frase);
    expect(subir?.responses['201']?.description).toContain('image/webp');
    expect(subir?.responses['201']?.content?.['application/json']?.schema?.$ref).toBe(
      '#/components/schemas/FotoSubida',
    );
    expect(subir?.responses['415']?.description).toContain('JPEG, PNG o WebP');
  });

  it('GET /fotos/{key} sirve image/webp, e image/jpeg solo para las fotos anteriores', () => {
    const ok = servir?.responses['200'];
    expect(Object.keys(ok?.content ?? {})).toStrictEqual(['image/webp', 'image/jpeg']);
    expect(ok?.description).toContain('image/jpeg solo para las fotos anteriores');
  });

  it('GET /fotos/{key}: una foto sin reporte solo la ve quien la subió; el resto recibe 404', () => {
    expect(textoDe(servir)).toContain('una foto sin reporte solo la ve quien la subió');
    expect(textoDe(servir)).toContain('técnicos incluidos');
    expect(servir?.responses['404']?.content?.['application/json']?.schema?.$ref).toBe(
      '#/components/schemas/ErrorApi',
    );
  });

  it('GET /fotos/{key}: la sesión es opcional (el dueño la necesita, el público no)', () => {
    expect(servir?.security).toStrictEqual([{}, { cookieSesion: [] }]);
  });

  it('GET /fotos/{key}: la clave es un uuid con .webp, o .jpg para las anteriores', () => {
    const patron = servir?.parameters?.find((p) => p.name === 'key')?.schema?.pattern;
    expect(patron).toBeDefined();
    const re = new RegExp(patron ?? '');
    for (const valida of [`${CLAVE}.webp`, `${CLAVE}.jpg`]) expect(re.test(valida)).toBe(true);
    for (const invalida of [
      `${CLAVE}.png`,
      `${CLAVE}.jpeg`,
      `${CLAVE}.WEBP`,
      `${CLAVE}.webp.jpg.exe`,
      `../${CLAVE}.webp`,
      'foto.webp',
      CLAVE,
    ])
      expect(re.test(invalida)).toBe(false);
  });

  it('GET /fotos/{key} documenta Cache-Control y nosniff', () => {
    const cabeceras = servir?.responses['200']?.headers ?? {};
    expect(cabeceras['Cache-Control']?.description).toContain('private, no-store');
    expect(cabeceras['X-Content-Type-Options']?.description).toContain('nosniff');
  });
});

describe('versión del paquete', () => {
  const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

  it('package.json y la última entrada del CHANGELOG dicen la misma versión, 0.8.0', () => {
    const { version } = JSON.parse(readFileSync(resolve(raiz, 'package.json'), 'utf8')) as {
      version: string;
    };
    const ultima = readFileSync(resolve(raiz, 'CHANGELOG.md'), 'utf8').match(/^## (\S+)/m)?.[1];
    expect(version).toBe('0.8.0');
    expect(ultima).toBe(version);
  });
});
