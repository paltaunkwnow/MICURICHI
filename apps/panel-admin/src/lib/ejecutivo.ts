import type {
  ConteoActivas,
  ConteoPorEstadoResumen,
  ConteoPorSeveridad,
  ResumenDistrito,
  ResumenEjecutivo,
  Severidad,
  VentanaResumen,
} from 'contracts';
import type { Formato } from './formato';

/**
 * Lógica pura del panel ejecutivo: agrupación de pestañas, escala de colores del mapa y datos de
 * las gráficas. Sin React ni red, para probarla sin navegador.
 *
 * Desde contracts 0.6.0 las cifras de severidad, el mapa y «Inundaciones activas por distrito»
 * cuentan la inundación ACTIVA (en revisión + verificadas). Los resueltos solo aparecen en «Cómo
 * va el trabajo».
 */

/**
 * Los textos con cifras reciben el formato de la ciudad del despliegue (`useFormato()`): el
 * separador de miles depende de su locale.
 */
type FormatoNumeros = Pick<Formato, 'numero'>;

export type PestanaEjecutiva = 'critica' | 'media' | 'baja' | 'todas';

export interface DefinicionPestana {
  id: PestanaEjecutiva;
  etiqueta: string;
  /** Texto para lectores de pantalla y tooltip: qué severidades suma la pestaña. */
  descripcion: string;
  severidades: readonly Severidad[];
}

/**
 * Decisión del usuario (2026-09-25): tres pestañas, y «Crítica» suma crítica + alta. Para quien
 * decide, «alta» y «crítica» piden la misma respuesta; separarlas partía la atención en dos.
 */
export const PESTANAS: readonly DefinicionPestana[] = [
  {
    id: 'critica',
    etiqueta: 'Crítica',
    descripcion: 'Severidad crítica y alta',
    severidades: ['critica', 'alta'],
  },
  { id: 'media', etiqueta: 'Media', descripcion: 'Severidad media', severidades: ['media'] },
  { id: 'baja', etiqueta: 'Baja', descripcion: 'Severidad baja', severidades: ['baja'] },
  {
    id: 'todas',
    etiqueta: 'Todas',
    descripcion: 'Todas las severidades',
    severidades: ['critica', 'alta', 'media', 'baja'],
  },
];

export function definicionPestana(p: PestanaEjecutiva): DefinicionPestana {
  const d = PESTANAS.find((x) => x.id === p);
  if (!d) throw new Error(`Pestaña desconocida: ${p}`);
  return d;
}

/** Conteo de una pestaña a partir de un desglose por severidad. */
export function conteoPestana(porSeveridad: ConteoPorSeveridad, p: PestanaEjecutiva): number {
  return definicionPestana(p).severidades.reduce((suma, s) => suma + porSeveridad[s], 0);
}

export function conteosPorPestana(
  porSeveridad: ConteoPorSeveridad,
): Record<PestanaEjecutiva, number> {
  return {
    critica: conteoPestana(porSeveridad, 'critica'),
    media: conteoPestana(porSeveridad, 'media'),
    baja: conteoPestana(porSeveridad, 'baja'),
    todas: conteoPestana(porSeveridad, 'todas'),
  };
}

export const VENTANAS: ReadonlyArray<{ id: VentanaResumen; etiqueta: string }> = [
  { id: '7d', etiqueta: 'Últimos 7 días' },
  { id: '30d', etiqueta: 'Últimos 30 días' },
  { id: 'todo', etiqueta: 'Histórico' },
];

// --- Escala de colores ------------------------------------------------------------------------

/**
 * Rampas de cinco pasos, de claro a oscuro, con los tonos de la paleta de CLAUDE.md §14.4:
 * severidad (la de «Crítica» va del naranja de «alta» al rojo de «crítica», porque suma las dos)
 * y agua para «Todas», que no es una severidad.
 *
 * Empiezan en un tono medio a propósito. Antes el primer paso era el 100 de cada rol y quedaba a
 * 1,03–1,09:1 del gris de «sin activas»: un distrito con una inundación se veía igual que uno sin
 * ninguna. Ahora el primer paso tiene al menos 3:1 con ese gris (WCAG 1.4.11), también ya pintado
 * sobre el mapa con `OPACIDAD_COROPLETA`; lo comprueba `ejecutivo.test.ts`.
 */
