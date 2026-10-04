'use client';

import type { AgregadoUv, CapaInfo, ResumenEjecutivo } from 'contracts';
import { Filter, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Aviso } from '@/componentes/Aviso';
import { type FeaturePuntoReporte, Mapa } from '@/componentes/Mapa';
import { useFormato } from '@/lib/ciudad-contexto';
import {
  barrasInundaciones,
  barrasTrabajo,
  colorPrincipal,
  conteosPorPestana,
  definicionPestana,
  type PestanaEjecutiva,
  textoAnuncio,
  textoVerificadas,
} from '@/lib/ejecutivo';
import { CriteriosSeveridad } from './CriteriosSeveridad';
import { GraficaInundaciones, GraficaTrabajo } from './Graficas';
import { PestanasSeveridad } from './PestanasSeveridad';

const ID_PANEL = 'panel-ejecutivo-contenido';

/** «crítica y alta», «media»…: cómo se nombra la pestaña dentro de una frase. */
function rotulo(p: PestanaEjecutiva): string {
  return p === 'todas' ? 'todas las severidades' : definicionPestana(p).descripcion.toLowerCase();
}

export function coincideUv(
  repUv: { id?: string; codigo?: string } | null | undefined,
  sel: { id?: string; codigo?: string } | null | undefined,
): boolean {
  if (!repUv || !sel) return false;
  if (repUv.id && sel.id) {
    if (repUv.id === sel.id) return true;
    const cleanId1 = repUv.id
      .replace(/^unidad_vecinal:/i, '')
      .trim()
      .toLowerCase();
    const cleanId2 = sel.id
      .replace(/^unidad_vecinal:/i, '')
      .trim()
      .toLowerCase();
    if (cleanId1 && cleanId2 && cleanId1 === cleanId2) return true;
  }
  if (repUv.codigo && sel.codigo) {
    const c1 = repUv.codigo.trim().toLowerCase();
    const c2 = sel.codigo.trim().toLowerCase();
    if (c1 === c2) return true;
    const num1 = c1.replace(/^uv[-\s]*/i, '');
    const num2 = c2.replace(/^uv[-\s]*/i, '');
    if (num1 && num2 && num1 === num2) return true;
  }
  return false;
}

export interface PropsPanelEjecutivo {
  /** `undefined` mientras carga o si la primera carga falló: nunca se muestran ceros inventados. */
  resumen: ResumenEjecutivo | undefined;
  cargando: boolean;
  /** Error de la última consulta. Con `resumen` presente, los datos son los de la anterior. */
  error: string | null;
  onReintentar: () => void;
  pestana: PestanaEjecutiva;
  onCambiarPestana: (p: PestanaEjecutiva) => void;
  capas?: CapaInfo[];
  reportes?: FeaturePuntoReporte[];
  agregadosUv?: AgregadoUv[];
  uvSeleccionada?: { id: string; codigo: string; nombre: string } | null;
  onSeleccionarUv?: (uv: { id: string; codigo: string; nombre: string } | null) => void;
}

/**
 * Pantalla del rol ejecutivo: la cifra grande, las pestañas de severidad y dos gráficas por
 * distrito. Se actualiza sola cada 10 s (`lib/consultas.ts`) y siempre muestra el histórico.
 */
export function PanelEjecutivo(props: PropsPanelEjecutivo) {
  const { resumen } = props;
  const formato = useFormato();
  const [uvInterna, setUvInterna] = useState<{ id: string; codigo: string; nombre: string } | null>(
    props.uvSeleccionada ?? null,
  );
  const uvSeleccionada = props.uvSeleccionada !== undefined ? props.uvSeleccionada : uvInterna;
  const setUvSeleccionada = props.onSeleccionarUv ?? setUvInterna;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="titular text-3xl">Panel ejecutivo</h1>
      </header>

      {/*
        Regiones vivas, siempre montadas: la primera habla solo cuando cambian las cifras (un
        refresco con los mismos números no la repite); la segunda, cuando un refresco falla y
        quedan a la vista los datos anteriores.
      */}
      <p className="sr-only" role="status" data-testid="ejecutivo-anuncio">
        {resumen ? textoAnuncio(resumen, formato) : ''}
      </p>
      <Aviso tipo="alerta" testId="ejecutivo-sin-actualizar">
        {resumen && props.error
          ? `No se pudo actualizar (${props.error}). Se muestran los últimos datos recibidos.`
          : null}
      </Aviso>

      {resumen ? (
        <div className="space-y-6" data-testid="ejecutivo-contenido">
          <Contenido
            {...props}
            resumen={resumen}
            uvSeleccionada={uvSeleccionada}
            setUvSeleccionada={setUvSeleccionada}
          />
        </div>
      ) : props.cargando ? (
        <p className="text-tinta-600" role="status">
          Cargando el resumen…
        </p>
      ) : (
        <div className="aviso aviso-error" role="alert" data-testid="ejecutivo-error">
          <p className="font-semibold">No se pudo cargar el resumen.</p>
          {props.error ? <p>{props.error}</p> : null}
          <button
            type="button"
            className="btn btn-secundario btn-sm mt-2"
            onClick={props.onReintentar}
          >
            Reintentar
          </button>
        </div>
      )}

      <p className="text-[13.5px] text-tinta-600" data-testid="ejecutivo-nota">
        Son reportes ciudadanos, no mediciones: donde no hay reportes igual puede inundarse, y toda
        obra requiere un estudio técnico.
      </p>
    </div>
  );
}

