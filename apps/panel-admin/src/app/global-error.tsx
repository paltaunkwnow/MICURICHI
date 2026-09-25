'use client';

import { useEffect } from 'react';
import './globals.css';

/** Para cuando lo que se rompe es el propio armazón del panel: reemplaza el documento entero. */
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
        <div className="p-8" role="alert">
          <h1 className="text-2xl">El panel no pudo cargar</h1>
          <p className="mt-2 text-tinta-600">
            Hubo un fallo al arrancar la aplicación. Volvé a intentarlo; si sigue igual, revisá que
            api-core esté en marcha.
          </p>
          {error.digest ? <p className="ayuda mt-2">Código del fallo: {error.digest}</p> : null}
          <button type="button" className="btn btn-primario mt-6" onClick={reset}>
            Volver a intentar
          </button>
        </div>
      </body>
    </html>
  );
}
