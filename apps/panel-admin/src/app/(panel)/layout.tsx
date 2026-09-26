'use client';

import type { ReactNode } from 'react';
import { Aviso } from '@/componentes/Aviso';
import { BarraLateral } from '@/componentes/BarraLateral';
import { Protegido, useAvisoAcceso } from '@/lib/sesion';

/** Layout autenticado: barra lateral en tinta y contenido sobre fondo claro. */
export default function LayoutPanel({ children }: { children: ReactNode }) {
  return (
    <Protegido>
      <div className="min-h-dvh lg:flex">
        <BarraLateral />
        <main id="contenido" className="mainp min-w-0 flex-1">
          <AvisoDeAcceso />
          {children}
        </main>
      </div>
    </Protegido>
  );
}

function AvisoDeAcceso() {
  const aviso = useAvisoAcceso();
  return (
    <div className={aviso ? 'mb-4' : undefined}>
      <Aviso tipo="alerta" testId="aviso-acceso">
        {aviso}
      </Aviso>
    </div>
  );
}
