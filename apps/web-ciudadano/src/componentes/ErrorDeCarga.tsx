'use client';

import { RotateCcw } from 'lucide-react';
import { mensajeDeError } from '@/lib/errores';
import { Aviso } from './Aviso';

/**
 * Lo que se muestra cuando una consulta a la API falla.
 *
 * Existe porque callar era peor que molestar: con `api-core` parado, el mapa se quedaba sin
 * puntos y la pantalla decía «Todavía nadie reportó en esta zona». Es decir, un fallo de red se
 * leía como un dato sobre el barrio, y justo el dato contrario al que el propio sistema advierte
 * en `CLAUDE.md` §9.5 («la ausencia de reportes no significa ausencia de anegamiento»).
 *
 * El botón no es decorativo: sin él la única salida era recargar la página entera, que en el
 * mapa significa perder la vista, los filtros y la selección.
 */
export function ErrorDeCarga({
  error,
  alReintentar,
  reintentando = false,
  que = 'la información',
  testId = 'error-de-carga',
  className = '',
}: {
  error: unknown;
  alReintentar?: () => void;
  reintentando?: boolean;
  /** Qué no se pudo traer, para completar «No pudimos cargar …». */
  que?: string;
  testId?: string;
  className?: string;
}) {
  return (
    <Aviso tono="err" className={className} data-testid={testId} role="alert">
      <b className="mb-1 block text-[15px]">No pudimos cargar {que}</b>
      {mensajeDeError(error)}
      {alReintentar ? (
        <button
          type="button"
          className="btn btn-fantasma btn-sm mt-2.5"
          onClick={alReintentar}
          disabled={reintentando}
        >
          <RotateCcw size={15} aria-hidden="true" />
          {reintentando ? 'Reintentando…' : 'Reintentar'}
        </button>
      ) : null}
    </Aviso>
  );
}
