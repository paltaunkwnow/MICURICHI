#!/usr/bin/env node
/**
 * Comprueba contra una base REAL que los roles de aplicación tienen exactamente los privilegios
 * de la migración 0008: ni uno más, ni uno menos.
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

const URL_BASE = process.env.DATABASE_URL;
if (!URL_BASE) {
  console.error('Definí DATABASE_URL (rol dueño) para poder leer el catálogo de privilegios.');
  process.exit(1);
}

/**
 * La matriz esperada. Es la misma que documenta la migración 0008 y el informe de seguridad; si
 * alguien añade una tabla o un GRANT, este script lo dice en vez de que se descubra más tarde.
 */
const ESPERADO = {
  curichi_api: {
    'public.reporte_inundacion': ['SELECT', 'INSERT', 'UPDATE'],
    'public.reporte_foto': ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
    'public.auditoria': ['INSERT'],
    // Solo SELECT a nivel de TABLA. El INSERT y el UPDATE existen, pero acotados a unas pocas
    // columnas (migración 0009), y `has_table_privilege` no los cuenta: distingue el privilegio
    // de tabla del de columna. Que aquí aparecieran sería justamente el fallo —significaría que
    // api-core puede escribir `rol` y fabricarse un administrador—, así que esta línea es una
    // aserción en negativo. Las columnas concretas se comprueban en COLUMNAS_ESPERADAS.
    'public.usuario': ['SELECT'],
    'public.sesion': ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
    'public.intento_login': ['SELECT', 'INSERT', 'DELETE'],
    'public.idempotencia': ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
    'public.punto_critico': ['SELECT', 'INSERT', 'DELETE'],
    'public.spatial_ref_sys': ['SELECT'],
    'public._migraciones': [],
    'geo.distrito_municipal': ['SELECT'],
    'geo.unidad_vecinal': ['SELECT'],
    'geo.manzana': ['SELECT'],
    'geo.capa_version': ['SELECT', 'UPDATE'],
  },
  curichi_geo: {
    'public.reporte_inundacion': ['SELECT'],
    'public.punto_critico': ['SELECT'],
    'public.spatial_ref_sys': ['SELECT'],
    'public.reporte_foto': [],
    'public.auditoria': [],
    'public.usuario': [],
    'public.sesion': [],
    'public.intento_login': [],
    'public.idempotencia': [],
    'public._migraciones': [],
    'geo.distrito_municipal': ['SELECT'],
    'geo.unidad_vecinal': ['SELECT'],
    'geo.manzana': ['SELECT'],
    'geo.capa_version': ['SELECT'],
  },
};

/**
 * Privilegios por COLUMNA. Sin esto, la matriz de arriba no distinguiría «puede escribir tres
 * columnas» de «puede escribir la tabla entera», y en `usuario` esa diferencia es exactamente la
 * que impide que el registro público pueda fabricar un administrador: si `rol` apareciera en
 * estas listas, un INSERT con `rol: 'admin'` dejaría de ser imposible para pasar a ser una
 * cuestión de que el código no se equivoque.
 */
const COLUMNAS_ESPERADAS = {
  curichi_api: {
    'public.usuario': {
      INSERT: ['email', 'nombre', 'password_hash'],
      UPDATE: ['password_hash', 'ultimo_reporte_en'],
    },
  },
  curichi_geo: {},
};

const OPERACIONES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
/** Atributos de rol que ningún servicio debe tener. */
const ATRIBUTOS_PROHIBIDOS = ['rolsuper', 'rolcreaterole', 'rolcreatedb', 'rolbypassrls'];

const pool = new pg.Pool({ connectionString: URL_BASE, max: 2 });
const fallos = [];
const avisos = [];

try {
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
        WHERE schemaname IN ('public','geo') AND tablename <> 'spatial_ref_sys' AND tableowner = $1`,
      [rol],
    );
    if (dueño.rows[0].n) fallos.push(`${rol} es dueño de ${dueño.rows[0].n} tabla(s)`);

    // Privilegios reales, tabla por tabla y operación por operación.
    const tablas = await pool.query(
      `SELECT schemaname || '.' || tablename AS t FROM pg_tables WHERE schemaname IN ('public','geo')`,
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
    for (const esquema of ['public', 'geo']) {
      const r = await pool.query('SELECT has_schema_privilege($1, $2, $3) AS p', [
        rol,
        esquema,
        'CREATE',
      ]);
      if (r.rows[0].p) fallos.push(`${rol} puede CREATE en el esquema ${esquema}`);
    }
  }
} finally {
  await pool.end();
}

for (const a of avisos) console.log(`aviso: ${a}`);
if (fallos.length) {
  console.error('\nPrivilegios incorrectos:');
  for (const f of fallos) console.error(` - ${f}`);
  process.exit(1);
}
console.log(
  `privilegios correctos: ${Object.keys(ESPERADO).join(' y ')} tienen exactamente lo documentado en las migraciones 0008 y 0009`,
);
