/**
 * Cupo por cuenta sobre `cupo_contador` (contador genérico, migración 0020, ADR 0017). Desde M3 el
 * cupo es POR REGLA, no por una tabla de columnas fijas:
 *
 *  - reportes: clave `reportes:<slug>`, ventana del día local de la ciudad, límite de la `ReglaCupo`
 *    de la categoría (o el override de instalación `REPORTES_POR_DIA_POR_CUENTA`). Cada categoría
 *    cuenta en su propia fila, así que el 4.º de inundación se rechaza sin tocar el cupo de otra;
 *  - fotos: clave `fotos:cuenta`, GLOBAL (suma todas las categorías, ADR 0017), límite
 *    `FOTOS_POR_DIA_POR_CUENTA`.
 *
 * Reemplaza a `cuota_reporte_diaria` (0014), que queda SIN USO hasta M10 (no se borra). El
 * mantenimiento ya borra las ventanas de días anteriores (packages/db/mantenimiento.ts).
 *
 * POR QUÉ NO BASTA EL LÍMITE POR IP
 *
 * El límite por IP frena a una conexión, no a una persona: con datos móviles la IP cambia sola
 * (modo avión y de vuelta), y un barrio detrás de un mismo NAT comparte el cubo. Los dos límites
 * conviven porque miden cosas distintas: la cuenta acota a la persona, la IP a la máquina.
 *
 * POR QUÉ UN INSERT … ON CONFLICT DO UPDATE … WHERE
 *
 * Leer el contador, comparar e incrementar abre una ventana de carrera: dos envíos simultáneos
 * leen lo mismo y entran los dos. Con el upsert condicional la fila `(usuario_id, clave,
 * ventana_inicio)` hace de cerrojo: la segunda transacción espera a la primera y vuelve a evaluar
 * el WHERE con el valor ya incrementado (EvalPlanQual). Sin fila devuelta, el cupo está agotado.
 * El `n` devuelto es el número de reporte del día de esa categoría y decide la demora de
 * publicación (1.º: 60 s; siguientes: 240 s).
 *
 * EL DÍA ES EL DE LA CIUDAD
 *
 * La ventana de `dia_local` se calcula aquí con la zona de la instalación, no con `current_date`:
 * con la sesión de PostgreSQL en UTC, en La Paz el día cambiaría a las 20:00. Todas las funciones
 * aceptan `ahora` para que las pruebas fijen el instante (23:59 y 00:01 locales caen en días
 * distintos). `ventana_inicio` es la medianoche local de hoy como `timestamptz`, el mismo valor con
 * el que el mantenimiento decide qué ventanas ya pasaron.
 */

interface ClienteSql {
  query<T extends Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
}

export interface OpcionesDia {
  /** Zona IANA de la ciudad (`cfg.zonaHoraria`). */
  zona: string;
  /** Instante a usar en lugar de `now()`. Solo para pruebas. */
  ahora?: Date | string;
}

export interface OpcionesCupo extends OpcionesDia {
  /** Tope del día para lo que se reserva. */
  maximo: number;
}

/** Cuándo vuelve a haber cupo: la próxima medianoche de la ciudad. */
export interface EsperaCupo {
  /** Segundos hasta la medianoche, para `Retry-After`. Al menos 1. */
  reintentarEnS: number;
  /** La medianoche en ISO 8601 con el desfase de la ciudad (p. ej. `…T00:00:00-04:00`). */
  disponibleEn: string;
}

export type ResultadoReserva =
  | { permitido: true; n: number; ventanaInicio: string }
  | { permitido: false; espera: EsperaCupo };

/** Clave de `cupo_contador` para el cupo de reportes de una categoría (por cuenta y categoría). */
export const claveReportes = (slug: string): string => `reportes:${slug}`;

/** Clave de `cupo_contador` para el cupo de fotos: GLOBAL, una por cuenta (ADR 0017). */
export const CLAVE_FOTOS = 'fotos:cuenta';

const ahoraSql = (o: OpcionesDia) =>
  o.ahora === undefined ? null : o.ahora instanceof Date ? o.ahora.toISOString() : o.ahora;

