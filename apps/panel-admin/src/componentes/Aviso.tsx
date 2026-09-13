import type { ReactNode } from 'react';

export type TipoAviso = 'ok' | 'error' | 'info' | 'alerta';

/**
 * Región viva para resultados de acciones y errores. Siempre está montada (aunque vacía)
 * para que los lectores de pantalla anuncien los cambios.
 */
export function Aviso({
  tipo = 'info',
  children,
  testId,
}: {
  tipo?: TipoAviso;
  children?: ReactNode;
  testId?: string;
}) {
  const vacio = children === null || children === undefined || children === '';
  return (
    <output aria-live="polite" data-testid={testId} className="block">
      {!vacio && <div className={`aviso aviso-${tipo}`}>{children}</div>}
    </output>
  );
}
