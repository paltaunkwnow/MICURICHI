'use client';

import { LayoutDashboard, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { destinoDelPanelDeSesion, textoDelPanel } from '@/lib/panel';
import { useSesion } from '@/lib/sesion';

/**
 * Barra superior de escritorio (`.topnav` del prototipo): marca a la izquierda, navegación
 * principal y acciones a la derecha. En móvil no se dibuja: ahí navega la barra inferior, que
 * queda al alcance del pulgar.
 *
 * La entrada de cuenta va a la derecha, junto a «Reportar un punto», porque es ahí donde hace
 * falta: reportar es lo único que pide sesión. El mapa y el resto de la navegación siguen
 * abiertos, y por eso esta barra nunca bloquea nada ni redirige a nadie.
 */
const ENLACES = [
  { href: '/', texto: 'Mapa' },
  { href: '/mis-reportes', texto: 'Mis reportes' },
  { href: '/como-funciona', texto: 'Cómo funciona' },
];

export function BarraSuperior() {
  const ruta = usePathname();
  const { usuario, cargando, errorDeCarga } = useSesion();
  const panel = destinoDelPanelDeSesion(usuario);
  const activo = (href: string) =>
    href === '/' ? ruta === '/' : ruta === href || ruta.startsWith(`${href}/`);
  return (
    <header className="topnav">
      <Link href="/inicio" className="mrc" aria-label="Mi Curichi, inicio">
        {/* biome-ignore lint/performance/noImgElement: logo estático de 200 px, sin necesidad de optimización */}
        <img src="/logo.webp" alt="" width={34} height={34} />
        Mi Curichi
      </Link>
      <nav aria-label="Principal">
        {ENLACES.map((e) => (
          <Link
            key={e.href}
            href={e.href}
            className="enlace-nav"
            aria-current={activo(e.href) ? 'page' : undefined}
          >
            {e.texto}
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        {/* Solo técnico, admin y ejecutivo. Es `<a>` y no `Link`: el panel es otra aplicación, en
            otro origen. Por debajo de 1280 px queda solo el ícono: con el texto, a 1024 px la barra
            partía en dos líneas todos sus enlaces. El texto sigue ahí para el lector de pantalla. */}
        {panel && (
          <a
            href={panel}
            className="btn btn-tinta btn-sm no-underline"
            title={textoDelPanel(usuario?.rol)}
          >
            <LayoutDashboard size={17} aria-hidden="true" className="xl:mr-2" />
            <span className="max-xl:sr-only">{textoDelPanel(usuario?.rol)}</span>
          </a>
        )}
        {/* Mientras no se sabe si hay sesión no se enseña ninguna de las dos opciones: un
            «Iniciar sesión» que parpadea y se convierte en el nombre de la persona al medio
            segundo es peor que un hueco que se rellena. Tampoco si /auth/yo falló: no saber
            no es «no hay sesión». */}
        {!cargando &&
          !errorDeCarga &&
          (usuario ? (
            <Link
              href="/cuenta"
              className="enlace-nav"
              aria-current={activo('/cuenta') ? 'page' : undefined}
            >
              <UserRound size={18} aria-hidden="true" className="mr-2" />
              {usuario.nombre}
            </Link>
          ) : (
            <Link
              href="/ingresar"
              className="enlace-nav"
              aria-current={activo('/ingresar') ? 'page' : undefined}
            >
              Iniciar sesión
            </Link>
          ))}
        <Link href="/reportar" className="btn btn-sm no-underline">
          Reportar un punto
        </Link>
      </div>
    </header>
  );
}
