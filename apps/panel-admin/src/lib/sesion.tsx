'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Usuario } from 'contracts';
import { useRouter } from 'next/navigation';
import { createContext, type ReactNode, useContext, useEffect } from 'react';
import { ErrorApi, obtenerYo } from '@/lib/api';

export const CLAVE_YO = ['yo'] as const;

/** Usuario con sesión activa (GET /api/v1/auth/yo). Error 401 = sin sesión. */
export function useUsuario() {
  return useQuery({
    queryKey: CLAVE_YO,
    queryFn: obtenerYo,
    retry: false,
    staleTime: 5 * 60_000,
  });
}

const ContextoUsuario = createContext<Usuario | null>(null);

/** Usuario actual dentro de <Protegido>. */
export function useUsuarioActual(): Usuario {
  const u = useContext(ContextoUsuario);
  if (!u) throw new Error('useUsuarioActual debe usarse dentro de <Protegido>.');
  return u;
}

/** Envuelve las pantallas del panel: sin sesión (401) redirige a /login. */
export function Protegido({ children }: { children: ReactNode }) {
  const router = useRouter();
  const cliente = useQueryClient();
  const { data, error, isPending } = useUsuario();
  const sinSesion = error instanceof ErrorApi && error.estado === 401;

  useEffect(() => {
    if (sinSesion) {
      cliente.clear();
      router.replace('/login');
    }
  }, [sinSesion, router, cliente]);

  if (isPending) {
    return (
      <p className="p-8 text-tinta-600" role="status">
        Verificando la sesión…
      </p>
    );
  }
  if (sinSesion) {
    return (
      <p className="p-8 text-tinta-600" role="status">
        Redirigiendo al inicio de sesión…
      </p>
    );
  }
  if (error || !data) {
    return (
      <div className="p-8" role="alert">
        <p className="error">No se pudo comprobar la sesión.</p>
        <p className="ayuda">
          {error instanceof Error ? error.message : 'Verificá que api-core esté en marcha.'}
        </p>
      </div>
    );
  }
  return <ContextoUsuario.Provider value={data}>{children}</ContextoUsuario.Provider>;
}
