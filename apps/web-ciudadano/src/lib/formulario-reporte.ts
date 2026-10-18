import { zodResolver } from '@hookform/resolvers/zod';
import {
  CONFIG_DOMINIO,
  type Dispositivo,
  dentroDelRadio,
  type PuntoLatLon,
  type ReporteCrearCategoriaSchema,
  type ReporteCrearEntrada,
} from 'contracts';
import type { FieldValues, Resolver } from 'react-hook-form';
import type { z } from 'zod';
import { leerCoordenadas } from './geo';
import type { Ubicacion } from './radio';

export type { Ubicacion };

/**
 * Reglas del asistente de reporte que no necesitan React: qué habilita cada paso, cómo se
 * interpreta el GPS, qué se envía. Están aparte para poder probarlas; el componente solo las
 * aplica.
 *
 * Desde M4 el asistente trabaja POR CATEGORÍA (ADR 0009, 0021): el núcleo (ubicación, fotos,
 * descripción, revisión) vive acá y en el armazón, y lo propio de cada categoría —el paso 2 «Qué
 * pasa», sus filas de la revisión, su `detalle` y su validación— lo aporta un ADAPTADOR
 * (`componentes/formulario-categorias`). Ninguna función de acá pregunta por una categoría concreta:
 * recibe el adaptador o sus datos (ADR 0009 §6.3). Con una sola categoría activa, el adaptador de
 * Inundaciones reproduce exactamente el formulario de antes.
 */

/** Pasos del asistente de reporte: ubicación, qué pasa, fotos y descripción, revisión. */
export const PASOS_REPORTE = 4;

/**
 * Lo que contesta la persona. Es el núcleo (de `ReporteCrearEntrada`, menos `dispositivo`, que es la
 * posición del teléfono y se agrega al enviar) MÁS, para una categoría declarativa, las respuestas
 * del paso 2 bajo `detalle.<id>`. El adaptador de Inundaciones usa los campos planos del núcleo (los
 * mismos `name` de siempre); los demás usan `detalle`.
 */
export type ValoresFormulario = Omit<ReporteCrearEntrada, 'dispositivo'> & {
  /** Respuestas propias de una categoría con paso 2 declarativo (renderizador común). */
  detalle?: Record<string, unknown>;
  subtipo?: string | null;
};

/** El cuerpo de `POST /api/v1/reportes` en la forma por categoría (D2 del plan M4). */
export type CuerpoReporte = z.input<typeof ReporteCrearCategoriaSchema>;

/** Posición del teléfono con la precisión que declaró; el paso 1 se ancla a ella. */
export interface Ancla extends PuntoLatLon {
  precisionM: number;
}

/** Contexto opcional pasado por useForm con la ubicación actual elegida. */
export interface ContextoFormulario {
  ubicacion?: Ubicacion | null;
}

/**
 * Lo mínimo que `armarEnvio` necesita de una categoría para construir el cuerpo: su slug, cómo pasar
 * de los valores del formulario a su `detalle` y, si tiene, su `subtipo`. El adaptador completo
 * (`componentes/formulario-categorias`) lo satisface.
 */
export interface AdaptadorEnvio {
  slug: string;
  aDetalle(valores: ValoresFormulario): Record<string, unknown>;
  subtipo?(valores: ValoresFormulario): string | null | undefined;
}

/**
 * Lo que el resolver necesita de una categoría: el esquema Zod del formulario entero y cómo preparar
 * los valores para validarlos. Inundaciones valida con el contrato plano de siempre; una categoría
 * declarativa valida el núcleo más su `detalle` con `def.esquemaDetalle`.
 */
export interface AdaptadorValidacion {
  esquemaFormulario: z.ZodType;
  prepararParaValidar(valores: ValoresFormulario): Record<string, unknown>;
}