export const RAMPAS: Record<PestanaEjecutiva, readonly string[]> = {
  critica: ['#D9531A', '#BD3913', '#A1230C', '#801907', '#5A1004'],
  media: ['#A87408', '#8E6005', '#744D00', '#5A3B00', '#3F2800'],
  baja: ['#258C49', '#1B763C', '#156233', '#0F4D27', '#0A371B'],
  todas: ['#3C83AD', '#276F99', '#135C82', '#0B4868', '#06324A'],
};

/** Distrito sin inundaciones activas: gris neutro, a 3:1 o más del primer paso de cada rampa. */
export const COLOR_SIN_REPORTES = '#F4F6F5';

/**
 * Opacidad del relleno de la coropleta. Deja ver apenas las calles de la base; más transparente,
 * el contraste entre «sin activas» y el primer paso vuelve a caer por debajo de 3:1.
 */
export const OPACIDAD_COROPLETA = 0.9;

/** Barras de «Inundaciones activas por distrito» y forma de las pestañas: el 500 de cada rol. */
const COLOR_PRINCIPAL: Record<PestanaEjecutiva, string> = {
  critica: '#E4601B',
  media: '#C98A0E',
  baja: '#28934D',
  todas: '#0D6189',
};

export function colorPrincipal(p: PestanaEjecutiva): string {
  return COLOR_PRINCIPAL[p];
}

export interface PasoEscala {
  desde: number;
  hasta: number;
  color: string;
}

/**
 * Hasta cinco rangos enteros contiguos entre 1 y `maximo`. El cero va aparte («sin activas»)
 * para que un distrito sin datos nunca se confunda con uno de pocos. Con menos de cinco valores
 * posibles hay menos rangos, y se toman los pasos más oscuros: el máximo siempre es el más oscuro.
 */
export function construirEscala(maximo: number, rampa: readonly string[]): PasoEscala[] {
  if (maximo <= 0) return [];
  const n = Math.min(rampa.length, maximo);
  const pasos: PasoEscala[] = [];
  for (let i = 0; i < n; i++) {
    pasos.push({
      desde: Math.floor((i * maximo) / n) + 1,
      hasta: Math.floor(((i + 1) * maximo) / n),
      color: rampa[rampa.length - n + i] as string,
    });
  }
  return pasos;
}

export function colorParaConteo(conteo: number, escala: PasoEscala[]): string {
  if (conteo <= 0) return COLOR_SIN_REPORTES;
  for (const p of escala) if (conteo <= p.hasta) return p.color;
  return escala.at(-1)?.color ?? COLOR_SIN_REPORTES;
}

export function textoRango(p: PasoEscala): string {
  return p.desde === p.hasta ? String(p.desde) : `${p.desde}–${p.hasta}`;
}

// --- Distritos ----------------------------------------------------------------------------------

/** «07» a partir de `D07`, `DM-07` o `07`: la etiqueta del eje tiene que ser corta. */
export function codigoCorto(codigo: string): string {
  return codigo.replace(/^(dm|d)[\s-]*(?=\d)/i, '');
}

export function ordenarDistritos(distritos: readonly ResumenDistrito[]): ResumenDistrito[] {
  return [...distritos].sort((a, b) =>
    a.codigo.localeCompare(b.codigo, 'es', { numeric: true, sensitivity: 'base' }),
  );
}

/**
 * Solo los distritos de la capa vigente van al mapa, a la escala y a las gráficas. Uno que solo
 * existe en una capa anterior no tiene polígono en el mapa, su código acortado puede repetir el
 * de uno vigente (salía una segunda barra «01») y sus conteos subían el máximo de la escala, que
 * dejaba a todos los demás distritos en los pasos más claros.
 */
