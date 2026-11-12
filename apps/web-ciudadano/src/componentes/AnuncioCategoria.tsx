'use client';

import { useEffect, useState } from 'react';

/** Monta la región vacía antes de anunciar, incluso si el formulario apareció tras el login. */
export function AnuncioCategoria({ mensaje }: { mensaje: string | null }) {
  const [anuncio, setAnuncio] = useState<string | null>(null);
  useEffect(() => {
    setAnuncio(mensaje);
  }, [mensaje]);
  return (
    <p
      className="sr-only"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="anuncio-categoria"
    >
      {anuncio}
    </p>
  );
}
