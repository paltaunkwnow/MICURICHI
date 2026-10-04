import { PESOS, PUNTOS, type ReporteTecnico } from 'contracts';
import { colorSeveridad } from '@/lib/formato';
import { MAX_FRECUENCIA, MAX_PROFUNDIDAD, PUNTAJE_MAXIMO } from '@/lib/severidad';

/**
 * De dónde salió el puntaje (M-03 del prototipo). El técnico que va a validar o a reclasificar
 * necesita ver qué variable empujó la severidad, no solo el número final; y que la profundidad
 * pesa doble, que es lo que más sorprende cuando se mira por primera vez.
 */
export function FactoresSeveridad({ reporte }: { reporte: ReporteTecnico }) {
  const filas = [
    {
      nombre: 'Profundidad',
      valor: PUNTOS.profundidad[reporte.profundidad_estimada],
      peso: PESOS.profundidad,
      maximo: MAX_PROFUNDIDAD,
    },
    {
      nombre: 'Frecuencia',
      valor: PUNTOS.frecuencia[reporte.frecuencia],
      peso: PESOS.frecuencia,
      maximo: MAX_FRECUENCIA,
    },
  ];
  const color = colorSeveridad(reporte.severidad_calculada).relleno;

  return (
    <div className="mt-4">
      <h3 className="glbl mt-0">
        Cómo se llegó a {reporte.severidad_puntaje} de {PUNTAJE_MAXIMO} puntos
      </h3>
      <dl className="grid gap-2.5">
        {filas.map(({ nombre, valor, peso, maximo }) => (
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
                style={{ width: `${Math.min(100, (valor / maximo) * 100)}%`, background: color }}
                // El ancho ya lo dice el número de la derecha; la barra es apoyo visual.
                aria-hidden="true"
              />
            </dd>
            <dd className="m-0 text-right tabular-nums">
              {valor}/{maximo}
            </dd>
          </div>
        ))}
      </dl>
      <p className="ayuda mt-3">
        puntaje = {PESOS.profundidad} × profundidad + frecuencia. La profundidad pesa doble porque
        es lo más ligado al riesgo directo para personas y vehículos.
        {reporte.severidad_manual
          ? ' Este reporte tiene una reclasificación manual, así que la severidad efectiva no es esta.'
          : ' Sin reclasificación manual: se recalcula si el reporte se corrige.'}
      </p>
    </div>
  );
}
