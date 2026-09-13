import type { Afectacion, Duracion, Frecuencia, Severidad, Tirante } from './enums.js';

/**
 * Matriz de severidad (CLAUDE.md §9.1). Función pura y reproducible.
 * puntaje = 2·T + D + F + A (rango 5..20) → banda base → reglas de escalamiento (solo suben).
 */
export const SEVERIDAD_VERSION = 1;

export const PUNTOS = {
  tirante: { tobillo: 1, rodilla: 2, muslo: 3, mas_70: 4 },
  duracion: { menos_30min: 1, '30min_2h': 2, '2h_12h': 3, mas_12h: 4 },
  frecuencia: { primera_vez: 1, ocasional: 2, cada_lluvia_fuerte: 3, permanente: 4 },
  afectacion: { peatonal: 1, vehicular: 2, ingreso_viviendas: 3, corte_total_via: 4 },
} as const satisfies {
  tirante: Record<Tirante, number>;
  duracion: Record<Duracion, number>;
  frecuencia: Record<Frecuencia, number>;
  afectacion: Record<Afectacion, number>;
};

export const PESOS = { tirante: 2, duracion: 1, frecuencia: 1, afectacion: 1 } as const;

/** Bandas base por puntaje: [min, max] inclusivos. */
export const BANDAS: ReadonlyArray<{ banda: Severidad; min: number; max: number }> = [
  { banda: 'baja', min: 5, max: 8 },
  { banda: 'media', min: 9, max: 12 },
  { banda: 'alta', min: 13, max: 16 },
  { banda: 'critica', min: 17, max: 20 },
];

const ORDEN: Record<Severidad, number> = { baja: 0, media: 1, alta: 2, critica: 3 };

export interface EntradaSeveridad {
  tirante_estimado: Tirante;
  duracion_estimada: Duracion;
  frecuencia: Frecuencia;
  afectacion: Afectacion;
}

export interface ResultadoSeveridad {
  puntaje: number;
  banda_base: Severidad;
  banda: Severidad;
  /** Reglas de escalamiento aplicadas, en orden (E1, E2, E3). */
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
  const d = PUNTOS.duracion[e.duracion_estimada];
  const f = PUNTOS.frecuencia[e.frecuencia];
  const a = PUNTOS.afectacion[e.afectacion];
  const puntaje =
    PESOS.tirante * t + PESOS.duracion * d + PESOS.frecuencia * f + PESOS.afectacion * a;

  const base = BANDAS.find((b) => puntaje >= b.min && puntaje <= b.max);
  if (!base) throw new Error(`Puntaje fuera de rango: ${puntaje}`);

  let banda: Severidad = base.banda;
  const reglas: string[] = [];
  // E1: tirante > 70 cm → crítica.
  if (t === 4) {
    banda = 'critica';
    reglas.push('E1');
  }
  // E2: afectación ≥ ingreso a viviendas y frecuencia ≥ cada lluvia fuerte → mínimo alta.
  if (a >= 3 && f >= 3 && ORDEN[banda] < ORDEN.alta) {
    banda = 'alta';
    reglas.push('E2');
  }
  // E3: frecuencia permanente → mínimo media.
  if (f === 4 && ORDEN[banda] < ORDEN.media) {
    banda = 'media';
    reglas.push('E3');
  }
  return { puntaje, banda_base: base.banda, banda, reglas, version: SEVERIDAD_VERSION };
}
