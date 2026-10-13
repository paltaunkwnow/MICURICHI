import { filasDeDetalle } from './filas';
import type { PresentadorCategoria, PropsPresentador } from './tipos';

/**
 * Presentador de una categoría que no registró uno propio (ADR 0021): las filas salen de los
 * `camposPublicos` de su definición, con la etiqueta de la pregunta y la de la opción elegida.
 */
function CamposDetalleGenerico({ reporte, definicion }: PropsPresentador) {
  return (
    <>
      {filasDeDetalle(definicion, reporte.properties.detalle).map((f) => (
        <div key={f.clave}>
          <dt>{f.etiqueta}</dt>
          <dd>{f.valor}</dd>
        </div>
      ))}
    </>
  );
}

/** La tarjeta muestra, a lo sumo, el primer dato público de la categoría. */
function PastillaTarjetaGenerica({ reporte, definicion }: PropsPresentador) {
  const primera = filasDeDetalle(definicion, reporte.properties.detalle)[0];
  return primera ? <span className="mini">{primera.valor}</span> : null;
}

export const PRESENTADOR_GENERICO: PresentadorCategoria = {
  CamposDetalle: CamposDetalleGenerico,
  PastillaTarjeta: PastillaTarjetaGenerica,
};
