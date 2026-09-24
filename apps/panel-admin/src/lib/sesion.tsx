'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Usuario } from 'contracts';
import { useRouter } from 'next/navigation';
import { createContext, type ReactNode, useContext, useEffect } from 'react';
import { ErrorApi, EVENTO_SESION_CADUCADA, obtenerYo } from '@/lib/api';

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
  // El login de api-core acepta cualquier usuario activo, también uno con rol `ciudadano`.
  // La API le devolvería 403 en cada acción, pero sin esto entraba igual al panel y solo veía
  // errores. El permiso real lo sigue aplicando el servidor (`requerirRol`); esto es la puerta.
  const sinPermiso = !!data && data.rol !== 'tecnico' && data.rol !== 'admin';

  useEffect(() => {
    if (sinSesion) {
      cliente.clear();
      router.replace('/login');
    }
  }, [sinSesion, router, cliente]);

  /**
   * Sesión caducada a mitad de trabajo. Cualquier llamada a api-core que reciba 401 lo anuncia
   * (ver `EVENTO_SESION_CADUCADA`), y acá se resuelve una sola vez: se tira la caché —que puede
   * tener reportes que este usuario ya no debería ver— y se manda al login diciendo por qué.
   */
  useEffect(() => {
    const alCaducar = () => {
      cliente.clear();
      router.replace('/login?caducada=1');
    };
    window.addEventListener(EVENTO_SESION_CADUCADA, alCaducar);
    return () => window.removeEventListener(EVENTO_SESION_CADUCADA, alCaducar);
  }, [router, cliente]);

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
  if (sinPermiso) {
    return (
      <div className="p-8" role="alert">
        <p className="error">Tu cuenta no tiene acceso al panel técnico.</p>
        <p className="ayuda">Pedí a un administrador que te asigne el rol de técnico.</p>
      </div>
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
