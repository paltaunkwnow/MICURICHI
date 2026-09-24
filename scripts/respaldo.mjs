#!/usr/bin/env node
/**
 * Respaldo, restauración y **simulacro** de recuperación.
 *
 * Existe porque "tenemos backups" no es evidencia de nada. Lo único que demuestra que un respaldo
 * sirve es restaurarlo en una base vacía y comprobar que los datos están. Eso es lo que hace
 * `simulacro`, y es lo que hay que correr periódicamente, no solo el día que haga falta.
 *
 *   node scripts/respaldo.mjs respaldar [archivo]     # pg_dump -Fc comprimido
 *   node scripts/respaldo.mjs restaurar <archivo> [base]
 *   node scripts/respaldo.mjs simulacro               # respalda, restaura en una base nueva,
 *                                                     # verifica, mide y borra la base de prueba
 *
 * Medido en la Fase 4 contra PostgreSQL 18 en Docker, con 1 000 025 reportes (base de 1004 MB):
 *
 *   pg_dump -Fc -Z 6   →  5,3 s   ·  66 MB   (15× de compresión)
 *   pg_restore -j 4    → 19,1 s
 *   verificación       →  conteos exactos, 0 geometrías inválidas, 15 índices, 7 migraciones
 *
 * O sea, un RTO de unos 25 segundos de proceso para un gigabyte, más lo que tarde en existir la
 * máquina. Escala más o menos lineal con el tamaño.
 *
 * QUÉ SE RESPALDA Y QUÉ NO
 *  · La base entera, con el esquema `geo` incluido. Es la única fuente de verdad de los reportes.
 *  · Las FOTOS **no** están aquí: viven en el volumen `fotos-data` (o en MinIO cuando exista el
 *    adaptador S3). Hay que respaldarlas aparte; un respaldo de base sin las fotos deja reportes
 *    con `foto_url` apuntando a objetos que ya no existen.
 *  · `data/raw` y `data/processed` no hacen falta: lo primero es inmutable y está fuera del repo,
 *    lo segundo se regenera con `pnpm etl:all`.
 *
 * El archivo del dump contiene datos personales (`ip_hash`, emails de técnicos, descripciones y
 * coordenadas EXACTAS de viviendas). Se cifra antes de salir de la máquina. El comando lo dice
 * al terminar; cifrarlo no es cosa de este script, que no debe manejar claves.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const ejecutar = promisify(execFile);

const CONTENEDOR = process.env.PG_CONTENEDOR ?? 'curichi-postgis';
const USUARIO = process.env.POSTGRES_USER ?? 'curichi';
const BASE = process.env.POSTGRES_DB ?? 'curichi';
const PASSWORD = process.env.POSTGRES_PASSWORD ?? '';

/** Ejecuta un comando DENTRO del contenedor de PostgreSQL. */
async function enContenedor(args, { silencioso = false } = {}) {
  const base = ['exec', '-e', `PGPASSWORD=${PASSWORD}`, CONTENEDOR, ...args];
  try {
    const { stdout, stderr } = await ejecutar('docker', base, { maxBuffer: 64 * 1024 * 1024 });
    if (stderr && !silencioso) process.stderr.write(stderr);
    return stdout;
  } catch (e) {
    throw new Error(`${args[0]} falló: ${(e.stderr || e.message).toString().slice(0, 500)}`);
  }
}

const sql = (base, consulta) =>
  enContenedor(['psql', '-U', USUARIO, '-d', base, '-tAc', consulta], { silencioso: true });

function cronometrar(nombre) {
  const t0 = Date.now();
  return () => {
    const s = (Date.now() - t0) / 1000;
    console.log(`  ${nombre}: ${s.toFixed(1)} s`);
    return s;
  };
}

async function respaldar(archivo = `/tmp/${BASE}-${new Date().toISOString().slice(0, 10)}.dump`) {
  console.log(`respaldo de "${BASE}" → ${archivo} (dentro del contenedor ${CONTENEDOR})`);
  const tamano = (await sql(BASE, `SELECT pg_size_pretty(pg_database_size('${BASE}'))`)).trim();
  console.log(`  tamaño de la base: ${tamano}`);
  const fin = cronometrar('pg_dump');
  // -Fc: formato custom. Permite restaurar en paralelo (-j) y restaurar tablas sueltas, cosas
  // que el volcado en SQL plano no permite. -Z 6: comprimido, ~15× en estos datos.
  await enContenedor(['pg_dump', '-U', USUARIO, '-d', BASE, '-Fc', '-Z', '6', '-f', archivo]);
  const segundos = fin();
  const ls = await enContenedor(['sh', '-c', `ls -l ${archivo} | awk '{print $5}'`]);
  const bytes = Number(ls.trim());
  console.log(`  archivo: ${(bytes / 1e6).toFixed(0)} MB`);
  console.log('\n  ⚠ El dump lleva datos personales: ip_hash, emails y coordenadas EXACTAS de');
  console.log('    viviendas. Cífralo antes de moverlo fuera de la máquina.');
  return { archivo, bytes, segundos };
}

async function restaurar(archivo, destino = `${BASE}_restaurada`) {
  console.log(`restauración de ${archivo} → base "${destino}"`);
  await sql('postgres', `DROP DATABASE IF EXISTS ${destino} WITH (FORCE)`);
  await sql('postgres', `CREATE DATABASE ${destino}`);
  const fin = cronometrar('pg_restore');
  await enContenedor([
    'pg_restore',
    '-U',
    USUARIO,
    '-d',
    destino,
    '-j',
    '4',
    '--no-owner',
    archivo,
  ]);
  return { destino, segundos: fin() };
}

/** Comprobaciones que tienen que dar lo mismo en el original y en la copia restaurada. */
const COMPROBACIONES = {
  reportes: 'SELECT count(*) FROM reporte_inundacion',
  publicables: "SELECT count(*) FROM reporte_inundacion WHERE estado IN ('validado','resuelto')",
  con_geom_publico: 'SELECT count(*) FROM reporte_inundacion WHERE geom_publico IS NOT NULL',
  geometrias_invalidas: 'SELECT count(*) FROM reporte_inundacion WHERE NOT ST_IsValid(geom)',
  unidades_vecinales: 'SELECT count(*) FROM geo.unidad_vecinal',
  usuarios: 'SELECT count(*) FROM usuario',
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
    const igual = a === b;
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
    `  tiempo total de recuperación (dump + restore): ${(r.segundos + s.segundos).toFixed(1)} s`,
  );
  console.log(`  tamaño del respaldo: ${(r.bytes / 1e6).toFixed(0)} MB`);
  await sql('postgres', `DROP DATABASE IF EXISTS ${s.destino} WITH (FORCE)`);
  console.log(`  base de prueba "${s.destino}" borrada`);
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
    if (!resto[0]) throw new Error('falta el archivo a restaurar');
    await restaurar(resto[0], resto[1]);
  } else if (accion === 'simulacro') await simulacro();
  else {
    console.log('uso: node scripts/respaldo.mjs respaldar|restaurar|simulacro');
    process.exitCode = 1;
  }
} catch (e) {
  console.error('respaldo:', e.message);
  process.exitCode = 1;
}
