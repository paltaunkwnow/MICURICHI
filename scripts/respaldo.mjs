#!/usr/bin/env node
/**
 * Respaldo, restauración y **simulacro** de recuperación contra el contenedor de PostgreSQL.
 *
 * Existe porque "tenemos backups" no es evidencia de nada. Lo único que demuestra que un respaldo
 * sirve es restaurarlo en una base vacía y comprobar que los datos están. Eso es lo que hace
 * `simulacro`, y es lo que hay que correr periódicamente, no solo el día que haga falta.
 *
 *   node --env-file=.env scripts/respaldo.mjs respaldar [archivo]
 *   node --env-file=.env scripts/respaldo.mjs restaurar <archivo> <base> [--hasta NNNN]
 *   node --env-file=.env scripts/respaldo.mjs simulacro
 *
 * El respaldo AUTOMÁTICO (diario, cifrado, a un S3 externo, con retención) es el servicio
 * `respaldo` del Compose (`infra/respaldo/respaldo.sh`). Este script usa el MISMO formato para
 * que las dos cosas sean intercambiables:
 *
 *  · pg_dump -Fc SIN la tabla `_migraciones`, y la última migración aplicada anotada al lado
 *    (`<archivo>.migracion`).
 *  · Restauración en tres pasos: migrar la base vacía `--hasta` la versión del respaldo, cargar
 *    solo los DATOS de `public` y `geo`, y migrar el resto. Así un respaldo viejo se restaura con
 *    el código nuevo: las migraciones posteriores convierten sus datos igual que convirtieron los
 *    de producción. Con un volcado completo (esquema incluido) eso no se podía: el esquema viejo
 *    quedaba sin su registro de migraciones o chocaba con el nuevo.
 *
 * Las migraciones se aplican con el CLI de producción (`packages/db/dist/cli/migrar.js`; hace
 * falta `pnpm --filter db build`) o, si se define MIGRAR_IMAGEN (p. ej. mi-curichi-api-core:local),
 * con esa imagen: exactamente lo que corre el job `migraciones` del Compose.
 *
 * Medido en la Fase 4 contra PostgreSQL 18 en Docker, con 1 000 025 reportes (base de 1004 MB):
 *
 *   pg_dump -Fc -Z 6   →  5,3 s   ·  66 MB   (15× de compresión)
 *   pg_restore -j 4    → 19,1 s
 *   verificación       →  conteos exactos, 0 geometrías inválidas, 15 índices, 7 migraciones
 *
 * QUÉ SE RESPALDA Y QUÉ NO
 *  · La base entera salvo `_migraciones`. Es la única fuente de verdad de los reportes.
 *  · Las FOTOS **no** están aquí: viven en el volumen `fotos-data` o en el bucket S3. Hay que
 *    respaldarlas aparte; un respaldo de base sin las fotos deja reportes con `foto_url`
 *    apuntando a objetos que ya no existen.
 *  · `data/raw` y `data/processed` no hacen falta: lo primero es inmutable y está fuera del repo,
 *    lo segundo se regenera con `pnpm etl:all`.
 *
 * El archivo del dump contiene datos personales (`ip_hash`, emails de técnicos, descripciones y
 * coordenadas EXACTAS de viviendas). No sale de la máquina sin cifrar: el servicio `respaldo` lo
 * cifra; este script, que es para la máquina local y los simulacros, no maneja claves.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const ejecutar = promisify(execFile);

const CONTENEDOR = process.env.PG_CONTENEDOR ?? 'curichi-postgis';
const USUARIO = process.env.POSTGRES_USER ?? 'curichi';
const BASE = process.env.POSTGRES_DB ?? 'curichi';
const PASSWORD = process.env.POSTGRES_PASSWORD ?? '';
const PUERTO = process.env.POSTGRES_PORT ?? '5432';
const MIGRAR_IMAGEN = process.env.MIGRAR_IMAGEN ?? '';
const CLI_MIGRAR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'packages/db/dist/cli/migrar.js',
);
const NOMBRE_BASE = /^[a-z_][a-z0-9_]{0,62}$/;

/** Ejecuta un comando DENTRO del contenedor de PostgreSQL. */
async function enContenedor(args, { silencioso = false } = {}) {
  // `-e PGPASSWORD` sin valor: docker lo toma del entorno de este proceso, así la contraseña no
  // aparece en la línea de órdenes (visible con `ps` para cualquier usuario de la máquina).
  const base = ['exec', '-e', 'PGPASSWORD', CONTENEDOR, ...args];
  try {
    const { stdout, stderr } = await ejecutar('docker', base, {
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, PGPASSWORD: PASSWORD },
    });
    if (stderr && !silencioso) process.stderr.write(stderr);
    return stdout;
  } catch (e) {
    throw new Error(`${args[0]} falló: ${(e.stderr || e.message).toString().slice(0, 500)}`);
  }
}

const sql = (base, consulta) =>
  enContenedor(
    ['psql', '-U', USUARIO, '-d', base, '-X', '-v', 'ON_ERROR_STOP=1', '-tAc', consulta],
    { silencioso: true },
  );

function cronometrar(nombre) {
  const t0 = Date.now();
  return () => {
    const s = (Date.now() - t0) / 1000;
    console.log(`  ${nombre}: ${s.toFixed(1)} s`);
    return s;
  };
}

/**
 * Aplica las migraciones a `base` con el CLI de producción, `--hasta` una versión o todas.
 * Devuelve el mensaje final del CLI (una línea JSON por evento, con la forma de pino).
 */
async function migrar(base, hasta, { autorizarContraccionCompatible = false } = {}) {
  const argumentos = hasta ? ['--hasta', hasta] : [];
  if (autorizarContraccionCompatible === true)
    argumentos.push('--autorizar-contraccion-compatible');
  let orden;
  let args;
  let url;
  if (MIGRAR_IMAGEN) {
    // La red del propio contenedor de PostgreSQL: dentro, la base está en 127.0.0.1:5432 y no
    // hace falta saber cómo se llama la red del Compose.
    url = `postgresql://${USUARIO}:${encodeURIComponent(PASSWORD)}@127.0.0.1:5432/${base}`;
    orden = 'docker';
    args = [
      'run',
      '--rm',
      '--network',
      `container:${CONTENEDOR}`,
      '-e',
      'DATABASE_URL',
      MIGRAR_IMAGEN,
      'node',
      'node_modules/db/dist/cli/migrar.js',
      ...argumentos,
    ];
  } else {
    if (!existsSync(CLI_MIGRAR))
      throw new Error(
        `no está ${CLI_MIGRAR}: corré \`pnpm --filter db build\` o definí MIGRAR_IMAGEN=mi-curichi-api-core:local`,
      );
    url = `postgresql://${USUARIO}:${encodeURIComponent(PASSWORD)}@127.0.0.1:${PUERTO}/${base}`;
    orden = process.execPath;
    args = [CLI_MIGRAR, ...argumentos];
  }
  try {
    const { stdout } = await ejecutar(orden, args, {
      env: { ...process.env, DATABASE_URL: url },
      maxBuffer: 16 * 1024 * 1024,
    });
    const ultima = stdout.trim().split('\n').at(-1) ?? '';
    return JSON.parse(ultima).msg ?? ultima;
  } catch (e) {
    const detalle = (e.stderr || e.stdout || e.message).toString().trim().split('\n').at(-1);
    throw new Error(`las migraciones fallaron sobre "${base}": ${detalle.slice(0, 500)}`);
  }
}

