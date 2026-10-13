import type { DefinicionCategoriaCualquiera } from 'contracts';
import type { ComponentType } from 'react';
import type { ReporteFeature } from '@/lib/api';

/** Lo que reciben los presentadores de una categoría (ADR 0021: componentes especiales registrados). */
export interface PropsPresentador {
  reporte: ReporteFeature;
  /** La definición de la categoría del reporte; `undefined` si el registro no la conoce. */
  definicion?: DefinicionCategoriaCualquiera | undefined;
}

/**
 * Cómo se muestra lo propio de cada categoría en el detalle y en la tarjeta. El detalle y la tarjeta
 * comunes no preguntan por una categoría concreta: buscan el presentador de la categoría del reporte.
 */
export interface PresentadorCategoria {
  /** Las filas `<div><dt/><dd/></div>` de la categoría dentro del `<dl className="kv">` del detalle. */
  CamposDetalle: ComponentType<PropsPresentador>;
  /** La pastilla (`.mini`) de la tarjeta de la lista con el dato que más dice de la categoría. */
  PastillaTarjeta: ComponentType<PropsPresentador>;
}
