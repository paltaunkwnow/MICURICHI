/**
 * Seeds SINTÉTICOS (CLAUDE.md §6.10 y §12): capas y reportes inventados para desarrollo y demo.
 * Lee data/samples/geo/*.geojson (generados por pipelines/geodata-etl `samples:generar`).
 * Idempotente: borra y vuelve a cargar la versión 'samples-sinteticas' y los reportes marcados.
 */
import { randomBytes, scryptSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calcularSeveridad } from 'contracts';
import type { Ejecutor } from '../ejecutor.js';
import { recalcularPuntosCriticos } from '../puntos-criticos.js';

export const VERSION_SAMPLES = 'samples-sinteticas';
const raizRepo = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
export const DIR_SAMPLES = resolve(raizRepo, 'data/samples/geo');

type Feature = {
  type: 'Feature';
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
};
type FC = { type: 'FeatureCollection'; features: Feature[] };

export function hashPassword(password: string): string {
  const sal = randomBytes(16).toString('hex');
  const hash = scryptSync(password, sal, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt$${sal}$${hash}`;
}

function leerCapa(nombre: string): FC {
  return JSON.parse(readFileSync(resolve(DIR_SAMPLES, `${nombre}.geojson`), 'utf8')) as FC;
}

async function cargarCapa(
  ex: Ejecutor,
  capa: 'distrito_municipal' | 'unidad_vecinal' | 'manzana',
  fc: FC,
) {
  await ex.consultar(`DELETE FROM geo.${capa} WHERE version_capa = $1`, [VERSION_SAMPLES]);
  for (const f of fc.features) {
    const p = f.properties;
    const geom = JSON.stringify(f.geometry);
    if (capa === 'distrito_municipal') {
      await ex.consultar(
        `INSERT INTO geo.distrito_municipal (id, codigo, nombre, geom, version_capa, fuente)
         VALUES ($1, $2, $3, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)), $5, 'sintético')`,
        [p.id, p.codigo, p.nombre, geom, VERSION_SAMPLES],
      );
    } else if (capa === 'unidad_vecinal') {
      await ex.consultar(
        `INSERT INTO geo.unidad_vecinal (id, codigo, nombre, geom, version_capa, fuente, distrito_id)
         VALUES ($1, $2, $3, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)), $5, 'sintético', $6)`,
        [p.id, p.codigo, p.nombre, geom, VERSION_SAMPLES, p.distrito_id],
      );
    } else {
      await ex.consultar(
        `INSERT INTO geo.manzana (id, codigo, nombre, geom, version_capa, fuente, distrito_id, unidad_vecinal_id)
         VALUES ($1, $2, $3, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)), $5, 'sintético', $6, $7)`,
        [p.id, p.codigo, p.nombre ?? '', geom, VERSION_SAMPLES, p.distrito_id, p.unidad_vecinal_id],
      );
    }
  }
  await ex.consultar('DELETE FROM geo.capa_version WHERE capa = $1 AND version = $2', [
    capa,
    VERSION_SAMPLES,
  ]);
  // Solo se activa si no hay otra versión vigente (una capa real cargada por el ETL tiene prioridad).
  const [vig] = await ex.consultar<{ n: string }>(
    'SELECT count(*)::text AS n FROM geo.capa_version WHERE capa = $1 AND vigente',
    [capa],
  );
  await ex.consultar(
    `INSERT INTO geo.capa_version (capa, version, fuente, crs_origen, n_features, vigente)
     VALUES ($1, $2, 'sintético: pipelines/geodata-etl samples:generar', 'EPSG:4326', $3, $4)`,
    [capa, VERSION_SAMPLES, fc.features.length, Number(vig?.n ?? 0) === 0],
  );
}

/** Generador pseudoaleatorio determinista (mulberry32) para que los seeds sean reproducibles. */
function rng(semilla: number) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TIRANTES = ['tobillo', 'rodilla', 'muslo', 'mas_70'] as const;
const DURACIONES = ['menos_30min', '30min_2h', '2h_12h', 'mas_12h'] as const;
const FRECUENCIAS = ['primera_vez', 'ocasional', 'cada_lluvia_fuerte', 'permanente'] as const;
const AFECTACIONES = ['peatonal', 'vehicular', 'ingreso_viviendas', 'corte_total_via'] as const;
const CAUSAS = [
  'sumidero_tapado',
  'falta_sumidero',
  'hundimiento_pavimento',
  'contrapendiente',
  'colector_saturado',
  'desconocida',
] as const;
const DESCRIPCIONES = [
  'Se junta agua en toda la esquina cada vez que llueve fuerte y tarda medio día en irse.',
  'El sumidero está tapado con basura y el agua cubre la calzada de vereda a vereda.',
  'Hay un hundimiento en el pavimento donde queda un charco permanente aunque no llueva.',
  'El agua entra a las casas de la cuadra; los vecinos ponen bolsas de arena.',
  'Los autos no pueden pasar; se corta la calle por más de dos horas.',
  'Brota agua del sumidero cuando llueve, como si el colector estuviera lleno.',
  'Charco chico pero recurrente en la huella de los vehículos, frente a la parada.',
  'Se anega la bocacalle y los peatones tienen que dar la vuelta a la manzana.',
];

export interface ResumenSeed {
  capas: Record<string, number>;
  usuarios: number;
  reportes: number;
  puntosCriticos: number;
}

export async function sembrarSamples(
  ex: Ejecutor,
  opciones: { passwordAdmin?: string; passwordTecnico?: string } = {},
): Promise<ResumenSeed> {
  const capas: Record<string, number> = {};
  // Las capas sintéticas solo se cargan si NO hay una capa real vigente (la del municipio manda).
  for (const capa of ['distrito_municipal', 'unidad_vecinal', 'manzana'] as const) {
    const [vig] = await ex.consultar<{ version: string }>(
      'SELECT version FROM geo.capa_version WHERE capa = $1 AND vigente',
      [capa],
    );
    if (vig && vig.version !== VERSION_SAMPLES) {
      capas[capa] = 0;
      continue;
    }
    const fc = leerCapa(capa);
    await cargarCapa(ex, capa, fc);
    capas[capa] = fc.features.length;
  }

  // Usuarios de desarrollo (SOLO LOCAL). Contraseñas por variable de entorno o valor por defecto documentado.
  const passwordAdmin =
    opciones.passwordAdmin ?? process.env.SEED_ADMIN_PASSWORD ?? 'curichi-admin-local';
  const passwordTecnico =
    opciones.passwordTecnico ?? process.env.SEED_TECNICO_PASSWORD ?? 'curichi-tecnico-local';
  await ex.consultar(
    `DELETE FROM usuario WHERE email IN ('admin@curichi.local', 'tecnico@curichi.local')`,
  );
  await ex.consultar(
    `INSERT INTO usuario (email, nombre, rol, password_hash) VALUES
       ('admin@curichi.local', 'Admin local (sintético)', 'admin', $1),
       ('tecnico@curichi.local', 'Técnico local (sintético)', 'tecnico', $2)`,
    [hashPassword(passwordAdmin), hashPassword(passwordTecnico)],
  );
  const [tecnico] = await ex.consultar<{ id: string }>(
    `SELECT id::text FROM usuario WHERE email = 'tecnico@curichi.local'`,
  );

  // Reportes sintéticos ubicados dentro de las UV VIGENTES de la base (reales del municipio si están
  // cargadas, sintéticas si no). ST_GeneratePoints garantiza que el punto cae dentro del polígono.
  await ex.consultar(
    `DELETE FROM reporte_inundacion WHERE descripcion LIKE '%[muestra sintética]%'`,
  );
  const al = rng(20260913);
  const elegir = <T>(arr: readonly T[]): T => arr[Math.floor(al() * arr.length)]!;

  // 10 focos (varios reportes a pocos metros, para ejercitar la recurrencia) + 14 puntos sueltos
  const uvsMuestra = await ex.consultar<{ id: string; lon: number; lat: number }>(
    `SELECT id, ST_X(p) AS lon, ST_Y(p) AS lat
     FROM (
       SELECT id, (ST_Dump(ST_GeneratePoints(geom, 1, 20260913))).geom AS p
       FROM geo.unidad_vecinal_vigente
       ORDER BY md5(id) LIMIT 24
     ) s`,
  );
  if (!uvsMuestra.length)
    throw new Error('No hay unidades vecinales vigentes: cargá una capa antes de sembrar.');

  const puntos: Array<{ lon: number; lat: number }> = [];
  uvsMuestra.forEach((u, i) => {
    const lon = Number(u.lon);
    const lat = Number(u.lat);
    if (i < 10) {
      // foco: entre 1 y 4 reportes dentro de ~20 m
      const n = 1 + Math.floor(al() * 4);
      for (let k = 0; k < n; k++)
        puntos.push({ lon: lon + (al() - 0.5) * 0.0003, lat: lat + (al() - 0.5) * 0.0003 });
    } else puntos.push({ lon, lat });
  });

  let insertados = 0;
  for (const [i, p] of puntos.entries()) {
    const entrada = {
      tirante_estimado: elegir(TIRANTES),
      duracion_estimada: elegir(DURACIONES),
      frecuencia: elegir(FRECUENCIAS),
      afectacion: elegir(AFECTACIONES),
    };
    const sev = calcularSeveridad(entrada);
    const estado =
      i % 9 === 0 ? 'nuevo' : i % 13 === 0 ? 'resuelto' : i % 17 === 0 ? 'rechazado' : 'validado';
    const diasAtras = Math.floor(al() * 120);
    const desc = `${elegir(DESCRIPCIONES)} [muestra sintética]`;
    await ex.consultar(
      `INSERT INTO reporte_inundacion (geom, creado_en, evento_en, distrito_id, unidad_vecinal_id, manzana_id, version_capa, resolucion_flags,
         ubicacion_metodo, precision_gps_m, ubicacion_tipo, descripcion, tirante_estimado, duracion_estimada, frecuencia, afectacion, causa_presunta,
         sumidero_cercano, severidad_calculada, severidad_puntaje, severidad_version, estado, estado_motivo, validado_por, validado_en)
       SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326), now() - ($3 || ' days')::interval, now() - ($3 || ' days')::interval - interval '3 hours',
         COALESCE((SELECT distrito_id FROM geo.unidad_vecinal_vigente u WHERE ST_Contains(u.geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)) LIMIT 1), 'sin_distrito'),
         COALESCE((SELECT id FROM geo.unidad_vecinal_vigente u WHERE ST_Contains(u.geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)) LIMIT 1), 'sin_uv'),
         (SELECT id FROM geo.manzana_vigente m WHERE ST_Contains(m.geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)) LIMIT 1),
         $4, '{"seed": true}'::jsonb,
         $5::ubicacion_metodo, $6, $7::ubicacion_tipo, $8, $9::tirante_estimado, $10::duracion_estimada, $11::frecuencia, $12::afectacion, $13::causa_presunta,
         $14::sumidero_cercano, $15::severidad, $16, $17, $18::estado_reporte, $19,
         CASE WHEN $18 IN ('validado', 'resuelto') THEN $20::uuid END,
         CASE WHEN $18 IN ('validado', 'resuelto') THEN now() - ($3 || ' days')::interval + interval '1 day' END`,
      [
        p.lon,
        p.lat,
        String(diasAtras),
        VERSION_SAMPLES,
        al() < 0.6 ? 'gps' : 'manual',
        al() < 0.6 ? Math.round(5 + al() * 30) : null,
        al() < 0.8 ? 'via_publica' : 'vivienda_o_predio',
        desc,
        entrada.tirante_estimado,
        entrada.duracion_estimada,
        entrada.frecuencia,
        entrada.afectacion,
        elegir(CAUSAS),
        elegir(['si', 'no', 'no_sabe'] as const),
        sev.banda,
        sev.puntaje,
        sev.version,
        estado,
        estado === 'rechazado'
          ? 'Fuera de cobertura (muestra sintética)'
          : estado === 'resuelto'
            ? 'Limpieza de sumidero (muestra sintética)'
            : null,
        tecnico?.id ?? null,
      ],
    );
    insertados++;
  }
  // Reportes que cayeron fuera de las UV sintéticas (por el ruido) se eliminan para no ensuciar la muestra.
  await ex.consultar(
    `DELETE FROM reporte_inundacion WHERE descripcion LIKE '%[muestra sintética]%' AND unidad_vecinal_id = 'sin_uv'`,
  );
  const [n] = await ex.consultar<{ n: string }>(
    `SELECT count(*)::text AS n FROM reporte_inundacion WHERE descripcion LIKE '%[muestra sintética]%'`,
  );
  const pc = await recalcularPuntosCriticos(ex);
  return { capas, usuarios: 2, reportes: Number(n?.n ?? insertados), puntosCriticos: pc.puntos };
}
