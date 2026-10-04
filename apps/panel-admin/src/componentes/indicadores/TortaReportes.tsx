'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId } from 'react';
import { useFormato } from '@/lib/ciudad-contexto';
import { caminoDona, type Porcion, totalPorciones } from '@/lib/indicadores-torta';

/**
 * Torta (dona) de reportes: la imagen es el SVG (solo para el ojo, `aria-hidden`, clic con el
 * ratón); la identidad y los valores viven SIEMPRE en la leyenda de al lado, una tabla accesible
 * con nombre + número + porcentaje. Así el color nunca es el único canal (skill dataviz: la leyenda
 * es el «relief» obligatorio porque algunos colores no llegan a 3:1 sobre blanco) y el teclado opera
 * todo desde las filas (botón o enlace nativos, con foco visible).
 *
 * `accion` decide qué hace tocar una porción (que no sea «Otros»):
 * - `seleccion`: alterna un distrito (la fila es un botón con `aria-pressed`; la torta de UV se
 *   acota a ese distrito).
 * - `enlace`: abre la bandeja filtrada (la fila es un enlace; la porción navega con el ratón).
 */

const TAMANO = 220;
const CENTRO = TAMANO / 2;
const R_EXTERNO = 100;
const R_INTERNO = 62;

export type AccionTorta =
  | {
      modo: 'seleccion';
      seleccionado: string | null;
      onActivar: (p: Porcion) => void;
      pista: string;
    }
  | { modo: 'enlace'; href: (p: Porcion) => string; pista: string };

export function TortaReportes({
  titulo,
  subtitulo,
  porciones,
  unidadCentro,
  vacioTexto,
  accion,
  testId,
}: {
  titulo: string;
  subtitulo?: string;
  porciones: Porcion[];
  /** Palabra bajo el número grande del centro, p. ej. «reportes». */
  unidadCentro: string;
  vacioTexto: string;
  accion?: AccionTorta;
  testId: string;
}) {
  const { numero } = useFormato();
  const router = useRouter();
  const tituloId = useId();
  const total = totalPorciones(porciones);

  const textoPorcion = (p: Porcion) =>
    `${p.nombre}: ${numero(p.n)} ${p.n === 1 ? 'reporte' : 'reportes'}, ${p.porcentaje} %`;

  const seleccionActiva = accion?.modo === 'seleccion' ? accion.seleccionado : null;
  const interactiva = (p: Porcion) => Boolean(accion) && !p.esOtros;

  const alClicPorcion = (p: Porcion) => {
    if (!accion || p.esOtros) return;
    if (accion.modo === 'seleccion') accion.onActivar(p);
    else router.push(accion.href(p));
  };

  return (
    <figure className="tarjeta m-0 p-5" aria-labelledby={tituloId} data-testid={testId}>
      <figcaption id={tituloId}>
        <span className="titular text-xl">{titulo}</span>
        {subtitulo ? (
          <span className="mt-1 block text-[13.5px] text-tinta-600">{subtitulo}</span>
        ) : null}
      </figcaption>

      {porciones.length === 0 ? (
        <p className="mt-4 text-tinta-600" role="status" data-testid={`${testId}-vacio`}>
          {vacioTexto}
        </p>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-5 md:flex-row md:items-start">
          <svg
            viewBox={`0 0 ${TAMANO} ${TAMANO}`}
            className="h-[200px] w-[200px] shrink-0"
            aria-hidden="true"
          >
            {porciones.map((p) => {
              const atenuada = seleccionActiva !== null && !p.esOtros && p.id !== seleccionActiva;
              const resaltada = seleccionActiva !== null && p.id === seleccionActiva;
              return (
                // El SVG es `aria-hidden`: solo decora y da un atajo con el ratón. La identidad y
                // el teclado viven en la leyenda de al lado (botón o enlace con foco visible), que
                // hace lo mismo que tocar la porción, así que la porción no necesita rol ni foco.
                // biome-ignore lint/a11y/noStaticElementInteractions: porción decorativa con control accesible gemelo en la leyenda
                <path
                  key={p.id}
                  d={caminoDona(CENTRO, CENTRO, R_EXTERNO, R_INTERNO, p.gradoInicio, p.gradoFin)}
                  fill={p.color}
                  fillRule="evenodd"
                  stroke={resaltada ? '#0f2d43' : '#fff'}
                  strokeWidth={resaltada ? 3 : 2}
                  opacity={atenuada ? 0.4 : 1}
                  style={{ cursor: interactiva(p) ? 'pointer' : 'default' }}
                  onClick={interactiva(p) ? () => alClicPorcion(p) : undefined}
                >
                  <title>{textoPorcion(p)}</title>
                </path>
              );
            })}
            <text
              x={CENTRO}
              y={CENTRO - 2}
              textAnchor="middle"
              fontSize={30}
              fontWeight={700}
              fill="#0f2d43"
            >
              {numero(total)}
            </text>
            <text x={CENTRO} y={CENTRO + 20} textAnchor="middle" fontSize={14} fill="#3e5468">
              {unidadCentro}
            </text>
          </svg>

          <div className="w-full min-w-0 overflow-x-auto">
            <table className="tabla w-full" data-testid={`${testId}-leyenda`}>
              <caption className="sr-only">
                {titulo}. {numero(total)} {unidadCentro} en total.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Categoría</th>
                  <th scope="col" className="numero">
                    Reportes
                  </th>
                  <th scope="col" className="numero">
                    Porcentaje
                  </th>
                </tr>
              </thead>
              <tbody>
                {porciones.map((p) => (
                  <tr key={p.id} data-id={p.id}>
                    <th scope="row" className="font-normal">
                      <FilaNombre
                        porcion={p}
                        accion={interactiva(p) ? accion : undefined}
                        seleccionado={seleccionActiva === p.id}
                        etiquetaAccesible={textoPorcion(p)}
                        onActivar={alClicPorcion}
                      />
                    </th>
                    <td className="numero">{numero(p.n)}</td>
                    <td className="numero">{p.porcentaje} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </figure>
  );
}

/** Punto de color + nombre, como botón (selección), enlace (bandeja) o texto plano («Otros»). */
function FilaNombre({
  porcion,
  accion,
  seleccionado,
  etiquetaAccesible,
  onActivar,
}: {
  porcion: Porcion;
  accion?: AccionTorta;
  seleccionado: boolean;
  etiquetaAccesible: string;
  onActivar: (p: Porcion) => void;
}) {
  const punto = (
    <span
      className="inline-block h-3 w-3 shrink-0 rounded-full"
      style={{ background: porcion.color }}
      aria-hidden="true"
    />
  );

  if (!accion) {
    return (
      <span className="inline-flex items-center gap-2 py-1">
        {punto}
        {porcion.nombre}
      </span>
    );
  }

  const clases =
    'inline-flex min-h-[28px] items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-tinta-100';

  if (accion.modo === 'enlace') {
    return (
      <Link
        href={accion.href(porcion)}
        className={clases}
        aria-label={`${etiquetaAccesible}. ${accion.pista}`}
      >
        {punto}
        <span className="underline-offset-2 hover:underline">{porcion.nombre}</span>
      </Link>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={seleccionado}
      onClick={() => onActivar(porcion)}
      aria-label={`${etiquetaAccesible}. ${accion.pista}`}
      className={`${clases} ${seleccionado ? 'bg-tinta-100 font-semibold' : ''}`}
    >
      {punto}
      <span>{porcion.nombre}</span>
      {seleccionado ? <span className="text-[12px] text-tinta-600">(elegido)</span> : null}
    </button>
  );
}