/**
 * Relleno para validar sin la posición del teléfono. El `dispositivo` que viaja lo pone siempre
 * `armarEnvio`; acá solo satisface el esquema cuando lo pide (Inundaciones usa el contrato plano,
 * que lo exige).
 */
const DISPOSITIVO_DE_RELLENO: Dispositivo = { lat: 0, lon: 0, precision_m: 0, antiguedad_s: 0 };

/**
 * Crea el resolver de react-hook-form para una categoría (M4). Valida el núcleo y el `detalle` con
 * el esquema que da el adaptador (`def.esquemaDetalle` para una categoría declarativa; el contrato
 * plano para Inundaciones), tomando lat/lon del contexto si los valores no los traen y descartando
 * el error del `dispositivo` de relleno. Con el adaptador de Inundaciones es el resolver de siempre.
 */
export function crearResolverFormulario(
  adaptador: AdaptadorValidacion,
): Resolver<ValoresFormulario, ContextoFormulario> {
  // El esquema es un objeto Zod, pero el tipo abierto `z.ZodType` no le dice a `zodResolver` que su
  // entrada es un `FieldValues`; se le indica con un cast (la validación real no cambia).
  const validarContrato = zodResolver(adaptador.esquemaFormulario as never);
  return async (valores, contexto, opciones) => {
    const u = contexto?.ubicacion;
    const datosCompletos = {
      ...adaptador.prepararParaValidar(valores),
      lat: typeof valores.lat === 'number' ? valores.lat : (u?.lat ?? 0),
      lon: typeof valores.lon === 'number' ? valores.lon : (u?.lon ?? 0),
      dispositivo: DISPOSITIVO_DE_RELLENO,
    };
    const r = await validarContrato(
      datosCompletos,
      contexto,
      opciones as unknown as Parameters<typeof validarContrato>[2],
    );
    const { dispositivo: _relleno, ...errores } = r.errors as Record<string, unknown>;
    if (Object.keys(errores).length > 0)
      return { values: {}, errors: errores as typeof r.errors } as Awaited<
        ReturnType<Resolver<ValoresFormulario>>
      >;
    const { dispositivo: _descartado, ...valoresValidos } = r.values as Record<string, unknown>;
    return { values: valoresValidos as FieldValues as ValoresFormulario, errors: {} };
  };
}

/**
 * Valores de partida del NÚCLEO del formulario (y de «Empezar de nuevo»). Lo propio de cada
 * categoría lo agrega el adaptador (`adaptador.valoresIniciales()`): el armazón los combina. Cada
 * llamada da un objeto nuevo, para que «Empezar de nuevo» no herede las fotos del anterior.
 */
export function valoresIniciales(
  ubicacionTipo: ValoresFormulario['ubicacion_tipo'] = 'via_publica',
): Partial<ValoresFormulario> {
  return {
    ubicacion_tipo: ubicacionTipo,
    descripcion: '',
    fotos: [],
    sitio_web: '',
  };
}

/**
 * Campos del núcleo que se conservan al CAMBIAR de categoría en el paso 1 (ADR 0021): la ubicación,
 * el tipo de lugar, la descripción y las fotos ya contestados no se pierden. Lo que se reinicia son
 * las respuestas del paso 2 (los campos propios de la categoría, incluida la fecha del evento).
 */
const CAMPOS_NUCLEO_CONSERVADOS = [
  'lat',
  'lon',
  'ubicacion_tipo',
  'descripcion',
  'fotos',
  'sitio_web',
] as const;

/**
 * Los valores del formulario tras elegir otra categoría en el paso 1 (ADR 0021). Parte de los
 * iniciales de la categoría nueva (núcleo + lo suyo) y copia encima lo que la persona ya contestó
 * del núcleo, de modo que no pierda la ubicación, el tipo de lugar, la descripción ni las fotos. Las
 * respuestas del paso 2 de la categoría anterior desaparecen (no están entre los campos copiados).
 * Pura: el componente la aplica con `form.reset`.
 */
