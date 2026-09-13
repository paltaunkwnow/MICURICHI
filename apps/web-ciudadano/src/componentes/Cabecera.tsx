'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const enlaces = [
  { href: '/', texto: 'Mapa' },
  { href: '/reportar', texto: 'Reportar' },
  { href: '/como-funciona', texto: 'Cómo funciona' },
];

export function Cabecera() {
  const ruta = usePathname();
  return (
    <header className="flex items-center gap-4 px-4 py-3 md:px-6">
      <Link
        href="/"
        className="flex items-center gap-2 no-underline"
        aria-label="Mi Curichi, inicio"
      >
        {/* biome-ignore lint/performance/noImgElement: ícono SVG estático */}
        <img src="/icono.svg" alt="" width={36} height={36} className="rounded-xl" />
        <span className="titular text-xl text-tinta-900">Mi Curichi</span>
      </Link>
      <nav aria-label="Principal" className="ml-auto flex gap-2 overflow-x-auto">
        {enlaces.map((e) => (
          <Link
            key={e.href}
            href={e.href}
            className={`chip whitespace-nowrap no-underline ${ruta === e.href ? 'chip-activo' : ''}`}
            aria-current={ruta === e.href ? 'page' : undefined}
          >
            {e.texto}
          </Link>
        ))}
      </nav>
    </header>
  );
}
