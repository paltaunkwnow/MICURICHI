import { type ReactNode, useId } from 'react';
import { useFormato } from '@/lib/ciudad-contexto';
import {
  type BarraApilada,
  type BarraSimple,
  type EstadoTrabajo,
  marcasEje,
  SEGMENTOS_TRABAJO,
} from '@/lib/ejecutivo';

/**
 * Gráficas de barras del panel ejecutivo en SVG inline, sin librerías. El SVG es la imagen
 * (`role="img"` con título y descripción); los datos para lectores de pantalla van en una tabla
 * `sr-only` al lado, que es lo que se puede recorrer celda por celda.
 */

const ANCHO = 640;
const ALTO = 300;
const M = { izq: 44, der: 12, arriba: 26, abajo: 34 };
const ANCHO_UTIL = ANCHO - M.izq - M.der;
const ALTO_UTIL = ALTO - M.arriba - M.abajo;
/** Tinta 600 sobre blanco: 7,9:1. Los números del eje tienen que leerse. */
const COLOR_EJE = '#3E5468';
const COLOR_TEXTO = '#0F2D43';
const COLOR_GUIA = '#D7DFDA';
/** «Otros» no es un distrito: va en gris neutro (4,4:1 sobre blanco) en todas las pestañas. */
const COLOR_OTROS = '#6B7B8A';

/** Los ids de `useId` traen caracteres que no conviene meter en `url(#…)`. */
function idSeguro(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, '');
}

