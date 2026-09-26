'use client';

/**
 * La ciudad de la instalación para los componentes de cliente, y el formato de fechas y cifras
 * que sale de ella.
 *
 * El valor llega del layout raíz, que lo leyó en el servidor antes del primer HTML
 * (`ciudad-servidor.ts`): ni el mapa abre en otra ciudad ni las fechas cambian de zona al
 * hidratar. No hay valor por defecto a propósito: un contexto que cayera en Santa Cruz cuando
 * falta el proveedor mostraría otra ciudad sin avisar a nadie. Si falta, es un error de armado
 * del panel y se dice.
 */
import type { Ciudad } from 'contracts';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { crearFormato, type Formato } from './formato';

const ContextoCiudad = createContext<Ciudad | null>(null);

export function ProveedorCiudad({ ciudad, children }: { ciudad: Ciudad; children?: ReactNode }) {
  return <ContextoCiudad value={ciudad}>{children}</ContextoCiudad>;
}

export function useCiudad(): Ciudad {
  const ciudad = useContext(ContextoCiudad);
  if (!ciudad)
    throw new Error(
      'useCiudad() sin <ProveedorCiudad>: la ciudad la reparte el layout raíz (src/app/layout.tsx).',
    );
  return ciudad;
}

/** Fechas y cifras con el locale y la zona horaria de la ciudad de la instalación. */
export function useFormato(): Formato {
  const ciudad = useCiudad();
  return useMemo(() => crearFormato(ciudad), [ciudad]);
}
