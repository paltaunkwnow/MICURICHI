'use client';

import { CONFIG_DOMINIO, ETIQUETAS } from 'contracts';
import { LocateFixed, MapPin } from 'lucide-react';
import Link from 'next/link';
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
  aviso = null,
}: {
  estado: EstadoUbicacionDispositivo;
  alCompartir: () => void;
  /** Por qué se vuelve a pedir: un borrador retomado, una posición vencida, un 422. */
  aviso?: string | null;
}) {
  if (estado.fase === 'lista') return null;
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        {aviso ? (
          <Aviso tono="alerta" className="mb-3" data-testid="aviso-ubicacion">
            {aviso}
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
      </div>
      <div className="pie">
        <Accion estado={estado} alCompartir={alCompartir} />
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
}: {
  estado: EstadoUbicacionDispositivo;
  alCompartir: () => void;
}) {
  switch (estado.fase) {
    case 'inactiva':
      return (
        <button
          type="button"
          className="btn btn-bloque"
          data-testid="boton-compartir-ubicacion"
          onClick={alCompartir}
        >
          <LocateFixed size={18} aria-hidden="true" />
          Compartir mi ubicación
        </button>
      );
    case 'buscando':
      return (
        <button type="button" className="btn btn-bloque" disabled>
          Buscando tu ubicación…
        </button>
      );
    case 'imprecisa':
      return (
        <button
          type="button"
          className="btn btn-bloque"
          data-testid="boton-reintentar-ubicacion"
          onClick={alCompartir}
        >
          Reintentar
        </button>
      );
    case 'denegada':
      return (
        <button
          type="button"
          className="btn btn-fantasma btn-bloque"
          data-testid="boton-reintentar-ubicacion"
          onClick={alCompartir}
        >
          Probar de nuevo
        </button>
      );
    default:
      return (
        <Link href="/" className="btn btn-fantasma btn-bloque no-underline">
          Volver al mapa
        </Link>
      );
  }
}