/**
 * Medianoche local de HOY como `timestamptz` (la ventana de `dia_local`). `$ts` es el instante (o
 * null = now()) y `$zona` la zona. Es el mismo valor con el que el mantenimiento compara.
 */
const VENTANA_DIA_LOCAL = (ts: string, zona: string) =>
  `(((COALESCE(${ts}::timestamptz, now()) AT TIME ZONE ${zona}::text)::date)::timestamp AT TIME ZONE ${zona}::text)`;

/**
 * El día local, su medianoche siguiente y la medianoche de hoy (ventana). `$1` es el instante (o
 * null = now()) y `$2` la zona. `medianoche_local` y `desfase_s` sirven para escribir la hora con
 * el desfase de la ciudad.
 */
const SQL_DIA = `
  SELECT d.dia::text AS dia,
         to_char(d.medianoche AT TIME ZONE $2::text, 'YYYY-MM-DD"T"HH24:MI:SS') AS medianoche_local,
         extract(epoch FROM (d.medianoche AT TIME ZONE $2::text) - (d.medianoche AT TIME ZONE 'UTC'))::int AS desfase_s,
         GREATEST(1, ceil(extract(epoch FROM d.medianoche - d.t)))::int AS segundos,
         d.ventana_inicio::text AS ventana_inicio
    FROM (SELECT a.t, (a.t AT TIME ZONE $2::text)::date AS dia,
                 ((a.t AT TIME ZONE $2::text)::date::timestamp AT TIME ZONE $2::text) AS ventana_inicio,
                 (((a.t AT TIME ZONE $2::text)::date + 1)::timestamp AT TIME ZONE $2::text) AS medianoche
            FROM (SELECT COALESCE($1::timestamptz, now()) AS t) a) d`;

interface FilaDia extends Record<string, unknown> {
  dia: string;
  medianoche_local: string;
  desfase_s: number;
  segundos: number;
  ventana_inicio: string;
}

/** `-04:00` a partir de -14400 s. */
function desfaseIso(segundos: number): string {
  const signo = segundos < 0 ? '-' : '+';
  const abs = Math.abs(segundos);
  const hh = String(Math.floor(abs / 3600)).padStart(2, '0');
  const mm = String(Math.floor((abs % 3600) / 60)).padStart(2, '0');
  return `${signo}${hh}:${mm}`;
}

function esperaDe(f: FilaDia): EsperaCupo {
  return {
    reintentarEnS: f.segundos,
    disponibleEn: `${f.medianoche_local}${desfaseIso(f.desfase_s)}`,
  };
}

/** Día local, medianoche siguiente y minutos transcurridos desde la medianoche de hoy. */
export async function momentoDelDia(
  cliente: ClienteSql,
  o: OpcionesDia,
): Promise<{ dia: string; espera: EsperaCupo; minutosDesdeMedianoche: number }> {
  const r = await cliente.query<FilaDia & { minutos: number }>(
    `SELECT x.*, extract(epoch FROM COALESCE($1::timestamptz, now())
                   - ((x.dia::date)::timestamp AT TIME ZONE $2::text)) / 60 AS minutos
       FROM (${SQL_DIA}) x`,
    [ahoraSql(o), o.zona],
  );
  const f = r.rows[0]!;
  return { dia: f.dia, espera: esperaDe(f), minutosDesdeMedianoche: Number(f.minutos) };
}

/** Estado de un conjunto de cupos de la cuenta en la ventana de HOY. Solo lee (para `/auth/yo`). */
export interface EstadoCupos {
  dia: string;
  ventanaInicio: string;
  espera: EsperaCupo;
  /** `clave` → `n` gastado hoy; una clave sin fila no aparece (cuenta como 0). */
  conteos: Record<string, number>;
}

/**
 * Lo gastado hoy por la cuenta en cada una de `claves` y cuándo vuelve el cupo. Una sola consulta:
 * el día (y la ventana) de `SQL_DIA` más un LEFT JOIN de `cupo_contador` por esas claves.
 */
