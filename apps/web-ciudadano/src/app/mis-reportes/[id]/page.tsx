'use client';

import { useParams } from 'next/navigation';
import { SeguimientoReporte } from '@/componentes/SeguimientoReporte';

export default function Pagina() {
  const params = useParams<{ id: string }>();
  return <SeguimientoReporte id={params?.id ?? ''} />;
}
