'use client';

import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Ciudad } from 'contracts';
import { type ReactNode, useState } from 'react';
import { ErrorApi } from '@/lib/api';
import { ProveedorCiudad } from '@/lib/ciudad-contexto';

export function Proveedores({ ciudad, children }: { ciudad: Ciudad; children: ReactNode }) {
  const [cliente] = useState(() => {
    const qc: QueryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
      queryCache: new QueryCache({
        // Si cualquier consulta responde 401 la sesión venció: se revalida "yo" y
        // el componente Protegido manda al login.
        onError: (error, query) => {
          if (error instanceof ErrorApi && error.estado === 401 && query.queryKey[0] !== 'yo') {
            qc.invalidateQueries({ queryKey: ['yo'] });
          }
        },
      }),
    });
    return qc;
  });
  return (
    <ProveedorCiudad ciudad={ciudad}>
      <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
    </ProveedorCiudad>
  );
}
