import type { Metadata } from 'next';
import { Cabecera } from '@/componentes/Cabecera';
import { FormularioReporte } from '@/componentes/FormularioReporte';

export const metadata: Metadata = {
  title: 'Reportar un punto',
  description: 'Marcá dónde se junta el agua en tu barrio.',
};

export default function Reportar() {
  return (
    <>
      <Cabecera />
      <main id="contenido">
        <FormularioReporte />
      </main>
    </>
  );
}