async function respaldar(archivo = `/tmp/${BASE}-${new Date().toISOString().slice(0, 10)}.dump`) {
  console.log(`respaldo de "${BASE}" → ${archivo} (dentro del contenedor ${CONTENEDOR})`);
  const tamano = (await sql(BASE, `SELECT pg_size_pretty(pg_database_size('${BASE}'))`)).trim();
  console.log(`  tamaño de la base: ${tamano}`);
  const fin = cronometrar('pg_dump');
  // -Fc: formato custom. Permite restaurar en paralelo (-j) y solo los datos de unos esquemas,
  // cosas que el volcado en SQL plano no permite. -Z 6: comprimido, ~15× en estos datos.
  // Sin `_migraciones`: la restauración aplica las migraciones ANTES de cargar los datos.
  const { migracion } = await respaldarNode(BASE, archivo, {
    sql,
    perfil: 'm10-contraccion-v1',
    capturar: (base) => snapshotContraccion(base, { sql }),
    huellaArchivo: async (dump) =>
      (await enContenedor(['sha256sum', '--', dump])).trim().split(/\s/)[0],
    anotarEvidencia: (dump, sobre) =>
      enContenedor([
        'sh',
        '-c',
        'umask 077; set -C; printf %s "$1" > "$2"',
        'sh',
        JSON.stringify(sobre),
        `${dump}.evidencia22.json`,
      ]),
    volcar: () =>
      enContenedor([
        'pg_dump',
        '-U',
        USUARIO,
        '-d',
        BASE,
        '-Fc',
        '-Z',
        '6',
        '--exclude-table=public._migraciones',
        '-f',
        archivo,
      ]),
    anotar: (_archivo, version) =>
      enContenedor(['sh', '-c', 'printf %s "$1" > "$2"', 'sh', version, `${archivo}.migracion`]),
  });
  const segundos = fin();
  // La versión viaja con el archivo: sin ella no se sabe hasta dónde migrar antes de cargarlo.
  const ls = await enContenedor(['stat', '-c', '%s', '--', archivo]);
  const bytes = Number(ls.trim());
  console.log(`  archivo: ${(bytes / 1e6).toFixed(1)} MB · migración ${migracion}`);
  console.log('\n  ⚠ El dump lleva datos personales: ip_hash, emails y coordenadas EXACTAS de');
  console.log('    viviendas. Cífralo antes de moverlo fuera de la máquina.');
  return { archivo, bytes, segundos, migracion };
}

/** Una sola sentencia: un error revierte también la preparación de las semillas. */
export function sqlPrepararDestino(migracion, { archivo = false } = {}) {
  const version = numeroMigracion(migracion);
  if (![19, 21, 22].includes(version)) throw new Error('perfil de migración no soportado');
  const catalogo =
    version >= 20
      ? `
  SELECT jsonb_agg(to_jsonb(c) ORDER BY slug) INTO semillas FROM public.categoria c;
  IF semillas IS DISTINCT FROM '[
    {"slug":"area_verde","activa":false,"orden":3,"activada_en":null,"activada_por":null},
    {"slug":"bache","activa":false,"orden":2,"activada_en":null,"activada_por":null},
    {"slug":"basura","activa":false,"orden":4,"activada_en":null,"activada_por":null},
    {"slug":"inundacion","activa":true,"orden":1,"activada_en":null,"activada_por":null}
  ]'::jsonb THEN RAISE EXCEPTION 'catálogo inicial inesperado'; END IF;
  DELETE FROM public.categoria WHERE slug IN ('inundacion','bache','area_verde','basura');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 4 THEN RAISE EXCEPTION 'semillas incompletas'; END IF;`
      : '';
  return `DO $preparar$
DECLARE t record; n bigint; semillas jsonb;
BEGIN
  ${version === 22 || archivo ? "IF to_regclass('resguardo_m10.cuota_reporte_diaria') IS NULL THEN RAISE EXCEPTION 'falta archivo de cuota'; END IF;" : ''}
  IF (SELECT left(max(nombre),4) FROM public._migraciones) IS DISTINCT FROM '${String(version).padStart(4, '0')}'
    THEN RAISE EXCEPTION 'migración destino inesperada'; END IF;
  FOR t IN SELECT ns.nspname, c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
    WHERE (ns.nspname IN ('public','geo') OR ns.nspname='resguardo_m10') AND c.relkind IN ('r','p')
      AND NOT (ns.nspname='public' AND c.relname IN ('_migraciones','spatial_ref_sys')) ORDER BY ns.nspname,c.relname
  LOOP
    IF t.nspname='resguardo_m10' AND t.relname<>'cuota_reporte_diaria' THEN RAISE EXCEPTION 'archivo inesperado'; END IF;
    EXECUTE format('LOCK TABLE %I.%I IN ACCESS EXCLUSIVE MODE',t.nspname,t.relname);
    ${version >= 20 ? "IF t.nspname='public' AND t.relname='categoria' THEN CONTINUE; END IF;" : ''}
    EXECUTE format('SELECT count(*) FROM %I.%I',t.nspname,t.relname) INTO n;
    IF n <> 0 THEN RAISE EXCEPTION 'destino contiene datos o configuración'; END IF;
  END LOOP;${catalogo}
END $preparar$;`;
}

/** Operación compartida CLI/ensayo. Sin inyección explícita nunca conecta. */
export async function restaurarNode(
  archivo,
  destino,
  {
    hasta,
    baseAdministrativa,
    sql: consultar,
    migrar: aplicar,
    cargar,
    creada,
    objetivo,
    autorizarContraccionCompatible = false,
    validarCarga,
    evidencia,
    capturar = snapshotContraccion,
    prepararArchivo,
  } = {},
) {
  if ([consultar, aplicar, cargar].some((f) => typeof f !== 'function'))
    throw new Error('se requieren operadores inyectados');
  if (!NOMBRE_BASE.test(destino)) throw new Error('nombre de base no admitido');
  if (!NOMBRE_BASE.test(baseAdministrativa ?? '') || baseAdministrativa === destino)
    throw new Error('base administrativa explícita requerida');
  if (!/^\d{4}$/.test(hasta ?? '')) throw new Error('migración inválida');
  const version = numeroMigracion(hasta);
  if (![19, 21, 22].includes(version)) throw new Error('perfil no soportado');
  if (objetivo !== undefined && !['0019', '0021', '0022'].includes(objetivo))
    throw new Error('objetivo no soportado');
  if (objetivo && Number(objetivo) < version) throw new Error('downgrade no permitido');
  const nuevaRuta = objetivo === '0022' || version === 22 || evidencia !== undefined;
  if ((version === 22 || objetivo === '0022') && autorizarContraccionCompatible !== true)
    throw new Error('consentimiento --autorizar-contraccion-compatible requerido');
  if (nuevaRuta && typeof validarCarga !== 'function')
    throw new Error('validación exacta de carga y FK inyectada requerida');
  if (evidencia && (!sobreValido(evidencia) || evidencia.version !== version))
    throw new Error('evidencia del dump inválida');
  const tieneArchivo = evidencia?.esquema.archivo != null;
  if (
    version < 22 &&
    tieneArchivo &&
    (typeof prepararArchivo !== 'function' || autorizarContraccionCompatible !== true)
  )
    throw new Error('preparación de archivo reexpandido inyectada y consentimiento requeridos');
  const existe = (
    await consultar(
      baseAdministrativa,
      `SELECT count(*) FROM pg_database WHERE datname = '${destino}'`,
    )
  ).trim();
  if (existe !== '0') throw new Error('el destino existe o su ausencia no está comprobada');
  await consultar(baseAdministrativa, `CREATE DATABASE ${destino} TEMPLATE template0`);
  if (creada) await creada(destino);
  await aplicar(
    destino,
    hasta,
    ...(version === 22 ? [{ autorizarContraccionCompatible: true }] : []),
  );
  if (version < 22 && tieneArchivo) {
    // El adaptador usa 0022+reversa en el destino nuevo; nunca inventa DDL de archivo.
    await prepararArchivo(destino, hasta, { autorizarContraccionCompatible });
  }
  await consultar(destino, sqlPrepararDestino(hasta, { archivo: tieneArchivo }));
  await cargar(
    archivo,
    destino,
    ...(nuevaRuta ? [{ version, archivo: version === 22 || tieneArchivo }] : []),
  );
  if (nuevaRuta) {
    const validada = await validarCarga(archivo, destino, hasta);
    if (validada === false) throw new Error('carga exacta o FK inválida');
    // El camino nuevo exige además evidencia íntegra del dump antes de cualquier upgrade.
    if (!evidencia) throw new Error('evidencia íntegra del dump requerida antes del upgrade');
    const cargada = await capturar(destino, { sql: consultar });
    if (!compararSnapshotsContraccion(evidencia, cargada, { exacta: true }))
      throw new Error('carga diferente del dump');
    if (objetivo && Number(objetivo) > version) {
      await aplicar(destino, objetivo, { autorizarContraccionCompatible });
      const final = await capturar(destino, { sql: consultar });
      if (!compararSnapshotsContraccion(cargada, final)) throw new Error('pérdida en upgrade');
    }
  } else await aplicar(destino);
  return { destino };
}