function distritosVigentes(resumen: ResumenEjecutivo): ResumenDistrito[] {
  return ordenarDistritos(resumen.por_distrito.filter((d) => d.en_capa_vigente));
}

export interface RellenoDistritos {
  colores: Record<string, string>;
  descripciones: Record<string, string>;
  escala: PasoEscala[];
}

function textoActivas(n: number, f: FormatoNumeros): string {
  return `${f.numero(n)} ${n === 1 ? 'inundación activa' : 'inundaciones activas'}`;
}

/** Colores y textos del mapa, por `codigo` de distrito vigente, para la pestaña activa. */
export function rellenoDistritos(
  resumen: ResumenEjecutivo,
  pestana: PestanaEjecutiva,
  f: FormatoNumeros,
): RellenoDistritos {
  const conteos = distritosVigentes(resumen).map((d) => ({
    d,
    n: conteoPestana(d.activas.por_severidad, pestana),
  }));
  const maximo = conteos.reduce((m, x) => Math.max(m, x.n), 0);
  const escala = construirEscala(maximo, RAMPAS[pestana]);
  const colores: Record<string, string> = {};
  const descripciones: Record<string, string> = {};
  for (const { d, n } of conteos) {
    colores[d.codigo] = colorParaConteo(n, escala);
    descripciones[d.codigo] = `${d.nombre} · ${textoActivas(n, f)}`;
  }
  return { colores, descripciones, escala };
}

export interface FilaCapaAnterior {
  distrito_id: string;
  /** Código completo: acortado podría confundirse con el de un distrito vigente. */
  codigo: string;
  nombre: string;
  /** Activas de la pestaña elegida. */
  activas: number;
  por_estado: ConteoPorEstadoResumen;
}

/** Distritos que solo existen en una capa anterior: van aparte, con su código completo. */
export function distritosCapaAnterior(
  resumen: ResumenEjecutivo,
  pestana: PestanaEjecutiva,
): FilaCapaAnterior[] {
  return ordenarDistritos(resumen.por_distrito.filter((d) => !d.en_capa_vigente)).map((d) => ({
    distrito_id: d.distrito_id,
    codigo: d.codigo,
    nombre: d.nombre,
    activas: conteoPestana(d.activas.por_severidad, pestana),
    por_estado: d.por_estado,
  }));
}

// --- Gráficas -----------------------------------------------------------------------------------

export interface BarraSimple {
  codigo: string;
  etiqueta: string;
  nombre: string;
  valor: number;
}

export function barrasInundaciones(
  resumen: ResumenEjecutivo,
  pestana: PestanaEjecutiva,
): BarraSimple[] {
  return distritosVigentes(resumen).map((d) => ({
    codigo: d.codigo,
    etiqueta: codigoCorto(d.codigo),
    nombre: d.nombre,
    valor: conteoPestana(d.activas.por_severidad, pestana),
  }));
}

export type EstadoTrabajo = keyof ConteoPorEstadoResumen;

/** Orden de apilado, de abajo arriba, y rótulo de cada segmento. */
export const SEGMENTOS_TRABAJO: ReadonlyArray<{ estado: EstadoTrabajo; etiqueta: string }> = [
  { estado: 'nuevo', etiqueta: 'En revisión' },
  { estado: 'validado', etiqueta: 'Validados' },
  { estado: 'resuelto', etiqueta: 'Resueltos' },
];

export interface SegmentoApilado {
  estado: EstadoTrabajo;
  valor: number;
  /** Base y tope acumulados del segmento, en unidades de conteo. */
  desde: number;
  hasta: number;
}

export interface BarraApilada {
  codigo: string;
  etiqueta: string;
  nombre: string;
  total: number;
  segmentos: SegmentoApilado[];
}

