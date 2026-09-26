import type { Indicadores } from 'contracts';
import { describe, expect, it } from 'vitest';
import { kpisIndicadores } from './indicadores';

/** Indicadores SINTÉTICOS: 12 vigentes (nuevo + validado + resuelto) y 5 fuera del total. */
const d: Indicadores = {
  total: 12,
  por_estado: { nuevo: 3, validado: 7, resuelto: 2, rechazado: 4, duplicado: 1 },
  por_severidad: { baja: 5, media: 4, alta: 2, critica: 1 },
  por_distrito: [],
  por_unidad_vecinal: [],
  puntos_criticos_recurrentes: 2,
  capas_vigentes: {},
};

describe('tarjetas de /indicadores', () => {
  it('el total se rotula como lo que cuenta api-core: sin rechazados ni duplicados', () => {
    // Antes decía «reportes en total» y se leía como todo lo recibido.
    const [total] = kpisIndicadores(d);
    expect(total).toEqual({
      valor: 12,
      etiqueta: 'reportes vigentes (sin rechazados ni duplicados)',
      testId: 'indicador-vigentes',
    });
    expect(kpisIndicadores(d).map((k) => k.etiqueta)).not.toContain('reportes en total');
  });

  it('validados, en revisión y puntos críticos salen de sus campos', () => {
    expect(kpisIndicadores(d).slice(1)).toEqual([
      { valor: 7, etiqueta: 'validados', testId: 'indicador-validados' },
      { valor: 3, etiqueta: 'esperando revisión', testId: 'indicador-nuevos' },
      {
        valor: 2,
        etiqueta: 'puntos críticos con 2 o más reportes',
        testId: 'indicador-puntos-criticos',
      },
    ]);
  });
});
