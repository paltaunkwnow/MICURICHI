import type { Metadata } from 'next';
import { VistaMapa } from '@/componentes/VistaMapa';

export const metadata: Metadata = {
  title: 'Mapa público',
  description: 'Dónde se junta el agua en la ciudad, según los vecinos.',
};

export default function Inicio() {
  return <VistaMapa />;
}
