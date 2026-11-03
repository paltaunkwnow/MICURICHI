#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * Comprueba contra una base REAL que los roles de aplicación tienen exactamente los privilegios
 * de las migraciones 0008, 0009, 0014, 0016 y 0020: ni uno más, ni uno menos.
 *
 * Existe como script y no como test de Vitest porque las pruebas del monorepo corren sobre PGlite,
 * que es de un solo usuario y no tiene roles: allí no hay nada que comprobar. Esto se ejecuta
 * contra PostgreSQL de verdad (Docker o el servidor del municipio) y es lo que da la evidencia.
 *
 *   pnpm privilegios
 *
 * Falla con código 1 si sobra o falta algún privilegio, para poder encadenarlo en un despliegue.
 */
import pg from 'pg';
// La matriz esperada vive aparte para que las pruebas comprueben que nombra todas las tablas.
import { COLUMNAS_ESPERADAS, ESPERADO } from './matriz-privilegios.mjs';

const OPERACIONES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
/** Atributos de rol que ningún servicio debe tener. */
const ATRIBUTOS_PROHIBIDOS = ['rolsuper', 'rolcreaterole', 'rolcreatedb', 'rolbypassrls'];

/** Pool inyectado: importar este módulo no lee configuración, conecta ni termina el proceso. */
export async function verificarMatrizPrivilegios(pool) {
  const fallos = [];
  const avisos = [];
  for (const rol of Object.keys(ESPERADO)) {
    const existe = await pool.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [rol]);
    if (!existe.rowCount) {
      fallos.push(`el rol ${rol} no existe (¿se ejecutó infra/sql/01-roles.sh?)`);
      continue;
    }

    const atrib = await pool.query(
      `SELECT ${ATRIBUTOS_PROHIBIDOS.join(', ')} FROM pg_roles WHERE rolname = $1`,
      [rol],
    );
    for (const a of ATRIBUTOS_PROHIBIDOS)
      if (atrib.rows[0][a]) fallos.push(`${rol} tiene ${a.replace('rol', '').toUpperCase()}`);

    const dueño = await pool.query(
      `SELECT count(*)::int AS n FROM pg_tables
        WHERE schemaname IN ('public','geo','resguardo_m10') AND tablename <> 'spatial_ref_sys' AND tableowner = $1`,
      [rol],
    );
    if (dueño.rows[0].n) fallos.push(`${rol} es dueño de ${dueño.rows[0].n} tabla(s)`);

    // Privilegios reales, tabla por tabla y operación por operación.
    const tablas = await pool.query(
      `SELECT schemaname || '.' || tablename AS t FROM pg_tables WHERE schemaname IN ('public','geo','resguardo_m10')`,
    );
    for (const { t } of tablas.rows) {
      const esperadas = ESPERADO[rol][t];
      const tiene = [];
      for (const op of OPERACIONES) {
        const r = await pool.query('SELECT has_table_privilege($1, $2, $3) AS p', [rol, t, op]);
        if (r.rows[0].p) tiene.push(op);
      }
      if (esperadas === undefined) {
        // Tabla que la matriz no contempla: si el rol no tiene nada, es el resultado correcto
        // (cerrado por defecto); si tiene algo, alguien concedió sin documentarlo.
        if (tiene.length) fallos.push(`${rol} tiene ${tiene.join(',')} sobre ${t}, no documentado`);
        else avisos.push(`tabla ${t} sin privilegios para ${rol} y fuera de la matriz`);
        continue;
      }
      const sobra = tiene.filter((op) => !esperadas.includes(op));
      const falta = esperadas.filter((op) => !tiene.includes(op));
      if (sobra.length) fallos.push(`${rol} · ${t}: SOBRA ${sobra.join(',')}`);
      if (falta.length) fallos.push(`${rol} · ${t}: FALTA ${falta.join(',')}`);
    }

    // Columna a columna, allí donde el privilegio se concedió acotado.
    for (const [tabla, ops] of Object.entries(COLUMNAS_ESPERADAS[rol])) {
      const columnas = await pool.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = split_part($1, '.', 1) AND table_name = split_part($1, '.', 2)`,
        [tabla],
      );
      for (const [op, permitidas] of Object.entries(ops)) {
        const tiene = [];
        for (const { column_name: c } of columnas.rows) {
          const r = await pool.query('SELECT has_column_privilege($1, $2, $3, $4) AS p', [
            rol,
            tabla,
            c,
            op,
          ]);
          if (r.rows[0].p) tiene.push(c);
        }
        const sobra = tiene.filter((c) => !permitidas.includes(c));
        const falta = permitidas.filter((c) => !tiene.includes(c));
        if (sobra.length)
          fallos.push(`${rol} · ${tabla}: ${op} SOBRA en columnas ${sobra.join(',')}`);
        if (falta.length)
          fallos.push(`${rol} · ${tabla}: ${op} FALTA en columnas ${falta.join(',')}`);
      }
    }

    // Poder crear objetos en un esquema equivale a poder instalarse una puerta propia.
    for (const esquema of ['public', 'geo', 'resguardo_m10']) {
      const r = await pool.query('SELECT has_schema_privilege($1, $2, $3) AS p', [
        rol,
        esquema,
        'CREATE',
      ]);
      if (r.rows[0].p) fallos.push(`${rol} puede CREATE en el esquema ${esquema}`);
      if (esquema === 'resguardo_m10') {
        const uso = await pool.query('SELECT has_schema_privilege($1, $2, $3) AS p', [
          rol,
          esquema,
          'USAGE',
        ]);
        if (uso.rows[0].p) fallos.push(`${rol} puede USAGE en el esquema ${esquema}`);
      }
    }
  }
  const archivo = await pool.query(`SELECT c.relowner=n.nspowner AS mismo_dueno,
    NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee<>c.relowner) AS tabla_exclusiva,
    NOT EXISTS (SELECT 1 FROM pg_attribute columna CROSS JOIN LATERAL aclexplode(columna.attacl) permiso
      WHERE columna.attrelid=c.oid AND columna.attnum>0 AND NOT columna.attisdropped AND permiso.grantee<>c.relowner) AS columnas_exclusivas,
    NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE a.grantee<>n.nspowner) AS esquema_exclusivo
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='resguardo_m10' AND c.relname='cuota_reporte_diaria' AND c.relkind='r'`);
  if (archivo.rows.length !== 1)
    fallos.push('falta el archivo físico resguardo_m10.cuota_reporte_diaria');
  else {
    if (!archivo.rows[0].mismo_dueno)
      fallos.push('archivo y esquema resguardo_m10 tienen distinto dueño');
    if (!archivo.rows[0].tabla_exclusiva)
      fallos.push('archivo con ACL de tabla ajena al dueño (incluido PUBLIC)');
    if (!archivo.rows[0].columnas_exclusivas)
      fallos.push('archivo con ACL de columna ajena al dueño (incluido PUBLIC)');
    if (!archivo.rows[0].esquema_exclusivo)
      fallos.push('resguardo_m10 con ACL de esquema ajena al dueño (incluido PUBLIC)');
  }
  return { fallos, avisos };
}

async function ejecutarCli() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Definí DATABASE_URL (rol dueño) para poder leer el catálogo de privilegios.');
    process.exitCode = 1;
    return;
  }
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  let resultado;
  try {
    resultado = await verificarMatrizPrivilegios(pool);
  } finally {
    await pool.end();
  }
  const { fallos, avisos } = resultado;
  for (const a of avisos) console.log(`aviso: ${a}`);
  if (fallos.length) {
    console.error('\nPrivilegios incorrectos:');
    for (const f of fallos) console.error(` - ${f}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `privilegios correctos: ${Object.keys(ESPERADO).join(' y ')} tienen exactamente lo documentado hasta la migración0022; archivo exclusivo del dueño`,
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await ejecutarCli();