/** Misma lógica de versión/volcado que usa la operación manual. */
export async function respaldarNode(
  base,
  archivo,
  { sql: consultar, volcar, anotar, capturar, huellaArchivo, anotarEvidencia, perfil } = {},
) {
  if ([consultar, volcar, anotar].some((f) => typeof f !== 'function'))
    throw new Error('se requieren operadores inyectados');
  if (!NOMBRE_BASE.test(base)) throw new Error('nombre de base no admitido');
  const consulta = "SELECT coalesce(max(nombre), '') FROM public._migraciones";
  const migracion = (await consultar(base, consulta)).trim();
  const version = numeroMigracion(migracion);
  if (![19, 21, 22].includes(version)) throw new Error('perfil no soportado');
  if (perfil !== undefined && perfil !== 'm10-contraccion-v1')
    throw new Error('perfil no soportado');
  const nuevaRuta = version === 22 || perfil === 'm10-contraccion-v1';
  if (nuevaRuta && [capturar, huellaArchivo, anotarEvidencia].some((f) => typeof f !== 'function'))
    throw new Error('evidencia22/huella de dump inyectadas requeridas');
  const antes = nuevaRuta ? await capturar(base) : null;
  if (antes && (!sobreValido(antes) || antes.version !== version))
    throw new Error('evidencia de origen inválida');
  await volcar(base, archivo);
  if ((await consultar(base, consulta)).trim() !== migracion)
    throw new Error('migración cambió durante el volcado');
  if (nuevaRuta) {
    if (!compararSnapshotsContraccion(antes, await capturar(base), { exacta: true }))
      throw new Error('datos cambiaron durante el volcado');
    const dumpSha256 = await huellaArchivo(archivo);
    if (!SHA256.test(dumpSha256)) throw new Error('hash de dump inválido');
    await anotarEvidencia(archivo, { perfil: 'm10-dump-v1', dumpSha256, evidencia: antes });
  }
  await anotar(archivo, migracion);
  return { archivo, migracion };
}

async function restaurar(
  archivo,
  destino,
  { hasta, baseAdministrativa = 'postgres', objetivo, autorizarContraccionCompatible = false } = {},
) {
  if (!NOMBRE_BASE.test(destino)) throw new Error(`nombre de base no admitido: "${destino}"`);
  if (destino === BASE)
    throw new Error(
      `no se restaura sobre la base principal "${BASE}": restaurá en otra y renombrá (ver docs/operaciones/respaldo-y-restauracion.md)`,
    );
  let version = hasta;
  if (!version) {
    const anotada = (
      await enContenedor(['sh', '-c', 'cat "$1" 2>/dev/null || true', 'sh', `${archivo}.migracion`])
    ).trim();
    version = anotada.slice(0, 4);
  }
  if (!/^\d{4}$/.test(version ?? ''))
    throw new Error(
      `no sé hasta qué migración llevar la base: falta ${archivo}.migracion; pasá --hasta NNNN`,
    );
  let evidencia;
  const listado = await enContenedor(['pg_restore', '--list', archivo]);
  const archivoEnDump = /TABLE DATA resguardo_m10 cuota_reporte_diaria(?:\s|$)/m.test(listado);
  if (version === '0022' || objetivo === '0022' || archivoEnDump) {
    if (autorizarContraccionCompatible !== true)
      throw new Error('consentimiento explícito requerido');
    const sidecar = JSON.parse(await enContenedor(['cat', '--', `${archivo}.evidencia22.json`]));
    const hash = (await enContenedor(['sha256sum', '--', archivo])).trim().split(/\s/)[0];
    if (
      sidecar.perfil !== 'm10-dump-v1' ||
      !SHA256.test(hash) ||
      hash !== sidecar.dumpSha256 ||
      !sobreValido(sidecar.evidencia) ||
      sidecar.evidencia.version !== Number(version)
    )
      throw new Error('dump/evidencia22 inválidos');
    evidencia = sidecar.evidencia;
    if ((evidencia.esquema.archivo != null) !== archivoEnDump)
      throw new Error('archivo de cuota diferente de evidencia');
  }
  console.log(`restauración de ${archivo} → base "${destino}" (esquema hasta ${version})`);
  const fin = cronometrar('restauración');
  // --data-only y solo `public` y `geo`: el esquema ya lo pusieron las migraciones, y los esquemas
  // de otras extensiones de la imagen (tiger, topology) no son datos de la aplicación.
  // --disable-triggers: el orden de las tablas no respeta las claves foráneas (y
  // `fusionado_en_id` se apunta a sí misma). --exit-on-error: por defecto pg_restore sigue, dice
  // «errors ignored on restore» y sale con 0.
  const resultado = await restaurarNode(archivo, destino, {
    hasta: version,
    baseAdministrativa,
    sql,
    migrar,
    ...(evidencia
      ? {
          evidencia,
          objetivo,
          autorizarContraccionCompatible,
          validarCarga: async (_dump, baseDestino) =>
            compararSnapshotsContraccion(
              evidencia,
              await snapshotContraccion(baseDestino, { sql }),
              { exacta: true },
            ),
        }
      : {}),
    cargar: (dump, baseDestino, perfil) =>
      enContenedor([
        'pg_restore',
        '-U',
        USUARIO,
        '-d',
        baseDestino,
        '--data-only',
        '--schema=public',
        '--schema=geo',
        ...(perfil?.archivo ? ['--schema=resguardo_m10'] : []),
        '--disable-triggers',
        '--exit-on-error',
        '--single-transaction',
        dump,
      ]),
  });
  const segundos = fin();
  return { ...resultado, segundos };
}

