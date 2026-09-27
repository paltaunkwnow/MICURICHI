'use client';

import { CONFIG_DOMINIO } from 'contracts';
import { LayoutDashboard, LogOut, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FOTOS_POR_DIA, REPORTES_POR_DIA, TEXTO_CUPO_AGOTADO, textoCupo } from '@/lib/cupo';
import { destinoDelPanelDeSesion, textoDelPanel } from '@/lib/panel';
import { useCerrarSesion, useSesion } from '@/lib/sesion';
import { Aviso } from './Aviso';
import { ErrorDeCarga } from './ErrorDeCarga';

/**
 * Estado de la cuenta: quién está, cuántos reportes le quedan hoy y cómo salir.
 *
 * Sin sesión NO es un error ni una pantalla de bloqueo: es el estado normal de la mayoría de
 * quien entra a Mi Curichi. Esta pantalla lo dice y ofrece las dos puertas, sin esconder el mapa
 * detrás de ninguna.
 */
export function PanelCuenta() {
  const router = useRouter();
  const { usuario, cargando, errorDeCarga, reintentar, reintentando, reportesRestantesHoy } =
    useSesion();
  const salir = useCerrarSesion();
  const panel = destinoDelPanelDeSesion(usuario);

  if (cargando)
    return (
      <p className="ayuda p-6" role="status">
        Comprobando la sesión…
      </p>
    );

  // Sin respuesta de /auth/yo no se sabe si hay sesión: decir «todavía no iniciaste sesión» a
  // quien sí la tiene es mandarlo a entrar de nuevo por un fallo del servidor.
  if (errorDeCarga)
    return (
      <div className="tarjeta w-full max-w-md p-7">
        <h1 className="mb-4 text-2xl">Tu cuenta</h1>
        <ErrorDeCarga
          error={errorDeCarga}
          que="tu sesión"
          alReintentar={reintentar}
          reintentando={reintentando}
          testId="error-sesion"
        />
      </div>
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

      {/* Arriba de todo: quien tiene rol técnico casi siempre viene a esto. En móvil no hay barra
          superior, así que este es el único camino al panel. */}
      {panel && (
        <div className="mb-5">
          <a href={panel} className="btn btn-tinta btn-bloque no-underline">
            <LayoutDashboard size={18} aria-hidden="true" className="mr-2" />
            Ir al {textoDelPanel(usuario.rol).toLowerCase()}
          </a>
          <p className="ayuda mt-2">
            {usuario.rol === 'ejecutivo'
              ? 'Tu cuenta es de ejecutivo. El resumen de reportes por distrito y severidad está en el panel.'
              : `Tu cuenta es de ${usuario.rol === 'admin' ? 'administrador' : 'técnico'}. Moderar, exportar y ver los indicadores se hace desde el panel.`}
          </p>
        </div>
      )}

      {reportesRestantesHoy === 0 ? (
        <Aviso tono="alerta" data-testid="cupo-cuenta">
          <b className="mb-1 block">{textoCupo(0)}</b>
          {TEXTO_CUPO_AGOTADO}
        </Aviso>
      ) : reportesRestantesHoy === null ? (
        <Aviso tono="ok">Podés enviar un reporte ahora.</Aviso>
      ) : (
        <Aviso tono="ok" data-testid="cupo-cuenta">
          {textoCupo(reportesRestantesHoy)}
        </Aviso>
      )}
      <p className="ayuda mt-3">
        Cada cuenta puede enviar {REPORTES_POR_DIA} reportes por día, con hasta{' '}
        {CONFIG_DOMINIO.FOTOS_MAX_POR_REPORTE} fotos cada uno y {FOTOS_POR_DIA} fotos por día. El
        cupo vuelve entero a la medianoche. Es para que el inventario no se llene de envíos
        repetidos del mismo punto.
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
