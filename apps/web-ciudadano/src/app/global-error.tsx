'use client';

import { useEffect } from 'react';
import './globals.css';

/**
 * Para cuando lo que falla es el propio armazón (`layout.tsx`): ahí `error.tsx` ya no se
 * renderiza, porque vive dentro del layout que se rompió. Este archivo reemplaza el documento
 * entero, así que tiene que traer su `<html>` y su `<body>`.
 *
 * Es deliberadamente austero: no usa proveedores, ni consultas, ni el mapa. Cuanto menos
 * necesite, más probable es que se pueda dibujar cuando todo lo demás falló.
 */
export default function ErrorDeArmazon({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="es">
      <body>
        <div className="mx-auto w-full max-w-2xl px-5 py-12" role="alert">
          <h1 className="titular text-[26px]">Mi Curichi no pudo cargar</h1>
          <p className="mt-3 text-[16px] leading-[1.55] text-tinta-600">
            Hubo un fallo al arrancar la aplicación. Volvé a intentarlo; si sigue igual, probá más
            tarde.
          </p>
          {error.digest ? <p className="ayuda mt-3">Código del fallo: {error.digest}</p> : null}
          <button type="button" className="btn mt-6" onClick={reset}>
            Volver a intentar
          </button>
        </div>
      </body>
    </html>
  );
}
