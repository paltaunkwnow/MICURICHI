/**
 * No contaminación entre categorías en las lecturas (M3.3, ADR 0012, 0013).
 *
 * Reportes de las CUATRO categorías en las MISMAS coordenadas. Sin parámetro `categoria`, cada
 * lectura devuelve SOLO inundación (público, detalle, técnico, CSV, GeoJSON, indicadores, ejecutivo,
 * fotos, id corto). En el panel, `categoria=todas` las trae todas. En lo público, una categoría
 * inactiva da 400. Y con una categoría sintética ACTIVA (catálogo + registro inyectado), sus
 * lecturas devuelven solo las suyas.
 *
 * El registro se INYECTA con una categoría sintética (`bache`, con una definición propia): así se
 * ejercita el camino multicategoría sin tocar `contracts`, que hoy solo define Inundaciones.
 */
import { randomUUID } from 'node:crypto';
import {
  crearRegistroCategorias,
  DEFINICION_INUNDACION,
  type DefinicionCategoriaCualquiera,
} from 'contracts';
import { ejecutorPg } from 'db';
import {
  type BaseEfimera,
  cargarCapasDePrueba,
  insertarReporte,
  levantarBaseEfimera,
} from 'db/test-utils';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AlmacenMemoria } from '../src/almacen.js';
import { crearApp } from '../src/app.js';
import {
  configDePrueba,
  crearUsuarios,
  iniciarSesion,
  resolverDePrueba,
  sesion,
} from './ayudas.js';

// Categoría sintética: la definición de inundación con otro slug y otros campos públicos. El
// `detalle` de sus reportes de prueba es `{ sintetico: true }`, así que su único campo público es
// `sintetico`; el resto del detalle (si lo hubiera) no saldría en la vista pública.
const DEF_BACHE = {
  ...DEFINICION_INUNDACION,
  slug: 'bache',
  nombre: 'Baches (sintético)',
  nombreCorto: 'Bache',
  camposPublicos: ['sintetico'],
} as DefinicionCategoriaCualquiera;

const REGISTRO_SINTETICO = crearRegistroCategorias([DEFINICION_INUNDACION, DEF_BACHE]);

const P = { lon: -63.195, lat: -17.79 }; // dentro de la UV A de las capas de prueba

let base: BaseEfimera;
let pool: pg.Pool;
let ex: ReturnType<typeof ejecutorPg>;
let app: FastifyInstance;
let almacen: AlmacenMemoria;
let cookieTecnico: string;

const idPorCategoria: Record<string, string> = {};

/** Pega una foto (ya «sanitizada») a un reporte y deja su objeto en el almacén en memoria. */
async function pegarFoto(reporteId: string): Promise<string> {
  const key = `${randomUUID()}.webp`;
  await almacen.guardar(key, Buffer.from('webp-de-prueba'), 'image/webp');
  await ex.consultar(
    `INSERT INTO reporte_foto (objeto_key, reporte_id, mime, bytes, ancho, alto, exif_sanitizado)
     VALUES ($1, $2, 'image/webp', 14, 4, 4, true)`,
    [key, reporteId],
  );
  return key;
}

const get = (url: string, cookie?: string) =>
  app.inject({ method: 'GET', url, ...(cookie ? { cookies: sesion(cookie) } : {}) });

const ids = (r: { json(): { features: Array<{ id: string }> } }) =>
  r.json().features.map((f) => f.id);

beforeAll(async () => {
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 4 });
  ex = ejecutorPg(pool);
  await cargarCapasDePrueba(ex);
  await crearUsuarios(ex);
  almacen = new AlmacenMemoria();
  app = await crearApp({
    pool,
    cfg: { ...configDePrueba({ DATABASE_URL: base.url }), rutaOpenApi: '/no-existe.yaml' },
    resolver: resolverDePrueba,
    almacen,
    registro: REGISTRO_SINTETICO,
  });
  cookieTecnico = await iniciarSesion(app, 'tecnico@test.local');
  // Un reporte validado y publicado de cada categoría, en el MISMO punto.
  for (const categoria of ['inundacion', 'bache', 'area_verde', 'basura'])
    idPorCategoria[categoria] = await insertarReporte(
      ex,
      P.lon,
      P.lat,
      'validado',
      'media',
      categoria,
    );
}, 180_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await base?.cerrar();
});

