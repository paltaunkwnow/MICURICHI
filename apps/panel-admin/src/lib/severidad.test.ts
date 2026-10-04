import { BANDAS, calcularSeveridad, FRECUENCIAS, PROFUNDIDADES, PUNTOS } from 'contracts';
import { describe, expect, it } from 'vitest';
import {
  formulaPuntaje,
  MAX_FRECUENCIA,
  MAX_PROFUNDIDAD,
  PUNTAJE_MAXIMO,
  profundidadesSiempreCriticas,
  rangoPuntaje,
  textoPuntaje,
  textoRango,
} from './severidad';

/** Todas las combinaciones de respuestas con lo que `calcularSeveridad` da para cada una. */
function combinaciones() {
  return PROFUNDIDADES.flatMap((profundidad_estimada) =>
    FRECUENCIAS.map((frecuencia) => ({
      profundidad_estimada,
      frecuencia,
      ...calcularSeveridad({ profundidad_estimada, frecuencia }),
    })),
  );
}

describe('puntaje máximo: una sola cifra para la ficha, el .txt y el desglose', () => {
  it('es el mayor puntaje que da calcularSeveridad y coincide con el tope de la última banda', () => {
    const mayor = Math.max(...combinaciones().map((c) => c.puntaje));
    expect(PUNTAJE_MAXIMO).toBe(mayor);
    expect(PUNTAJE_MAXIMO).toBe(BANDAS[BANDAS.length - 1]?.max);
  });

  it('los máximos por variable son los de la respuesta más extrema: juntas dan el puntaje máximo', () => {
    const conMaxima = combinaciones().find(
      (c) => c.profundidad_estimada === 'mas_70' && c.frecuencia === 'agua_estancada',
    );
    expect(conMaxima?.puntaje).toBe(PUNTAJE_MAXIMO);
    expect(MAX_PROFUNDIDAD).toBe(PUNTOS.profundidad.mas_70);
    expect(MAX_FRECUENCIA).toBe(PUNTOS.frecuencia.agua_estancada);
  });

  it('textoPuntaje escribe «N de M puntos» con ese máximo', () => {
    expect(textoPuntaje(6)).toBe(`6 de ${PUNTAJE_MAXIMO} puntos`);
    expect(textoPuntaje(PUNTAJE_MAXIMO)).toBe(`${PUNTAJE_MAXIMO} de ${PUNTAJE_MAXIMO} puntos`);
  });
});

describe('fórmula del puntaje', () => {
  it('se escribe con los pesos de contracts y sin el peso 1', () => {
    expect(formulaPuntaje()).toBe('puntaje = 2 × profundidad + frecuencia');
  });
});

describe('rango de puntaje de un grupo de severidades (de BANDAS)', () => {
  it('una banda sola devuelve la suya', () => {
    const media = BANDAS.find((b) => b.banda === 'media');
    const r = rangoPuntaje(['media']);
    expect(r.min).toBe(media?.min);
    expect(r.max).toBe(media?.max);
    expect(r.bandas).toEqual([{ banda: 'media', min: media?.min, max: media?.max }]);
  });

  it('dos bandas se juntan de la más baja a la más alta, sin importar el orden pedido', () => {
    const alta = BANDAS.find((b) => b.banda === 'alta');
    const critica = BANDAS.find((b) => b.banda === 'critica');
    const r = rangoPuntaje(['critica', 'alta']);
    expect(r.min).toBe(alta?.min);
    expect(r.max).toBe(critica?.max);
    expect(r.bandas.map((b) => b.banda)).toEqual(['alta', 'critica']);
  });

  it('todas las severidades cubren el rango entero de la fórmula', () => {
    const r = rangoPuntaje(['baja', 'media', 'alta', 'critica']);
    const puntajes = combinaciones().map((c) => c.puntaje);
    expect(r.min).toBe(Math.min(...puntajes));
    expect(r.max).toBe(Math.max(...puntajes));
  });

  it('sin ninguna severidad no hay rango que inventar', () => {
    expect(() => rangoPuntaje([])).toThrow();
  });

  it('el puntaje base de cada combinación cae dentro del rango de su banda base', () => {
    for (const c of combinaciones()) {
      const r = rangoPuntaje([c.banda_base]);
      expect(c.puntaje, `${c.profundidad_estimada}/${c.frecuencia}`).toBeGreaterThanOrEqual(r.min);
      expect(c.puntaje, `${c.profundidad_estimada}/${c.frecuencia}`).toBeLessThanOrEqual(r.max);
    }
  });

  it('textoRango escribe «min a max»', () => {
    expect(textoRango({ min: 8, max: 13 })).toBe('8 a 13');
  });
});

describe('regla de escalamiento: profundidades que dan crítica con cualquier frecuencia', () => {
  it('son las que calcularSeveridad lleva a crítica sea cual sea la frecuencia', () => {
    const esperadas = PROFUNDIDADES.filter((p) =>
      combinaciones()
        .filter((c) => c.profundidad_estimada === p)
        .every((c) => c.banda === 'critica'),
    );
    expect(profundidadesSiempreCriticas()).toEqual(esperadas);
  });

  it('con la matriz v2 es solo la más profunda, que además sube de banda por la regla E1', () => {
    expect(profundidadesSiempreCriticas()).toEqual(['mas_70']);
    for (const c of combinaciones().filter((x) => x.profundidad_estimada === 'mas_70')) {
      expect(c.reglas).toContain('E1');
    }
  });
});