/** Comprobaciones auxiliares; los reportes se comparan además por contenido y categoría. */
const COMPROBACIONES = {
  unidades_vecinales: 'SELECT count(*) FROM geo.unidad_vecinal',
  capas_vigentes: 'SELECT count(*) FROM geo.capa_version WHERE vigente',
  usuarios: 'SELECT count(*) FROM usuario',
  fotos: 'SELECT count(*) FROM reporte_foto',
  auditoria: 'SELECT count(*) FROM auditoria',
  migraciones: 'SELECT count(*) FROM _migraciones',
  // Migración 0020 (ADR 0011): la tabla pasa de `reporte_inundacion` a `reporte` y la vista no tiene índices.
  indices_reporte:
    "SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('reporte', 'reporte_inundacion')",
  puntos_criticos: 'SELECT count(*) FROM punto_critico',
};

function numeroMigracion(nombre) {
  if (!/^\d{4}(?:[_-][a-zA-Z0-9_.-]+)?$/.test(nombre) || Number(nombre.slice(0, 4)) === 0)
    throw new Error('migración ausente o inválida');
  return Number(nombre.slice(0, 4));
}

function contar(valor) {
  if (!/^\d+$/.test(valor)) throw new Error('conteo SQL inválido');
  return BigInt(valor);
}

const CAMPOS_INUNDACION = Object.freeze([
  'profundidad_estimada',
  'frecuencia',
  'causa_presunta',
  'sumidero_cercano',
  'sumidero_estado',
  'agua_brota_sumidero',
]);
const CAMPOS_ARCHIVO = ['usuario_id', 'dia', 'reportes_n', 'fotos_n', 'actualizado_en'];
const CAMPOS_MULTITEMA = ['categoria', 'subtipo', 'detalle', 'detalle_version'];
const ARCHIVO = 'resguardo_m10.cuota_reporte_diaria';
const CUOTA = 'public.cuota_reporte_diaria';
const CATALOGO_0020 = [
  { slug: 'area_verde', activa: false, orden: 3, activada_en: null, activada_por: null },
  { slug: 'bache', activa: false, orden: 2, activada_en: null, activada_por: null },
  { slug: 'basura', activa: false, orden: 4, activada_en: null, activada_por: null },
  { slug: 'inundacion', activa: true, orden: 1, activada_en: null, activada_por: null },
];
const SHA256 = /^[a-f0-9]{64}$/;
const identificador = (s) => typeof s === 'string' && /^[a-z_][a-z0-9_]*$/.test(s);
const tablaPermitida = (s) => /^(public|geo)\.[a-z_][a-z0-9_]*$/.test(s) || s === ARCHIVO;
class NumeroExacto {
  constructor(texto) {
    this.texto = texto;
  }
}
function jsonSinRedondeo(texto) {
  return JSON.parse(texto, (_clave, valor, contexto) =>
    typeof valor === 'number' && (!Number.isSafeInteger(valor) || /[.eE]/.test(contexto.source))
      ? new NumeroExacto(contexto.source)
      : valor,
  );
}

// Serialización propia del sobre nuevo. Nunca se aplica a los blobs/sellos históricos.
export function canonico(valor) {
  if (valor instanceof NumeroExacto) return valor.texto;
  if (valor === null || typeof valor === 'boolean' || typeof valor === 'string')
    return JSON.stringify(valor);
  if (typeof valor === 'number' && Number.isFinite(valor)) return JSON.stringify(valor);
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(',')}]`;
  if (valor && Object.getPrototypeOf(valor) === Object.prototype)
    return `{${Object.keys(valor)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonico(valor[k])}`)
      .join(',')}}`;
  throw new Error('valor no canónico; no se admite ausencia como NULL');
}
export const huellaCanonica = (valor) =>
  createHash('sha256').update(canonico(valor), 'utf8').digest('hex');
const iguales = (a, b) => canonico(a) === canonico(b);
const conjunto = (xs) => [...xs].sort((a, b) => canonico(a).localeCompare(canonico(b)));
const evidenciaFilas = (filas) => ({
  filas: String(filas.length),
  huella: huellaCanonica(conjunto(filas)),
});
const evidenciaValida = (e) => e && /^\d+$/.test(e.filas) && SHA256.test(e.huella);

function sobreValido(s) {
  try {
    if (
      s?.perfil !== 'm10-contraccion-v1' ||
      ![19, 21, 22].includes(s.version) ||
      numeroMigracion(s.migracion) !== s.version ||
      s.esquema?.tabla !== (s.version === 19 ? 'public.reporte_inundacion' : 'public.reporte') ||
      !Array.isArray(s.esquema.columnas) ||
      !s.esquema.columnas.length ||
      s.esquema.columnas.some((c) => !identificador(c)) ||
      new Set(s.esquema.columnas).size !== s.esquema.columnas.length ||
      !SHA256.test(s.crudo?.reportes) ||
      !evidenciaValida(s.logico?.cuota) ||
      !SHA256.test(s.logico.catalogo) ||
      !Array.isArray(s.logico.categorias) ||
      !Array.isArray(s.logico.auxiliares) ||
      !Array.isArray(s.esquema.indices) ||
      !s.esquema.indices.length ||
      s.esquema.indices.some((i) => i.valido !== true) ||
      !Array.isArray(s.esquema.fks) ||
      !Array.isArray(s.integridad?.fkHuerfanas) ||
      s.integridad.fkHuerfanas.length ||
      s.integridad.geometriasInvalidas !== '0'
    )
      return false;
    if (
      s.logico.categorias.some(
        (c) =>
          !['inundacion', 'bache', 'basura', 'area_verde'].includes(c.categoria) ||
          !evidenciaValida(c),
      ) ||
      new Set(s.logico.categorias.map((c) => c.categoria)).size !== s.logico.categorias.length ||
      s.logico.auxiliares.some((t) => !tablaPermitida(t.tabla) || !evidenciaValida(t)) ||
      new Set(s.logico.auxiliares.map((t) => t.tabla)).size !== s.logico.auxiliares.length
    )
      return false;
    const cols = s.esquema.columnas;
    if (
      s.version === 22
        ? CAMPOS_INUNDACION.some((c) => cols.includes(c))
        : CAMPOS_INUNDACION.some((c) => !cols.includes(c))
    )
      return false;
    if (s.version >= 21 && CAMPOS_MULTITEMA.some((c) => !cols.includes(c))) return false;
    if (
      s.version === 22 &&
      !['m10_0022_detalle_version_v1', 'm10_0022_inundacion_detalle_v1'].every((c) =>
        s.esquema.garantias?.includes(c),
      )
    )
      return false;
    const a = s.esquema.archivo;
    if (s.version === 22 && !a) return false;
    if (
      a &&
      (typeof a.propietario !== 'string' ||
        !a.propietario ||
        !iguales(conjunto(a.columnas), conjunto(CAMPOS_ARCHIVO)) ||
        !iguales(a.pk, ['usuario_id', 'dia']) ||
        !Array.isArray(a.privilegiosAjenos) ||
        a.privilegiosAjenos.length ||
        !Array.isArray(a.fks) ||
        a.fks.length)
    )
      return false;
    return true;
  } catch {
    return false;
  }
}

