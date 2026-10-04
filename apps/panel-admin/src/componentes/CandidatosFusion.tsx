'use client';

import {
  type CandidatoFusion,
  etiquetaDistancia,
  etiquetaRadio,
  radiosMayores,
} from '@/lib/fusion-cercana';

/**
 * La lista de reportes cercanos con los que se puede fusionar uno (el reporte canónico, el que se
 * conserva). Solo se elige de la lista: no hay campo para pegar un ID. Es un grupo de radios
 * nativos con rótulo (el rótulo dice el radio vigente), así que se recorre con Tab y las flechas, y
 * cada opción dice en texto el ID corto, la UV, la distancia y el comienzo de la descripción.
 *
 * Es solo presentación: la consulta, el filtro por distancia y el radio viven en `PanelAcciones`
 * (`lib/fusion-cercana.ts`). Sin hooks, para que las pruebas puedan llamarla como función.
 */

const ID_AYUDA = 'ayuda-fusion-cercanos';

export interface PropsCandidatosFusion {
  estado: 'cargando' | 'error' | 'listo';
  /** Radio de la búsqueda vigente, en metros. */
  radioM: number;
  /** Ya filtrados por distancia y ordenados del más cercano al más lejano. */
  candidatos: readonly CandidatoFusion[];
  /** Aviso de respuesta recortada (`avisoRecorte`), o `null`. */
  aviso: string | null;
  /** Id del reporte elegido; '' = ninguno. */
  elegido: string;
  onElegir: (id: string) => void;
  /** Buscar hasta ese radio, en metros. */
  onAmpliar: (radioM: number) => void;
  onReintentar: () => void;
}

/** «Hay 3 reportes validados a menos de 100 m, del más cercano al más lejano.» */
function resumenDeResultados(n: number, radio: string): string {
  return n === 1
    ? `Hay 1 reporte validado a menos de ${radio}.`
    : `Hay ${n} reportes validados a menos de ${radio}, del más cercano al más lejano.`;
}

export function CandidatosFusion({
  estado,
  radioM,
  candidatos,
  aviso,
  elegido,
  onElegir,
  onAmpliar,
  onReintentar,
}: PropsCandidatosFusion) {
  const radio = etiquetaRadio(radioM);
  return (
    <fieldset
      className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0"
      aria-describedby={ID_AYUDA}
      data-testid="fusion-cercanos"
    >
      <legend className="mb-1 font-semibold">{`Reportes validados a menos de ${radio}`}</legend>
      <p id={ID_AYUDA} className="ayuda">
        Elegí el reporte que se conserva: este se suma a él como duplicado. Tiene que estar
        validado.
      </p>

      {/* Siempre montada, aunque vacía: así el lector de pantalla anuncia cuando llega el resultado. */}
      <output aria-live="polite" className="block" data-testid="fusion-estado">
        {estado === 'cargando' && (
          <p className="text-tinta-600" data-testid="fusion-cargando">
            Buscando reportes validados cerca…
          </p>
        )}
        {estado === 'listo' && candidatos.length === 0 && (
          <p data-testid="fusion-sin-cercanos">{`No hay reportes validados a menos de ${radio}.`}</p>
        )}
        {estado === 'listo' && candidatos.length > 0 && (
          <p data-testid="fusion-con-cercanos">{resumenDeResultados(candidatos.length, radio)}</p>
        )}
        {aviso ? (
          <p className="aviso aviso-alerta mt-2" data-testid="fusion-recorte">
            {aviso}
          </p>
        ) : null}
      </output>

      {estado === 'error' && (
        <div className="flex flex-col items-start gap-2" data-testid="fusion-error">
          <p className="error" role="alert">
            No pudimos buscar reportes cercanos. Revisá la conexión e intentá de nuevo.
          </p>
          <button
            type="button"
            className="btn btn-secundario"
            data-testid="fusion-reintentar"
            onClick={onReintentar}
          >
            Reintentar
          </button>
        </div>
      )}

      {estado === 'listo' && candidatos.length === 0 && radiosMayores(radioM).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {radiosMayores(radioM).map((mayor) => (
            <button
              key={mayor}
              type="button"
              className="btn btn-secundario"
              data-testid={`fusion-ampliar-${mayor}`}
              onClick={() => onAmpliar(mayor)}
            >
              {`Buscar hasta ${etiquetaRadio(mayor)}`}
            </button>
          ))}
        </div>
      )}

      {estado === 'listo' && candidatos.length > 0 && (
        <div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
          {candidatos.map((c) => (
            <label
              key={c.id}
              className="opcion-radio"
              data-testid="fusion-candidato"
              data-id={c.id}
            >
              <input
                type="radio"
                name="canonico"
                value={c.id}
                checked={elegido === c.id}
                onChange={() => onElegir(c.id)}
              />
              <span className="flex min-w-0 flex-col">
                <span>
                  <span className="font-mono font-semibold">{c.idCorto}</span>
                  {` · ${c.unidadVecinal} · `}
                  <strong>{etiquetaDistancia(c.distanciaM)}</strong>
                </span>
                {c.descripcion ? (
                  <span className="break-words text-[13.5px] text-tinta-600">{c.descripcion}</span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
