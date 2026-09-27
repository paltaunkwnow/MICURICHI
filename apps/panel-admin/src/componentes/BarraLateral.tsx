'use client';

import {
  ChartColumn,
  Map as IconoMapa,
  Landmark,
  Layers,
  ListChecks,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCiudad } from '@/lib/ciudad-contexto';
import { etiquetaRol } from '@/lib/formato';
import { hayPlanoDeReferencia } from '@/lib/plano';
import { enlacesPara } from '@/lib/roles';
import { useCerrarSesion, useUsuarioActual } from '@/lib/sesion';

const ICONOS: Record<string, LucideIcon> = {
  '/ejecutivo': Landmark,
  '/reportes': ListChecks,
  '/indicadores': ChartColumn,
  '/capas': Layers,
  '/plano': IconoMapa,
};

export function BarraLateral() {
  const usuario = useUsuarioActual();
  const ruta = usePathname();
  const salir = useCerrarSesion();
  const enlaces = enlacesPara(usuario.rol, {
    planoDeReferencia: hayPlanoDeReferencia(useCiudad()),
  });

  return (
    <aside className="side lg:sticky lg:top-0 lg:h-dvh lg:w-72">
      <div className="flex items-center gap-3">
        {/* biome-ignore lint/performance/noImgElement: logo estático de 200 px, sin optimización de Next */}
        <img src="/logo.webp" alt="" width={44} height={44} className="rounded-xl object-cover" />
        <div>
          <p className="titular text-lg leading-tight">Mi Curichi</p>
          <p className="text-sm text-white/75">
            {usuario.rol === 'ejecutivo' ? 'Panel ejecutivo' : 'Panel técnico'}
          </p>
        </div>
      </div>

      <nav className="nav-lateral flex flex-col gap-1" aria-label="Secciones del panel">
        {enlaces.map(({ href, texto }) => {
          const Icono = ICONOS[href] ?? ListChecks;
          const activo = ruta === href || ruta.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className="enlace-lateral"
              aria-current={activo ? 'page' : undefined}
            >
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