/** Igualdad TOTAL dentro de la transformación declarada; no intersección de columnas. */
export function compararSnapshotsContraccion(a, b, { exacta = false, recuperacion = false } = {}) {
  if (!sobreValido(a) || !sobreValido(b)) return false;
  if (b.version < a.version && !recuperacion) return false;
  if (exacta) return iguales(a, b);
  if (b.version < a.version) return compararSnapshotsContraccion(b, a);
  if (b.version === a.version && b.migracion !== a.migracion) return false;
  const columnasLogicas = (s) =>
    conjunto([
      ...s.esquema.columnas.filter(
        (c) => !CAMPOS_INUNDACION.includes(c) && !CAMPOS_MULTITEMA.includes(c),
      ),
      ...CAMPOS_MULTITEMA,
      ...CAMPOS_INUNDACION,
    ]);
  if (!iguales(columnasLogicas(a), columnasLogicas(b))) return false;
  const normalizarTabla = (s) => s.replaceAll('public.reporte_inundacion', 'public.reporte');
  const indices = (s) =>
    conjunto(
      s.esquema.indices
        .filter(
          (i) =>
            !(
              s.version < 22 &&
              b.version === 22 &&
              i.columnas?.some((c) => CAMPOS_INUNDACION.includes(c))
            ),
        )
        .map((i) => JSON.parse(normalizarTabla(JSON.stringify(i)))),
    );
  const fks = (s) =>
    conjunto(
      s.esquema.fks
        .filter((f) => !(b.version === 22 && f.tabla === CUOTA))
        .map((f) => JSON.parse(normalizarTabla(JSON.stringify(f)))),
    );
  // La única FK eliminada de auxiliares es la de la cuota archivada, que deja de ser operativa.
  // El capturador19 aplica únicamente las adiciones0020/0021 conocidas a sus metadatos.
  if (!iguales(indices(a), indices(b)) || !iguales(fks(a), fks(b))) return false;
  if (a.esquema.tipos && b.esquema.tipos) {
    const tipos = (s) =>
      conjunto(
        s.esquema.tipos.filter(
          (t) =>
            !CAMPOS_INUNDACION.includes(t.nombre) &&
            !(a.version === 19 && CAMPOS_MULTITEMA.includes(t.nombre)),
        ),
      );
    if (!iguales(tipos(a), tipos(b))) return false;
  }
  if (
    a.esquema.auxiliares &&
    b.esquema.auxiliares &&
    !iguales(conjunto(a.esquema.auxiliares), conjunto(b.esquema.auxiliares))
  )
    return false;
  if (
    !iguales(conjunto(a.logico.categorias), conjunto(b.logico.categorias)) ||
    !iguales(a.logico.cuota, b.logico.cuota) ||
    a.logico.catalogo !== b.logico.catalogo ||
    !iguales(conjunto(a.logico.auxiliares), conjunto(b.logico.auxiliares))
  )
    return false;
  // Una reversa puede conservar archivo y cuota pública distintos: se comprueban POR SEPARADO.
  const archivada = (s) => s.crudo.cuotaArchivada ?? (s.version === 22 ? s.crudo.cuota : null);
  if (a.esquema.archivo && b.esquema.archivo && !iguales(archivada(a), archivada(b))) return false;
  return true;
}

function reporteLogico(r, version) {
  const fila = { ...r };
  if (version === 19) {
    fila.categoria = 'inundacion';
    fila.subtipo = null;
    fila.detalle_version = 1;
    fila.detalle = Object.fromEntries(
      CAMPOS_INUNDACION.filter((c) => fila[c] !== null).map((c) => [c, fila[c]]),
    );
  }
  if (
    !['inundacion', 'bache', 'basura', 'area_verde'].includes(fila.categoria) ||
    fila.detalle_version !== 1 ||
    !fila.detalle ||
    Array.isArray(fila.detalle) ||
    typeof fila.detalle !== 'object'
  )
    throw new Error('detalle/categoría/version no soportados');
  if (version < 22 && fila.categoria === 'inundacion') {
    const esperado = Object.fromEntries(
      CAMPOS_INUNDACION.filter((c) => fila[c] !== null).map((c) => [c, fila[c]]),
    );
    if (!iguales(fila.detalle, esperado)) throw new Error('planos y JSON completo divergentes');
  }
  for (const c of CAMPOS_INUNDACION) {
    const esperado = fila.categoria === 'inundacion' ? (fila.detalle[c] ?? null) : null;
    if (version < 22 && !iguales(fila[c], esperado)) throw new Error('planos y JSON divergentes');
    fila[c] = esperado;
  }
  return fila;
}

