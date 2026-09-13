'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { obtenerAgregados, obtenerCapas, obtenerPuntosCriticos, obtenerReportes } from '@/lib/api';
import {
  colorSeveridad,
  distanciaDesde,
  etiquetaSeveridad,
  SEVERIDADES_ORDEN,
  textoCapaOficial,
  tituloPuntos,
} from '@/lib/formato';
import { useUbicacionUsuario } from '@/lib/useUbicacionUsuario';
import { Cabecera } from './Cabecera';
import { HojaDetalle } from './HojaDetalle';
import { MapaDiferido } from './MapaDiferido';
import { TarjetaReporte } from './TarjetaReporte';

function Kpi({
  valor,
  etiqueta,
  testId,
}: {
  valor: string | number;
  etiqueta: string;
  testId?: string;
}) {
  return (
    <div className="tarjeta flex-1 px-4 py-3" data-testid={testId}>
      <p className="titular text-3xl leading-none">{valor}</p>
      <p className="mt-1 text-[13.5px] text-tinta-600">{etiqueta}</p>
    </div>
  );
}

export function VistaMapa() {
  const [bbox, setBbox] = useState<string | null>(null);
  const [severidad, setSeveridad] = useState<string | null>(null);
  const [puntoCritico, setPuntoCritico] = useState<string | null>(null);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const { ubicacion } = useUbicacionUsuario();

  const filtros = useMemo(
    () => ({
      bbox: puntoCritico ? undefined : (bbox ?? undefined),
      severidad: severidad ?? undefined,
      punto_critico_id: puntoCritico ?? undefined,
      limite: '300',
    }),
    [bbox, severidad, puntoCritico],
  );

  const reportes = useQuery({
    queryKey: ['reportes', filtros],
    queryFn: () => obtenerReportes(filtros),
  });
  const capas = useQuery({ queryKey: ['capas'], queryFn: obtenerCapas, staleTime: 10 * 60_000 });
  const criticos = useQuery({
    queryKey: ['puntos-criticos'],
    queryFn: () => obtenerPuntosCriticos(),
    staleTime: 60_000,
  });
  const agregados = useQuery({
    queryKey: ['agregados'],
    queryFn: obtenerAgregados,
    staleTime: 60_000,
  });

  const features = reportes.data?.features ?? [];
  const elegido = features.find((f) => f.properties.id === seleccionado) ?? null;
  const uvConReportes = (agregados.data ?? []).filter((a) => a.n_reportes > 0).length;
  const hayFiltros = severidad !== null || puntoCritico !== null;

  const alMover = useCallback((nuevoBbox: string) => setBbox(nuevoBbox), []);
  const limpiarFiltros = () => {
    setSeveridad(null);
    setPuntoCritico(null);
  };

  const chipCapa = elegido
    ? textoCapaOficial(elegido.properties.distrito, elegido.properties.unidad_vecinal)
    : `${features.length} puntos en esta vista · capa oficial vigente`;

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      {/* Panel lateral (escritorio) */}
      <div className="order-2 hidden w-full flex-col overflow-y-auto md:order-1 md:flex md:w-[42%] md:max-w-[560px]">
        <Cabecera />
        <div className="space-y-4 px-4 pb-8 md:px-6">
          <div>
            <h1 className="titular text-4xl">
              {reportes.isPending ? tituloPuntos(undefined) : tituloPuntos(reportes.data?.total)}
            </h1>
            <p className="mt-1 text-tinta-600">
              Reportes de vecinos ya validados por la municipalidad.
            </p>
          </div>

          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">Filtrar por severidad</legend>
            <button
              type="button"
              className="chip"
              aria-pressed={severidad === null}
              onClick={() => setSeveridad(null)}
            >
              Todos
            </button>
            {SEVERIDADES_ORDEN.map((s) => (
              <button
                key={s}
                type="button"
                className="chip"
                aria-pressed={severidad === s}
                onClick={() => setSeveridad(s)}
              >
                <span
                  className="punto"
                  style={{ background: colorSeveridad(s).relleno }}
                  aria-hidden="true"
                />
                {etiquetaSeveridad(s)}
              </button>
            ))}
          </fieldset>

          {puntoCritico ? (
            <div className="flex items-center gap-2 rounded-2xl bg-agua-100 p-3 text-[15px]">
              <span>Mostrando solo los reportes de un punto crítico.</span>
              <button
                type="button"
                className="btn-secundario btn ml-auto"
                onClick={() => setPuntoCritico(null)}
              >
                Ver todos
              </button>
            </div>
          ) : null}

          {reportes.isPending ? (
            <p aria-live="polite" className="ayuda">
              Buscando reportes…
            </p>
          ) : features.length === 0 ? (
            <div className="tarjeta space-y-3 p-5" aria-live="polite">
              <h2 className="titular text-2xl">
                {hayFiltros
                  ? 'Ningún punto coincide con el filtro'
                  : 'Todavía nadie reportó en esta zona'}
              </h2>
              <p className="text-tinta-600">
                {hayFiltros
                  ? 'Probá con otra severidad o mové el mapa para buscar en otra zona.'
                  : 'Que no haya puntos no significa que no se anegue. Si conocés un lugar donde se junta el agua, sos el primero en marcarlo.'}
              </p>
              {hayFiltros ? (
                <button type="button" className="btn-secundario btn" onClick={limpiarFiltros}>
                  Limpiar filtros
                </button>
              ) : (
                <Link href="/reportar" className="btn-primario btn no-underline">
                  Reportar el primero acá
                </Link>
              )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {features.map((f) => (
                <TarjetaReporte
                  key={f.properties.id}
                  reporte={f}
                  distanciaM={distanciaDesde(ubicacion, f)}
                  seleccionado={seleccionado === f.properties.id}
                  onSeleccionar={setSeleccionado}
                />
              ))}
            </div>
          )}

          {elegido ? (
            <div className="tarjeta">
              <HojaDetalle
                reporte={elegido}
                distanciaM={distanciaDesde(ubicacion, elegido)}
                onCerrar={() => setSeleccionado(null)}
                onVerPunto={(id) => {
                  setPuntoCritico(id);
                  setSeveridad(null);
                }}
              />
            </div>
          ) : null}

          <p className="ayuda">
            Los puntos son reportes de vecinos. El distrito y la unidad vecinal los asigna el
            sistema por point-in-polygon contra las capas oficiales, no los escribe el vecino.
          </p>
        </div>
      </div>

      {/* Mapa */}
      <div className="relative order-1 min-h-0 flex-1 md:order-2">
        <MapaDiferido
          className="h-full w-full"
          reportes={features}
          capas={capas.data ?? []}
          seleccionado={seleccionado}
          onSeleccionar={setSeleccionado}
          onMover={alMover}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 p-3">
          <span className="tarjeta pointer-events-auto px-3 py-2 text-[13.5px] font-semibold">
            {chipCapa}
          </span>
          <Link
            href="/reportar"
            data-testid="boton-reportar"
            aria-label="Reportar un punto"
            className="btn-circular-verde btn-circular btn pointer-events-auto ml-auto no-underline"
          >
            <Plus aria-hidden="true" />
          </Link>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden gap-2 p-3 md:flex">
          <Kpi
            valor={reportes.data?.total ?? '—'}
            etiqueta="puntos publicados"
            testId="kpi-publicados"
          />
          <Kpi valor={criticos.data?.length ?? '—'} etiqueta="puntos críticos" />
          <Kpi valor={uvConReportes || '—'} etiqueta="UV con reportes" />
          <Kpi
            valor={elegido?.properties.n_reportes_punto ?? '—'}
            etiqueta="reportes en este punto"
          />
        </div>

        {/* Móvil: acción principal al alcance del pulgar */}
        {!elegido ? (
          <div className="absolute inset-x-0 bottom-0 p-4 md:hidden">
            <Link href="/reportar" className="btn-primario btn w-full no-underline">
              <Plus aria-hidden="true" size={20} /> Reportar un punto
            </Link>
          </div>
        ) : null}
      </div>

      {/* Móvil: hoja de detalle */}
      {elegido ? (
        <div className="fixed inset-x-0 bottom-0 z-20 max-h-[70dvh] overflow-y-auto rounded-t-[30px] bg-superficie shadow-[0_-8px_32px_rgba(15,45,67,.25)] md:hidden">
          <HojaDetalle
            reporte={elegido}
            distanciaM={distanciaDesde(ubicacion, elegido)}
            onCerrar={() => setSeleccionado(null)}
            onVerPunto={(id) => {
              setPuntoCritico(id);
              setSeveridad(null);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
