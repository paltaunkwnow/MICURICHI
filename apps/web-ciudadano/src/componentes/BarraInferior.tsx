'use client';

import { CircleQuestionMark, Layers, List, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Barra inferior de móvil (`.barrainf` del prototipo). Cuatro destinos, como en el prototipo
 * original: el cuarto («Cuenta») vuelve a tener sentido desde que existen cuentas de ciudadano.
 *
 * Lleva siempre el mismo rótulo, con o sin sesión, y siempre apunta al mismo sitio. Es a
 * propósito: si cambiara entre «Cuenta» y «Entrar» según el estado, el destino se movería bajo
 * el pulgar de quien lo usa a diario y, en móvil, además parpadearía en cada carga mientras se
 * resuelve la sesión. La pantalla de destino ya dice qué toca hacer.
 */
const DESTINOS = [
  { href: '/', texto: 'Mapa', Icono: Layers },
  { href: '/mis-reportes', texto: 'Mis reportes', Icono: List },
  { href: '/como-funciona', texto: 'Cómo funciona', Icono: CircleQuestionMark },
  { href: '/cuenta', texto: 'Cuenta', Icono: UserRound },
];

export function BarraInferior() {
  const ruta = usePathname();
  const activo = (href: string) =>
    href === '/' ? ruta === '/' : ruta === href || ruta.startsWith(`${href}/`);
  return (
    <nav className="barrainf" aria-label="Secciones">
      {DESTINOS.map(({ href, texto, Icono }) => (
        <Link
          key={href}
          href={href}
          className="enlace-inf"
          aria-current={activo(href) ? 'page' : undefined}
        >
          <Icono size={21} aria-hidden="true" />
          {texto}
        </Link>
      ))}
    </nav>
  );
}
