import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BarraInferior } from '@/componentes/BarraInferior';
import { FormularioAcceso } from '@/componentes/FormularioAcceso';

export const metadata: Metadata = {
  title: 'Iniciar sesión',
  description: 'Entrá a tu cuenta para enviar reportes. Ver el mapa no necesita cuenta.',
};

/**
 * `useSearchParams` (para `?volver=`) obliga a un límite de suspensión: sin él, Next no puede
 * prerenderizar la ruta y el build falla. Mismo motivo que en `/reportar`.
 */
export default function Ingresar() {
  return (
    <>
      <div className="flex flex-1 items-center justify-center p-5">
        <Suspense fallback={<p className="ayuda">Cargando…</p>}>
          <FormularioAcceso modo="entrar" />
        </Suspense>
      </div>
      <BarraInferior />
    </>
  );
}
