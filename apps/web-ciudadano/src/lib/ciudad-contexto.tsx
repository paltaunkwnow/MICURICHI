'use client';

/**
 * La ciudad de la instalación para los componentes de cliente.
 *
 * El valor llega del layout raíz, que lo leyó en el servidor antes del primer HTML
 * (`ciudad-servidor.ts`). No hay valor por defecto a propósito: un contexto que cayera en Santa
 * Cruz cuando falta el proveedor mostraría otra ciudad sin avisar a nadie. Si falta, es un error
 * de armado de la app y se dice.
 */
import type { Ciudad } from 'contracts';
import { createContext, type ReactNode, useContext } from 'react';

const ContextoCiudad = createContext<Ciudad | null>(null);

export function ProveedorCiudad({ ciudad, children }: { ciudad: Ciudad; children: ReactNode }) {
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
