import type { ReactNode } from 'react';
import { Aviso } from './Aviso';

/**
 * Pie del paso 4 («Revisá antes de enviar»), fijo debajo del área con scroll. Acá vive el botón de
 * enviar, así que acá tiene que aparecer lo que le pasó al envío: el aviso estaba al final del área
 * con scroll, que en un teléfono queda debajo del pliegue, y el botón volvía a su estado sin que se
 * viera ni se anunciara nada. `role="alert"` lo anuncia al aparecer.
 *
 * `children` son las notas que van después del botón (cuánto tarda en publicarse, qué se guarda de
 * la ubicación): las declara el formulario, que tiene los datos.
 *
 * `data-campo-con-error` se conserva: tras un rechazo, `llevarAlError` busca el primer elemento con
 * esa marca. Los errores de un campo están en el área con scroll, antes que este pie en el
 * documento, así que siguen teniendo prioridad; y como el pie siempre está a la vista, llevar la
 * vista hasta acá no mueve nada.
 */
export function PieDeRevision({
  errorEnvio,
  textoBoton,
  deshabilitado,
  children,
}: {
  errorEnvio: string | null;
  /** Lo que dice el botón según lo que esté pasando (releyendo la posición, enviando, subiendo). */
  textoBoton: string;
  deshabilitado: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="pie">
      {errorEnvio ? (
        <Aviso
          tono="err"
          className="mb-3"
          role="alert"
          data-testid="error-envio"
          data-campo-con-error=""
        >
          {errorEnvio}
        </Aviso>
      ) : null}
      <button
        type="submit"
        data-testid="boton-enviar"
        className="btn btn-bloque"
        disabled={deshabilitado}
      >
        {textoBoton}
      </button>
      {children}
    </div>
  );
}

/**
 * Una foto que no se pudo agregar. Va en el paso 3, justo debajo de «Sacar foto», y en la revisión,
 * junto a la fila «Fotos» (con título, porque ahí no se ve qué botón la provocó). `role="alert"` la
 * anuncia al aparecer, igual que el error de la cámara (`error-camara`).
 */
export function ErrorDeFoto({
  mensaje,
  titulo,
  className = '',
}: {
  mensaje: string;
  titulo?: string;
  className?: string;
}) {
  return (
    <Aviso tono="err" className={className} role="alert" data-testid="error-foto">
      {titulo ? <b className="mb-1 block text-[14.5px]">{titulo}</b> : null}
      {mensaje}
    </Aviso>
  );
}
