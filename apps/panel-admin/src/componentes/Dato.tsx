import type { ReactNode } from 'react';

/** Un par etiqueta y valor dentro de una `<dl className="lista-datos">`; «—» si no hay valor. */
export function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <>
      <dt>{etiqueta}</dt>
      <dd>{children ?? '—'}</dd>
    </>
  );
}