function Contenido(
  props: PropsPanelEjecutivo & {
    resumen: ResumenEjecutivo;
    uvSeleccionada: { id: string; codigo: string; nombre: string } | null;
    setUvSeleccionada: (uv: { id: string; codigo: string; nombre: string } | null) => void;
  },
) {
  const { resumen, pestana, uvSeleccionada, setUvSeleccionada } = props;
  const formato = useFormato();
  const conteos = conteosPorPestana(resumen.activas.por_severidad);
  const inundaciones = useMemo(() => barrasInundaciones(resumen, pestana), [resumen, pestana]);
  const trabajo = useMemo(() => barrasTrabajo(resumen), [resumen]);
  const [mostrarTodasUvs, setMostrarTodasUvs] = useState(false);

  const uvsAfectadas = useMemo(
    () => (props.agregadosUv ?? []).filter((u) => u.n_reportes > 0),
    [props.agregadosUv],
  );

  const reportesVisibles = useMemo(() => {
    let lista = props.reportes ?? [];
    if (uvSeleccionada) {
      lista = lista.filter((f) => {
        const uv = (f.properties as { unidad_vecinal?: { id?: string; codigo?: string } })
          .unidad_vecinal;
        return coincideUv(uv, uvSeleccionada);
      });
    }
    return lista;
  }, [props.reportes, uvSeleccionada]);

  const uvsAMostrar = mostrarTodasUvs ? uvsAfectadas : uvsAfectadas.slice(0, 8);

  return (
    <>
      <section
        className="tarjeta grid gap-5 p-5 lg:grid-cols-[minmax(220px,auto)_1fr] lg:items-center"
        aria-label="Resumen"
      >
        <div>
          {/* La inundación activa, siempre entera: cada pestaña lleva su propio conteo. */}
          <p className="numero-ejecutivo tabular-nums" data-testid="ejecutivo-total">
            {formato.numero(resumen.activas.total)}
          </p>
          <p className="text-lg font-semibold">inundaciones activas</p>
          <p className="text-[15px] text-tinta-600" data-testid="ejecutivo-verificadas">
            {textoVerificadas(resumen.activas, formato)}
          </p>
        </div>
        <PestanasSeveridad
          conteos={conteos}
          activa={pestana}
          onCambiar={props.onCambiarPestana}
          idPanel={ID_PANEL}
        />
      </section>

      {/* Qué significa cada nivel: la fórmula y los rangos de puntaje, de contracts */}
      <CriteriosSeveridad pestana={pestana} onCambiarPestana={props.onCambiarPestana} />

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Lo único que cambia con la pestaña es esta gráfica. */}
        <div id={ID_PANEL} role="tabpanel" aria-labelledby={`pestana-ej-${pestana}`}>
          <section className="tarjeta h-full p-5" aria-labelledby="ej-titulo-inundaciones">
            <h2 id="ej-titulo-inundaciones" className="titular mb-2 text-xl">
              Inundaciones activas por distrito
            </h2>
            <GraficaInundaciones
              barras={inundaciones}
              color={colorPrincipal(pestana)}
              rotuloSeveridad={rotulo(pestana)}
            />
          </section>
        </div>

        <section className="tarjeta p-5" aria-labelledby="ej-titulo-trabajo">
          <h2 id="ej-titulo-trabajo" className="titular mb-2 text-xl">
            Cómo va el trabajo
          </h2>
          <GraficaTrabajo barras={trabajo} />
        </section>
      </div>

      {/* Mapa interactivo con distritos y unidades vecinales (UV) */}
      <section className="tarjeta p-5 space-y-4" aria-labelledby="ej-titulo-mapa">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="ej-titulo-mapa" className="titular text-xl">
              Distribución territorial y capas UV
            </h2>
            <p className="text-sm text-tinta-600">
              Capas administrativas de distritos municipales y unidades vecinales (UV) con los
              reportes geolocalizados.
            </p>
          </div>
          {uvSeleccionada && (
            <button
              type="button"
              onClick={() => setUvSeleccionada(null)}
              className="btn btn-sm btn-secundario flex items-center gap-1.5"
              data-testid="ejecutivo-quitar-filtro-uv-btn"
            >
              <X size={15} aria-hidden="true" />
              <span>Ver todas las UV</span>
            </button>
          )}
        </div>

        {uvSeleccionada && (
          <div
            className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-sky-200 bg-sky-50 text-sky-950 shadow-sm"
            data-testid="ejecutivo-banner-filtro-uv"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-600 text-white shadow-sm shrink-0">
                <Filter size={16} aria-hidden="true" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-sky-950">
                    Filtro activo: Unidad Vecinal {uvSeleccionada.codigo}
                  </span>
                  {uvSeleccionada.nombre && (
                    <span className="text-xs text-sky-800 bg-sky-100/90 px-2 py-0.5 rounded-md font-medium">
                      {uvSeleccionada.nombre}
                    </span>
                  )}
                </div>
                <p className="text-xs text-sky-800 mt-0.5">
                  Mostrando únicamente los{' '}
                  <strong>{formato.numero(reportesVisibles.length)}</strong> incidentes
                  geolocalizados dentro de esta UV.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setUvSeleccionada(null)}
              className="btn btn-sm bg-white hover:bg-sky-100/80 text-sky-800 border-sky-300 shadow-xs flex items-center gap-1.5"
              title="Quitar filtro de UV y mostrar todos los incidentes"
              data-testid="ejecutivo-quitar-filtro-uv"
            >
              <X size={15} aria-hidden="true" />
              <span>Quitar filtro</span>
            </button>
          </div>
        )}

        <div className="h-[460px] w-full overflow-hidden rounded-lg border border-slate-200">
          <Mapa
            reportes={reportesVisibles}
            capas={props.capas ?? []}
            ajustarAPuntos={Boolean(uvSeleccionada)}
            onSeleccionarUv={(uv) => setUvSeleccionada(uv)}
            className="h-full w-full"
            ariaLabel="Mapa de distritos y unidades vecinales con reportes"
          />
        </div>
      </section>

      {uvsAfectadas.length > 0 && (
        <section className="tarjeta p-5 space-y-3" aria-labelledby="ej-titulo-uvs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="ej-titulo-uvs" className="titular text-xl">
              Unidades Vecinales (UV) con mayor incidencia
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-tinta-600">
                Seleccioná una UV para filtrar incidentes en el mapa
              </span>
              {uvsAfectadas.length > 8 && (
                <button
                  type="button"
                  onClick={() => setMostrarTodasUvs(!mostrarTodasUvs)}
                  className="text-xs font-semibold text-sky-600 hover:text-sky-700 underline cursor-pointer"
                >
                  {mostrarTodasUvs ? 'Ver menos UVs' : `Ver todas (${uvsAfectadas.length})`}
                </button>
              )}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {uvsAMostrar.map((uv) => {
              const estaSeleccionada =
                uvSeleccionada !== null &&
                coincideUv({ id: uv.unidad_vecinal_id, codigo: uv.codigo }, uvSeleccionada);
              return (
                <button
                  key={uv.unidad_vecinal_id}
                  type="button"
                  onClick={() => {
                    if (estaSeleccionada) {
                      setUvSeleccionada(null);
                    } else {
                      setUvSeleccionada({
                        id: uv.unidad_vecinal_id,
                        codigo: uv.codigo,
                        nombre: uv.nombre ?? `UV ${uv.codigo}`,
                      });
                    }
                  }}
                  className={`text-left rounded-lg border p-3 flex flex-col justify-between transition-all cursor-pointer ${
                    estaSeleccionada
                      ? 'border-sky-500 bg-sky-50/80 ring-2 ring-sky-500/20 shadow-sm'
                      : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 hover:border-slate-300'
                  }`}
                  aria-pressed={estaSeleccionada}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div>
                      <span className="font-semibold text-tinta-900">UV {uv.codigo}</span>
                      {uv.nombre && <p className="text-xs text-tinta-600 truncate">{uv.nombre}</p>}
                    </div>
                    {estaSeleccionada && (
                      <span className="rounded bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white shrink-0">
                        FILTRADA
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-right">
                    <span className="text-lg font-bold text-tinta-900">
                      {formato.numero(uv.n_reportes)}
                    </span>
                    <span className="text-xs text-tinta-600 ml-1">reportes</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