/** Solo SELECT con SQL inyectado. Se captura en una transacción/snapshot del adaptador dueño. */
export async function snapshotContraccion(base, { sql: consultar } = {}) {
  if (typeof consultar !== 'function') throw new Error('se requiere SQL inyectado');
  const json = async (consulta) => jsonSinRedondeo(await consultar(base, consulta));
  const migracion = (
    await consultar(base, "SELECT coalesce(max(nombre),'') FROM public._migraciones")
  ).trim();
  const version = numeroMigracion(migracion);
  if (![19, 21, 22].includes(version)) throw new Error('versión no soportada');
  const historial = await json(
    "SELECT coalesce(jsonb_agg(nombre ORDER BY nombre),'[]'::jsonb)::text FROM public._migraciones",
  );
  if (
    historial.length !== version ||
    historial.some((n, i) => numeroMigracion(n) !== i + 1) ||
    historial.at(-1) !== migracion
  )
    throw new Error('historial de esquema incompleto');
  if (version === 22) {
    const estado = await json(
      "SELECT coalesce(jsonb_agg(s),'[]'::jsonb)::text FROM public.estado_esquema_m10() s",
    );
    if (estado.length !== 1 || estado[0].version !== 22 || estado[0].integro !== true)
      throw new Error('esquema22 incompleto');
  }
  const tablas =
    await json(`SELECT coalesce(jsonb_agg(n.nspname||'.'||c.relname ORDER BY n.nspname,c.relname),'[]'::jsonb)::text
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p')
    AND n.nspname IN ('public','geo','resguardo_m10') AND NOT (n.nspname='public' AND c.relname IN ('_migraciones','spatial_ref_sys'))`);
  if (!Array.isArray(tablas) || tablas.some((t) => !tablaPermitida(t)))
    throw new Error('tabla no permitida');
  const tabla = version === 19 ? 'public.reporte_inundacion' : 'public.reporte';
  if (!tablas.includes(tabla) || (version === 22 && !tablas.includes(ARCHIVO)))
    throw new Error('faltan objetos de perfil');
  const obligatorias = [
    'public.usuario',
    'public.reporte_foto',
    'public.auditoria',
    'public.idempotencia',
    'public.sesion',
    'public.punto_critico',
    'geo.capa_version',
    'geo.distrito_municipal',
    'geo.unidad_vecinal',
    'geo.manzana',
    ...(version >= 21 ? ['public.categoria', 'public.cupo_contador'] : []),
    ...(version < 22 ? [CUOTA] : []),
  ];
  if (obligatorias.some((t) => !tablas.includes(t)))
    throw new Error('faltan tablas auxiliares del perfil');
  const todas = {};
  for (const t of tablas)
    todas[t] = await json(`SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)::text FROM ${t} r`);
  const columnas = await json(
    `SELECT coalesce(jsonb_agg(column_name ORDER BY column_name),'[]'::jsonb)::text FROM information_schema.columns WHERE table_schema='public' AND table_name='${tabla.split('.')[1]}'`,
  );
  const tipos = await json(
    `SELECT coalesce(jsonb_agg(jsonb_build_object('nombre',column_name,'tipo',udt_schema||'.'||udt_name,'nullable',is_nullable) ORDER BY column_name),'[]'::jsonb)::text FROM information_schema.columns WHERE table_schema='public' AND table_name='${tabla.split('.')[1]}'`,
  );
  const estructuraAuxiliar =
    await json(`SELECT coalesce(jsonb_agg(jsonb_build_object('tabla',n.nspname||'.'||c.relname,'nombre',a.attname,
    'tipo',format_type(a.atttypid,a.atttypmod),'noNulo',a.attnotnull) ORDER BY n.nspname,c.relname,a.attnum),'[]'::jsonb)::text
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
    WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','geo','resguardo_m10') AND a.attnum>0 AND NOT a.attisdropped
    AND c.oid<>'${tabla}'::regclass AND NOT(n.nspname='public' AND c.relname IN ('_migraciones','spatial_ref_sys','cuota_reporte_diaria'))
    AND n.nspname<>'resguardo_m10'`);
  let indices =
    await json(`SELECT coalesce(jsonb_agg(jsonb_build_object('tabla',n.nspname||'.'||t.relname,'metodo',am.amname,
    'columnas',(SELECT jsonb_agg(pg_get_indexdef(i.indexrelid,k,true) ORDER BY k) FROM generate_series(1,i.indnatts) k),
    'claves',i.indnkeyatts,'orden',to_jsonb(i.indoption::smallint[]),'nullsNoDistintos',i.indnullsnotdistinct,
    'definicion',substring(pg_get_indexdef(i.indexrelid) from 'USING .*$'),
    'predicado',pg_get_expr(i.indpred,i.indrelid),'unico',i.indisunique,'valido',i.indisvalid AND i.indisready) ORDER BY n.nspname,t.relname,c.relname),'[]'::jsonb)::text
    FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    JOIN pg_am am ON am.oid=c.relam WHERE n.nspname IN ('public','geo') AND t.relname NOT IN ('_migraciones','spatial_ref_sys','cuota_reporte_diaria')`);
  const fks =
    await json(`SELECT coalesce(jsonb_agg(jsonb_build_object('tabla',ns.nspname||'.'||t.relname,
    'columnas',(SELECT jsonb_agg(a.attname ORDER BY k.ord) FROM unnest(f.conkey) WITH ORDINALITY k(att,ord) JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.att),
    'referencia',nr.nspname||'.'||r.relname,'referenciadas',(SELECT jsonb_agg(a.attname ORDER BY k.ord) FROM unnest(f.confkey) WITH ORDINALITY k(att,ord) JOIN pg_attribute a ON a.attrelid=r.oid AND a.attnum=k.att),
    'onDelete',f.confdeltype,'onUpdate',f.confupdtype,'match',f.confmatchtype,'diferible',f.condeferrable,'diferida',f.condeferred) ORDER BY ns.nspname,t.relname,f.conname),'[]'::jsonb)::text
    FROM pg_constraint f JOIN pg_class t ON t.oid=f.conrelid JOIN pg_namespace ns ON ns.oid=t.relnamespace
    JOIN pg_class r ON r.oid=f.confrelid JOIN pg_namespace nr ON nr.oid=r.relnamespace WHERE f.contype='f' AND ns.nspname IN ('public','geo','resguardo_m10')`);
  const fkHuerfanas = [];
  for (const f of fks) {
    if (
      !tablaPermitida(f.tabla) ||
      !tablaPermitida(f.referencia) ||
      !f.columnas?.length ||
      f.columnas.length !== f.referenciadas?.length ||
      [...f.columnas, ...f.referenciadas].some((c) => !identificador(c))
    )
      throw new Error('FK inválida');
    const noNulas = f.columnas.map((c) => `a.${c} IS NOT NULL`).join(' AND ');
    const algunaNula = f.columnas.map((c) => `a.${c} IS NULL`).join(' OR ');
    const algunaNoNula = f.columnas.map((c) => `a.${c} IS NOT NULL`).join(' OR ');
    const join = f.columnas.map((c, i) => `b.${f.referenciadas[i]}=a.${c}`).join(' AND ');
    const parcial = f.match === 'f' ? ` OR ((${algunaNula}) AND (${algunaNoNula}))` : '';
    const n = (
      await consultar(
        base,
        `SELECT count(*) FROM ${f.tabla} a WHERE ((${noNulas}) AND NOT EXISTS (SELECT 1 FROM ${f.referencia} b WHERE ${join}))${parcial}`,
      )
    ).trim();
    if (contar(n) !== 0n) fkHuerfanas.push(f);
  }
  const indicesCrudos = structuredClone(indices);
  const fksCrudas = structuredClone(fks);
  const auxiliaresCrudos = structuredClone(estructuraAuxiliar);
  const garantias = await json(
    `SELECT coalesce(jsonb_agg(conname ORDER BY conname),'[]'::jsonb)::text FROM pg_constraint WHERE conrelid='${tabla}'::regclass AND contype='c' AND convalidated`,
  );
  let archivo = null;
  if (tablas.includes(ARCHIVO)) {
    archivo = await json(`SELECT jsonb_build_object('propietario',pg_get_userbyid(c.relowner),
      'columnas',(SELECT jsonb_agg(attname ORDER BY attnum) FROM pg_attribute WHERE attrelid=c.oid AND attnum>0 AND NOT attisdropped),
      'pk',(SELECT jsonb_agg(a.attname ORDER BY k.ord) FROM pg_constraint p CROSS JOIN LATERAL unnest(p.conkey) WITH ORDINALITY k(att,ord) JOIN pg_attribute a ON a.attrelid=p.conrelid AND a.attnum=k.att WHERE p.conrelid=c.oid AND p.contype='p'),
      'fks',(SELECT coalesce(jsonb_agg(conname),'[]'::jsonb) FROM pg_constraint WHERE conrelid=c.oid AND contype='f'),
      'privilegiosAjenos',(SELECT coalesce(jsonb_agg(r.rolname),'[]'::jsonb) FROM pg_roles r WHERE r.oid<>c.relowner AND NOT r.rolsuper
        AND (r.rolcanlogin OR r.rolname IN ('curichi_api','curichi_geo')) AND
        (has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))))::text
      FROM pg_class c WHERE c.oid='${ARCHIVO}'::regclass`);
    const propietarioValido = (
      await consultar(
        base,
        `SELECT c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)
      AND n.nspowner=c.relowner AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) x WHERE x.grantee<>n.nspowner)
      AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x WHERE x.grantee<>c.relowner)
      AND NOT EXISTS (SELECT 1 FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE a.attrelid=c.oid AND x.grantee<>c.relowner)
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid='${ARCHIVO}'::regclass`,
      )
    ).trim();
    if (propietarioValido !== 't') throw new Error('archivo no exclusivo del dueño');
  }
  const filas = todas[tabla].map((r) => reporteLogico(r, version));
  const categorias = [...new Set(filas.map((r) => r.categoria))].sort().map((categoria) => ({
    categoria,
    ...evidenciaFilas(filas.filter((r) => r.categoria === categoria)),
  }));
  const cuota = version === 22 ? todas[ARCHIVO] : todas[CUOTA];
  if (!cuota) throw new Error('falta cuota del perfil');
  const auxiliares = Object.entries(todas)
    .filter(([t]) => ![tabla, CUOTA, ARCHIVO, 'public.categoria'].includes(t))
    .map(([t, rows]) => ({
      tabla: t,
      ...evidenciaFilas(
        version === 19 && t === 'public.punto_critico'
          ? rows.map((r) => ({ ...r, categoria: 'inundacion' }))
          : rows,
      ),
    }));
  if (version === 19) {
    auxiliares.push({ tabla: 'public.cupo_contador', ...evidenciaFilas([]) });
    const agregado = [
      'unidad_vecinal_id',
      'id',
      'punto_critico_id',
      'severidad_manual',
      'severidad_calculada',
      'estado',
      'publicar_en',
    ];
    const indiceAgregado = indices.find((i) => i.tabla === tabla && iguales(i.columnas, agregado));
    indices = indices.map((i) =>
      i === indiceAgregado
        ? {
            ...i,
            columnas: [...agregado, 'categoria'],
            definicion: i.definicion.replace('publicar_en) WHERE', 'publicar_en, categoria) WHERE'),
          }
        : i,
    );
    const indice = (
      t,
      cols,
      unico = true,
      predicado = null,
      orden = cols.map(() => 0),
      definicion = `USING btree (${cols.join(', ')})`,
    ) => ({
      tabla: t,
      metodo: 'btree',
      columnas: cols,
      predicado,
      unico,
      valido: true,
      claves: cols.length,
      orden,
      nullsNoDistintos: false,
      definicion,
    });
    const creado = indices.find(
      (i) =>
        i.tabla === tabla &&
        i.predicado === null &&
        (iguales(i.columnas, ['creado_en']) || iguales(i.columnas, ['creado_en DESC'])),
    );
    if (!creado || !indiceAgregado?.predicado)
      throw new Error('faltan índices temporales históricos');
    indices.push(
      indice('public.categoria', ['slug']),
      indice('public.categoria', ['orden']),
      indice('public.cupo_contador', ['usuario_id', 'clave', 'ventana_inicio']),
      indice(
        'public.reporte',
        ['categoria', ...creado.columnas],
        false,
        indiceAgregado.predicado,
        [0, ...creado.orden],
        `USING btree (categoria, creado_en DESC) WHERE ${indiceAgregado.predicado}`,
      ),
    );
    const fk = (t, cols, ref, refs, onDelete = 'a') => ({
      tabla: t,
      columnas: cols,
      referencia: ref,
      referenciadas: refs,
      onDelete,
      onUpdate: 'a',
      match: 's',
      diferible: false,
      diferida: false,
    });
    fks.push(
      fk('public.categoria', ['activada_por'], 'public.usuario', ['id'], 'n'),
      fk('public.reporte', ['categoria'], 'public.categoria', ['slug']),
      fk('public.punto_critico', ['categoria'], 'public.categoria', ['slug']),
      fk('public.cupo_contador', ['usuario_id'], 'public.usuario', ['id'], 'c'),
    );
    const tipo = (t, nombre, tipoDato, noNulo) => ({ tabla: t, nombre, tipo: tipoDato, noNulo });
    estructuraAuxiliar.push(
      tipo('public.punto_critico', 'categoria', 'text', true),
      ...[
        ['slug', 'text', true],
        ['activa', 'boolean', true],
        ['orden', 'smallint', true],
        ['activada_en', 'timestamp with time zone', false],
        ['activada_por', 'uuid', false],
      ].map(([n, t, nn]) => tipo('public.categoria', n, t, nn)),
      ...[
        ['usuario_id', 'uuid', true],
        ['clave', 'text', true],
        ['ventana_inicio', 'timestamp with time zone', true],
        ['n', 'integer', true],
        ['actualizado_en', 'timestamp with time zone', true],
      ].map(([n, t, nn]) => tipo('public.cupo_contador', n, t, nn)),
    );
  }
  const s = {
    perfil: 'm10-contraccion-v1',
    version,
    migracion,
    esquema: {
      tabla,
      columnas,
      tipos,
      indices,
      fks,
      garantias,
      archivo,
      auxiliares: estructuraAuxiliar,
    },
    crudo: {
      reportes: huellaCanonica(conjunto(todas[tabla])),
      cuota: evidenciaFilas(cuota),
      cuotaArchivada: todas[ARCHIVO] ? evidenciaFilas(todas[ARCHIVO]) : null,
      esquemaSha256: huellaCanonica({
        columnas,
        tipos,
        indices: indicesCrudos,
        fks: fksCrudas,
        auxiliares: auxiliaresCrudos,
        garantias,
        archivo,
      }),
      tablas: Object.entries(todas).map(([t, rows]) => ({ tabla: t, ...evidenciaFilas(rows) })),
    },
    logico: {
      categorias,
      reportes: conjunto(
        filas.map((r) => ({ id: r.id, categoria: r.categoria, huella: huellaCanonica(r) })),
      ),
      cuota: evidenciaFilas(cuota),
      catalogo: huellaCanonica(
        conjunto(version === 19 ? CATALOGO_0020 : todas['public.categoria']),
      ),
      auxiliares,
    },
    integridad: {
      fkHuerfanas,
      geometriasInvalidas: (
        await consultar(base, `SELECT count(*) FROM ${tabla} WHERE NOT ST_IsValid(geom)`)
      ).trim(),
    },
  };
  if (!sobreValido(s)) throw new Error('evidencia incompleta o integridad inválida');
  return s;
}

