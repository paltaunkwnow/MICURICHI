import type { ReporteCrearEntrada } from 'contracts';
import { fechaEventoVigente, PASOS_REPORTE, type Ubicacion } from './formulario-reporte';

export { PASOS_REPORTE };

/**
 * Borrador del formulario de reporte, para que recargar la página no cueste empezar de cero.
 *
 * El caso que lo justifica no es el descuido: es el teléfono. Con la cámara abierta, o al salir un
 * momento a otra aplicación, un móvil con poca memoria puede descartar la pestaña; al volver, la
 * página se recarga. Sin esto, el vecino que ya había contestado varias pantallas se encontraba
 * con el paso 1 en blanco. El mismo caso se da al tocar «atrás» sin querer, o al girar el teléfono
 * en algunos navegadores.
 *
 * Va en `sessionStorage` y no en `localStorage` a propósito: el borrador pertenece a ESTA sesión
 * de la pestaña. Sobrevive a la recarga, que es lo que hace falta, y desaparece al cerrar, que es
 * lo que corresponde a un formulario que nadie llegó a enviar. En un teléfono prestado o
 * compartido, un borrador que quedara meses guardado sería un dato de más sobre quién estuvo ahí.
 *
 * No guarda las fotos, solo sus `objeto_key`: los bytes ya están en el servidor y el vale dura
 * 24 h (`HORAS_VALIDEZ_FOTO` en api-core). Por eso cada foto recuerda cuándo se subió y el
 * borrador caduca antes que ellas.
 */

const CLAVE = 'curichi.borrador-reporte.v1';

/**
 * Caducidad del borrador, contada desde que se empezó y NO desde el último guardado. Antes se
 * contaba desde `guardado_en`, que se renueva en cada cambio y también al restaurar: el plazo se
 * deslizaba sin fin y volvían fotos con el vale vencido, que el servidor rechaza con 400.
 */
export const VALIDEZ_MS = 12 * 60 * 60 * 1000;

/** Una foto restaurada con más de esto se descarta: el vale del servidor dura 24 h. */
export const VALIDEZ_FOTO_MS = 23 * 60 * 60 * 1000;

/**
 * Formato del borrador. Hasta la corrida 2026-09-25-quitar-campos-del-reporte el asistente tenía
 * cinco pasos (profundidad y duración en el 2, frecuencia y afectación en el 3); ahora profundidad y
 * frecuencia van juntos en el 2 y todo lo que seguía se corre uno. Un borrador sin `formato` es
 * del asistente viejo: sin traducir su paso, quien iba por las fotos caería en la revisión.
 */
const FORMATO = 2;
const PASO_VIEJO_A_NUEVO: Record<number, number> = { 1: 1, 2: 2, 3: 2, 4: 3, 5: 4 };

/**
 * Respuestas que el formulario ya no pregunta. Un borrador viejo las trae; si se restauraran,
 * viajarían en el envío y el formulario cargaría con valores que no se ven en ninguna pantalla.
 */
const CAMPOS_QUITADOS = ['duracion_estimada', 'afectacion'] as const;

/**
 * Traducción de respuestas guardadas con nombres o valores de contracts < 0.5.0. Se traducen en
 * vez de descartarse: el vecino ya las contestó, y perderlas por un renombre sería castigarlo por
 * algo que no hizo.
 * - `tirante_estimado` pasó a llamarse `profundidad_estimada` (mismos valores).
 * - El sumidero perdió «No sé»: «no contestó» es `null`. Su estado quedó en tapado / no tapado.
 *   Si no se tradujeran, el envío fallaría la validación por un valor que ninguna pantalla
 *   muestra ni deja corregir.
 * - contracts 0.6.0: sin «Sí» en el sumidero cercano no hay estado, y con «No» el agua no puede
 *   brotar de él. El estado solo se pregunta con «Sí», así que una respuesta suya guardada con
 *   otra cosa no se ve en ninguna pantalla y haría rechazar el envío entero.
 * - «El agua brota» en `false`: hasta esta versión el formulario lo escribía al montar la casilla,
 *   sin que nadie contestara. La casilla solo sabe decir «sí»; lo demás es «sin contestar».
 */
