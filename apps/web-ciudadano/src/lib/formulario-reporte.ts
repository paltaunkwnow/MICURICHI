import { CONFIG_DOMINIO, type ReporteCrearEntrada } from 'contracts';
import { leerCoordenadas } from './geo';

/**
 * Reglas del asistente de reporte que no necesitan React: qué habilita cada paso, cómo se
 * interpreta el GPS, qué se envía. Están aparte para poder probarlas; el componente solo las
 * aplica.
 */

/** Pasos del asistente de reporte: ubicación, agua, fotos y descripción, revisión. */
export const PASOS_REPORTE = 4;

/** Dónde quedó el punto del reporte y cómo se eligió. */
export interface Ubicacion {
  lat: number;
  lon: number;
  metodo: 'gps' | 'manual';
  precisionM: number | null;
  /**
   * La puso el enlace «Me pasa a mí» (el detalle de otro punto), no la persona. Sirve de punto de
   * partida, pero no cuenta como algo empezado: abrir el enlace y salir no deja borrador.
   */
  precargada?: boolean;
}

/** Las tres respuestas del sumidero, con `null` como «sin contestar». */
export interface Sumidero {
  sumidero_cercano: NonNullable<ReporteCrearEntrada['sumidero_cercano']> | null;
  sumidero_estado: NonNullable<ReporteCrearEntrada['sumidero_estado']> | null;
  agua_brota_sumidero: boolean | null;
}

/**
 * Valores de partida del formulario (y de «Empezar de nuevo»). Las tres respuestas del sumidero
 * empiezan en `null`, «sin contestar». Antes «el agua brota» no tenía valor inicial y
 * react-hook-form le escribía `false` al montar la casilla: todos los reportes decían que el agua
 * no brotaba aunque nadie lo hubiera dicho.
 */
export function valoresIniciales(): Partial<ReporteCrearEntrada> {
  return {
    ubicacion_tipo: 'via_publica',
    causa_presunta: 'desconocida',
    descripcion: '',
    fotos: [],
    sitio_web: '',
    sumidero_cercano: null,
    sumidero_estado: null,
    agua_brota_sumidero: null,
  };
}

// ------------------------------------------------------------------ paso 1: el punto

/** Coordenadas del enlace «Me pasa a mí» (`?lat=&lon=`), o `null` si no hay o no sirven. */
export function ubicacionDelEnlace(
  lat: string | null | undefined,
  lon: string | null | undefined,
): { lat: number; lon: number } | null {
  if (!lat?.trim() || !lon?.trim()) return null;
  const c = leerCoordenadas(lat, lon);
  return c && (c.lat !== 0 || c.lon !== 0) ? c : null;
}

/**
 * Dónde abre el mapa del paso 1. El mapa se vuelve a crear cada vez que se entra al paso (al
 * volver desde el 2, al retomar un borrador), y abría siempre en el centro por defecto: con el
 * marcador clavado en el centro de la pantalla, eso era ENSEÑAR otro punto que el elegido.
 *
 * Sin punto ni enlace, el centro de la ciudad configurada (`centroDeCiudad(useCiudad())`).
 */
export function centroDelPaso1(
  ubicacion: Ubicacion | null,
  enlace: { lat: number; lon: number } | null,
  centroCiudad: [number, number],
): [number, number] {
  if (ubicacion) return [ubicacion.lon, ubicacion.lat];
  if (enlace) return [enlace.lon, enlace.lat];
  return centroCiudad;
}

/**
 * Por encima de esto la «ubicación» no viene de un GPS sino de la red o de la IP, que la dan con
 * kilómetros de error. Es también el máximo que admite `precision_gps_m` en el contrato.
 */
export const PRECISION_GPS_MAX_M = 10_000;

/**
 * Lo que devolvió `navigator.geolocation`, como ubicación del reporte. Una posición de más de
 * 10 km de precisión no se presenta como GPS: se toma como punto de partida manual, sin
 * precisión, y la pantalla le pide a la persona que ajuste el mapa.
 */
export function ubicacionDesdeGps(coords: {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
}): { ubicacion: Ubicacion; aproximada: boolean } {
  const { latitude: lat, longitude: lon, accuracy } = coords;
  const precision =
    typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null;
  if (precision !== null && precision > PRECISION_GPS_MAX_M)
    return { ubicacion: { lat, lon, metodo: 'manual', precisionM: null }, aproximada: true };
  return { ubicacion: { lat, lon, metodo: 'gps', precisionM: precision }, aproximada: false };
}

// ------------------------------------------------------------------ paso 2: la fecha

/**
 * El contrato rechaza un `evento_en` de hace más de `EVENTO_MAX_DIAS_ATRAS` días, medidos contra
 * el reloj del momento de validar. El calendario ofrece un día menos: el mediodía del día más
 * viejo que se puede elegir sigue dentro hasta el mediodía del día siguiente, así que enviar al
 * final del mismo día no choca con el borde. Con el día completo, elegirlo por la tarde ya lo
 * dejaba afuera.
 */
