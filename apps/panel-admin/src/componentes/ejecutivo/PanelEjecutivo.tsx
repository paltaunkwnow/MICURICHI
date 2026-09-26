'use client';

import type { ResumenEjecutivo, VentanaResumen } from 'contracts';
import { RefreshCw } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import { Aviso } from '@/componentes/Aviso';
import {
  barrasInundaciones,
  barrasTrabajo,
  colorPrincipal,
  conteosPorPestana,
  definicionPestana,
  type PestanaEjecutiva,
  type RellenoDistritos,
  rellenoDistritos,
  VENTANAS,
} from '@/lib/ejecutivo';
import { fechaHora, numero } from '@/lib/formato';
import { GraficaInundaciones, GraficaTrabajo } from './Graficas';
import { LeyendaEscala } from './LeyendaEscala';
import { PestanasSeveridad } from './PestanasSeveridad';

const ID_PANEL = 'panel-ejecutivo-contenido';

/** «crítica y alta», «media»…: cómo se nombra la pestaña dentro de una frase. */
function rotulo(p: PestanaEjecutiva): string {
  return p === 'todas' ? 'todas las severidades' : definicionPestana(p).descripcion.toLowerCase();
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
  ventana: VentanaResumen;
  onCambiarVentana: (v: VentanaResumen) => void;
  textoActualizado: string;
  actualizando: boolean;
  /** El mapa va por fuera para que este componente se pueda renderizar sin MapLibre (tests). */
  mapa: (relleno: RellenoDistritos, ariaLabel: string) => ReactNode;
}

export function PanelEjecutivo(props: PropsPanelEjecutivo) {
  const { resumen, pestana, ventana } = props;
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="titular text-3xl">Panel ejecutivo</h1>
          <p className="text-tinta-600">Dónde y cuánto se está inundando, y cómo va el trabajo.</p>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ejecutivo-ventana" className="text-[13.5px] font-semibold text-tinta-600">
            Período
          </label>
          <select
            id="ejecutivo-ventana"
            className="campo min-w-52"
            data-testid="ejecutivo-ventana"
            value={ventana}
            onChange={(e) => props.onCambiarVentana(e.target.value as VentanaResumen)}
          >
            {VENTANAS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.etiqueta}
              </option>
            ))}
          </select>
        </div>
      </header>

      {resumen ? (
        <Contenido {...props} resumen={resumen} pestana={pestana} />
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

      <p className="ayuda">
        Son reportes ciudadanos: datos de percepción, no mediciones. La ausencia de reportes en un
        distrito no significa que ahí no se inunde. Cualquier decisión de obra o inversión requiere
        un estudio técnico formal.
      </p>
    </div>
  );
}

function Contenido(props: PropsPanelEjecutivo & { resumen: ResumenEjecutivo }) {
  const { resumen, pestana } = props;
  const conteos = conteosPorPestana(resumen.por_severidad);
  const relleno = useMemo(() => rellenoDistritos(resumen, pestana), [resumen, pestana]);
  const inundaciones = useMemo(() => barrasInundaciones(resumen, pestana), [resumen, pestana]);
  const trabajo = useMemo(() => barrasTrabajo(resumen), [resumen]);
  const nombreSeveridad = rotulo(pestana);

  return (
    <>
      {props.error ? (
        <Aviso tipo="alerta" testId="ejecutivo-sin-actualizar">
          No se pudo actualizar ({props.error}). Se muestran los últimos datos recibidos.
        </Aviso>
      ) : null}

      <section
        className="tarjeta grid gap-5 p-5 lg:grid-cols-[minmax(220px,auto)_1fr] lg:items-center"
        aria-label="Resumen"
      >
        <div>
          {/* El número grande sigue a la pestaña: «Media» muestra cuántos son de severidad media. */}
          <p className="numero-ejecutivo tabular-nums" data-testid="ejecutivo-total">
            {numero(conteos[pestana])}
          </p>
          <p className="text-lg font-semibold">reportes de inundación</p>
          {pestana !== 'todas' ? (
            <p className="text-[13.5px] text-tinta-600">
              {definicionPestana(pestana).descripcion} · de {numero(resumen.total)} en total
            </p>
          ) : null}
          <p className="text-[13.5px] text-tinta-600">
            <span aria-live="polite" aria-atomic="true" data-testid="ejecutivo-actualizado">
              {props.textoActualizado}
            </span>
            {props.actualizando ? (
              <span className="ml-2 inline-flex items-center gap-1">
                <RefreshCw size={13} aria-hidden="true" className="animate-spin" />
                actualizando…
              </span>
            ) : null}
          </p>
          {resumen.ultimo_reporte_en ? (
            <p className="text-[13.5px] text-tinta-600">
              Último reporte: {fechaHora(resumen.ultimo_reporte_en)}
            </p>
          ) : null}
        </div>
        <PestanasSeveridad
          conteos={conteos}
          activa={pestana}
          onCambiar={props.onCambiarPestana}
          idPanel={ID_PANEL}
        />
      </section>

      <div
        id={ID_PANEL}
        role="tabpanel"
        aria-labelledby={`pestana-ej-${pestana}`}
        className="grid gap-6 xl:grid-cols-2"
      >
        <section className="tarjeta p-5" aria-labelledby="ej-titulo-mapa">
          <h2 id="ej-titulo-mapa" className="titular text-xl">
            Dónde se inunda
          </h2>
          <p className="text-[15px] text-tinta-600">
            Distritos coloreados por cantidad de reportes ({nombreSeveridad}). Pasá o tocá un
            distrito para ver su nombre y su conteo.
          </p>
          <div className="mt-3">
            {props.mapa(
              relleno,
              `Mapa de distritos coloreados por cantidad de reportes, ${nombreSeveridad}. Los mismos datos están en la gráfica «Inundaciones por distrito».`,
            )}
          </div>
          <LeyendaEscala escala={relleno.escala} titulo="Reportes por distrito" />
        </section>

        <div className="grid gap-6">
          <section className="tarjeta p-5" aria-labelledby="ej-titulo-inundaciones">
            <h2 id="ej-titulo-inundaciones" className="titular text-xl">
              Inundaciones por distrito
            </h2>
            <p className="mb-2 text-[15px] text-tinta-600">
              Reportes activos por distrito ({nombreSeveridad}).
            </p>
            <GraficaInundaciones
              barras={inundaciones}
              color={colorPrincipal(pestana)}
              rotuloSeveridad={nombreSeveridad}
            />
          </section>

          <section className="tarjeta p-5" aria-labelledby="ej-titulo-trabajo">
            <h2 id="ej-titulo-trabajo" className="titular text-xl">
              Cómo va el trabajo
            </h2>
            <p className="mb-2 text-[15px] text-tinta-600">
              Reportes por estado en cada distrito, todas las severidades.
            </p>
            <GraficaTrabajo barras={trabajo} />
          </section>
        </div>
      </div>
    </>
  );
}
