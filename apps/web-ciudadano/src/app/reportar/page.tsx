import type { Metadata } from 'next';
import { Suspense } from 'react';
import { FormularioReporte } from '@/componentes/FormularioReporte';

export const metadata: Metadata = {
  title: 'Reportar un punto',
  description: 'Marcá dónde se junta el agua en tu barrio.',
};

export default function Reportar() {
  // `useSearchParams` obliga a un límite de suspensión: sin él, Next no puede prerenderizar
  // nada de esta ruta y falla el build.
  return (
    <Suspense fallback={<p className="p-6">Cargando el formulario…</p>}>
      <FormularioReporte />
    </Suspense>
  );
}