export function valoresTrasCambiarCategoria(
  valores: ValoresFormulario,
  inicialesCategoriaNueva: Partial<ValoresFormulario>,
  conservarTipoElegido = true,
): ValoresFormulario {
  const base: Record<string, unknown> = { ...valoresIniciales(), ...inicialesCategoriaNueva };
  for (const campo of CAMPOS_NUCLEO_CONSERVADOS) {
    if (campo === 'ubicacion_tipo' && !conservarTipoElegido) continue;
    if (valores[campo] !== undefined) base[campo] = valores[campo];
  }
  return base as ValoresFormulario;
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
 * Dónde abre el mapa del paso 1: en el punto elegido y, sin punto, en la posición del teléfono.
 * El mapa se vuelve a crear cada vez que se entra al paso (al volver desde el 2, al retomar un
 * borrador): si abriera en otro lado, el marcador mostraría un lugar distinto del que se envía.
 */
export function centroDelPaso1(ubicacion: Ubicacion | null, ancla: PuntoLatLon): [number, number] {
  const c = ubicacion ?? ancla;
  return [c.lon, c.lat];
}

// ------------------------------------------------------------------ paso 2: la fecha del evento

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

// ------------------------------------------------------------------ paso 2: sumidero (Inundaciones)

/** Las tres respuestas del sumidero, con `null` como «sin contestar». */
export interface Sumidero {
  sumidero_cercano: NonNullable<ReporteCrearEntrada['sumidero_cercano']> | null;
  sumidero_estado: NonNullable<ReporteCrearEntrada['sumidero_estado']> | null;
  agua_brota_sumidero: boolean | null;
}

/**
 * Respuestas del sumidero al contestar «¿Hay sumidero cercano?». Sin sumidero no hay estado que
 * declarar ni agua que brote de él (contracts 0.6.0 lo exige); «Dejar sin responder» también
 * borra el estado, que solo se pregunta con «Sí». Es de Inundaciones (su adaptador la usa), pero
 * vive acá por ser una función pura y muy probada.
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

// ------------------------------------------------------------------ paso 3: fotos

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
  /** Posición del teléfono a la que se ancla el paso 1; `null` mientras no se compartió. */
  ancla: Ancla | null;
  /** Camino de ubicación aproximada (ADR 0007): sin exigir precisión del dispositivo ni radio. */
  aproximado?: boolean;
  ubicacion: Ubicacion | null;
  resuelto: { dentro_cobertura: boolean } | null;
  resolviendo: boolean;
  descripcion?: string | null;
  subiendoFoto: boolean;
  enviando: boolean;
}

/**
 * ¿El botón del paso («Continuar», o «Enviar reporte» en el último) se puede usar? Resuelve el
 * núcleo (pasos 1, 3 y 4); el paso 2 lo decide el adaptador de la categoría
 * (`adaptador.puedeAvanzarPaso2`), porque sus respuestas son propias de cada una.
 */
