'use client';

import { FRECUENCIAS, PESOS, PROFUNDIDADES, PUNTOS } from 'contracts';
import { definicionPestana, type PestanaEjecutiva, rangoPuntajePestana } from '@/lib/ejecutivo';
import { etiquetaFrecuencia, etiquetaProfundidad, etiquetaSeveridad } from '@/lib/formato';
import { formulaPuntaje, profundidadesSiempreCriticas, textoRango } from '@/lib/severidad';

/** Cómo se dibuja cada tarjeta. Qué dice (rangos, reglas) sale de contracts, no de acá. */
const TARJETAS = [
  {
    id: 'critica',
    etiqueta: 'Crítica (y Alta)',
    colorDot: '#B3200A',
    bordeActivo: 'border-red-500 bg-red-50/60 ring-2 ring-red-500/20 shadow-sm',
  },
  {
    id: 'media',
    etiqueta: 'Media',
    colorDot: '#C98A0E',
    bordeActivo: 'border-amber-500 bg-amber-50/60 ring-2 ring-amber-500/20 shadow-sm',
  },
  {
    id: 'baja',
    etiqueta: 'Baja',
    colorDot: '#28934D',
    bordeActivo: 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-500/20 shadow-sm',
  },
] as const satisfies ReadonlyArray<{
  id: PestanaEjecutiva;
  etiqueta: string;
  colorDot: string;
  bordeActivo: string;
}>;

const ROTULO = 'block text-[11px] font-semibold uppercase tracking-wider text-tinta-500';

function textoPuntos(n: number): string {
  return `${n} ${n === 1 ? 'punto' : 'puntos'}`;
}

/** «Profundidad ×2»: el peso solo se escribe si cuenta más que una vez. */
function tituloDeVariable(nombre: string, peso: number): string {
  return peso === 1 ? nombre : `${nombre} ×${peso}`;
}

function ListaDePuntos({
  titulo,
  filas,
}: {
  titulo: string;
  filas: ReadonlyArray<{ clave: string; etiqueta: string; puntos: number }>;
}) {
  return (
    <div>
      <h3 className={ROTULO}>{titulo}</h3>
      <dl className="mt-1 space-y-0.5">
        {filas.map((f) => (
          <div key={f.clave} className="flex items-baseline justify-between gap-3">
            <dt className="text-tinta-700">{f.etiqueta}</dt>
            <dd className="m-0 font-semibold tabular-nums text-tinta-900">
              {textoPuntos(f.puntos)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Qué significa cada nivel de severidad en el panel ejecutivo: la fórmula del puntaje, los puntos
 * de cada respuesta y el rango de puntaje de cada tarjeta. Todo sale de `contracts` (CLAUDE.md
 * §9.1): la pantalla no cuenta nada que la función de severidad no haga, y no dice qué hace el
 * municipio con cada nivel porque eso no lo sabe el sistema. Las tarjetas siguen las pestañas de
 * severidad (la de «Crítica» junta alta y crítica) y tocarlas cambia la pestaña.
 *
 * Sin hooks, a propósito: así se puede probar sin navegador, llamándolo como una función.
 */
export function CriteriosSeveridad({
  pestana,
  onCambiarPestana,
}: {
  pestana: PestanaEjecutiva;
  onCambiarPestana: (p: PestanaEjecutiva) => void;
}) {
  const siempreCriticas = profundidadesSiempreCriticas();

  return (
    <section
      className="tarjeta p-5 space-y-4"
      aria-labelledby="ej-titulo-criterios"
      data-testid="ejecutivo-criterios"
    >
      <div className="border-b border-slate-100 pb-3">
        <h2 id="ej-titulo-criterios" className="titular text-xl">
          Significado de los niveles de severidad
        </h2>
        <p className="text-sm text-tinta-600 mt-1">
          Cada reporte suma puntos por la profundidad del agua y por cuánto se repite; el puntaje
          decide su nivel.
        </p>
      </div>

      <div
        className="space-y-3 rounded-xl bg-slate-50/70 p-4 text-sm"
        data-testid="ejecutivo-formula"
      >
        <p className="font-semibold text-tinta-900">{formulaPuntaje()}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <ListaDePuntos
            titulo={tituloDeVariable('Profundidad', PESOS.profundidad)}
            filas={PROFUNDIDADES.map((p) => ({
              clave: p,
              etiqueta: etiquetaProfundidad(p),
              puntos: PUNTOS.profundidad[p],
            }))}
          />
          <ListaDePuntos
            titulo={tituloDeVariable('Frecuencia', PESOS.frecuencia)}
            filas={FRECUENCIAS.map((f) => ({
              clave: f,
              etiqueta: etiquetaFrecuencia(f),
              puntos: PUNTOS.frecuencia[f],
            }))}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {TARJETAS.map((c) => {
          const destacada = pestana === c.id;
          const seleccionada = pestana === 'todas' || destacada;
          const rango = rangoPuntajePestana(c.id);
          // La regla de escalamiento sube a crítica: se cuenta donde está la crítica.
          const escala =
            siempreCriticas.length > 0 && definicionPestana(c.id).severidades.includes('critica');
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onCambiarPestana(c.id)}
              className={`text-left rounded-xl border p-4 transition-all duration-200 cursor-pointer ${
                destacada
                  ? c.bordeActivo
                  : seleccionada
                    ? 'border-slate-200 bg-slate-50/40 hover:border-slate-300'
                    : 'border-slate-200 bg-white opacity-70 hover:opacity-100 hover:border-slate-300'
              }`}
              aria-pressed={destacada}
              data-testid={`ejecutivo-criterio-${c.id}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="flex h-3 w-3 rounded-full shrink-0"
                  style={{ backgroundColor: c.colorDot }}
                  aria-hidden="true"
                />
                <span className="font-bold text-tinta-900">{c.etiqueta}</span>
              </div>
              <div className="mt-3 space-y-2.5 text-sm">
                <div>
                  <span className={ROTULO}>Rango de puntaje</span>
                  <p className="font-medium text-tinta-900">{`${textoRango(rango)} puntos`}</p>
                </div>
                {rango.bandas.length > 1 && (
                  <div>
                    <span className={ROTULO}>Por nivel</span>
                    <p className="text-tinta-700 leading-snug">
                      {rango.bandas
                        .map((b) => `${etiquetaSeveridad(b.banda)}: ${textoRango(b)}`)
                        .join(' · ')}
                    </p>
                  </div>
                )}
                {escala && (
                  <div>
                    <span className={ROTULO}>Regla de escalamiento</span>
                    <p className="text-tinta-700 leading-snug">
                      {`Con profundidad «${siempreCriticas.map((p) => etiquetaProfundidad(p)).join('» o «')}», la severidad es siempre crítica, sea cual sea el puntaje.`}
                    </p>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-tinta-600">
        Parámetros iniciales, a validar con el técnico municipal.
      </p>
    </section>
  );
}
