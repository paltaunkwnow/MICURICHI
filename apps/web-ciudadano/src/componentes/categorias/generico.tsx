import { filasDeDetalle } from './filas';
import type { PresentadorCategoria, PropsPresentador } from './tipos';

function etiquetaSubtipo({ reporte, definicion }: PropsPresentador): string | undefined {
  return definicion?.subtipos?.find((opcion) => opcion.valor === reporte.properties.subtipo)
    ?.etiqueta;
}

/**
 * Presentador de una categoría que no registró uno propio (ADR 0021): las filas salen de los
 * `camposPublicos` de su definición, con la etiqueta de la pregunta y la de la opción elegida.
 */
function CamposDetalleGenerico({ reporte, definicion }: PropsPresentador) {
  const subtipo = etiquetaSubtipo({ reporte, definicion });
  return (
    <>
      {subtipo ? (
        <div>
          <dt>Tipo de problema</dt>
          <dd>{subtipo}</dd>
        </div>
      ) : null}
      {filasDeDetalle(definicion, reporte.properties.detalle).map((f) => (
        <div key={f.clave}>
          <dt>{f.etiqueta}</dt>
          <dd>{f.valor}</dd>
        </div>
      ))}
    </>
  );
}

/** La tarjeta muestra el tipo reconocido o, sin él, el primer dato público de la categoría. */
function PastillaTarjetaGenerica({ reporte, definicion }: PropsPresentador) {
  const texto =
    etiquetaSubtipo({ reporte, definicion }) ??
    filasDeDetalle(definicion, reporte.properties.detalle)[0]?.valor;
  return texto ? <span className="mini">{texto}</span> : null;
}

export const PRESENTADOR_GENERICO: PresentadorCategoria = {
  CamposDetalle: CamposDetalleGenerico,
  PastillaTarjeta: PastillaTarjetaGenerica,
};