export async function leerCupos(
  cliente: ClienteSql,
  usuarioId: string,
  claves: readonly string[],
  o: OpcionesDia,
): Promise<EstadoCupos> {
  const r = await cliente.query<FilaDia & { clave: string | null; n: number | null }>(
    // `x.ventana_inicio` sale como texto de SQL_DIA (lo devolvemos así en `EstadoCupos`); se castea
    // a timestamptz para compararlo con la columna, que lo es.
    `SELECT x.*, c.clave, c.n::int AS n
       FROM (${SQL_DIA}) x
       LEFT JOIN cupo_contador c
         ON c.usuario_id = $3 AND c.ventana_inicio = x.ventana_inicio::timestamptz AND c.clave = ANY($4::text[])`,
    [ahoraSql(o), o.zona, usuarioId, [...claves]],
  );
  const f = r.rows[0]!;
  const conteos: Record<string, number> = {};
  for (const fila of r.rows) if (fila.clave !== null) conteos[fila.clave] = Number(fila.n ?? 0);
  return {
    dia: f.dia,
    ventanaInicio: f.ventana_inicio,
    espera: esperaDe(f),
    conteos,
  };
}

/** Upsert atómico genérico sobre `cupo_contador` para una `clave` y la ventana del día local. */
async function reservar(
  cliente: ClienteSql,
  usuarioId: string,
  clave: string,
  o: OpcionesCupo,
): Promise<ResultadoReserva> {
  const r = await cliente.query<{ n: number; ventana_inicio: string }>(
    `INSERT INTO cupo_contador (usuario_id, clave, ventana_inicio, n)
     VALUES ($1::uuid, $2, ${VENTANA_DIA_LOCAL('$3', '$5')}, 1)
     ON CONFLICT (usuario_id, clave, ventana_inicio) DO UPDATE
       SET n = cupo_contador.n + 1, actualizado_en = now()
       WHERE cupo_contador.n < $4
     RETURNING n::int AS n, ventana_inicio::text AS ventana_inicio`,
    [usuarioId, clave, ahoraSql(o), o.maximo, o.zona],
  );
  const fila = r.rows[0];
  if (fila) return { permitido: true, n: fila.n, ventanaInicio: fila.ventana_inicio };
  const d = await cliente.query<FilaDia>(SQL_DIA, [ahoraSql(o), o.zona]);
  return { permitido: false, espera: esperaDe(d.rows[0]!) };
}

/**
 * Reserva un turno de reporte de la categoría `slug`. Va DENTRO de la transacción que inserta el
 * reporte y DESPUÉS de la idempotencia: un reenvío del mismo envío no gasta turno, y si el reporte
 * no llega a guardarse (fotos inválidas, error posterior) el ROLLBACK devuelve el turno.
 */
export function reservarTurnoDeReporte(
  cliente: ClienteSql,
  usuarioId: string,
  slug: string,
  o: OpcionesCupo,
): Promise<ResultadoReserva> {
  return reservar(cliente, usuarioId, claveReportes(slug), o);
}

/**
 * Reserva un turno de foto (clave global `fotos:cuenta`) ANTES de leer y procesar la imagen, en su
 * propia sentencia (no se retiene ninguna transacción mientras trabaja sharp). Si el procesamiento
 * falla, se devuelve con `devolverTurnoDeFoto`. La limpieza de fotos huérfanas no lo toca: borrar
 * lo propio no devuelve turnos.
 */
export function reservarTurnoDeFoto(
  cliente: ClienteSql,
  usuarioId: string,
  o: OpcionesCupo,
): Promise<ResultadoReserva> {
  return reservar(cliente, usuarioId, CLAVE_FOTOS, o);
}

/** Devuelve el turno de foto reservado en `ventanaInicio` (la de la reserva, aunque ya sea otro día). */
export async function devolverTurnoDeFoto(
  cliente: ClienteSql,
  usuarioId: string,
  ventanaInicio: string,
): Promise<void> {
  await cliente.query(
    `UPDATE cupo_contador SET n = n - 1, actualizado_en = now()
      WHERE usuario_id = $1 AND clave = $2 AND ventana_inicio = $3::timestamptz AND n > 0`,
    [usuarioId, CLAVE_FOTOS, ventanaInicio],
  );
}
