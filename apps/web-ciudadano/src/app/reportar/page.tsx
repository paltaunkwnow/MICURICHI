import { REGISTRO_CATEGORIAS } from 'contracts';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { FormularioReporte } from '@/componentes/FormularioReporte';
import { activasDelRegistro, textosParaCategoria } from '@/lib/categoria';
import { obtenerCategoriasActivas } from '@/lib/ciudad-servidor';

/**
 * La descripción de la página sale de la definición de la primera categoría activa (0.21.0): se lee
 * en el servidor con las activas de la instalación, la misma lectura que el layout. Con una sola
 * categoría activa dice lo de siempre.
 */
export async function generateMetadata(): Promise<Metadata> {
  const primera = activasDelRegistro(await obtenerCategoriasActivas(), REGISTRO_CATEGORIAS)[0];
  return {
    title: 'Reportar un punto',
    description: textosParaCategoria(REGISTRO_CATEGORIAS, primera).descripcionReportar,
  };
}

export default function Reportar() {
  // `useSearchParams` obliga a un límite de suspensión: sin él, Next no puede prerenderizar
  // nada de esta ruta y falla el build.
  return (
    <Suspense fallback={<p className="p-6">Cargando el formulario…</p>}>
      <FormularioReporte />
    </Suspense>
  );
}
