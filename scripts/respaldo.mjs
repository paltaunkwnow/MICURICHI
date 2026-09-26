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
  enContenedor(['psql', '-U', USUARIO, '-d', base, '-X', '-tAc', consulta], { silencioso: true });

function cronometrar(nombre) {
  const t0 = Date.now();
  return () => {
    const s = (Date.now() - t0) / 1000;
    console.log(`  ${nombre}: ${s.toFixed(1)} s`);
    return s;
  };
}

async function ultimaMigracion(base) {
  const existe = (await sql(base, "SELECT to_regclass('public._migraciones') IS NOT NULL")).trim();
  if (existe !== 't') return '';
  return (await sql(base, "SELECT coalesce(max(nombre), '') FROM _migraciones")).trim();
}

/**
 * Aplica las migraciones a `base` con el CLI de producción, `--hasta` una versión o todas.
 * Devuelve el mensaje final del CLI (una línea JSON por evento, con la forma de pino).
 */
async function migrar(base, hasta) {
  const argumentos = hasta ? ['--hasta', hasta] : [];
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
  const migracion = await ultimaMigracion(BASE);
  if (!migracion) throw new Error(`"${BASE}" no tiene migraciones aplicadas: no hay qué respaldar`);
  const fin = cronometrar('pg_dump');
  // -Fc: formato custom. Permite restaurar en paralelo (-j) y solo los datos de unos esquemas,
  // cosas que el volcado en SQL plano no permite. -Z 6: comprimido, ~15× en estos datos.
  // Sin `_migraciones`: la restauración aplica las migraciones ANTES de cargar los datos.
  await enContenedor([
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
  ]);
  const segundos = fin();
  const despues = await ultimaMigracion(BASE);
  if (despues !== migracion)
    throw new Error(`se aplicó una migración durante el volcado (${migracion} → ${despues})`);
  // La versión viaja con el archivo: sin ella no se sabe hasta dónde migrar antes de cargarlo.
  await enContenedor([
    'sh',
    '-c',
    'printf %s "$1" > "$2"',
    'sh',
    migracion,
    `${archivo}.migracion`,
  ]);
  const ls = await enContenedor(['sh', '-c', `ls -l ${archivo} | awk '{print $5}'`]);
  const bytes = Number(ls.trim());
  console.log(`  archivo: ${(bytes / 1e6).toFixed(1)} MB · migración ${migracion}`);
  console.log('\n  ⚠ El dump lleva datos personales: ip_hash, emails y coordenadas EXACTAS de');
  console.log('    viviendas. Cífralo antes de moverlo fuera de la máquina.');
  return { archivo, bytes, segundos, migracion };
}

async function restaurar(archivo, destino, { hasta } = {}) {
  if (!NOMBRE_BASE.test(destino)) throw new Error(`nombre de base no admitido: "${destino}"`);
  // Se BORRA y se vuelve a crear la base destino: nunca la principal.
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
  console.log(`restauración de ${archivo} → base "${destino}" (esquema hasta ${version})`);
  await sql('postgres', `DROP DATABASE IF EXISTS ${destino} WITH (FORCE)`);
  await sql('postgres', `CREATE DATABASE ${destino}`);

  console.log(`  1) esquema: ${await migrar(destino, version)}`);
  const fin = cronometrar('2) datos (pg_restore)');
  // --data-only y solo `public` y `geo`: el esquema ya lo pusieron las migraciones, y los esquemas
  // de otras extensiones de la imagen (tiger, topology) no son datos de la aplicación.
  // --disable-triggers: el orden de las tablas no respeta las claves foráneas (y
  // `fusionado_en_id` se apunta a sí misma). --exit-on-error: por defecto pg_restore sigue, dice
  // «errors ignored on restore» y sale con 0.
  await enContenedor([
    'pg_restore',
    '-U',
    USUARIO,
    '-d',
    destino,
    '--data-only',
    '--schema=public',
    '--schema=geo',
    '--disable-triggers',
    '--exit-on-error',
    '-j',
    '4',
    archivo,
  ]);
  const segundos = fin();
  console.log(`  3) resto de migraciones: ${await migrar(destino)}`);
  return { destino, segundos };
}

