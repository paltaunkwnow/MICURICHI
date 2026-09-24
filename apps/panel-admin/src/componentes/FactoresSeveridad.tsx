import { PESOS, PUNTOS, type ReporteTecnico } from 'contracts';
import { colorSeveridad } from '@/lib/formato';

/** Puntaje máximo de cada variable en la tabla de severidad (CLAUDE.md §9.1). */
const MAXIMO = 4;

/**
 * De dónde salió el puntaje (M-03 del prototipo). El técnico que va a validar o a reclasificar
 * necesita ver qué variable empujó la severidad, no solo el número final; y que el tirante pesa
 * doble, que es lo que más sorprende cuando se mira por primera vez.
 */
export function FactoresSeveridad({ reporte }: { reporte: ReporteTecnico }) {
  const filas: Array<[string, number, number]> = [
    ['Tirante', PUNTOS.tirante[reporte.tirante_estimado], PESOS.tirante],
    ['Duración', PUNTOS.duracion[reporte.duracion_estimada], PESOS.duracion],
    ['Frecuencia', PUNTOS.frecuencia[reporte.frecuencia], PESOS.frecuencia],
    ['Afectación', PUNTOS.afectacion[reporte.afectacion], PESOS.afectacion],
  ];
  const color = colorSeveridad(reporte.severidad_calculada).relleno;

  return (
    <div className="mt-4">
      <h3 className="glbl mt-0">Cómo se llegó a {reporte.severidad_puntaje} de 20 puntos</h3>
      <dl className="grid gap-2.5">
        {filas.map(([nombre, valor, peso]) => (
          <div
            key={nombre}
            className="grid grid-cols-[minmax(96px,130px)_minmax(0,1fr)_64px] items-center gap-3 text-[15.5px]"
          >
            <dt className="text-tinta-600">
              {nombre}
              {peso > 1 ? <span className="mini ml-1.5">×{peso}</span> : null}
            </dt>
            <dd className="barra-proporcion m-0">
              <span
                style={{ width: `${(valor / MAXIMO) * 100}%`, background: color }}
                // El ancho ya lo dice el número de la derecha; la barra es apoyo visual.
                aria-hidden="true"
              />
            </dd>
            <dd className="m-0 text-right tabular-nums">
              {valor}/{MAXIMO}
            </dd>
          </div>
        ))}
      </dl>
      <p className="ayuda mt-3">
        puntaje = {PESOS.tirante} × tirante + duración + frecuencia + afectación. El tirante pesa
        doble porque es lo más ligado al riesgo directo para personas y vehículos.
        {reporte.severidad_manual
          ? ' Este reporte tiene una reclasificación manual, así que la severidad efectiva no es esta.'
          : ' Sin reclasificación manual: se recalcula si el reporte se corrige.'}
      </p>
    </div>
  );
}
