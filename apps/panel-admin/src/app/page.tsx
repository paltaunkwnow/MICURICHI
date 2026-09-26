'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { rutaInicial } from '@/lib/roles';
import { useUsuario } from '@/lib/sesion';

/**
 * La raíz lleva a cada rol a su pantalla: el ejecutivo a /ejecutivo, el técnico a la bandeja. Antes
 * iba siempre a /reportes y el ejecutivo rebotaba a su panel con «Te trajimos al panel ejecutivo»,
 * un aviso que no se borraba porque no tiene otra pantalla a la que ir. Sin sesión, al login.
 */
export default function Inicio() {
  const router = useRouter();
  const { data, error } = useUsuario();

  useEffect(() => {
    if (data) router.replace(rutaInicial(data.rol));
    else if (error) router.replace('/login');
  }, [data, error, router]);

  return (
    <main id="contenido" className="p-8">
      <p className="text-tinta-600" role="status">
        Abriendo el panel…
      </p>
    </main>
  );
}
