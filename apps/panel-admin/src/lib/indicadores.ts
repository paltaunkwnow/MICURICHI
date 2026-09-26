import type { Indicadores } from 'contracts';

export interface KpiIndicador {
  valor: number;
  etiqueta: string;
  testId: string;
}

/**
 * Tarjetas de arriba de /indicadores. api-core cuenta en `total` —y en severidad, distritos y
 * unidades vecinales— solo los reportes vigentes (nuevo, validado, resuelto); rechazados y
 * duplicados quedan fuera y se ven en «Por estado». El rótulo lo dice: «reportes en total» se
 * leía como todo lo recibido.
 */
export function kpisIndicadores(d: Indicadores): KpiIndicador[] {
  return [
    {
      valor: d.total,
      etiqueta: 'reportes vigentes (sin rechazados ni duplicados)',
      testId: 'indicador-vigentes',
    },
    { valor: d.por_estado.validado ?? 0, etiqueta: 'validados', testId: 'indicador-validados' },
    { valor: d.por_estado.nuevo ?? 0, etiqueta: 'esperando revisión', testId: 'indicador-nuevos' },
    {
      valor: d.puntos_criticos_recurrentes,
      etiqueta: 'puntos críticos con 2 o más reportes',
      testId: 'indicador-puntos-criticos',
    },
  ];
}
