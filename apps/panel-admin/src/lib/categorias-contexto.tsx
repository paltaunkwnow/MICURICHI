'use client';

import { REGISTRO_CATEGORIAS, type RegistroCategorias } from 'contracts';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import {
  crearLectorDeConfiguracion,
  type EstadoConfiguracion,
  REVALIDAR_MS,
} from './configuracion';
import { disponiblesPanel } from './filtros';

const ContextoCategorias = createContext<{
  estado: EstadoConfiguracion;
  registro: RegistroCategorias;
  disponibles: ReturnType<typeof disponiblesPanel>;
} | null>(null);

export function ProveedorCategoriasPanel({
  inicial,
  registro = REGISTRO_CATEGORIAS,
  children,
}: {
  inicial: EstadoConfiguracion;
  registro?: RegistroCategorias;
  children?: ReactNode;
}) {
  const [estado, setEstado] = useState(inicial);
  useEffect(() => {
    setEstado(inicial);
  }, [inicial]);
  useEffect(() => {
    let vigente = true;
    const leer = crearLectorDeConfiguracion({
      urlBase: () => '',
      inicial,
      esperarRenovacion: true,
    });
    const actualizar = async () => {
      if (document.visibilityState === 'hidden') return;
      const siguiente = await leer();
      if (vigente) setEstado(siguiente);
    };
    void actualizar();
    const intervalo = setInterval(() => void actualizar(), REVALIDAR_MS);
    const alVolver = () => {
      void actualizar();
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      vigente = false;
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [inicial]);
  const valor = useMemo(
    () => ({ estado, registro, disponibles: disponiblesPanel(estado.configuracion, registro) }),
    [estado, registro],
  );
  return <ContextoCategorias value={valor}>{children}</ContextoCategorias>;
}

export function useCategoriasPanel() {
  const valor = useContext(ContextoCategorias);
  if (!valor) throw new Error('useCategoriasPanel() sin ProveedorCategoriasPanel.');
  return valor;
}
