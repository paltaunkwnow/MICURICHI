'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import type { Ciudad } from 'contracts';
import { type ReactNode, useEffect, useState } from 'react';
import { ProveedorToast } from '@/componentes/Toast';
import { ProveedorCiudad } from '@/lib/ciudad-contexto';
import { crearClienteDeConsultas } from '@/lib/consultas';

export function Proveedores({ ciudad, children }: { ciudad: Ciudad; children: ReactNode }) {
  // Sin tráfico automático: ver `src/lib/consultas.ts`.
  const [cliente] = useState(crearClienteDeConsultas);
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return (
    <ProveedorCiudad ciudad={ciudad}>
      <QueryClientProvider client={cliente}>
        <ProveedorToast>{children}</ProveedorToast>
      </QueryClientProvider>
    </ProveedorCiudad>
  );
}
