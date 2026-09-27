import type {
  ConteoActivas,
  ConteoPorEstadoResumen,
  ConteoPorSeveridad,
  ResumenDistrito,
  ResumenEjecutivo,
  Severidad,
} from 'contracts';
import type { Formato } from './formato';

/**
 * Lógica pura del panel ejecutivo: agrupación de pestañas y datos de las gráficas. Sin React ni
 * red, para probarla sin navegador.
 *
 * Desde contracts 0.6.0 las cifras de severidad y «Inundaciones activas por distrito» cuentan la
 * inundación ACTIVA (en revisión + verificadas). Los resueltos solo aparecen en «Cómo va el
 * trabajo».
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

/**
 * Barras de «Inundaciones activas por distrito» y forma de las pestañas: el 500 de cada rol de la
 * paleta de CLAUDE.md §14.4 (severidad, y agua para «Todas», que no es una severidad).
 */
const COLOR_PRINCIPAL: Record<PestanaEjecutiva, string> = {
  critica: '#E4601B',
  media: '#C98A0E',
  baja: '#28934D',
  todas: '#0D6189',
};

export function colorPrincipal(p: PestanaEjecutiva): string {
  return COLOR_PRINCIPAL[p];
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
 * Solo los distritos de la capa vigente tienen barra propia. El código acortado de uno que solo
 * existe en una capa anterior puede repetir el de uno vigente (salía una segunda barra «01»):
 * sus activas van a «Otros» y su detalle, a la tabla de Indicadores.
 */
function distritosVigentes(resumen: ResumenEjecutivo): ResumenDistrito[] {
  return ordenarDistritos(resumen.por_distrito.filter((d) => d.en_capa_vigente));
}

function textoActivas(n: number, f: FormatoNumeros): string {
  return `${f.numero(n)} ${n === 1 ? 'inundación activa' : 'inundaciones activas'}`;
}

export interface FilaCapaAnterior {
  distrito_id: string;
  /** Código completo: acortado podría confundirse con el de un distrito vigente. */
  codigo: string;
  nombre: string;
  /** Inundaciones activas, todas las severidades. */
  activas: number;
  por_estado: ConteoPorEstadoResumen;
}

/**
 * Distritos que solo existen en una capa anterior, para la tabla de Indicadores: van aparte y con
 * su código completo. En el panel ejecutivo sus activas cuentan dentro de «Otros».
 */
export function distritosCapaAnterior(resumen: ResumenEjecutivo): FilaCapaAnterior[] {
  return ordenarDistritos(resumen.por_distrito.filter((d) => !d.en_capa_vigente)).map((d) => ({
    distrito_id: d.distrito_id,
    codigo: d.codigo,
    nombre: d.nombre,
    activas: d.activas.total,
    por_estado: d.por_estado,
  }));
}

// --- Gráficas -----------------------------------------------------------------------------------

export interface BarraSimple {
  codigo: string;
  etiqueta: string;
  nombre: string;
  valor: number;
  /** La barra «Otros»: no es un distrito. */
  otros?: true;
}

/** `codigo` de la barra «Otros»: no choca con el de ningún distrito. */
export const CODIGO_OTROS = 'otros';

/**
 * Una barra por distrito vigente y, al final, «Otros» con lo que no tiene barra propia: los
 * distritos de una capa anterior y las activas sin distrito (api-core las suma al total sin darles
 * fila). Así las barras suman siempre las activas de la pestaña y la gráfica cuadra con el número
 * grande. «Otros» solo aparece si tiene algo.
 */
export function barrasInundaciones(
  resumen: ResumenEjecutivo,
  pestana: PestanaEjecutiva,
): BarraSimple[] {
  const barras: BarraSimple[] = distritosVigentes(resumen).map((d) => ({
    codigo: d.codigo,
    etiqueta: codigoCorto(d.codigo),
    nombre: d.nombre,
    valor: conteoPestana(d.activas.por_severidad, pestana),
  }));
  const enDistritos = barras.reduce((s, b) => s + b.valor, 0);
  const otros = conteoPestana(resumen.activas.por_severidad, pestana) - enDistritos;
  if (otros > 0) {
    barras.push({
      codigo: CODIGO_OTROS,
      etiqueta: 'Otros',
      nombre: 'Distritos de una capa anterior o sin distrito',
      valor: otros,
      otros: true,
    });
  }
  return barras;
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

/** «55 verificadas · 59 en revisión», bajo el número grande. */
export function textoVerificadas(a: ConteoActivas, f: FormatoNumeros): string {
  return `${f.numero(a.verificadas)} ${a.verificadas === 1 ? 'verificada' : 'verificadas'} · ${f.numero(a.en_revision)} en revisión`;
}

/**
 * Texto de la región viva del panel. Depende solo de las cifras: el refresco de cada 10 s con los
 * mismos números deja el mismo texto y el lector de pantalla no lo repite.
 */
export function textoAnuncio(r: ResumenEjecutivo, f: FormatoNumeros): string {
  const a = r.activas;
  return `${textoActivas(a.total, f)}: ${f.numero(a.verificadas)} ${a.verificadas === 1 ? 'verificada' : 'verificadas'} y ${f.numero(a.en_revision)} en revisión.`;
}
