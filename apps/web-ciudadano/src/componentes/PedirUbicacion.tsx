'use client';

import { CONFIG_DOMINIO, ETIQUETAS } from 'contracts';
import { LocateFixed, MapPin } from 'lucide-react';
import Link from 'next/link';
import { ofreceUbicacionAproximada } from '@/lib/ubicacion-aproximada';
import type { EstadoUbicacionDispositivo } from '@/lib/ubicacion-dispositivo';
import { Aviso } from './Aviso';

const RADIO_M = CONFIG_DOMINIO.REPORTE_RADIO_DISPOSITIVO_M;
const PRECISION_M = CONFIG_DOMINIO.PRECISION_DISPOSITIVO_MAX_M;
const JITTER_M = CONFIG_DOMINIO.JITTER_PUBLICO_M;
const VIVIENDA = ETIQUETAS.ubicacion_tipo.vivienda_o_predio;

/**
 * Paso 1 antes de tener la posición del teléfono (plan 2026-09-26, pedidos E y F): por qué hace
 * falta, la precisión mientras se busca, «Salí a un lugar abierto» si no llega y el bloqueo si se
 * negó el permiso. Con la posición ya anclada no dibuja nada: el formulario muestra el mapa.
 *
 * Solo muestra: la ubicación la pide el formulario al tocar el botón (`alCompartir`), nunca al
 * montar.
 */
export function VistaPedirUbicacion({
  estado,
  alCompartir,
  alSimular,
  alAproximar,
  aviso = null,
  reanudando = false,
}: {
  estado: EstadoUbicacionDispositivo;
  alCompartir: () => void;
  alSimular?: () => void;
  /**
   * Habilita «Reportar con ubicación aproximada» (ADR 0007). Aparece solo cuando el dispositivo no
   * llega a la precisión exigida (`ofreceUbicacionAproximada`); sin este callback el camino no se
   * ofrece (p. ej. la ubicación de prueba, que sí llega a la precisión).
   */
  alAproximar?: () => void;
  /** Por qué se vuelve a pedir: un borrador retomado, una posición vencida, un 422. */
  aviso?: string | null;
  /** Se retomó un borrador que iba por el camino aproximado: se recuerda para seguir por ahí. */
  reanudando?: boolean;
}) {
  if (estado.fase === 'lista') return null;
  const ofreceAproximada = !!alAproximar && ofreceUbicacionAproximada(estado);
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        {aviso ? (
          <Aviso tono="alerta" className="mb-3" data-testid="aviso-ubicacion">
            {aviso}
          </Aviso>
        ) : null}
        {reanudando ? (
          <Aviso tono="info" className="mb-3" data-testid="reanudar-ubicacion-aproximada">
            Seguías reportando con <b>ubicación aproximada</b>. Compartí tu ubicación para
            continuar: el punto que marcaste sigue guardado.
          </Aviso>
        ) : null}
        <div className="tarjeta p-5">
          <span
            className="grid h-[46px] w-[46px] place-items-center rounded-[14px]"
            style={{ background: 'var(--color-verde-100)', color: 'var(--color-verde-700)' }}
          >
            <MapPin size={23} aria-hidden="true" />
          </span>
          <h2 className="titular mt-3 text-xl">Para reportar necesitamos tu ubicación</h2>
          <p className="mt-2 text-[15.5px] leading-[1.5] text-tinta-600">
            El punto del reporte tiene que quedar a {RADIO_M} m o menos de donde estás. Para
            comprobarlo usamos la posición de tu teléfono, que no guardamos aparte.
          </p>
          <p className="ayuda mt-2">
            Ojo: el punto arranca donde estás y es lo que se guarda en el reporte. Lo ven los
            técnicos y, cuando se publica, el mapa, sin tu nombre. Si es tu casa, marcá «{VIVIENDA}»
            y el mapa público lo corre hasta {JITTER_M} m.
          </p>
          <p className="ayuda mt-2">
            Tu teléfono tiene que ubicarte con un error de {PRECISION_M} m o menos. Al aire libre
            suele alcanzar.
          </p>
          <div className="mt-4">
            <Detalle estado={estado} />
          </div>
        </div>
        {ofreceAproximada ? (
          <div className="tarjeta mt-3 p-5" data-testid="bloque-ubicacion-aproximada">
            <h3 className="titular text-[17px]">¿Estás en una computadora o sin GPS?</h3>
            <p
              className="mt-2 text-[15px] leading-[1.5] text-tinta-600"
              data-testid="explicacion-ubicacion-aproximada"
            >
              Tu dispositivo no te ubica con {PRECISION_M} m de precisión (por ejemplo, una
              computadora, que se ubica por Wi-Fi). Podés reportar igual: vas a poner el punto{' '}
              <b>a mano</b>, en el mapa, donde se junta el agua. Los técnicos lo van a ver como
              «ubicación aproximada, sin comprobar con tu dispositivo».
            </p>
            <button
              type="button"
              className="btn btn-tinta btn-bloque mt-3"
              data-testid="boton-ubicacion-aproximada"
              onClick={alAproximar}
            >
              Reportar con ubicación aproximada
            </button>
          </div>
        ) : null}
      </div>
      <div className="pie">
        <Accion estado={estado} alCompartir={alCompartir} alSimular={alSimular} />
      </div>
    </>
  );
}

