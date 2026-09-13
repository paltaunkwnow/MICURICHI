import { redirect } from 'next/navigation';

/** La raíz del panel siempre lleva a la tabla de reportes; Protegido decide si hace falta login. */
export default function Inicio() {
  redirect('/reportes');
}