function Eje({ marcas, escalaY }: { marcas: number[]; escalaY: (v: number) => number }) {
  const { numero } = useFormato();
  return (
    <g>
      {marcas.map((v) => (
        <g key={v}>
          <line x1={M.izq} x2={ANCHO - M.der} y1={escalaY(v)} y2={escalaY(v)} stroke={COLOR_GUIA} />
          <text
            x={M.izq - 8}
            y={escalaY(v)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize={13}
            fill={COLOR_EJE}
          >
            {numero(v)}
          </text>
        </g>
      ))}
    </g>
  );
}

function geometria(n: number, maximo: number) {
  const marcas = marcasEje(maximo);
  const tope = marcas.at(-1) ?? 1;
  const banda = ANCHO_UTIL / Math.max(1, n);
  const anchoBarra = Math.min(40, banda * 0.64);
  return {
    marcas,
    banda,
    anchoBarra,
    escalaY: (v: number) => M.arriba + ALTO_UTIL - (v / tope) * ALTO_UTIL,
    xBarra: (i: number) => M.izq + i * banda + (banda - anchoBarra) / 2,
    xCentro: (i: number) => M.izq + i * banda + banda / 2,
  };
}

function Marco({
  titulo,
  descripcion,
  testId,
  uid,
  defs,
  children,
}: {
  titulo: string;
  descripcion: string;
  testId: string;
  uid: string;
  defs?: ReactNode;
  children: ReactNode;
}) {
  return (
    // Con 16 distritos las etiquetas no entran en un celular: la gráfica se desplaza sola,
    // la página no.
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        width="100%"
        className="block min-w-[520px]"
        role="img"
        aria-labelledby={`${uid}-t ${uid}-d`}
        data-testid={testId}
      >
        <title id={`${uid}-t`}>{titulo}</title>
        <desc id={`${uid}-d`}>{descripcion}</desc>
        {defs ? <defs>{defs}</defs> : null}
        {children}
      </svg>
    </div>
  );
}

// --- Inundaciones activas por distrito ----------------------------------------------------------

export function GraficaInundaciones({
  barras,
  color,
  rotuloSeveridad,
}: {
  barras: BarraSimple[];
  color: string;
  /** «crítica y alta», «media», «baja» o «todas las severidades». */
  rotuloSeveridad: string;
}) {
  const uid = idSeguro(useId());
  const { numero } = useFormato();
  const maximo = barras.reduce((m, b) => Math.max(m, b.valor), 0);
  const g = geometria(barras.length, maximo);
  const total = barras.reduce((s, b) => s + b.valor, 0);
  return (
    <>
      <Marco
        titulo={`Inundaciones activas por distrito (${rotuloSeveridad})`}
        descripcion={`Inundaciones activas (en revisión o verificadas) por distrito municipal, ${rotuloSeveridad}. ${numero(total)} en total; el mayor es ${numero(maximo)}. «Otros» suma los distritos de una capa anterior y lo que no tiene distrito.`}
        testId="ejecutivo-grafica-inundaciones"
        uid={uid}
      >
        <Eje marcas={g.marcas} escalaY={g.escalaY} />
        {barras.map((b, i) => {
          const y = g.escalaY(b.valor);
          return (
            <g key={b.codigo} data-barra={b.codigo}>
              <title>
                {b.otros
                  ? `Otros (${b.nombre.toLowerCase()}): ${numero(b.valor)} activas`
                  : `${b.nombre} (distrito ${b.etiqueta}): ${numero(b.valor)} activas`}
              </title>
              <rect
                x={g.xBarra(i)}
                y={y}
                width={g.anchoBarra}
                height={Math.max(0, g.escalaY(0) - y)}
                rx={3}
                fill={b.otros ? COLOR_OTROS : color}
              />
              <text
                x={g.xCentro(i)}
                y={y - 6}
                textAnchor="middle"
                fontSize={13}
                fontWeight={700}
                fill={COLOR_TEXTO}
              >
                {numero(b.valor)}
              </text>
              <text
                x={g.xCentro(i)}
                y={ALTO - M.abajo + 20}
                textAnchor="middle"
                fontSize={13}
                fill={COLOR_EJE}
              >
                {b.etiqueta}
              </text>
            </g>
          );
        })}
      </Marco>
      <table className="sr-only">
        <caption>Inundaciones activas por distrito, {rotuloSeveridad}</caption>
        <thead>
          <tr>
            <th scope="col">Distrito</th>
            <th scope="col">Activas</th>
          </tr>
        </thead>
        <tbody>
          {barras.map((b) => (
            <tr key={b.codigo}>
              <th scope="row">
                {b.etiqueta} · {b.nombre}
              </th>
              <td>{b.valor}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// --- Cómo va el trabajo -------------------------------------------------------------------------

/**
 * Color y patrón de cada estado. El patrón (rayado, liso, punteado) distingue los segmentos sin
 * depender del color, y el borde blanco entre segmentos los separa aunque dos colores se parezcan.
 */
export const ESTILO_TRABAJO: Record<EstadoTrabajo, { color: string; patron: string }> = {
  nuevo: { color: '#6B7B8A', patron: 'rayado' },
  validado: { color: '#1B6B38', patron: 'liso' },
  resuelto: { color: '#0D6189', patron: 'punteado' },
};

function DefsTrabajo({ uid }: { uid: string }) {
  return (
    <>
      <pattern
        id={`${uid}-rayado`}
        width={7}
        height={7}
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect width={7} height={7} fill={ESTILO_TRABAJO.nuevo.color} />
        <line x1={0} y1={0} x2={0} y2={7} stroke="#fff" strokeWidth={2.5} />
      </pattern>
      <pattern id={`${uid}-punteado`} width={6} height={6} patternUnits="userSpaceOnUse">
        <rect width={6} height={6} fill={ESTILO_TRABAJO.resuelto.color} />
        <circle cx={3} cy={3} r={1.3} fill="#fff" />
      </pattern>
    </>
  );
}

function rellenoTrabajo(uid: string, estado: EstadoTrabajo) {
  const e = ESTILO_TRABAJO[estado];
  return e.patron === 'liso' ? e.color : `url(#${uid}-${e.patron})`;
}

export function GraficaTrabajo({ barras }: { barras: BarraApilada[] }) {
  const uid = idSeguro(useId());
  const { numero } = useFormato();
  const maximo = barras.reduce((m, b) => Math.max(m, b.total), 0);
  const g = geometria(barras.length, maximo);
  const sumas = SEGMENTOS_TRABAJO.map(({ estado, etiqueta }) => ({
    etiqueta,
    n: barras.reduce((s, b) => s + (b.segmentos.find((x) => x.estado === estado)?.valor ?? 0), 0),
  }));
  return (
    <>
      <Marco
        titulo="Cómo va el trabajo, por distrito"
        descripcion={`Reportes por estado en cada distrito: ${sumas
          .map((s) => `${s.etiqueta.toLowerCase()} ${numero(s.n)}`)
          .join(', ')}.`}
        testId="ejecutivo-grafica-trabajo"
        uid={uid}
        defs={<DefsTrabajo uid={uid} />}
      >
        <Eje marcas={g.marcas} escalaY={g.escalaY} />
        {barras.map((b, i) => (
          <g key={b.codigo} data-barra={b.codigo}>
            <title>
              {`${b.nombre} (distrito ${b.etiqueta}): ${SEGMENTOS_TRABAJO.map(
                ({ estado, etiqueta }) =>
                  `${etiqueta.toLowerCase()} ${numero(b.segmentos.find((s) => s.estado === estado)?.valor ?? 0)}`,
              ).join(', ')}`}
            </title>
            {b.segmentos
              .filter((s) => s.valor > 0)
              .map((s) => {
                const y = g.escalaY(s.hasta);
                return (
                  <rect
                    key={s.estado}
                    data-estado={s.estado}
                    x={g.xBarra(i)}
                    y={y}
                    width={g.anchoBarra}
                    height={Math.max(0, g.escalaY(s.desde) - y)}
                    fill={rellenoTrabajo(uid, s.estado)}
                    stroke="#fff"
                    strokeWidth={1.5}
                  />
                );
              })}
            <text
              x={g.xCentro(i)}
              y={g.escalaY(b.total) - 6}
              textAnchor="middle"
              fontSize={13}
              fontWeight={700}
              fill={COLOR_TEXTO}
            >
              {numero(b.total)}
            </text>
            <text
              x={g.xCentro(i)}
              y={ALTO - M.abajo + 20}
              textAnchor="middle"
              fontSize={13}
              fill={COLOR_EJE}
            >
              {b.etiqueta}
            </text>
          </g>
        ))}
      </Marco>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[15px]" aria-label="Leyenda">
        {SEGMENTOS_TRABAJO.map(({ estado, etiqueta }) => (
          <li key={estado} className="flex items-center gap-2">
            <svg width={18} height={18} aria-hidden="true" className="shrink-0">
              {ESTILO_TRABAJO[estado].patron !== 'liso' ? (
                <defs>
                  <DefsTrabajo uid={`${uid}-ley-${estado}`} />
                </defs>
              ) : null}
              <rect
                width={18}
                height={18}
                rx={4}
                fill={rellenoTrabajo(`${uid}-ley-${estado}`, estado)}
              />
            </svg>
            {etiqueta}
          </li>
        ))}
      </ul>
      <table className="sr-only">
        <caption>Cómo va el trabajo: reportes por estado en cada distrito</caption>
        <thead>
          <tr>
            <th scope="col">Distrito</th>
            {SEGMENTOS_TRABAJO.map(({ estado, etiqueta }) => (
              <th key={estado} scope="col">
                {etiqueta}
              </th>
            ))}
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {barras.map((b) => (
            <tr key={b.codigo}>
              <th scope="row">
                {b.etiqueta} · {b.nombre}
              </th>
              {b.segmentos.map((s) => (
                <td key={s.estado}>{s.valor}</td>
              ))}
              <td>{b.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
