'use client';

import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useMemo, useState } from 'react';
import { Aviso, type TipoAviso } from '@/componentes/Aviso';
import { FiltrosDeReportes } from '@/componentes/FiltrosReportes';
import { Mapa } from '@/componentes/Mapa';
import { Paginacion } from '@/componentes/Paginacion';
import { TablaReportes } from '@/componentes/TablaReportes';
import { exportarGeoJson, urlExportar } from '@/lib/api';
import { useFormato } from '@/lib/ciudad-contexto';
import {
  consultaCapasMapa,
  consultaDistritos,
  consultaReportes,
  consultaUnidadesVecinales,
} from '@/lib/consultas';
import { avisoExportacion, mensajeErrorExportacion } from '@/lib/exportacion';
import {
  type FiltrosReportes,
  hayFiltros,
  LIMITE_PAGINA,
  leerFiltros,
  parametrosConsulta,
  parametrosExportacion,
  serializarFiltros,
} from '@/lib/filtros';
import { AVISO_BANDEJA_PUBLICOS } from '@/lib/publicacion';

/** Guarda en el equipo un archivo ya recibido, con el nombre que mandó el servidor. */
function descargar(texto: string, nombre: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.append(a);
  a.click();
  a.remove();
  // Revocarlo en el acto puede cortar la descarga en algunos navegadores.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

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
  const formato = useFormato();
  const { numero } = formato;

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

  // Se refresca sola cada 10 s (`lib/consultas.ts`); al cambiar de filtro se sigue viendo la
  // página anterior hasta que llega la nueva.
  const reportes = useQuery({ ...consultaReportes(params), placeholderData: keepPreviousData });
  const distritos = useQuery(consultaDistritos());
  const unidadesVecinales = useQuery(consultaUnidadesVecinales());
  const capas = useQuery(consultaCapasMapa());

  // Reportes completos para el mapa (con los filtros actuales pero sin paginación), para que todos
  // los puntos de la zona aparezcan en el mapa y no solo los 50 de la página de la tabla.
  const paramsMapa = useMemo(() => ({ ...paramsExportacion, limite: '500' }), [paramsExportacion]);
  const reportesMapa = useQuery({
    ...consultaReportes(paramsMapa),
    placeholderData: keepPreviousData,
  });

  /**
   * Dos conteos que la bandeja necesita siempre, con filtros o sin ellos: cuántos esperan
   * revisión y cuántos de esos son críticos. Se piden con `limite=1` porque lo único que se usa
   * es el `total` que devuelve la API, no las filas.
   */
  const nuevos = useQuery(consultaReportes({ estado: 'nuevo', limite: '1' }));
  const criticos = useQuery(
    consultaReportes({ estado: 'nuevo', severidad: 'critica', limite: '1' }),
  );

  const features = reportes.data?.features ?? [];
  const total = reportes.data?.total ?? 0;
  const [resaltado, setResaltado] = useState<string | null>(null);
  const abrir = useCallback((id: string) => router.push(`/reportes/${id}`), [router]);

  const [avisoExportar, setAvisoExportar] = useState<{ tipo: TipoAviso; texto: string } | null>(
    null,
  );
  const exportar = useMutation({
    mutationFn: () => exportarGeoJson(paramsExportacion),
    onMutate: () => setAvisoExportar(null),
    onSuccess: (r) => {
      descargar(r.texto, r.nombreArchivo, 'application/geo+json');
      const aviso = avisoExportacion(r.resumen, formato);
      setAvisoExportar(aviso ? { tipo: 'alerta', texto: aviso } : null);
    },
    onError: (e) => setAvisoExportar({ tipo: 'error', texto: mensajeErrorExportacion(e) }),
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera y aviso de exportación van juntos: vacío, el aviso no suma un hueco más. */}
      <div>
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
            <button
              type="button"
              className="btn btn-secundario"
              data-testid="exportar-geojson"
              onClick={() => exportar.mutate()}
              disabled={exportar.isPending}
              aria-busy={exportar.isPending || undefined}
            >
              <Download size={18} aria-hidden="true" />
              {exportar.isPending ? 'Exportando…' : 'Exportar GeoJSON'}
            </button>
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
        <div className={avisoExportar ? 'mt-4' : undefined}>
          <Aviso tipo={avisoExportar?.tipo ?? 'info'} testId="aviso-exportacion">
            {avisoExportar?.texto}
          </Aviso>
        </div>
        {/* Fijo y no en una región viva: no anuncia un cambio, describe cómo funciona. */}
        <p className="aviso aviso-info mt-4" data-testid="aviso-nuevos-publicos">
          {AVISO_BANDEJA_PUBLICOS}
        </p>
      </div>

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
              ? reportes.data
                ? `No se pudo actualizar la tabla (${reportes.error.message}). Se muestran los últimos datos recibidos.`
                : `No se pudieron cargar los reportes: ${reportes.error.message}`
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
              // Se atenúa solo mientras llega otra página o filtro, no en cada refresco de 10 s.
              <div className={reportes.isPlaceholderData ? 'opacity-70 transition-opacity' : ''}>
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
              reportes={reportesMapa.data?.features ?? features}
              capas={capas.data ?? []}
              onSeleccionar={abrir}
              onSeleccionarDistrito={(d) => cambiarFiltros({ distrito_id: d.id, pagina: 1 })}
              onSeleccionarUv={(u) => cambiarFiltros({ unidad_vecinal_id: u.id, pagina: 1 })}
              seleccionado={resaltado}
              ajustarAPuntos
              className="h-[420px] w-full lg:h-[calc(100dvh-16rem)]"
              ariaLabel="Mapa con los reportes filtrados; hacé clic en un punto para abrirlo"
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
