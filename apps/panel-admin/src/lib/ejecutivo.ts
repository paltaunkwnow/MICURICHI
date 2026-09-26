import type {
  ConteoPorEstadoResumen,
  ConteoPorSeveridad,
  ResumenDistrito,
  ResumenEjecutivo,
  Severidad,
  VentanaResumen,
} from 'contracts';

/**
 * Lógica pura del panel ejecutivo: agrupación de pestañas, escala de colores del mapa y datos de
 * las gráficas. Sin React ni red, para probarla sin navegador.
 */

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
 * Rampas de cinco pasos, de claro a oscuro. Salen de la paleta de CLAUDE.md §14.4: severidad
 * (la de «Crítica» va del naranja de «alta» al rojo de «crítica», porque suma las dos), y agua
 * para «Todas», que no es una severidad.
 */
export const RAMPAS: Record<PestanaEjecutiva, readonly string[]> = {
  critica: ['#FDE8DC', '#F6B48C', '#E4601B', '#B3200A', '#6E1405'],
  media: ['#FBF1DC', '#F0CF85', '#C98A0E', '#8A5A00', '#553700'],
  baja: ['#E6F2EA', '#A8D5B5', '#28934D', '#1B6B38', '#0F3D1F'],
  todas: ['#E3EEF5', '#8FBCD6', '#0D6189', '#0A4A69', '#06324A'],
};

/** Distrito sin reportes: gris neutro, distinto del paso más claro (que ya tiene tinte). */
export const COLOR_SIN_REPORTES = '#F4F6F5';

/** Color de las barras de «Inundaciones por distrito» (paso 500 de la rampa). */
export function colorPrincipal(p: PestanaEjecutiva): string {
  return RAMPAS[p][2] as string;
}

export interface PasoEscala {
  desde: number;
  hasta: number;
  color: string;
}

/**
 * Hasta cinco rangos enteros contiguos entre 1 y `maximo`. El cero va aparte («sin reportes»)
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

export interface RellenoDistritos {
  colores: Record<string, string>;
  descripciones: Record<string, string>;
  escala: PasoEscala[];
}

/** Colores y textos del mapa, por `codigo` de distrito, para la pestaña activa. */
export function rellenoDistritos(
  resumen: ResumenEjecutivo,
  pestana: PestanaEjecutiva,
): RellenoDistritos {
  const conteos = resumen.por_distrito.map((d) => ({
    d,
    n: conteoPestana(d.por_severidad, pestana),
  }));
  const maximo = conteos.reduce((m, x) => Math.max(m, x.n), 0);
  const escala = construirEscala(maximo, RAMPAS[pestana]);
  const colores: Record<string, string> = {};
  const descripciones: Record<string, string> = {};
  for (const { d, n } of conteos) {
    colores[d.codigo] = colorParaConteo(n, escala);
    descripciones[d.codigo] = `${d.nombre} · ${n} ${n === 1 ? 'reporte' : 'reportes'}`;
  }
  return { colores, descripciones, escala };
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
  return ordenarDistritos(resumen.por_distrito).map((d) => ({
    codigo: d.codigo,
    etiqueta: codigoCorto(d.codigo),
    nombre: d.nombre,
    valor: conteoPestana(d.por_severidad, pestana),
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
  return ordenarDistritos(resumen.por_distrito).map((d) => {
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

/** «hace 40 s», «hace 3 min»: el tiempo desde la última respuesta buena de la API. */
export function textoActualizado(msDesde: number): string {
  const s = Math.max(0, Math.floor(msDesde / 1000));
  if (s < 10) return 'actualizado hace unos segundos';
  if (s < 60) return `actualizado hace ${Math.floor(s / 10) * 10} s`;
  return `actualizado hace ${Math.floor(s / 60)} min`;
}