const SUMIDERO_ESTADO_VIEJO_A_NUEVO: Record<string, 'tapado' | 'no_tapado'> = {
  tapado: 'tapado',
  no_tapado: 'no_tapado',
  libre: 'no_tapado',
  obstruido: 'tapado',
  danado: 'tapado',
};

export function traducirValoresViejos(entrada: Record<string, unknown>): Record<string, unknown> {
  const valores: Record<string, unknown> = { ...entrada };
  for (const c of CAMPOS_QUITADOS) delete valores[c];
  if ('tirante_estimado' in valores) {
    if (valores.profundidad_estimada === undefined) {
      valores.profundidad_estimada = valores.tirante_estimado;
    }
    delete valores.tirante_estimado;
  }
  if ('sumidero_cercano' in valores) {
    const v = valores.sumidero_cercano;
    valores.sumidero_cercano = v === 'si' || v === 'no' ? v : null;
  }
  if ('sumidero_estado' in valores) {
    const v = valores.sumidero_estado;
    valores.sumidero_estado =
      valores.sumidero_cercano === 'si'
        ? (typeof v === 'string' && SUMIDERO_ESTADO_VIEJO_A_NUEVO[v]) || null
        : null;
  }
  if (
    'agua_brota_sumidero' in valores &&
    (valores.agua_brota_sumidero === false || valores.sumidero_cercano === 'no')
  ) {
    valores.agua_brota_sumidero = null;
  }
  return valores;
}

/** Foto ya subida. `subida_en` (ms desde época) decide si su vale sigue vivo al restaurar. */
export interface FotoDelBorrador {
  objeto_key: string;
  url: string;
  subida_en: number;
}

export interface Borrador {
  /** Momento del último guardado, en milisegundos desde época. */
  guardado_en: number;
  /** Momento en que se empezó ESTE formulario (misma clave). De acá se cuenta la caducidad. */
  creado_en: number;
  paso: number;
  ubicacion: Ubicacion | null;
  /** Lo que respondió `POST /geo/v1/resolver` para esa ubicación, para no repetir la llamada. */
  resuelto: unknown;
  fotos: FotoDelBorrador[];
  valores: Partial<ReporteCrearEntrada>;
  /**
   * La clave de idempotencia se guarda con el resto: si la página se recarga justo después de
   * enviar, el reintento tiene que llevar la MISMA clave o el servidor crearía un segundo reporte.
   */
  clave: string;
}

/** Lo que guarda el formulario; las dos marcas de tiempo las pone `guardarBorrador`. */
export type BorradorNuevo = Omit<Borrador, 'guardado_en' | 'creado_en'>;

