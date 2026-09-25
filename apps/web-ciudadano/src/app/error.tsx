'use client';

import { RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

/**
 * Última red de seguridad de la app pública.
 *
 * Sin este archivo, cualquier excepción que escape de un componente de cliente deja al vecino
 * con la pantalla de Next: en producción, un «Application error: a client-side exception has
 * occurred» en inglés, sin salida y sin decir qué hacer.
 *
 * El mensaje del error NO se muestra: puede contener rutas internas o restos de una consulta, y
 * a quien está delante no le sirve de nada. Va a la consola, que es donde lo busca quien depura.
 */
export default function ErrorGlobal({
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
    <div className="mx-auto w-full max-w-2xl px-5 py-12" role="alert">
      <h1 className="titular text-[26px]">Algo se rompió de nuestro lado</h1>
      <p className="mt-3 text-[16px] leading-[1.55] text-tinta-600">
        No es culpa tuya ni se perdió nada de lo que ya habías enviado. Podés volver a cargar esta
        pantalla o ir al mapa.
      </p>
      {error.digest ? (
        <p className="ayuda mt-3">
          Si querés avisarnos, este es el código del fallo: <b>{error.digest}</b>
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap gap-2.5">
        <button type="button" className="btn" onClick={reset}>
          <RotateCcw size={17} aria-hidden="true" />
          Volver a intentar
        </button>
        <Link href="/" className="btn btn-fantasma no-underline">
          Ir al mapa
        </Link>
      </div>
    </div>
  );
}
