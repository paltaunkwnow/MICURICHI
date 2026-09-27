'use client';

import type { ResumenEjecutivo } from 'contracts';
import { useMemo } from 'react';
import { Aviso } from '@/componentes/Aviso';
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
import { GraficaInundaciones, GraficaTrabajo } from './Graficas';
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
}

/**
 * Pantalla del rol ejecutivo: la cifra grande, las pestañas de severidad y dos gráficas por
 * distrito. Se actualiza sola cada 10 s (`lib/consultas.ts`) y siempre muestra el histórico.
 */
export function PanelEjecutivo(props: PropsPanelEjecutivo) {
  const { resumen } = props;
  const formato = useFormato();
  return (
    <div className="space-y-6">
      <h1 className="titular text-3xl">Panel ejecutivo</h1>

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

      <p className="text-[13.5px] text-tinta-600" data-testid="ejecutivo-nota">
        Son reportes ciudadanos, no mediciones: donde no hay reportes igual puede inundarse, y toda
        obra requiere un estudio técnico.
      </p>
    </div>
  );
}

function Contenido(props: PropsPanelEjecutivo & { resumen: ResumenEjecutivo }) {
  const { resumen, pestana } = props;
  const formato = useFormato();
  const conteos = conteosPorPestana(resumen.activas.por_severidad);
  const inundaciones = useMemo(() => barrasInundaciones(resumen, pestana), [resumen, pestana]);
  const trabajo = useMemo(() => barrasTrabajo(resumen), [resumen]);

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
    </>
  );
}
