'use client';

import type { ReactNode } from 'react';
import { BarraLateral } from '@/componentes/BarraLateral';
import { Protegido } from '@/lib/sesion';

/** Layout autenticado: barra lateral en tinta y contenido sobre fondo claro. */
export default function LayoutPanel({ children }: { children: ReactNode }) {
  return (
    <Protegido>
      <div className="min-h-dvh lg:flex">
        <BarraLateral />
        <main id="contenido" className="mainp min-w-0 flex-1">
          {children}
        </main>
      </div>
    </Protegido>
  );
}
