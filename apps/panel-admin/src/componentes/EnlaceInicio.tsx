'use client';

import Link from 'next/link';
import { enlaceInicio } from '@/lib/roles';
import { useUsuario } from '@/lib/sesion';

/** «Volver al inicio» de las páginas de error: a la pantalla del rol de quien mira. */
export function EnlaceInicio({ className }: { className: string }) {
  const { data } = useUsuario();
  const { href, texto } = enlaceInicio(data?.rol);
  return (
    <Link href={href} className={className} data-testid="enlace-inicio">
      {texto}
    </Link>
  );
}
