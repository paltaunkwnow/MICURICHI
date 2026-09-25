import type { Metadata } from 'next';
import { ComoFunciona } from '@/componentes/ComoFunciona';

export const metadata: Metadata = {
  title: 'Cómo funciona',
  description:
    'Cómo se calcula la severidad, cómo se asigna la unidad vecinal y qué hacemos con tus datos.',
};

export default function Pagina() {
  return <ComoFunciona />;
}
