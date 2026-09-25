import type { Frecuencia, Severidad, Tirante } from './enums.js';

/**
 * Matriz de severidad v2 (CLAUDE.md §9.1). Función pura y reproducible.
 * puntaje = 2·T + F (rango 3..12) → banda base → reglas de escalamiento (solo suben).
 * La v1 (2·T + D + F + A, con la regla E2) desapareció al quitar duración y afectación del reporte.
 */
export const SEVERIDAD_VERSION = 2;

export const PUNTOS = {
  tirante: { tobillo: 1, rodilla: 2, muslo: 3, mas_70: 4 },
  frecuencia: { primera_vez: 1, ocasional: 2, cada_lluvia_fuerte: 3, permanente: 4 },
} as const satisfies {
  tirante: Record<Tirante, number>;
  frecuencia: Record<Frecuencia, number>;
};

export const PESOS = { tirante: 2, frecuencia: 1 } as const;

/** Bandas base por puntaje: [min, max] inclusivos. */
export const BANDAS: ReadonlyArray<{ banda: Severidad; min: number; max: number }> = [
  { banda: 'baja', min: 3, max: 4 },
  { banda: 'media', min: 5, max: 7 },
  { banda: 'alta', min: 8, max: 10 },
  { banda: 'critica', min: 11, max: 12 },
];

const ORDEN: Record<Severidad, number> = { baja: 0, media: 1, alta: 2, critica: 3 };

export interface EntradaSeveridad {
  tirante_estimado: Tirante;
  frecuencia: Frecuencia;
}

export interface ResultadoSeveridad {
  puntaje: number;
  banda_base: Severidad;
  banda: Severidad;
  /** Reglas de escalamiento aplicadas, en orden (E1, E3). */
  reglas: string[];
  version: number;
}

export function compararSeveridad(a: Severidad, b: Severidad): number {
  return ORDEN[a] - ORDEN[b];
}

export function severidadMaxima(a: Severidad, b: Severidad): Severidad {
  return compararSeveridad(a, b) >= 0 ? a : b;
}

export function calcularSeveridad(e: EntradaSeveridad): ResultadoSeveridad {
  const t = PUNTOS.tirante[e.tirante_estimado];
  const f = PUNTOS.frecuencia[e.frecuencia];
  const puntaje = PESOS.tirante * t + PESOS.frecuencia * f;

  const base = BANDAS.find((b) => puntaje >= b.min && puntaje <= b.max);
  if (!base) throw new Error(`Puntaje fuera de rango: ${puntaje}`);

  let banda: Severidad = base.banda;
  const reglas: string[] = [];
  // E1: tirante > 70 cm → crítica.
  if (t === 4) {
    banda = 'critica';
    reglas.push('E1');
  }
  // E3: frecuencia permanente → mínimo media. Con las bandas v2 no se dispara (F = 4 da
  // puntaje ≥ 6, ya media); se conserva como guarda por decisión del usuario (spec, P-7).
  if (f === 4 && ORDEN[banda] < ORDEN.media) {
    banda = 'media';
    reglas.push('E3');
  }
  return { puntaje, banda_base: base.banda, banda, reglas, version: SEVERIDAD_VERSION };
}