export function barrasTrabajo(resumen: ResumenEjecutivo): BarraApilada[] {
  return distritosVigentes(resumen).map((d) => {
    let acumulado = 0;
    const segmentos = SEGMENTOS_TRABAJO.map(({ estado }) => {
      const valor = d.por_estado[estado];
      const s = { estado, valor, desde: acumulado, hasta: acumulado + valor };
      acumulado += valor;
      return s;
    });
    return {
      codigo: d.codigo,
      etiqueta: codigoCorto(d.codigo),
      nombre: d.nombre,
      total: acumulado,
      segmentos,
    };
  });
}

/**
 * Marcas del eje Y: paso «redondo» (1, 2 o 5 por potencia de diez) con cinco divisiones como
 * mucho. Con máximo 0 el eje igual va de 0 a 1, para no dividir por cero al escalar.
 */
export function marcasEje(maximo: number): number[] {
  if (maximo <= 0) return [0, 1];
  let paso = 1;
  for (let potencia = 1; ; potencia *= 10) {
    const candidato = [1, 2, 5].map((k) => k * potencia).find((c) => Math.ceil(maximo / c) <= 5);
    if (candidato) {
      paso = candidato;
      break;
    }
  }
  const tope = Math.ceil(maximo / paso) * paso;
  const marcas: number[] = [];
  for (let v = 0; v <= tope; v += paso) marcas.push(v);
  return marcas;
}

// --- Textos ---------------------------------------------------------------------------------------

/** «hace 40 s», «hace 3 min». */
export function textoActualizado(msDesde: number): string {
  const s = Math.max(0, Math.floor(msDesde / 1000));
  if (s < 10) return 'actualizado hace unos segundos';
  if (s < 60) return `actualizado hace ${Math.floor(s / 10) * 10} s`;
  return `actualizado hace ${Math.floor(s / 60)} min`;
}

/**
 * Antigüedad de las cifras según `generado_en` del resumen. Antes se medía desde que llegaba la
 * respuesta, que dice cuándo habló el navegador con la API, no de cuándo son los datos.
 */
export function textoActualizadoDesde(generadoEn: string, ahora: number): string {
  const t = Date.parse(generadoEn);
  return Number.isNaN(t) ? '' : textoActualizado(ahora - t);
}

/** «55 verificadas · 59 en revisión», bajo el número grande. */
export function textoVerificadas(a: ConteoActivas, f: FormatoNumeros): string {
  return `${f.numero(a.verificadas)} ${a.verificadas === 1 ? 'verificada' : 'verificadas'} · ${f.numero(a.en_revision)} en revisión`;
}

/**
 * Texto de la región viva del panel. Depende solo de las cifras: una respuesta nueva con los
 * mismos números deja el mismo texto y el lector de pantalla no la repite; el reloj de
 * «actualizado hace…» ya no habla cada 10 s.
 */
export function textoAnuncio(r: ResumenEjecutivo, f: FormatoNumeros): string {
  const a = r.activas;
  return `${textoActivas(a.total, f)}: ${f.numero(a.verificadas)} ${a.verificadas === 1 ? 'verificada' : 'verificadas'} y ${f.numero(a.en_revision)} en revisión.`;
}

// --- Sondeo -------------------------------------------------------------------------------------

export interface OrigenConsultas {
  /** La persona hizo algo (abrir el panel, cambiar de período, reintentar). */
  marcarAccion(): void;
  /** Consume la marca: true si la consulta que sale ahora es un refresco automático. */
  esSondeo(): boolean;
}

/**
 * Distingue el refresco automático del resumen de lo que pide la persona. Solo lo segundo tiene
 * que renovar la inactividad de la sesión en api-core: si no, un panel abierto en una pantalla
 * de la oficina mantenía la sesión viva para siempre.
 */
export function crearOrigenConsultas(): OrigenConsultas {
  // La primera consulta la pide la persona al abrir el panel.
  let pendiente = true;
  return {
    marcarAccion() {
      pendiente = true;
    },
    esSondeo() {
      const sondeo = !pendiente;
      pendiente = false;
      return sondeo;
    },
  };
}
