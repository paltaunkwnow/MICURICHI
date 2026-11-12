'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import type { Ciudad, SlugCategoria } from 'contracts';
import { type ReactNode, useEffect, useState } from 'react';
import { ProveedorToast } from '@/componentes/Toast';
import { ProveedorCategorias } from '@/lib/categorias-contexto';
import { ProveedorCiudad } from '@/lib/ciudad-contexto';
import { crearClienteDeConsultas } from '@/lib/consultas';

export function Proveedores({
  ciudad,
  categoriasActivas,
  children,
}: {
  ciudad: Ciudad;
  categoriasActivas: readonly SlugCategoria[];
  children: ReactNode;
}) {
  // Sin tráfico automático: ver `src/lib/consultas.ts`.
  const [cliente] = useState(crearClienteDeConsultas);
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return (
    <ProveedorCiudad ciudad={ciudad}>
      <ProveedorCategorias activas={categoriasActivas}>
        <QueryClientProvider client={cliente}>
          <ProveedorToast>{children}</ProveedorToast>
        </QueryClientProvider>
      </ProveedorCategorias>
    </ProveedorCiudad>
  );
}
