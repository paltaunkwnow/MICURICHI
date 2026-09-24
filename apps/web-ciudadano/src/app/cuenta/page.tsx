import type { Metadata } from 'next';
import { BarraInferior } from '@/componentes/BarraInferior';
import { PanelCuenta } from '@/componentes/PanelCuenta';

export const metadata: Metadata = {
  title: 'Tu cuenta',
  description: 'Estado de tu sesión en Mi Curichi.',
};

export default function Cuenta() {
  return (
    <>
      <div className="flex flex-1 items-center justify-center p-5">
        <PanelCuenta />
      </div>
      <BarraInferior />
    </>
  );
}
