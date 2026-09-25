/**
 * Reglas del mapa que no dependen de MapLibre: cuántas pastillas se dibujan, cómo se escribe la
 * cantidad de una agrupación y cómo se mezcla el reporte elegido con lo que trae la vista.
 *
 * Viven acá y no en `componentes/Mapa.tsx` por dos motivos: son lógica pura y se pueden probar
 * sin navegador, y la pantalla (`VistaMapa`) necesita algunas de ellas sin arrastrar MapLibre al
 * paquete inicial —el mapa se carga diferido a propósito (CLAUDE.md §14.2)—.
 */

import type { ReporteFeature } from './api';

/**
 * Tope de pastillas HTML dibujadas a la vez. Cada pastilla es un nodo del DOM con punto de color
 * y nombre de severidad escrito; por encima de este número la vista pasa a círculos de MapLibre,
 * que se resuelven en la GPU y no cuestan nodos.
 *
 * Sesenta es lo que cabe leer de un vistazo en una pantalla. El tope se cuenta sobre los puntos
 * que MapLibre dibuja SUELTOS (los que no quedaron dentro de una agrupación), no sobre el listado
 * entero: son cosas distintas y confundirlas era lo que hacía que, con muchos reportes cerca, no
 * se dibujara ni una pastilla ni un punto.
 */
export const MAX_PASTILLAS = 60;

/**
 * Bandas de tamaño del círculo de agrupación.
 *
 * El círculo tiene que crecer con la cantidad —si todos midieran igual, el número sería el único
 * dato y la densidad no se leería de un vistazo— pero con tope: un círculo que crece sin límite
 * tapa el barrio que pretende describir. De 16 a 32 px de radio, es decir de 32 a 64 px de
 * diámetro, que además respeta el objetivo táctil de 24×24 px de WCAG 2.5.8 en su tamaño mínimo.
 */
export interface BandaCluster {
  /** Cantidad a partir de la cual manda esta banda. */
  desde: number;
  /** Radio del círculo en píxeles. */
  radio: number;
  /** Tamaño del número en píxeles. */
  texto: number;
}

export const BANDAS_CLUSTER: readonly BandaCluster[] = [
  { desde: 2, radio: 16, texto: 12 },
  { desde: 10, radio: 20, texto: 13 },
  { desde: 50, radio: 24, texto: 13 },
  { desde: 100, radio: 28, texto: 14 },
  { desde: 500, radio: 32, texto: 14 },
];

function banda(n: number): BandaCluster {
  let elegida = BANDAS_CLUSTER[0] as BandaCluster;
  for (const b of BANDAS_CLUSTER) if (n >= b.desde) elegida = b;
  return elegida;
}

/** Radio en píxeles del círculo de una agrupación de `n` reportes. */
export function radioCluster(n: number): number {
  return banda(n).radio;
}

/** Tamaño de letra del número dentro de una agrupación de `n` reportes. */
export function tamanoTextoCluster(n: number): number {
  return banda(n).texto;
}

/**
 * Cantidad escrita para que quepa dentro del círculo: exacta hasta 999 y en miles por encima.
 *
 * `1234` dentro de un círculo de 64 px no se lee, y `123456789` taparía media ciudad. Se escribe
 * en castellano («1,2 mil») y no con la K inglesa porque todo el texto visible va en español
 * (CLAUDE.md §12.1). Por debajo de mil se mantiene el número exacto: ahí la precisión sí importa
 * y el ancho no es problema.
 *
 * El mapa dibuja este mismo texto con una expresión de MapLibre —`expresionNumeroCompacto` en
 * `componentes/Mapa.tsx`—, porque `text-field` es una propiedad de layout y se evalúa dentro del
 * motor. Las dos tienen que dar lo mismo; esta es la de referencia y la que prueban los tests.
 */