/** Solo lectura. El ejecutor se exige explícitamente: al importar o probar no hay fallback. */
export async function snapshot(base, { sql: consultar, columnas: proyeccion } = {}) {
  if (typeof consultar !== 'function') throw new Error('se requiere SQL inyectado');
  const migracion = (
    await consultar(base, "SELECT coalesce(max(nombre), '') FROM _migraciones")
  ).trim();
  const version = numeroMigracion(migracion);
  if (![19, 21].includes(version))
    throw new Error('snapshot legado solo admite19/21; usar evidencia22 versionada');
  const tabla = version >= 20 ? 'reporte' : 'reporte_inundacion';
  const tipo = (
    await consultar(
      base,
      `SELECT c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = '${tabla}'`,
    )
  ).trim();
  if (!['r', 'p'].includes(tipo))
    throw new Error('falta la tabla física de reportes de esta migración');
  const columnas = JSON.parse(
    await consultar(
      base,
      `SELECT coalesce(json_agg(column_name ORDER BY column_name), '[]'::json)::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${tabla}'`,
    ),
  );
  if (
    !Array.isArray(columnas) ||
    columnas.length === 0 ||
    columnas.some((c) => typeof c !== 'string' || !/^[a-z_][a-z0-9_]*$/.test(c))
  )
    throw new Error('columnas de reportes inválidas');
  if (
    version >= 20 &&
    ['categoria', 'detalle', 'detalle_version'].some((c) => !columnas.includes(c))
  )
    throw new Error('faltan columnas multitemáticas');
  const elegidas = proyeccion ?? columnas;
  if (
    !Array.isArray(elegidas) ||
    elegidas.length === 0 ||
    elegidas.some((c) => !columnas.includes(c))
  )
    throw new Error('faltan columnas del respaldo en la copia');
  // JSONB conserva tipos, NULL, detalle completo y geometría. La proyección proviene del origen:
  // columnas añadidas por migraciones posteriores no alteran la huella de las columnas antiguas.
  const claves = elegidas.map((c) => `'${c}'`).join(',');
  const fila = `(SELECT jsonb_object_agg(key, value) FROM jsonb_each(to_jsonb(r)) WHERE key IN (${claves}))`;
  const huellaFila = `encode(sha256(convert_to(${fila}::text, 'UTF8')), 'hex')`;
  const categoria = version >= 20 ? 'r.categoria' : "'inundacion'::text";
  const categorias = JSON.parse(
    await consultar(
      base,
      `SELECT coalesce(jsonb_agg(s ORDER BY categoria), '[]'::jsonb)::text FROM (
      SELECT ${categoria} AS categoria, count(*)::text AS filas,
        encode(sha256(convert_to(coalesce(string_agg(${huellaFila}, '' ORDER BY ${huellaFila}), ''), 'UTF8')), 'hex') AS huella
      FROM public.${tabla} r GROUP BY ${categoria}
    ) s`,
    ),
  );
  if (
    !Array.isArray(categorias) ||
    categorias.some(
      (c) =>
        typeof c.categoria !== 'string' ||
        !/^[a-z_][a-z0-9_]*$/.test(c.categoria) ||
        !/^[1-9]\d*$/.test(c.filas) ||
        !/^[a-f0-9]{64}$/.test(c.huella),
    ) ||
    new Set(categorias.map((c) => c.categoria)).size !== categorias.length
  )
    throw new Error('evidencia de categorías inválida');
  categorias.sort((a, b) => a.categoria.localeCompare(b.categoria));
  const conteos = {};
  const consultas = {
    ...COMPROBACIONES,
    reportes: `SELECT count(*) FROM public.${tabla}`,
    publicables: `SELECT count(*) FROM public.${tabla} WHERE estado IN ('validado','resuelto')`,
    con_geom_publico: `SELECT count(*) FROM public.${tabla} WHERE geom_publico IS NOT NULL`,
    geometrias_invalidas: `SELECT count(*) FROM public.${tabla} WHERE NOT ST_IsValid(geom)`,
  };
  for (const [nombre, consulta] of Object.entries(consultas)) {
    conteos[nombre] = (await consultar(base, consulta)).trim();
    contar(conteos[nombre]);
  }
  if (categorias.reduce((n, c) => n + contar(c.filas), 0n) !== contar(conteos.reportes))
    throw new Error('evidencia de categorías incompleta para el total de reportes');
  const catalogo =
    version >= 20
      ? (
          await consultar(
            base,
            "SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(c) ORDER BY slug)::text, '[]'), 'UTF8')), 'hex') AS catalogo_categorias FROM public.categoria c",
          )
        ).trim()
      : null;
  if (catalogo !== null && !/^[a-f0-9]{64}$/.test(catalogo))
    throw new Error('evidencia del catálogo de categorías inválida');
  return { migracion, version, tabla, columnas: elegidas, categorias, conteos, catalogo };
}

