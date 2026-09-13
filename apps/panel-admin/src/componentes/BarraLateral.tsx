'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Layers, ListChecks, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cerrarSesion } from '@/lib/api';
import { etiquetaRol } from '@/lib/formato';
import { useUsuarioActual } from '@/lib/sesion';

const ENLACES = [
  { href: '/reportes', texto: 'Reportes', Icono: ListChecks },
  { href: '/indicadores', texto: 'Indicadores', Icono: BarChart3 },
  { href: '/capas', texto: 'Capas', Icono: Layers },
] as const;

export function BarraLateral() {
  const usuario = useUsuarioActual();
  const ruta = usePathname();
  const router = useRouter();
  const cliente = useQueryClient();
  const salir = useMutation({
    mutationFn: cerrarSesion,
    onSettled: () => {
      cliente.clear();
      router.replace('/login');
    },
  });

  return (
    <aside className="flex flex-col gap-6 bg-tinta-900 p-5 text-white lg:sticky lg:top-0 lg:h-dvh lg:w-72">
      <div className="flex items-center gap-3">
        {/* biome-ignore lint/performance/noImgElement: logo estático pequeño, sin optimización de Next */}
        <img src="/icono.svg" alt="" width={44} height={44} className="rounded-full bg-white/10" />
        <div>
          <p className="titular text-lg leading-tight">Mi Curichi</p>
          <p className="text-sm text-white/75">Panel técnico</p>
        </div>
      </div>

      <nav className="nav-lateral flex flex-col gap-1" aria-label="Secciones del panel">
        {ENLACES.map(({ href, texto, Icono }) => {
          const activo = ruta === href || ruta.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} aria-current={activo ? 'page' : undefined}>
              <Icono size={20} aria-hidden="true" />
              {texto}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3 border-t border-white/15 pt-4">
        <div>
          <p className="font-semibold">{usuario.nombre}</p>
          <p className="text-sm text-white/75">
            {etiquetaRol(usuario.rol)} · {usuario.email}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secundario"
          onClick={() => salir.mutate()}
          disabled={salir.isPending}
        >
          <LogOut size={18} aria-hidden="true" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
