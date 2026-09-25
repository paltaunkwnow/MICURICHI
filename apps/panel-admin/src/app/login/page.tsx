import { Suspense } from 'react';
import { FormularioLogin } from '@/componentes/FormularioLogin';

/**
 * El formulario lee `?caducada=1` con `useSearchParams`, y eso obliga a un límite de suspensión:
 * sin él Next no puede prerenderizar la ruta y el build falla (mismo motivo que en `/reportar`
 * de la app pública).
 */
export default function PaginaLogin() {
  return (
    <Suspense
      fallback={
        <main id="contenido" className="flex min-h-dvh items-center justify-center p-6">
          <p className="text-tinta-600">Cargando…</p>
        </main>
      }
    >
      <FormularioLogin />
    </Suspense>
  );
}