/** Las de otras categorías: todo lo que NO es inundación. */
const otras = () => ['bache', 'area_verde', 'basura'].map((c) => idPorCategoria[c] as string);

describe('sin parámetro, cada ruta devuelve SOLO inundación', () => {
  it('listado y detalle públicos', async () => {
    const lista = ids(await get('/api/v1/reportes?limite=500'));
    expect(lista).toContain(idPorCategoria.inundacion);
    for (const id of otras()) expect(lista).not.toContain(id);
    expect((await get(`/api/v1/reportes/${idPorCategoria.inundacion}`)).statusCode).toBe(200);
    // Las otras, aún publicadas, son de categorías inactivas: 404 igual que un reporte oculto.
    for (const id of otras()) expect((await get(`/api/v1/reportes/${id}`)).statusCode).toBe(404);
  });

  it('listado técnico', async () => {
    const lista = ids(await get('/api/v1/tecnico/reportes?limite=500', cookieTecnico));
    expect(lista).toContain(idPorCategoria.inundacion);
    for (const id of otras()) expect(lista).not.toContain(id);
  });

  it('exportación CSV y GeoJSON', async () => {
    const csv = (await get('/api/v1/exportar?formato=csv', cookieTecnico)).body;
    expect(csv).toContain(idPorCategoria.inundacion);
    for (const id of otras()) expect(csv).not.toContain(id);
    const geo = ids(await get('/api/v1/exportar?formato=geojson', cookieTecnico));
    expect(geo).toContain(idPorCategoria.inundacion);
    for (const id of otras()) expect(geo).not.toContain(id);
  });

  it('id corto público: inundación resuelve, las otras dan 404', async () => {
    const corto = (id: string) => id.slice(0, 8);
    expect((await get(`/api/v1/reportes/${corto(idPorCategoria.inundacion!)}`)).statusCode).toBe(
      200,
    );
    for (const id of otras())
      expect((await get(`/api/v1/reportes/${corto(id)}`)).statusCode).toBe(404);
  });

  it('indicadores y ejecutivo: `todas` cuenta 3 reportes más que la vista por defecto', async () => {
    const porDefecto = (await get('/api/v1/indicadores', cookieTecnico)).json();
    const todas = (await get('/api/v1/indicadores?categoria=todas', cookieTecnico)).json();
    // La diferencia es exactamente los 3 reportes de otras categorías (las de inundación cancelan).
    expect(todas.total - porDefecto.total).toBe(3);

    const ejeDefecto = (await get('/api/v1/ejecutivo/resumen?ventana=todo', cookieTecnico)).json();
    const ejeTodas = (
      await get('/api/v1/ejecutivo/resumen?ventana=todo&categoria=todas', cookieTecnico)
    ).json();
    expect(ejeTodas.activas.total - ejeDefecto.activas.total).toBe(3);
  });

  it('fotos: la de un reporte de categoría inactiva no se sirve en público (sí al técnico)', async () => {
    const fotoInundacion = await pegarFoto(idPorCategoria.inundacion as string);
    const fotoBache = await pegarFoto(idPorCategoria.bache as string);
    // La de inundación (categoría activa y reporte público): se sirve a cualquiera.
    expect((await get(`/api/v1/fotos/${fotoInundacion}`)).statusCode).toBe(200);
    // La del bache (categoría inactiva): 404 al público, aunque el reporte esté publicado.
    expect((await get(`/api/v1/fotos/${fotoBache}`)).statusCode).toBe(404);
    // El técnico la sigue viendo (el reporte está publicado): modo privado.
    const alTecnico = await get(`/api/v1/fotos/${fotoBache}`, cookieTecnico);
    expect(alTecnico.statusCode).toBe(200);
    expect(alTecnico.headers['cache-control']).toBe('private, no-store');
  });
});

describe('panel con categoria=todas: aparecen todas', () => {
  it('listado técnico, CSV y GeoJSON traen las cuatro', async () => {
    const lista = ids(
      await get('/api/v1/tecnico/reportes?categoria=todas&limite=500', cookieTecnico),
    );
    for (const id of Object.values(idPorCategoria)) expect(lista).toContain(id);
    const csv = (await get('/api/v1/exportar?formato=csv&categoria=todas', cookieTecnico)).body;
    for (const id of Object.values(idPorCategoria)) expect(csv).toContain(id);
    const geo = ids(await get('/api/v1/exportar?formato=geojson&categoria=todas', cookieTecnico));
    for (const id of Object.values(idPorCategoria)) expect(geo).toContain(id);
  });
});