/** Comprobaciones que tienen que dar lo mismo en el original y en la copia restaurada. */
const COMPROBACIONES = {
  reportes: 'SELECT count(*) FROM reporte_inundacion',
  publicables: "SELECT count(*) FROM reporte_inundacion WHERE estado IN ('validado','resuelto')",
  con_geom_publico: 'SELECT count(*) FROM reporte_inundacion WHERE geom_publico IS NOT NULL',
  geometrias_invalidas: 'SELECT count(*) FROM reporte_inundacion WHERE NOT ST_IsValid(geom)',
  unidades_vecinales: 'SELECT count(*) FROM geo.unidad_vecinal',
  capas_vigentes: 'SELECT count(*) FROM geo.capa_version WHERE vigente',
  usuarios: 'SELECT count(*) FROM usuario',
  fotos: 'SELECT count(*) FROM reporte_foto',
  auditoria: 'SELECT count(*) FROM auditoria',
  migraciones: 'SELECT count(*) FROM _migraciones',
  indices_reporte: "SELECT count(*) FROM pg_indexes WHERE tablename = 'reporte_inundacion'",
  puntos_criticos: 'SELECT count(*) FROM punto_critico',
};

async function verificar(original, copia) {
  const filas = [];
  let todoIgual = true;
  for (const [nombre, consulta] of Object.entries(COMPROBACIONES)) {
    const a = (await sql(original, consulta)).trim();
    const b = (await sql(copia, consulta)).trim();
    // La copia termina migrada al código ACTUAL: si el original iba por detrás (un respaldo viejo),
    // tiene más migraciones que él, nunca menos.
    const igual = nombre === 'migraciones' ? Number(b) >= Number(a) : a === b;
    if (!igual) todoIgual = false;
    filas.push({ comprobación: nombre, original: a, restaurada: b, coincide: igual ? 'sí' : 'NO' });
  }
  console.table(filas);
  // Aparte de que coincidan: no puede haber geometrías inválidas ni faltar índices.
  const invalidas = Number((await sql(copia, COMPROBACIONES.geometrias_invalidas)).trim());
  if (invalidas > 0) {
    console.error(`  ✗ la copia tiene ${invalidas} geometrías inválidas`);
    todoIgual = false;
  }
  return todoIgual;
}

async function simulacro() {
  console.log('SIMULACRO DE RECUPERACIÓN\n');
  const r = await respaldar();
  console.log('');
  const s = await restaurar(r.archivo, `${BASE}_simulacro`);
  console.log('');
  const ok = await verificar(BASE, s.destino);
  console.log('');
  console.log(
    `  tiempo de recuperación (dump + carga de datos): ${(r.segundos + s.segundos).toFixed(1)} s`,
  );
  console.log(`  tamaño del respaldo: ${(r.bytes / 1e6).toFixed(1)} MB · migración ${r.migracion}`);
  await sql('postgres', `DROP DATABASE IF EXISTS ${s.destino} WITH (FORCE)`);
  await enContenedor(['rm', '-f', r.archivo, `${r.archivo}.migracion`]);
  console.log(`  base de prueba "${s.destino}" y archivo de respaldo borrados`);
  if (!ok) {
    console.error('\n  ✗ EL SIMULACRO FALLÓ: la copia restaurada no coincide con el original.');
    process.exitCode = 1;
    return;
  }
  console.log('\n  ✓ simulacro correcto: el respaldo se restaura y los datos coinciden.');
}

const [accion, ...resto] = process.argv.slice(2);
try {
  if (accion === 'respaldar') await respaldar(resto[0]);
  else if (accion === 'restaurar') {
    const i = resto.indexOf('--hasta');
    const hasta = i >= 0 ? resto[i + 1] : undefined;
    const posicionales = i >= 0 ? resto.filter((_, j) => j !== i && j !== i + 1) : resto;
    if (!posicionales[0] || !posicionales[1])
      throw new Error('uso: restaurar <archivo> <base> [--hasta NNNN]');
    await restaurar(posicionales[0], posicionales[1], { hasta });
  } else if (accion === 'simulacro') await simulacro();
  else {
    console.log('uso: node scripts/respaldo.mjs respaldar|restaurar|simulacro');
    process.exitCode = 1;
  }
} catch (e) {
  console.error('respaldo:', e.message);
  process.exitCode = 1;
}
