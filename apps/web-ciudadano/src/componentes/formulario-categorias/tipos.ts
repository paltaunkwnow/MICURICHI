import type { DefinicionCategoriaCualquiera, Severidad } from 'contracts';
import type { ComponentType } from 'react';
import type { FieldErrors, UseFormReturn } from 'react-hook-form';
import type {
  AdaptadorEnvio,
  AdaptadorValidacion,
  ValoresFormulario,
} from '@/lib/formulario-reporte';

/**
 * Cómo trabaja el paso 2 «Qué pasa» de cada categoría y cómo se arma su revisión y su envío
 * (ADR 0021). El armazón del reporte (`FormularioReporte`) resuelve el núcleo —ubicación, fotos,
 * descripción, demora, cupo— y le pide a este adaptador lo propio de la categoría; nunca pregunta
 * por una categoría concreta (ADR 0009 §6.3). Inundaciones trae un componente especial (el paso 2
 * de hoy, extraído sin cambios); las demás usan el renderizador declarativo común, que dibuja las
 * `preguntas` de la definición.
 */

/** Una fila de la revisión (paso 4) de la categoría, con el paso al que lleva «Editar». */
export interface FilaRevisionCategoria {
  etiqueta: string;
  valor: string;
  paso: number;
}

/** Previsualización de severidad: la banda siempre; el puntaje y su máximo solo si la categoría los muestra. */
export interface SeveridadPrevia {
  banda: Severidad;
  puntaje?: number;
  max?: number;
}

/** Lo que recibe el cuerpo del paso 2 (y el bloque extra del paso 3) de una categoría. */
export interface PropsCuerpoPaso2 {
  form: UseFormReturn<ValoresFormulario>;
  valores: ValoresFormulario;
  errores: FieldErrors<ValoresFormulario>;
  definicion: DefinicionCategoriaCualquiera;
  /** Reloj del render, para los límites de la fecha del evento. */
  ahora: Date;
}

export interface AdaptadorFormularioCategoria extends AdaptadorEnvio, AdaptadorValidacion {
  slug: string;
  /** Cuerpo del paso 2 «Qué pasa» (sin el «Paso 2 de 4» ni el título, que pone el armazón). */
  CuerpoPaso2: ComponentType<PropsCuerpoPaso2>;
  /** Bloque extra del paso 3 (Inundaciones: causa presunta y sumidero). Ausente = nada. */
  ExtraPaso3?: ComponentType<PropsCuerpoPaso2>;
  /** Valores iniciales de los campos propios de la categoría (se mezclan con los del núcleo). */
  valoresIniciales(): Partial<ValoresFormulario>;
  /** ¿Se puede avanzar del paso 2? Sus respuestas obligatorias están completas. */
  puedeAvanzarPaso2(valores: ValoresFormulario, ahora: Date): boolean;
  /** El paso del asistente de cada campo propio (para llevar al error del paso correcto). */
  pasoDeCampo: Readonly<Record<string, number>>;
  /** Las filas de la revisión (paso 4) propias de la categoría. */
  filasRevision(valores: ValoresFormulario): FilaRevisionCategoria[];
  /** Previsualización de severidad del paso 2 y la revisión, o `null` si todavía no alcanza. */
  previsualizarSeveridad(valores: ValoresFormulario): SeveridadPrevia | null;
}