export async function verificar(original, copia, { sql: consultar, perfil } = {}) {
  if (typeof consultar !== 'function') throw new Error('se requiere SQL inyectado');
  if (perfil !== undefined) {
    if (perfil !== 'm10-contraccion-v1') throw new Error('perfil no soportado');
    const a = await snapshotContraccion(original, { sql: consultar });
    const b = await snapshotContraccion(copia, { sql: consultar });
    return compararSnapshotsContraccion(a, b);
  }
  const a = await snapshot(original, { sql: consultar });
  const b = await snapshot(copia, { sql: consultar, columnas: a.columnas });
  if (b.version < a.version || (b.version === a.version && a.migracion !== b.migracion))
    throw new Error('migración de la copia inconsistente con el respaldo');
  const mismasCategorias = JSON.stringify(a.categorias) === JSON.stringify(b.categorias);
  const mismosConteos = Object.keys(a.conteos).every((nombre) => {
    const ampliable = b.version > a.version && ['migraciones', 'indices_reporte'].includes(nombre);
    return ampliable
      ? contar(b.conteos[nombre]) >= contar(a.conteos[nombre])
      : b.conteos[nombre] === a.conteos[nombre];
  });
  return (
    mismasCategorias &&
    mismosConteos &&
    b.conteos.geometrias_invalidas === '0' &&
    contar(b.conteos.indices_reporte) > 0n &&
    (a.catalogo === null || a.catalogo === b.catalogo)
  );
}

async function simulacro({ autorizarContraccionCompatible = false } = {}) {
  if (autorizarContraccionCompatible !== true)
    throw new Error('simulacro22 requiere consentimiento explícito');
  console.log('SIMULACRO DE RECUPERACIÓN\n');
  const r = await respaldar();
  console.log('');
  const s = await restaurar(r.archivo, `${BASE}_simulacro`, {
    objetivo: '0022',
    autorizarContraccionCompatible,
  });
  console.log('');
  const ok = await verificar(BASE, s.destino, { sql, perfil: 'm10-contraccion-v1' });
  console.log('');
  console.log(
    `  tiempo de recuperación (dump + carga de datos): ${(r.segundos + s.segundos).toFixed(1)} s`,
  );
  console.log(`  tamaño del respaldo: ${(r.bytes / 1e6).toFixed(1)} MB · migración ${r.migracion}`);
  console.log(`  se conservan la base "${s.destino}" y el archivo de respaldo`);
  if (!ok) {
    console.error('\n  ✗ EL SIMULACRO FALLÓ: la copia restaurada no coincide con el original.');
    process.exitCode = 1;
    return;
  }
  console.log('\n  ✓ simulacro correcto: el respaldo se restaura y los datos coinciden.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [accion, ...resto] = process.argv.slice(2);
  try {
    if (accion === 'respaldar') await respaldar(resto[0]);
    else if (accion === 'restaurar') {
      const opciones = {};
      const posicionales = [];
      for (let i = 0; i < resto.length; i++) {
        if (resto[i] === '--hasta') opciones.hasta = resto[++i];
        else if (resto[i] === '--objetivo') opciones.objetivo = resto[++i];
        else if (resto[i] === '--autorizar-contraccion-compatible')
          opciones.autorizarContraccionCompatible = true;
        else if (resto[i] === '--base-administrativa') opciones.baseAdministrativa = resto[++i];
        else if (resto[i].startsWith('--')) throw new Error('opción desconocida');
        else posicionales.push(resto[i]);
      }
      if (!posicionales[0] || !posicionales[1])
        throw new Error('uso: restaurar <archivo> <base> [--hasta NNNN]');
      await restaurar(posicionales[0], posicionales[1], opciones);
    } else if (accion === 'simulacro') {
      if (resto.some((r) => r !== '--autorizar-contraccion-compatible') || resto.length > 1)
        throw new Error('opción desconocida');
      await simulacro({
        autorizarContraccionCompatible: resto.includes('--autorizar-contraccion-compatible'),
      });
    } else {
      console.log('uso: node scripts/respaldo.mjs respaldar|restaurar|simulacro');
      process.exitCode = 1;
    }
  } catch (e) {
    console.error('respaldo:', e.message);
    process.exitCode = 1;
  }
}
