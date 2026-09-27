/**
 * Cupo diario por cuenta (contracts 0.10.0, migración 0014): `REPORTES_POR_DIA_POR_CUENTA`
 * reportes y `FOTOS_POR_DIA_POR_CUENTA` fotos por día calendario en `ZONA_HORARIA`, contados en
 * `cuota_reporte_diaria` (una fila por cuenta y por día). Reemplaza a la espera de 60 min entre
 * reportes (`usuario.ultimo_reporte_en`), que ya no se lee ni se escribe.
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
 * leen lo mismo y entran los dos. Con el upsert condicional la fila `(usuario_id, dia)` hace de
 * cerrojo: la segunda transacción espera a la primera y vuelve a evaluar el WHERE con el valor ya
 * incrementado (EvalPlanQual). Sin fila devuelta, el cupo del día está agotado. El `n` devuelto
 * es el número de reporte del día y decide la demora de publicación (1.º: 60 s; siguientes: 240 s).
 *
 * EL DÍA ES EL DE LA CIUDAD
 *
 * `dia` se calcula aquí, con la zona de la instalación, y no con `current_date`: con la sesión de
 * PostgreSQL en UTC, en La Paz el día cambiaría a las 20:00. Todas las funciones aceptan `ahora`
 * para que las pruebas fijen el instante (23:59 y 00:01 locales caen en días distintos).
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
  | { permitido: true; n: number; dia: string }
  | { permitido: false; espera: EsperaCupo };

export interface CupoDelDia {
  dia: string;
  reportesN: number;
  fotosN: number;
  espera: EsperaCupo;
}

const ahoraSql = (o: OpcionesDia) =>
  o.ahora === undefined ? null : o.ahora instanceof Date ? o.ahora.toISOString() : o.ahora;

/**
 * El día local y su medianoche siguiente. `$1` es el instante (o null = now()) y `$2` la zona.
 * `medianoche_local` y `desfase_s` sirven para escribir la hora con el desfase de la ciudad.
 */
const SQL_DIA = `
  SELECT d.dia::text AS dia,
         to_char(d.medianoche AT TIME ZONE $2::text, 'YYYY-MM-DD"T"HH24:MI:SS') AS medianoche_local,
         extract(epoch FROM (d.medianoche AT TIME ZONE $2::text) - (d.medianoche AT TIME ZONE 'UTC'))::int AS desfase_s,
         GREATEST(1, ceil(extract(epoch FROM d.medianoche - d.t)))::int AS segundos
    FROM (SELECT a.t, (a.t AT TIME ZONE $2::text)::date AS dia,
                 (((a.t AT TIME ZONE $2::text)::date + 1)::timestamp AT TIME ZONE $2::text) AS medianoche
            FROM (SELECT COALESCE($1::timestamptz, now()) AS t) a) d`;

interface FilaDia extends Record<string, unknown> {
  dia: string;
  medianoche_local: string;
  desfase_s: number;
  segundos: number;
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

/** Lo gastado hoy por la cuenta y cuándo vuelve el cupo. Solo lee. */
export async function cupoDelDia(
  cliente: ClienteSql,
  usuarioId: string,
  o: OpcionesDia,
): Promise<CupoDelDia> {
  const r = await cliente.query<FilaDia & { reportes_n: number; fotos_n: number }>(
    `SELECT x.*, COALESCE(c.reportes_n, 0)::int AS reportes_n, COALESCE(c.fotos_n, 0)::int AS fotos_n
       FROM (${SQL_DIA}) x
       LEFT JOIN cuota_reporte_diaria c ON c.usuario_id = $3 AND c.dia = x.dia::date`,
    [ahoraSql(o), o.zona, usuarioId],
  );
  const f = r.rows[0]!;
  return { dia: f.dia, reportesN: f.reportes_n, fotosN: f.fotos_n, espera: esperaDe(f) };
}

async function reservar(
  cliente: ClienteSql,
  columna: 'reportes_n' | 'fotos_n',
  usuarioId: string,
  o: OpcionesCupo,
): Promise<ResultadoReserva> {
  const r = await cliente.query<{ n: number; dia: string }>(
    `INSERT INTO cuota_reporte_diaria (usuario_id, dia, ${columna})
     VALUES ($1::uuid, (COALESCE($3::timestamptz, now()) AT TIME ZONE $4::text)::date, 1)
     ON CONFLICT (usuario_id, dia) DO UPDATE
       SET ${columna} = cuota_reporte_diaria.${columna} + 1, actualizado_en = now()
       WHERE cuota_reporte_diaria.${columna} < $2
     RETURNING ${columna}::int AS n, dia::text AS dia`,
    [usuarioId, o.maximo, ahoraSql(o), o.zona],
  );
  const fila = r.rows[0];
  if (fila) return { permitido: true, n: fila.n, dia: fila.dia };
  const d = await cliente.query<FilaDia>(SQL_DIA, [ahoraSql(o), o.zona]);
  return { permitido: false, espera: esperaDe(d.rows[0]!) };
}

/**
 * Reserva un turno de reporte. Va DENTRO de la transacción que inserta el reporte y DESPUÉS de la
 * idempotencia: un reenvío del mismo envío no gasta turno, y si el reporte no llega a guardarse
 * (fotos inválidas, error posterior) el ROLLBACK devuelve el turno.
 */
export function reservarTurnoDeReporte(
  cliente: ClienteSql,
  usuarioId: string,
  o: OpcionesCupo,
): Promise<ResultadoReserva> {
  return reservar(cliente, 'reportes_n', usuarioId, o);
}

/**
 * Reserva un turno de foto ANTES de leer y procesar la imagen, en su propia sentencia (no se
 * retiene ninguna transacción mientras trabaja sharp). Si el procesamiento falla, se devuelve con
 * `devolverTurnoDeFoto`. La limpieza de fotos huérfanas no lo toca: borrar lo propio no devuelve
 * turnos.
 */
export function reservarTurnoDeFoto(
  cliente: ClienteSql,
  usuarioId: string,
  o: OpcionesCupo,
): Promise<ResultadoReserva> {
  return reservar(cliente, 'fotos_n', usuarioId, o);
}

/** Devuelve el turno de foto reservado en `dia` (el de la reserva, aunque ya sea otro día). */
export async function devolverTurnoDeFoto(
  cliente: ClienteSql,
  usuarioId: string,
  dia: string,
): Promise<void> {
  await cliente.query(
    `UPDATE cuota_reporte_diaria SET fotos_n = fotos_n - 1, actualizado_en = now()
      WHERE usuario_id = $1 AND dia = $2::date AND fotos_n > 0`,
    [usuarioId, dia],
  );
}