function Detalle({ estado }: { estado: EstadoUbicacionDispositivo }) {
  switch (estado.fase) {
    case 'inactiva':
      return (
        <p className="ayuda">
          Al tocar «Compartir mi ubicación», tu navegador te va a preguntar si nos dejás usarla:
          elegí «Permitir».
        </p>
      );
    case 'buscando':
      return (
        <div role="status" aria-live="polite" data-testid="precision-actual">
          {estado.ultima ? (
            <>
              <p className="titular text-[19px] tabular-nums">
                Precisión actual: {Math.round(estado.ultima.precisionM)} m
              </p>
              <p className="ayuda mt-1">
                Hace falta {PRECISION_M} m o menos. Si estás bajo techo, acercate a una ventana o
                salí afuera.
              </p>
            </>
          ) : (
            <p className="font-semibold">Buscando tu ubicación…</p>
          )}
        </div>
      );
    case 'imprecisa':
      return (
        <Aviso tono="alerta" role="alert" data-testid="ubicacion-imprecisa">
          <b className="mb-1 block text-[14.5px]">Salí a un lugar abierto</b>
          Tu teléfono no llegó a ubicarte con {PRECISION_M} m de precisión o menos
          {estado.ultima
            ? ` (la última lectura fue de ${Math.round(estado.ultima.precisionM)} m)`
            : ''}
          . Al aire libre, lejos de paredes y techos, el GPS mejora. También ayuda activar la
          ubicación precisa en los ajustes del teléfono.
        </Aviso>
      );
    case 'denegada':
      return (
        <Aviso tono="err" role="alert" data-testid="ubicacion-bloqueada">
          <b className="mb-1 block text-[14.5px]">No diste permiso para usar tu ubicación</b>
          Sin ella no se puede reportar: el punto tiene que quedar a {RADIO_M} m o menos de donde
          estás. Para habilitarla:
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Tocá el candado o el ícono de ajustes junto a la dirección de la página.</li>
            <li>Buscá «Ubicación» y elegí «Permitir».</li>
            <li>
              Si no aparece, habilitala para este sitio en los ajustes del navegador y revisá que la
              ubicación del teléfono esté encendida.
            </li>
          </ol>
          <span className="mt-2 block">En cuanto la habilites, seguimos solos.</span>
        </Aviso>
      );
    case 'error':
      return (
        <Aviso tono="err" role="alert" data-testid="ubicacion-no-disponible">
          {estado.problema === 'inseguro'
            ? 'La ubicación solo funciona si la página se abre con una conexión segura (https). Sin ella no se puede reportar.'
            : 'Este navegador no permite compartir la ubicación: abrí la página en Chrome o Safari. Sin ella no se puede reportar.'}
        </Aviso>
      );
    default:
      return null;
  }
}

function Accion({
  estado,
  alCompartir,
  alSimular,
}: {
  estado: EstadoUbicacionDispositivo;
  alCompartir: () => void;
  alSimular?: () => void;
}) {
  const botonSimular = alSimular ? (
    <button
      type="button"
      className="btn btn-secundario btn-bloque text-sm mt-2"
      data-testid="boton-simular-ubicacion"
      onClick={alSimular}
      title="Ubicación de prueba en Santa Cruz de la Sierra (para computadoras sin GPS)"
    >
      📍 Usar ubicación de prueba (Santa Cruz)
    </button>
  ) : null;

  switch (estado.fase) {
    case 'inactiva':
      return (
        <div className="w-full flex flex-col">
          <button
            type="button"
            className="btn btn-bloque"
            data-testid="boton-compartir-ubicacion"
            onClick={alCompartir}
          >
            <LocateFixed size={18} aria-hidden="true" />
            Compartir mi ubicación
          </button>
          {botonSimular}
        </div>
      );
    case 'buscando':
      return (
        <div className="w-full flex flex-col">
          <button type="button" className="btn btn-bloque" disabled>
            Buscando tu ubicación…
          </button>
          {botonSimular}
        </div>
      );
    case 'imprecisa':
      return (
        <div className="w-full flex flex-col">
          <button
            type="button"
            className="btn btn-bloque"
            data-testid="boton-reintentar-ubicacion"
            onClick={alCompartir}
          >
            Reintentar
          </button>
          {botonSimular}
        </div>
      );
    case 'denegada':
      return (
        <div className="w-full flex flex-col">
          <button
            type="button"
            className="btn btn-fantasma btn-bloque"
            data-testid="boton-reintentar-ubicacion"
            onClick={alCompartir}
          >
            Probar de nuevo
          </button>
          {botonSimular}
        </div>
      );
    default:
      return (
        <div className="w-full flex flex-col">
          <Link href="/" className="btn btn-fantasma btn-bloque no-underline">
            Volver al mapa
          </Link>
          {botonSimular}
        </div>
      );
  }
}
