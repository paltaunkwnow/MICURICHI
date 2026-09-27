import type { Metadata } from 'next';
import { MisReportes } from '@/componentes/MisReportes';

export const metadata: Metadata = {
  title: 'Mis reportes',
  description: 'Seguí el estado de los puntos que reportaste con tu cuenta.',
};

export default function Pagina() {
  return <MisReportes />;
}
