'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useMemo, useState } from 'react';
import { Aviso } from '@/componentes/Aviso';
import { FiltrosDeReportes } from '@/componentes/FiltrosReportes';
import { Mapa } from '@/componentes/Mapa';
import { Paginacion } from '@/componentes/Paginacion';
import { TablaReportes } from '@/componentes/TablaReportes';
import {
  obtenerCapasMapa,
  obtenerDistritos,
  obtenerReportes,
  obtenerUnidadesVecinales,
  urlExportar,
} from '@/lib/api';
import {
  type FiltrosReportes,
  hayFiltros,
  LIMITE_PAGINA,
  leerFiltros,
  parametrosConsulta,
  parametrosExportacion,
  serializarFiltros,
} from '@/lib/filtros';
import { numero } from '@/lib/formato';

export default function PaginaReportes() {
  // useSearchParams exige un límite de Suspense para el prerender.
  return (
    <Suspense
      fallback={
        <p className="text-tinta-600" role="status">
          Cargando reportes…
        </p>
      }
    >
      <Reportes />
    </Suspense>
  );
}

function Reportes() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filtros = useMemo(() => leerFiltros(new URLSearchParams(sp.toString())), [sp]);
  const params = useMemo(() => parametrosConsulta(filtros), [filtros]);
  const paramsExportacion = useMemo(() => parametrosExportacion(filtros), [filtros]);

  const navegar = useCallback(
    (nuevos: FiltrosReportes) => {
      const q = serializarFiltros(nuevos).toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router],
  );
  const cambiarFiltros = useCallback(
    (cambios: Partial<FiltrosReportes>) => navegar({ ...filtros, ...cambios, pagina: 1 }),
    [filtros, navegar],
  );

  const reportes = useQuery({
    queryKey: ['reportes', params],
    queryFn: ({ signal }) => obtenerReportes(params, signal),
    placeholderData: keepPreviousData,
  });
  const distritos = useQuery({
    queryKey: ['geo', 'distritos'],
    queryFn: obtenerDistritos,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const unidadesVecinales = useQuery({
    queryKey: ['geo', 'unidades-vecinales'],
    queryFn: obtenerUnidadesVecinales,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const capas = useQuery({
    queryKey: ['geo', 'capas'],
    queryFn: ({ signal }) => obtenerCapasMapa(signal),
    staleTime: Number.POSITIVE_INFINITY,
  });

  /**
   * Dos conteos que la bandeja necesita siempre, con filtros o sin ellos: cuántos esperan
   * revisión y cuántos de esos son críticos. Se piden con `limite=1` porque lo único que se usa
   * es el `total` que devuelve la API, no las filas.
   */
  const nuevos = useQuery({
    queryKey: ['reportes', 'conteo', 'nuevo'],
    queryFn: ({ signal }) => obtenerReportes({ estado: 'nuevo', limite: '1' }, signal),
    staleTime: 30_000,
  });
  const criticos = useQuery({
    queryKey: ['reportes', 'conteo', 'nuevo-critica'],
    queryFn: ({ signal }) =>
      obtenerReportes({ estado: 'nuevo', severidad: 'critica', limite: '1' }, signal),
    staleTime: 30_000,
  });

  const features = reportes.data?.features ?? [];
  const total = reportes.data?.total ?? 0;
  const [resaltado, setResaltado] = useState<string | null>(null);
  const abrir = useCallback((id: string) => router.push(`/reportes/${id}`), [router]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Reportes</h1>
          <p className="text-tinta-600">
            {reportes.data
              ? `${numero(total)} reportes con los filtros actuales`
              : 'Tabla y mapa sincronizados con los filtros'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={urlExportar('geojson', paramsExportacion)}
            download
            className="btn btn-secundario"
            data-testid="exportar-geojson"
          >
            <Download size={18} aria-hidden="true" />
            Exportar GeoJSON
          </a>
          <a
            href={urlExportar('csv', paramsExportacion)}
            download
            className="btn btn-secundario"
            data-testid="exportar-csv"
          >
            <Download size={18} aria-hidden="true" />
            Exportar CSV
          </a>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,38%)]">
        <section className="flex min-w-0 flex-col gap-4" aria-label="Filtros y tabla de reportes">
          <FiltrosDeReportes
            filtros={filtros}
            distritos={distritos.data ?? []}
            unidadesVecinales={unidadesVecinales.data ?? []}
            onCambiar={cambiarFiltros}
          />
          {(distritos.error || unidadesVecinales.error) && (
            <Aviso tipo="alerta">
              No se pudieron cargar las capas administrativas para los selectores. Verificá que
              geo-service esté en marcha.
            </Aviso>
          )}

          <Aviso tipo="error">
            {reportes.error
              ? `No se pudieron cargar los reportes: ${reportes.error.message}`
              : null}
          </Aviso>

          <div className="tarjeta p-2 lg:p-4">
            {reportes.isPending ? (
              <p className="p-4 text-tinta-600" role="status">
                Cargando reportes…
              </p>
            ) : features.length === 0 ? (
              <div className="flex flex-col items-start gap-3 p-6">
                <p className="titular text-xl">No hay reportes con estos filtros</p>
                <p className="text-tinta-600">
                  {hayFiltros(filtros)
                    ? 'Probá quitar algún filtro o ampliar el rango de fechas.'
                    : 'Todavía no se registró ningún reporte.'}
                </p>
                {hayFiltros(filtros) && (
                  <button
                    type="button"
                    className="btn btn-secundario"
                    onClick={() =>
                      cambiarFiltros({
                        estado: [],
                        severidad: [],
                        distrito_id: '',
                        unidad_vecinal_id: '',
                        desde: '',
                        hasta: '',
                      })
                    }
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            ) : (
              <div className={reportes.isFetching ? 'opacity-70 transition-opacity' : ''}>
                <TablaReportes
                  reportes={features}
                  seleccionado={resaltado}
                  onSeleccionar={setResaltado}
                />
              </div>
            )}
          </div>

          {total > 0 && (
            <Paginacion
              pagina={filtros.pagina}
              limite={LIMITE_PAGINA}
              total={total}
              onCambiar={(pagina) => navegar({ ...filtros, pagina })}
            />
          )}
        </section>

        <aside
          className="flex flex-col gap-4 lg:sticky lg:top-8 lg:self-start"
          aria-label="Mapa e indicadores de la bandeja"
        >
          <div className="mapa-panel">
            <Mapa
              reportes={features}
              capas={capas.data ?? []}
              onSeleccionar={abrir}
              seleccionado={resaltado}
              ajustarAPuntos
              className="h-[420px] w-full lg:h-[calc(100dvh-16rem)]"
              ariaLabel="Mapa con los reportes de la página actual; hacé clic en un punto para abrirlo"
            />
          </div>
          <dl className="grid grid-cols-3 gap-3">
            {(
              [
                [nuevos.data ? numero(nuevos.data.total) : '—', 'sin revisar'],
                [criticos.data ? numero(criticos.data.total) : '—', 'críticos pendientes'],
                [reportes.data ? numero(total) : '—', 'con estos filtros'],
              ] as Array<[string, string]>
            ).map(([valor, etiqueta]) => (
              <div key={etiqueta} className="kpi">
                <dd className="kpi-valor">{valor}</dd>
                <dt className="kpi-etiqueta">{etiqueta}</dt>
              </div>
            ))}
          </dl>
        </aside>
      </div>
    </div>
  );
}
