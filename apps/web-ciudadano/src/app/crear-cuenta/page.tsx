import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BarraInferior } from '@/componentes/BarraInferior';
import { FormularioAcceso } from '@/componentes/FormularioAcceso';

export const metadata: Metadata = {
  title: 'Crear cuenta',
  description: 'Creá una cuenta para enviar reportes. Ver el mapa no necesita cuenta.',
};

export default function CrearCuenta() {
  return (
    <>
      <div className="flex flex-1 items-center justify-center p-5">
        <Suspense fallback={<p className="ayuda">Cargando…</p>}>
          <FormularioAcceso modo="alta" />
        </Suspense>
      </div>
      <BarraInferior />
    </>
  );
}
