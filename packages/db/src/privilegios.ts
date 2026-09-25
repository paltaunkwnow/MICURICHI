/**
 * Comprobación de privilegios al arrancar (CLAUDE.md §13, mínimo privilegio).
 *
 * La migración 0008 concede a `curichi_api` y `curichi_geo` exactamente lo que cada servicio
 * necesita, pero una migración no puede impedir que alguien configure `DATABASE_URL` con el rol
 * dueño —o con un superusuario— y deje la separación en nada. Eso es justo lo que pasaba antes de
 * la auditoría: los dos servicios se conectaban como `curichi`, que era SUPERUSER.
 *
 * Por eso la comprobación se hace desde el propio servicio y en producción es un motivo para NO
 * arrancar. Un servicio que no levanta se ve enseguida; uno que levanta con permisos de más no se
 * ve hasta que alguien los aprovecha.
 *
 * Fuera de producción solo avisa: el modo local sin Docker corre sobre PGlite, que es de un solo
 * usuario y donde estas distinciones no existen.
 */
import type pg from 'pg';

export interface EstadoPrivilegios {
  usuario: string;
  superusuario: boolean;
  puedeCrearRoles: boolean;
  puedeCrearBases: boolean;
  ignoraRls: boolean;
  /** true si el rol es dueño de alguna tabla de la aplicación: entonces puede hacer DDL sobre ella. */
  dueñoDeTablas: boolean;
}

export async function leerEstadoPrivilegios(pool: pg.Pool): Promise<EstadoPrivilegios> {
  const r = await pool.query<{
    usuario: string;
    superusuario: boolean;
    crear_roles: boolean;
    crear_bases: boolean;
    ignora_rls: boolean;
    dueno_de_tablas: boolean;
  }>(
    `SELECT current_user AS usuario,
            rolsuper     AS superusuario,
            rolcreaterole AS crear_roles,
            rolcreatedb   AS crear_bases,
            rolbypassrls  AS ignora_rls,
            EXISTS (
              SELECT 1 FROM pg_tables
               WHERE schemaname IN ('public', 'geo')
                 AND tablename <> 'spatial_ref_sys'
                 AND tableowner = current_user
            ) AS dueno_de_tablas
       FROM pg_roles WHERE rolname = current_user`,
  );
  const f = r.rows[0];
  if (!f) throw new Error('no se pudo leer el rol actual de PostgreSQL');
  return {
    usuario: f.usuario,
    superusuario: f.superusuario,
    puedeCrearRoles: f.crear_roles,
    puedeCrearBases: f.crear_bases,
    ignoraRls: f.ignora_rls,
    dueñoDeTablas: f.dueno_de_tablas,
  };
}

/** Enumera lo que sobra. Vacío = el rol está dentro de lo que debería poder hacer. */
export function privilegiosDeMas(e: EstadoPrivilegios): string[] {
  const sobra: string[] = [];
  if (e.superusuario)
    sobra.push(
      'es SUPERUSER (puede leer y escribir archivos del servidor y ejecutar órdenes con COPY ... PROGRAM)',
    );
  if (e.puedeCrearRoles)
    sobra.push('tiene CREATEROLE (puede fabricarse otra cuenta con más permisos)');
  if (e.puedeCrearBases) sobra.push('tiene CREATEDB');
  if (e.ignoraRls) sobra.push('tiene BYPASSRLS');
  if (e.dueñoDeTablas)
    sobra.push(
      'es dueño de las tablas de la aplicación (puede borrarlas o alterarlas, aunque no tenga GRANT)',
    );
  return sobra;
}

export interface OpcionesVerificacion {
  /** Nombre del servicio, para el mensaje. */
  servicio: string;
  /** En producción, los privilegios de más impiden arrancar. Fuera, solo se avisa. */
  produccion: boolean;
  /** Rol esperado; si se indica y no coincide, se avisa (no bloquea: el nombre es convención). */
  rolEsperado?: string;
  registrar?: (mensaje: string) => void;
}

/**
 * Lanza en producción si el rol tiene más de lo que necesita. Devuelve el estado leído para que
 * el servicio lo pueda registrar en el arranque.
 */
export async function verificarPrivilegios(
  pool: pg.Pool,
  o: OpcionesVerificacion,
): Promise<EstadoPrivilegios> {
  const estado = await leerEstadoPrivilegios(pool);
  const sobra = privilegiosDeMas(estado);
  if (sobra.length) {
    const detalle = `${o.servicio}: el rol de PostgreSQL «${estado.usuario}» tiene privilegios de más:\n - ${sobra.join('\n - ')}\nUsá el rol de aplicación (${o.rolEsperado ?? 'curichi_api / curichi_geo'}) en DATABASE_URL; ver infra/sql/01-roles.sh y la migración 0008.`;
    if (o.produccion) throw new Error(detalle);
    o.registrar?.(detalle);
  } else if (o.rolEsperado && estado.usuario !== o.rolEsperado) {
    o.registrar?.(
      `${o.servicio}: conectado como «${estado.usuario}»; lo esperado era «${o.rolEsperado}».`,
    );
  }
  return estado;
}

/**
 * Comprueba que el rol NO puede escribir en una tabla. Se usa en las pruebas de privilegios y en
 * el arranque de geo-service, que por contrato (§4.6) es de solo lectura: si un día alguien le
 * concediera permiso de escritura, conviene enterarse por el log del servicio y no por el daño.
 */
export async function puedeEscribir(pool: pg.Pool, tabla: string): Promise<boolean> {
  const r = await pool.query<{ puede: boolean }>(
    `SELECT (has_table_privilege(current_user, $1, 'INSERT')
          OR has_table_privilege(current_user, $1, 'UPDATE')
          OR has_table_privilege(current_user, $1, 'DELETE')
          OR has_table_privilege(current_user, $1, 'TRUNCATE')) AS puede`,
    [tabla],
  );
  return r.rows[0]?.puede ?? false;
}
