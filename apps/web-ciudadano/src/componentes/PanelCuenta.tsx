'use client';

import { CONFIG_DOMINIO } from 'contracts';
import { LogOut, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCerrarSesion, useSesion } from '@/lib/sesion';
import { Aviso } from './Aviso';

/**
 * Estado de la cuenta: quién está, cuándo vuelve a tener turno para reportar y cómo salir.
 *
 * Sin sesión NO es un error ni una pantalla de bloqueo: es el estado normal de la mayoría de
 * quien entra a Mi Curichi. Esta pantalla lo dice y ofrece las dos puertas, sin esconder el mapa
 * detrás de ninguna.
 */
function faltaPara(momento: Date): string {
  const minutos = Math.ceil((momento.getTime() - Date.now()) / 60_000);
  if (minutos <= 0) return 'un momento';
  if (minutos === 1) return '1 minuto';
  return `${minutos} minutos`;
}

const hora = (d: Date) =>
  d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false });

export function PanelCuenta() {
  const router = useRouter();
  const { usuario, cargando, puedeReportarDesde } = useSesion();
  const salir = useCerrarSesion();

  if (cargando)
    return (
      <p className="ayuda p-6" role="status">
        Comprobando la sesión…
      </p>
    );

  if (!usuario)
    return (
      <div className="tarjeta w-full max-w-md p-7">
        <h1 className="mb-2 text-2xl">Tu cuenta</h1>
        <p className="ayuda mb-5">
          Todavía no iniciaste sesión. Para <strong>ver el mapa y consultar los reportes</strong> no
          hace falta cuenta; solo se necesita para <strong>enviar</strong> un reporte.
        </p>
        <Link href="/ingresar?volver=%2Fcuenta" className="btn btn-bloque no-underline">
          Iniciar sesión
        </Link>
        <Link
          href="/crear-cuenta?volver=%2Fcuenta"
          className="btn btn-secundario btn-bloque mt-3 no-underline"
        >
          Crear cuenta
        </Link>
        <p className="ayuda mt-5">
          <Link href="/">Volver al mapa</Link>
        </p>
      </div>
    );

  return (
    <div className="tarjeta w-full max-w-md p-7">
      <div className="mb-5 flex items-center gap-3">
        <UserRound size={34} aria-hidden="true" />
        <div>
          <h1 className="text-2xl">{usuario.nombre}</h1>
          <p className="ayuda">{usuario.email}</p>
        </div>
      </div>

      {puedeReportarDesde ? (
        <Aviso tono="alerta">
          Ya enviaste un reporte hace poco. Vas a poder enviar otro en{' '}
          {faltaPara(puedeReportarDesde)}, a las {hora(puedeReportarDesde)}.
        </Aviso>
      ) : (
        <Aviso tono="ok">Podés enviar un reporte ahora.</Aviso>
      )}
      <p className="ayuda mt-3">
        Cada cuenta puede enviar un reporte cada {CONFIG_DOMINIO.MINUTOS_ENTRE_REPORTES_POR_CUENTA}{' '}
        minutos. Es para que el inventario no se llene de envíos repetidos del mismo punto; si
        necesitás reportar varios lugares, el siguiente entra pasado ese rato.
      </p>

      <Link href="/reportar" className="btn btn-bloque mt-5 no-underline">
        Reportar un punto
      </Link>
      <Link href="/mis-reportes" className="btn btn-secundario btn-bloque mt-3 no-underline">
        Ver mis reportes
      </Link>

      <button
        type="button"
        className="btn btn-fantasma btn-bloque mt-3"
        disabled={salir.isPending}
        onClick={() =>
          salir.mutate(undefined, {
            onSettled: () => router.replace('/'),
          })
        }
      >
        <LogOut size={17} aria-hidden="true" className="mr-2" />
        {salir.isPending ? 'Cerrando…' : 'Cerrar sesión'}
      </button>
    </div>
  );
}
