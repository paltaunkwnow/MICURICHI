'use client';

import Link from 'next/link';
import { useUsuarioActual } from '@/lib/sesion';

/**
 * Coletilla «…, {texto} Capas» con enlace a /capas, solo para el admin: «Capas» es una sección de
 * administración. Al técnico y al ejecutivo no se los manda ahí, así que ven la frase sin esa
 * referencia (no se renderiza nada). La página del plano es server component; esto lee el rol en
 * cliente dentro de <Protegido>, igual que la barra lateral.
 */
export function VerEnCapas({ texto }: { texto: string }) {
  const { rol } = useUsuarioActual();
  if (rol !== 'admin') return null;
  return (
    <>
      , {texto}{' '}
      <Link href="/capas" className="font-semibold underline">
        Capas
      </Link>
    </>
  );
}