const DIAS_ATRAS_MAX = CONFIG_DOMINIO.EVENTO_MAX_DIAS_ATRAS - 1;

/** Lo que el contrato tolera hacia el futuro: la deriva del reloj del teléfono, no otro día. */
const TOLERANCIA_FUTURO_MS = CONFIG_DOMINIO.EVENTO_TOLERANCIA_FUTURO_MIN * 60_000;

/** `AAAA-MM-DD` de un instante, en la hora local de quien reporta (no en UTC). */
function fechaLocal(d: Date): string {
  const a = String(d.getFullYear()).padStart(4, '0');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${a}-${m}-${dia}`;
}

/**
 * `min` y `max` del calendario. Antes el tope salía de `toISOString()`, que es la fecha en UTC: en
 * Santa Cruz, de 20:00 a medianoche, dejaba elegir mañana.
 */
export function limitesFechaEvento(ahora: Date): { min: string; max: string } {
  const min = new Date(ahora.getTime());
  min.setDate(min.getDate() - DIAS_ATRAS_MAX);
  return { min: fechaLocal(min), max: fechaLocal(ahora) };
}

/**
 * El día que eligió la persona (`AAAA-MM-DD` del campo), como instante para `evento_en`: si es hoy,
 * la hora actual; si es otro día, su mediodía local. Antes era el mediodía UTC (`T12:00:00Z`), que
 * en Santa Cruz son las 08:00: elegir «hoy» antes de esa hora mandaba una fecha futura, y
 * contracts 0.6.0 la rechaza (tolera `EVENTO_TOLERANCIA_FUTURO_MIN`, la deriva del reloj, no
 * cuatro horas). Devuelve `null` si el valor no es un día completo y válido.
 */
export function isoDesdeCampoFecha(valor: string, ahora: Date): string | null {
  const partes = /^(\d{4,6})-(\d{2})-(\d{2})$/.exec(valor);
  if (!partes) return null;
  if (valor === fechaLocal(ahora)) return ahora.toISOString();
  const mediodia = new Date(ahora.getTime());
  mediodia.setFullYear(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
  mediodia.setHours(12, 0, 0, 0);
  // `setFullYear` acepta el 31 de febrero y lo convierte en marzo: eso no es lo que se eligió.
  if (Number.isNaN(mediodia.getTime()) || fechaLocal(mediodia) !== valor) return null;
  return mediodia.toISOString();
}

/** Valor del campo de fecha (`AAAA-MM-DD` local) para un `evento_en` guardado. */
export function campoFechaDesdeIso(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : fechaLocal(d);
}

/** Lo que tiene de malo la fecha del evento, en castellano, o `null` si se puede enviar. */
export function problemaFechaEvento(iso: string | null | undefined, ahora: Date): string | null {
  if (!iso) return null;
  const fecha = campoFechaDesdeIso(iso);
  if (!fecha) return 'No entendimos esa fecha. Elegila de nuevo o dejá el campo vacío.';
  const { min, max } = limitesFechaEvento(ahora);
  if (fecha > max || Date.parse(iso) > ahora.getTime() + TOLERANCIA_FUTURO_MS)
    return 'La fecha no puede ser posterior a hoy.';
  if (fecha < min) return 'Elegí una fecha dentro del último año.';
  return null;
}

/**
 * Un `evento_en` restaurado, recalculado con la regla de hoy. Un borrador anterior guardaba el
 * mediodía UTC, y restaurado de madrugada ese instante todavía es futuro.
 */
export function fechaEventoVigente(iso: string, ahora: Date): string | null {
  const campo = campoFechaDesdeIso(iso);
  return campo ? isoDesdeCampoFecha(campo, ahora) : null;
}

// ------------------------------------------------------------------ paso 3: sumidero y fotos

/**
 * Respuestas del sumidero al contestar «¿Hay sumidero cercano?». Sin sumidero no hay estado que
 * declarar ni agua que brote de él (contracts 0.6.0 lo exige); «Dejar sin responder» también
 * borra el estado, que solo se pregunta con «Sí».
 */
export function respuestasSumidero(
  cercano: Sumidero['sumidero_cercano'],
  actuales: Pick<ReporteCrearEntrada, 'sumidero_estado' | 'agua_brota_sumidero'>,
): Sumidero {
  return {
    sumidero_cercano: cercano,
    sumidero_estado: cercano === 'si' ? (actuales.sumidero_estado ?? null) : null,
    agua_brota_sumidero: cercano === 'no' ? null : (actuales.agua_brota_sumidero ?? null),
  };
}

/**
 * Lugares de foto que quedan. Ocupan lugar las fotos subidas y la que se está subiendo; la cámara
 * abierta no, porque se saca dentro de la página y cerrarla no deja nada a medias.
 */
export function mosaicoDeFotos(e: { subidas: number; subiendo: boolean }): {
  completas: boolean;
  libres: number;
} {
  const libres = Math.max(
    0,
    CONFIG_DOMINIO.FOTOS_MAX_POR_REPORTE - e.subidas - (e.subiendo ? 1 : 0),
  );
  return { completas: libres === 0, libres };
}

// ------------------------------------------------------------------ avanzar y enviar

export interface EstadoParaAvanzar {
  ubicacion: Ubicacion | null;
  resuelto: { dentro_cobertura: boolean } | null;
  resolviendo: boolean;
  profundidad_estimada?: string | null;
  frecuencia?: string | null;
  evento_en?: string | null;
  descripcion?: string | null;
  subiendoFoto: boolean;
  enviando: boolean;
  ahora: Date;
}

/** ¿El botón del paso («Continuar», o «Enviar reporte» en el último) se puede usar? */
export function puedeAvanzar(paso: number, e: EstadoParaAvanzar): boolean {
  switch (paso) {
    case 1:
      // La unidad vecinal que se muestra tiene que ser la del punto actual, no la del anterior.
      return !!e.ubicacion && !e.resolviendo && !!e.resuelto?.dentro_cobertura;
    case 2:
      return (
        !!e.profundidad_estimada && !!e.frecuencia && !problemaFechaEvento(e.evento_en, e.ahora)
      );
    case 3:
      // Con una foto subiendo, seguir significaba enviar el reporte sin ella y dejarla huérfana.
      return (
        (e.descripcion ?? '').trim().length >= CONFIG_DOMINIO.DESCRIPCION_MIN && !e.subiendoFoto
      );
    default:
      return !e.enviando && !e.subiendoFoto;
  }
}

/**
 * Paso del asistente donde se contesta cada campo del contrato, y donde se muestra su mensaje de
 * error. Los del paso 1 no tienen control propio: su mensaje es el de «falta la ubicación».
 */
const PASO_DEL_CAMPO: Record<string, number> = {
  lat: 1,
  lon: 1,
  ubicacion_metodo: 1,
  precision_gps_m: 1,
  profundidad_estimada: 2,
  frecuencia: 2,
  evento_en: 2,
  descripcion: 3,
  fotos: 3,
  causa_presunta: 3,
  sumidero_cercano: 3,
  sumidero_estado: 3,
  agua_brota_sumidero: 3,
  ubicacion_tipo: 4,
};

const campoRaiz = (campo: string) => campo.split('.')[0] ?? '';

/**
 * El primer paso con un campo rechazado, para llevar ahí a la persona. Un error que se anuncia en
 * un paso donde no está su campo es un botón que «no hace nada» (TRASPASO §3.8). Lo que no tiene
 * un lugar en la pantalla va a la revisión, donde lo dice el aviso general (`camposSinLugar`).
 */
export function pasoDelError(campos: readonly string[]): number {
  let paso = PASOS_REPORTE;
  for (const campo of campos) {
    const p = PASO_DEL_CAMPO[campoRaiz(campo)];
    if (p !== undefined && p < paso) paso = p;
  }
  return paso;
}

/**
 * Campos rechazados que no tienen un control donde mostrar su mensaje (el antispam, un error de
 * todo el formulario, uno que el contrato agregue mañana). Su mensaje va en el aviso de la
 * revisión: callarlo es volver al botón que no hace nada.
 */
export function camposSinLugar(campos: readonly string[]): string[] {
  return campos.filter((c) => PASO_DEL_CAMPO[campoRaiz(c)] === undefined);
}

/** Texto para cualquier error de lat, lon, método o precisión: no tienen control a la vista. */
export const MENSAJE_FALTA_UBICACION =
  'Falta la ubicación del punto: movelo en el mapa, usá tu ubicación o escribí las coordenadas.';

/**
 * El cuerpo de `POST /api/v1/reportes`. La ubicación sale del estado y no de los campos ocultos
 * del formulario, y el sumidero se vuelve a poner en regla por si algo incoherente llegó hasta
 * acá (un borrador de otra versión, por ejemplo): el servidor lo rechazaría entero.
 */
export function armarEnvio(
  datos: ReporteCrearEntrada,
  ubicacion: Ubicacion,
  fotos: ReadonlyArray<{ objeto_key: string }>,
): ReporteCrearEntrada {
  return {
    ...datos,
    ...respuestasSumidero(datos.sumidero_cercano ?? null, datos),
    lat: ubicacion.lat,
    lon: ubicacion.lon,
    ubicacion_metodo: ubicacion.metodo,
    precision_gps_m: ubicacion.precisionM,
    fotos: fotos.map((f) => f.objeto_key),
  };
}