describe('en lo público, una categoría inactiva da 400 CATEGORIA_NO_DISPONIBLE', () => {
  it('bache está en el registro pero inactiva en el catálogo', async () => {
    const r = await get('/api/v1/reportes?categoria=bache');
    expect(r.statusCode).toBe(400);
    expect(r.json().codigo).toBe('CATEGORIA_NO_DISPONIBLE');
  });
});

describe('con la categoría sintética ACTIVA (catálogo + registro), sus lecturas devuelven solo las suyas', () => {
  beforeAll(async () => {
    await ex.consultar(`UPDATE categoria SET activa = true WHERE slug = 'bache'`);
    // El catálogo cambió: se olvida la caché corta del proveedor para verlo enseguida.
    app.categorias.invalidar();
  });

  afterAll(async () => {
    await ex.consultar(`UPDATE categoria SET activa = false WHERE slug = 'bache'`);
    app.categorias.invalidar();
  });

  it('público con ?categoria=bache: solo el bache, con el detalle recortado a sus campos públicos', async () => {
    const r = await get('/api/v1/reportes?categoria=bache&limite=500');
    expect(r.statusCode).toBe(200);
    const lista = ids(r);
    expect(lista).toEqual([idPorCategoria.bache]);
    const detalle = await get(`/api/v1/reportes/${idPorCategoria.bache}`);
    expect(detalle.statusCode).toBe(200);
    const props = detalle.json().properties;
    expect(props.categoria).toBe('bache');
    // camposPublicos de la categoría sintética = ['sintetico']: solo esa clave sale en público.
    expect(props.detalle).toEqual({ sintetico: true });
  });

  it('la foto del bache ya se sirve en público', async () => {
    const foto = await pegarFoto(idPorCategoria.bache as string);
    expect((await get(`/api/v1/fotos/${foto}`)).statusCode).toBe(200);
  });

  it('/configuracion lista las categorías activas en orden canónico', async () => {
    const r = await get('/api/v1/configuracion');
    expect(r.statusCode).toBe(200);
    expect(r.json().categorias_activas).toEqual(['inundacion', 'bache']);
  });
});

describe('/configuracion sin categorías extra activas', () => {
  it('por defecto trae solo inundacion', async () => {
    const r = await get('/api/v1/configuracion');
    expect(r.statusCode).toBe(200);
    expect(r.json().categorias_activas).toEqual(['inundacion']);
    expect(r.headers['cache-control']).toBe('public, max-age=300');
  });
});

describe('la vista pública no expone en `detalle` nada fuera de camposPublicos (inundación)', () => {
  it('un campo del detalle que no es público (sumidero) sale al técnico pero no al público', async () => {
    // Reporte de inundación con sumidero_cercano: el disparador lo suma al detalle. No está en los
    // camposPublicos de inundación (solo profundidad/frecuencia/causa), así que el público no lo ve.
    const [fila] = await ex.consultar<{ id: string }>(
      `INSERT INTO reporte_inundacion (geom, geom_publico, distrito_id, unidad_vecinal_id,
         ubicacion_metodo, ubicacion_tipo, descripcion, profundidad_estimada, frecuencia,
         sumidero_cercano, severidad_calculada, severidad_puntaje, severidad_version, estado, publicar_en)
       VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326),
         ST_SetSRID(ST_MakePoint(round($1::numeric, 5)::float8, round($2::numeric, 5)::float8), 4326),
         'distrito_municipal:01', 'unidad_vecinal:A', 'manual', 'via_publica', 'Con sumidero cercano',
         'rodilla', 'ocasional', 'si', 'media', 6, 2, 'validado', now()) RETURNING id::text`,
      [P.lon, P.lat],
    );
    const id = fila!.id;
    const pub = (await get(`/api/v1/reportes/${id}`)).json().properties;
    expect(pub.detalle).toEqual({
      profundidad_estimada: 'rodilla',
      frecuencia: 'ocasional',
      causa_presunta: 'desconocida',
    });
    expect(pub.detalle).not.toHaveProperty('sumidero_cercano');
    const tec = (await get(`/api/v1/tecnico/reportes/${id}`, cookieTecnico)).json().properties;
    expect(tec.detalle.sumidero_cercano).toBe('si');
  });
});