export function numeroCompacto(n: number): string {
  if (!Number.isFinite(n)) return '';
  const entero = Math.max(0, Math.round(n));
  if (entero < 1000) return String(entero);
  const decimales = entero < 10_000 ? 1 : 0;
  const miles = (entero / 1000).toLocaleString('es-BO', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
  return `${miles} mil`;
}

/**
 * Añade el reporte elegido a lo que se dibuja, si la consulta de la vista ya no lo trae.
 *
 * El detalle que el vecino abrió sobrevive a cualquier movimiento del mapa (vive en su propia
 * consulta, por `id`), así que su punto tiene que sobrevivir igual: si al alejar el mapa el
 * reporte se cae del resultado —porque la vista pasó del tope de 300, o porque hay un texto
 * escrito en el buscador que no coincide— el panel seguiría abierto y el punto habría
 * desaparecido del mapa. Eso se lee como un error, no como un filtro.
 *
 * Devuelve el mismo arreglo cuando no hay nada que añadir, para no invalidar el `useMemo` de
 * quien lo llama ni obligar a MapLibre a reprocesar el origen.
 */
export function conSeleccionado(
  features: ReporteFeature[],
  elegido: ReporteFeature | null | undefined,
): ReporteFeature[] {
  if (!elegido) return features;
  const id = elegido.properties.id;
  if (features.some((f) => f.properties.id === id)) return features;
  return [...features, elegido];
}

/** Lo que el mapa está dibujando: puntos sueltos, agrupaciones y cuántos reportes reúnen. */
export interface ResumenMapa {
  sueltos: number;
  agrupaciones: number;
  agrupados: number;
}

/** En qué está la consulta que alimenta el mapa. */
export type EstadoMapa = 'ok' | 'cargando' | 'fallo';

/**
 * Lo que hay dibujado, contado en palabras.
 *
 * Es la única forma de que el contenido del mapa exista para quien no ve el lienzo: WebGL no
 * expone nada al árbol de accesibilidad, y el número dentro de una agrupación —«acá hay 27»— no
 * está escrito en ningún otro sitio de la página. El listado lateral cubre los puntos uno a uno,
 * pero solo en escritorio y solo los de la vista.
 *
 * Los tres estados están separados a propósito: un mapa vacío, un mapa que todavía está
 * preguntando y un mapa que no pudo preguntar se ven exactamente igual —no hay nada dibujado— y
 * solo el texto los distingue. Decir «ningún punto» en cualquiera de los otros dos casos es
 * afirmar algo que no se sabe (CLAUDE.md §9.5).
 */
export function textoDelResumen(r: ResumenMapa, estado: EstadoMapa = 'ok'): string {
  if (estado === 'fallo') return 'No pudimos cargar los reportes de esta vista.';
  if (estado === 'cargando') return 'Buscando los puntos de esta vista…';
  if (r.sueltos === 0 && r.agrupaciones === 0)
    return 'Ningún punto publicado en la vista actual del mapa.';
  const partes: string[] = [];
  if (r.sueltos > 0)
    partes.push(`${r.sueltos} ${r.sueltos === 1 ? 'punto suelto' : 'puntos sueltos'}`);
  if (r.agrupaciones > 0)
    partes.push(
      `${r.agrupados} ${r.agrupados === 1 ? 'punto agrupado' : 'puntos agrupados'} en ${r.agrupaciones} ${r.agrupaciones === 1 ? 'zona' : 'zonas'}; acercá el mapa para verlos uno a uno`,
    );
  return `${partes.join('. ')}.`;
}

/**
 * ¿La vista trae menos reportes de los que hay?
 *
 * La API acota cada consulta a 300 features pero devuelve el total de la vista. Sin decirlo, los
 * números de las agrupaciones sumarían 300 y el vecino leería «300 puntos» donde hay mil: el
 * mapa estaría mintiendo sobre la densidad, que es justo lo que las agrupaciones existen para
 * contar.
 */
export function vistaTruncada(total: number | undefined, mostrados: number): boolean {
  return typeof total === 'number' && total > mostrados;
}
