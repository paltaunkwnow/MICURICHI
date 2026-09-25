'use client';

import { RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

/**
 * Red de seguridad del panel. Al técnico sí se le muestra el `digest`: es quien puede pasárselo
 * a quien opera el servicio. El mensaje del error no, porque puede arrastrar rutas internas o un
 * fragmento de consulta; eso va a la consola del navegador y al log del servidor.
 */
export default function ErrorPanel({
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
    <div className="p-8" role="alert">
      <h1 className="text-2xl">La pantalla falló</h1>
      <p className="mt-2 text-tinta-600">
        No se aplicó ningún cambio a los reportes. Volvé a cargar la pantalla; si se repite, pasale
        este código a quien opera el servicio.
      </p>
      {error.digest ? <p className="ayuda mt-2">Código del fallo: {error.digest}</p> : null}
      <div className="mt-6 flex flex-wrap gap-2.5">
        <button type="button" className="btn btn-primario" onClick={reset}>
          <RotateCcw size={18} aria-hidden="true" />
          Volver a intentar
        </button>
        <Link href="/reportes" className="btn no-underline">
          Ir a la bandeja
        </Link>
      </div>
    </div>
  );
}