export function puedeAvanzar(paso: number, e: EstadoParaAvanzar): boolean {
  switch (paso) {
    case 1: {
      // La unidad vecinal que se muestra tiene que ser la del punto actual, no la del anterior, y
      // tiene que caer en la cobertura: eso vale para los dos caminos.
      if (!e.ancla || !e.ubicacion || e.resolviendo || !e.resuelto?.dentro_cobertura) return false;
      // Ubicación aproximada (ADR 0007): api-core no comprueba precisión ni radio, así que acá
      // tampoco. El punto lo pone la persona a mano en cualquier lugar de la cobertura.
      if (e.aproximado) return true;
      // Camino normal: sin la posición del teléfono, con una imprecisa o con el punto fuera del
      // círculo, el servidor lo rechazaría (422).
      return (
        e.ancla.precisionM <= CONFIG_DOMINIO.PRECISION_DISPOSITIVO_MAX_M &&
        dentroDelRadio(e.ubicacion, e.ancla)
      );
    }
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
 * Paso del asistente donde se contesta cada campo del NÚCLEO, y donde se muestra su mensaje de
 * error. Los del paso 1 no tienen control propio: su mensaje es el de «falta la ubicación». Los
 * campos propios de la categoría los aporta su adaptador (`adaptador.pasoDeCampo`).
 */
const PASO_DEL_CAMPO_NUCLEO: Record<string, number> = {
  lat: 1,
  lon: 1,
  dispositivo: 1,
  evento_en: 2,
  descripcion: 3,
  fotos: 3,
  ubicacion_tipo: 4,
};

const campoRaiz = (campo: string) => campo.split('.')[0] ?? '';

/**
 * El primer paso con un campo rechazado, para llevar ahí a la persona. Un error que se anuncia en
 * un paso donde no está su campo es un botón que «no hace nada» (TRASPASO §3.8). Lo que no tiene
 * un lugar en la pantalla va a la revisión, donde lo dice el aviso general (`camposSinLugar`). El
 * mapa de la categoría (`pasoDeCampo`) suma sus campos a los del núcleo.
 */
export function pasoDelError(
  campos: readonly string[],
  pasoDeCampo: Readonly<Record<string, number>> = {},
): number {
  const mapa = { ...PASO_DEL_CAMPO_NUCLEO, ...pasoDeCampo };
  let paso = PASOS_REPORTE;
  for (const campo of campos) {
    const p = mapa[campoRaiz(campo)];
    if (p !== undefined && p < paso) paso = p;
  }
  return paso;
}

/**
 * Campos rechazados que no tienen un control donde mostrar su mensaje (el antispam, un error de
 * todo el formulario, uno que el contrato agregue mañana). Su mensaje va en el aviso de la
 * revisión: callarlo es volver al botón que no hace nada.
 */
export function camposSinLugar(
  campos: readonly string[],
  pasoDeCampo: Readonly<Record<string, number>> = {},
): string[] {
  const mapa = { ...PASO_DEL_CAMPO_NUCLEO, ...pasoDeCampo };
  return campos.filter((c) => mapa[campoRaiz(c)] === undefined);
}

/** Texto para cualquier error de lat, lon o de la posición del teléfono: no tienen control a la vista. */
export const MENSAJE_FALTA_UBICACION =
  'Falta la ubicación del punto: compartí tu ubicación y ajustá el punto dentro del círculo.';

/**
 * El cuerpo de `POST /api/v1/reportes` en la forma por categoría (D2 del plan M4): núcleo más
 * `categoria` y el `detalle` que arma el adaptador desde los valores. La ubicación sale del estado
 * (no de los campos del formulario) y `dispositivo` va tal como lo congeló el primer intento, para
 * que un reintento repita la misma antigüedad.
 */
export function armarEnvio(
  datos: ValoresFormulario,
  ubicacion: Ubicacion,
  fotos: ReadonlyArray<{ objeto_key: string }>,
  dispositivo: Dispositivo,
  categoria: AdaptadorEnvio,
  aproximado = false,
): CuerpoReporte {
  const cuerpo: CuerpoReporte = {
    lat: ubicacion.lat,
    lon: ubicacion.lon,
    dispositivo,
    // ADR 0007: por el camino aproximado api-core guarda `ubicacion_metodo = aproximada` y no
    // comprueba el radio. Por el normal viaja false, que es el valor por defecto del contrato.
    ubicacion_aproximada: aproximado,
    ubicacion_tipo: datos.ubicacion_tipo,
    descripcion: datos.descripcion,
    evento_en: datos.evento_en ?? null,
    fotos: fotos.map((f) => f.objeto_key),
    sitio_web: datos.sitio_web,
    categoria: categoria.slug,
    detalle: categoria.aDetalle(datos),
  };
  const subtipo = categoria.subtipo?.(datos);
  if (subtipo !== undefined) cuerpo.subtipo = subtipo;
  return cuerpo;
}
