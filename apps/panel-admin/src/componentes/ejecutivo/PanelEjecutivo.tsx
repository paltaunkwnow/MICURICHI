'use client';

import type { ResumenEjecutivo, VentanaResumen } from 'contracts';
import { RefreshCw } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import { Aviso } from '@/componentes/Aviso';
import { useFormato } from '@/lib/ciudad-contexto';
import {
  barrasInundaciones,
  barrasTrabajo,
  colorPrincipal,
  conteosPorPestana,
  definicionPestana,
  distritosCapaAnterior,
  type FilaCapaAnterior,
  type PestanaEjecutiva,
  type RellenoDistritos,
  rellenoDistritos,
  textoActualizadoDesde,
  textoAnuncio,
  textoVerificadas,
  VENTANAS,
} from '@/lib/ejecutivo';
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
  /**
   * true mientras se ven las cifras del período anterior esperando las del elegido: se atenúan y
   * se dice que está cargando, para que nadie lea las viejas bajo la etiqueta nueva.
   */
  cargandoPeriodo: boolean;
  /** Error de la última consulta. Con `resumen` presente, los datos son los de la anterior. */
  error: string | null;
  onReintentar: () => void;
  pestana: PestanaEjecutiva;
  onCambiarPestana: (p: PestanaEjecutiva) => void;
  ventana: VentanaResumen;
  onCambiarVentana: (v: VentanaResumen) => void;
  /** Reloj del navegador: «actualizado hace…» se mide contra `resumen.generado_en`. */
  ahora: number;
  actualizando: boolean;
  /** El mapa va por fuera para que este componente se pueda renderizar sin MapLibre (tests). */
  mapa: (relleno: RellenoDistritos, ariaLabel: string) => ReactNode;
}

export function PanelEjecutivo(props: PropsPanelEjecutivo) {
  const { resumen, ventana } = props;
  const formato = useFormato();
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
          {props.cargandoPeriodo ? (
            <p
              className="text-[13.5px] font-semibold text-tinta-600"
              data-testid="ejecutivo-cargando-periodo"
            >
              Cargando el período…
            </p>
          ) : null}
        </div>
      </header>

      {/*
        Regiones vivas, siempre montadas: la primera habla solo cuando cambian las cifras (no con
        el reloj de «actualizado hace…», que antes se anunciaba cada 10 s); la segunda, cuando un
        refresco falla y quedan a la vista los datos anteriores.
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
        <div
          className={
            props.cargandoPeriodo
              ? 'space-y-6 opacity-50 transition-opacity'
              : 'space-y-6 transition-opacity'
          }
          aria-busy={props.cargandoPeriodo ? true : undefined}
          data-testid="ejecutivo-contenido"
        >
          <Contenido {...props} resumen={resumen} />
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
  const formato = useFormato();
  const { numero, fechaHora } = formato;
  const conteos = conteosPorPestana(resumen.activas.por_severidad);
  const relleno = useMemo(
    () => rellenoDistritos(resumen, pestana, formato),
    [resumen, pestana, formato],
  );
  const inundaciones = useMemo(() => barrasInundaciones(resumen, pestana), [resumen, pestana]);
  const trabajo = useMemo(() => barrasTrabajo(resumen), [resumen]);
  const anteriores = useMemo(() => distritosCapaAnterior(resumen, pestana), [resumen, pestana]);
  const nombreSeveridad = rotulo(pestana);

  return (
    <>
      <section
        className="tarjeta grid gap-5 p-5 lg:grid-cols-[minmax(220px,auto)_1fr] lg:items-center"
        aria-label="Resumen"
      >
        <div>
          {/* La inundación activa, siempre entera: cada pestaña lleva su propio conteo. */}
          <p className="numero-ejecutivo tabular-nums" data-testid="ejecutivo-total">
            {numero(resumen.activas.total)}
          </p>
          <p className="text-lg font-semibold">inundaciones activas</p>
          <p className="text-[15px] text-tinta-600" data-testid="ejecutivo-verificadas">
            {textoVerificadas(resumen.activas, formato)}
          </p>
          {props.cargandoPeriodo ? null : (
            <p className="text-[13.5px] text-tinta-600">
              <span data-testid="ejecutivo-actualizado">
                {textoActualizadoDesde(resumen.generado_en, props.ahora)}
              </span>
              {props.actualizando ? (
                <span className="ml-2 inline-flex items-center gap-1">
                  <RefreshCw size={13} aria-hidden="true" className="animate-spin" />
                  actualizando…
                </span>
              ) : null}
            </p>
          )}
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
            Distritos coloreados por inundaciones activas ({nombreSeveridad}). Pasá o tocá un
            distrito para ver su nombre y su conteo.
          </p>
          <div className="mt-3">
            {props.mapa(
              relleno,
              `Mapa de distritos coloreados por inundaciones activas, ${nombreSeveridad}. Los mismos datos están en la gráfica «Inundaciones activas por distrito».`,
            )}
          </div>
          <LeyendaEscala escala={relleno.escala} titulo="Inundaciones activas por distrito" />
        </section>

        <div className="grid gap-6">
          <section className="tarjeta p-5" aria-labelledby="ej-titulo-inundaciones">
            <h2 id="ej-titulo-inundaciones" className="titular text-xl">
              Inundaciones activas por distrito
            </h2>
            <p className="mb-2 text-[15px] text-tinta-600">
              En revisión o verificadas, por distrito ({nombreSeveridad}).
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

        {anteriores.length ? (
          <CapaAnterior filas={anteriores} nombreSeveridad={nombreSeveridad} />
        ) : null}
      </div>
    </>
  );
}

/**
 * Distritos que solo existen en una capa anterior: no tienen polígono en el mapa vigente y su
 * código acortado puede repetir el de uno vigente, así que van aparte y con el código completo.
 */
function CapaAnterior({
  filas,
  nombreSeveridad,
}: {
  filas: FilaCapaAnterior[];
  nombreSeveridad: string;
}) {
  const { numero } = useFormato();
  return (
    <section
      className="tarjeta p-5 xl:col-span-2"
      aria-labelledby="ej-titulo-capa-anterior"
      data-testid="ejecutivo-capa-anterior"
    >
      <h2 id="ej-titulo-capa-anterior" className="titular text-xl">
        De una capa anterior
      </h2>
      <p className="mb-2 text-[15px] text-tinta-600">
        Distritos que ya no están en la capa oficial vigente: sus reportes se ubicaron con una
        versión anterior. No se dibujan en el mapa ni cuentan para su escala de colores.
      </p>
      <div className="overflow-x-auto">
        <table className="tabla">
          <caption className="sr-only">Distritos de una capa anterior</caption>
          <thead>
            <tr>
              <th scope="col">Distrito</th>
              <th scope="col" className="numero">
                Activas ({nombreSeveridad})
              </th>
              <th scope="col" className="numero">
                En revisión
              </th>
              <th scope="col" className="numero">
                Validados
              </th>
              <th scope="col" className="numero">
                Resueltos
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((d) => (
              <tr key={d.distrito_id}>
                <th scope="row">{`${d.codigo} · ${d.nombre}`}</th>
                <td className="numero">{numero(d.activas)}</td>
                <td className="numero">{numero(d.por_estado.nuevo)}</td>
                <td className="numero">{numero(d.por_estado.validado)}</td>
                <td className="numero">{numero(d.por_estado.resuelto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
