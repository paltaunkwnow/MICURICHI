import { CalendarClock } from 'lucide-react';
import Link from 'next/link';
import { TEXTO_CUPO_AGOTADO, textoCupo } from '@/lib/cupo';
import { Aviso } from './Aviso';

/**
 * La cuenta ya envió los reportes de hoy. Se muestra en lugar del formulario, ANTES de pedir la
 * ubicación o la cámara: pedir permisos para un reporte que el servidor va a rechazar es hacerle
 * perder el tiempo a la persona. Lo que haya escrito sigue en el borrador del dispositivo.
 */
export function CupoAgotado() {
  return (
    <div className="flex flex-1 items-center justify-center p-5">
      <section
        className="tarjeta w-full max-w-md p-7"
        aria-labelledby="cupo-titulo"
        data-testid="cupo-agotado"
      >
        <div className="mb-4 flex items-center gap-3">
          <CalendarClock size={30} aria-hidden="true" />
          <h1 className="text-2xl" id="cupo-titulo">
            Ya reportaste hoy
          </h1>
        </div>
        <Aviso tono="alerta" className="mb-3" role="status">
          {TEXTO_CUPO_AGOTADO}
        </Aviso>
        <p className="ayuda mb-5">
          {textoCupo(0)}. El cupo vuelve entero a la medianoche. Si el agua sigue ahí, mañana podés
          sumar otro reporte.
        </p>
        <Link href="/mis-reportes" className="btn btn-bloque no-underline">
          Ver mis reportes
        </Link>
        <Link href="/" className="btn btn-fantasma btn-bloque mt-3 no-underline">
          Volver al mapa
        </Link>
      </section>
    </div>
  );
}
