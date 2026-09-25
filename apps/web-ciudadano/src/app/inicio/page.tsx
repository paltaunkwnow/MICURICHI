import type { Metadata } from 'next';
import { Bienvenida } from '@/componentes/Bienvenida';
import { Portada } from '@/componentes/Portada';

export const metadata: Metadata = {
  title: 'Inicio',
  description:
    'Mi Curichi: el mapa de los puntos donde se junta el agua en Santa Cruz de la Sierra, hecho por los vecinos.',
};

/**
 * Misma portada en dos formatos, como en el prototipo: en escritorio la página de inicio con el
 * mapa y los pasos (W-00) y en el celular las tres láminas de bienvenida (C-00). No son dos rutas
 * compitiendo: es el mismo contenido adaptado al tamaño, y solo una de las dos se dibuja.
 *
 * La de escritorio va primera en el marcado a propósito: cada variante trae su propio `h1` y así
 * el primero del documento es el que de verdad se ve en el tamaño más común.
 */
export default function Pagina() {
  return (
    <>
      <div className="hidden md:block">
        <Portada />
      </div>
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        <Bienvenida />
      </div>
    </>
  );
}
