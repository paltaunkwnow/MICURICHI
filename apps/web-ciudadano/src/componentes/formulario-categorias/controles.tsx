/**
 * Controles de formulario que comparten el armazón del reporte y los adaptadores de categoría
 * (ADR 0021). Son el MISMO marcado que el formulario tenía inline: al extraerlos, el DOM no cambia.
 */

/** Opción en tarjeta con radio real escondido: el aspecto es del prototipo, el control es nativo. */
export function Opcion({
  nombre,
  valor,
  texto,
  detalle,
  marcado,
  onCambio,
}: {
  nombre: string;
  valor: string;
  texto: string;
  detalle?: string;
  marcado: boolean;
  onCambio: () => void;
}) {
  return (
    <label className="opc">
      <input
        type="radio"
        className="control-invisible"
        name={nombre}
        value={valor}
        checked={marcado}
        onChange={onCambio}
      />
      <span className="r" aria-hidden="true" />
      <span className={marcado ? 'font-semibold' : ''}>{texto}</span>
      {detalle ? <span className="cm">{detalle}</span> : null}
    </label>
  );
}

/** Igual que `Opcion`, pero en pastilla: para respuestas cortas, como el tipo de lugar. */
export function Pastilla({
  nombre,
  valor,
  texto,
  marcado,
  onCambio,
}: {
  nombre: string;
  valor: string;
  texto: string;
  marcado: boolean;
  onCambio: () => void;
}) {
  return (
    <label className="chip">
      <input
        type="radio"
        className="control-invisible"
        name={nombre}
        value={valor}
        checked={marcado}
        onChange={onCambio}
      />
      {texto}
    </label>
  );
}

/**
 * Mensaje de error de un campo, en su lugar de la pantalla. `role="alert"` para que se anuncie al
 * aparecer, y `data-campo-con-error` para que, tras un rechazo, la vista pueda ir hasta él.
 */
export function MensajeDeCampo({ campo, mensaje }: { campo: string; mensaje?: string | null }) {
  if (!mensaje) return null;
  return (
    <p
      id={`error-${campo}`}
      className="error"
      role="alert"
      data-testid={`error-campo-${campo}`}
      data-campo-con-error=""
    >
      {mensaje}
    </p>
  );
}