function almacen(): Storage | null {
  try {
    // Safari en navegación privada y los navegadores con almacenamiento bloqueado lanzan aquí.
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/** `creado_en` del borrador guardado si es del mismo formulario (misma clave); si no, `null`. */
function creadoEnGuardado(s: Storage, clave: string): number | null {
  try {
    const d = JSON.parse(s.getItem(CLAVE) ?? 'null') as Partial<Borrador> | null;
    return d?.clave === clave && typeof d.creado_en === 'number' ? d.creado_en : null;
  } catch {
    return null;
  }
}

export function guardarBorrador(b: BorradorNuevo): void {
  const s = almacen();
  if (!s) return;
  try {
    const ahora = Date.now();
    s.setItem(
      CLAVE,
      JSON.stringify({
        ...b,
        guardado_en: ahora,
        // Se conserva mientras sea el mismo formulario: guardar (o restaurar) no renueva el plazo.
        creado_en: creadoEnGuardado(s, b.clave) ?? ahora,
        formato: FORMATO,
      }),
    );
  } catch {
    // Cuota llena: el formulario sigue funcionando en memoria, que es lo que importa.
  }
}

/** Fotos cuyo vale sigue vivo. Sin `subida_en` (borrador anterior) no se sabe: se descartan. */
function fotosVigentes(fotos: unknown, ahora: number): FotoDelBorrador[] {
  if (!Array.isArray(fotos)) return [];
  return fotos.filter(
    (f): f is FotoDelBorrador =>
      typeof f?.objeto_key === 'string' &&
      typeof f.subida_en === 'number' &&
      ahora - f.subida_en <= VALIDEZ_FOTO_MS,
  );
}

/** Devuelve el borrador si existe, es legible y no caducó. Cualquier otra cosa es `null`. */
export function leerBorrador(): Borrador | null {
  const s = almacen();
  if (!s) return null;
  try {
    const crudo = s.getItem(CLAVE);
    if (!crudo) return null;
    const b: unknown = JSON.parse(crudo);
    if (typeof b !== 'object' || b === null) return null;
    const d = b as Partial<Borrador>;
    if (typeof d.guardado_en !== 'number' || typeof d.clave !== 'string') return null;
    // Un borrador anterior a `creado_en` no sabe cuándo empezó: lo mejor que hay es su guardado.
    const creadoEn = typeof d.creado_en === 'number' ? d.creado_en : d.guardado_en;
    const ahora = Date.now();
    if (ahora - creadoEn > VALIDEZ_MS) {
      olvidarBorrador();
      return null;
    }
    const valores = traducirValoresViejos(
      typeof d.valores === 'object' && d.valores !== null ? { ...d.valores } : {},
    );
    if (typeof valores.evento_en === 'string')
      valores.evento_en = fechaEventoVigente(valores.evento_en, new Date(ahora));
    return {
      guardado_en: d.guardado_en,
      creado_en: creadoEn,
      paso: pasoRestaurado(d.paso, (b as { formato?: unknown }).formato === FORMATO),
      ubicacion: d.ubicacion ?? null,
      resuelto: d.resuelto ?? null,
      fotos: fotosVigentes(d.fotos, ahora),
      valores: valores as Borrador['valores'],
      clave: d.clave,
    };
  } catch {
    // Basura de una versión anterior o JSON roto: se descarta en silencio.
    return null;
  }
}

/** Paso válido del asistente actual; cualquier valor que no se entienda vuelve al primero. */
function pasoRestaurado(paso: unknown, formatoActual: boolean): number {
  if (typeof paso !== 'number' || !Number.isInteger(paso)) return 1;
  if (!formatoActual) return PASO_VIEJO_A_NUEVO[paso] ?? 1;
  return paso >= 1 && paso <= PASOS_REPORTE ? paso : 1;
}

export function olvidarBorrador(): void {
  const s = almacen();
  if (!s) return;
  try {
    s.removeItem(CLAVE);
  } catch {
    /* nada que hacer */
  }
}

/**
 * Valores que no cuentan como respuesta de la persona: los que ya traen un valor inicial y los
 * cuatro que el formulario copia de la ubicación (`fijarUbicacion`). Esos cuatro se juzgan por
 * `b.ubicacion`, que sabe si el punto lo eligió la persona o lo trajo el enlace; mirados como
 * valores sueltos, el punto del enlace contaba como algo empezado.
 */
const VALORES_QUE_NO_CUENTAN = new Set([
  'ubicacion_tipo',
  'causa_presunta',
  'fotos',
  'sitio_web',
  'lat',
  'lon',
  'ubicacion_metodo',
  'precision_gps_m',
]);

/**
 * ¿Hay algo que valga la pena restaurar, o el borrador está prácticamente vacío? Solo cuenta lo
 * que hizo la persona: el punto que trajo el enlace «Me pasa a mí» no, y los valores iniciales
 * (todos `null` o vacíos) tampoco.
 */
export function borradorTieneContenido(b: Borrador): boolean {
  return (
    b.paso > 1 ||
    b.fotos.length > 0 ||
    (!!b.ubicacion && !b.ubicacion.precargada) ||
    Object.entries(b.valores).some(
      ([clave, v]) =>
        !VALORES_QUE_NO_CUENTAN.has(clave) && v !== undefined && v !== null && v !== '',
    )
  );
}
