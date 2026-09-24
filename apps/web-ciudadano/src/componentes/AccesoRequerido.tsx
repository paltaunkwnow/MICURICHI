'use client';

import { UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Aviso } from './Aviso';

/**
 * «Para agregar un reporte necesitás una cuenta.»
 *
 * Aparece en dos momentos: al entrar a reportar sin sesión, y si la sesión caduca a mitad del
 * formulario. En los dos casos el borrador sigue en `sessionStorage`, así que entrar y volver no
 * cuesta nada de lo ya escrito; por eso el texto lo promete y por eso «Cancelar» lleva al mapa y
 * no borra nada.
 *
 * Lo que NO hace: redirigir por su cuenta. Un 401 que se convierte en un salto automático al
 * login es la forma más rápida de perder lo que alguien estaba escribiendo, y aquí no hace falta
 * porque nadie llega a esta pantalla sin haber pulsado «Reportar».
 */
export function AccesoRequerido({
  volver = '/reportar',
  motivo = 'nueva',
}: {
  /** A dónde vuelve después de entrar o crear la cuenta. */
  volver?: string;
  /** `caducada` cambia el texto: no es lo mismo no tener cuenta que haberse quedado sin sesión. */
  motivo?: 'nueva' | 'caducada';
}) {
  const router = useRouter();
  const destino = `volver=${encodeURIComponent(volver)}`;
  return (
    <div className="flex flex-1 items-center justify-center p-5">
      <section className="tarjeta w-full max-w-md p-7" aria-labelledby="acceso-titulo">
        <div className="mb-4 flex items-center gap-3">
          <UserRound size={30} aria-hidden="true" />
          <h1 className="text-2xl" id="acceso-titulo">
            {motivo === 'caducada' ? 'Se cerró tu sesión' : 'Necesitás una cuenta'}
          </h1>
        </div>

        <p className="mb-4">
          {motivo === 'caducada'
            ? 'Tu sesión venció mientras completabas el reporte. Volvé a entrar y seguí donde lo dejaste.'
            : 'Para agregar un reporte hace falta tener una cuenta e iniciar sesión.'}
        </p>

        <Aviso tono="info" className="mb-5">
          Lo que hayas completado se guarda en este dispositivo: al volver, seguís donde estabas.
        </Aviso>

        <Link href={`/ingresar?${destino}`} className="btn btn-bloque no-underline">
          Iniciar sesión
        </Link>
        <Link
          href={`/crear-cuenta?${destino}`}
          className="btn btn-secundario btn-bloque mt-3 no-underline"
        >
          Crear cuenta
        </Link>
        <button
          type="button"
          className="btn btn-fantasma btn-bloque mt-3"
          onClick={() => router.push('/')}
        >
          Cancelar
        </button>

        <p className="ayuda mt-5">
          Ver el mapa y consultar los reportes no necesita cuenta: solo enviar uno.
        </p>
      </section>
    </div>
  );
}
