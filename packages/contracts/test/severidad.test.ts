import { describe, expect, it } from 'vitest';
import {
  FRECUENCIAS,
  type Frecuencia,
  type Severidad,
  TIRANTES,
  type Tirante,
} from '../src/dominio/enums.js';
import {
  BANDAS,
  calcularSeveridad,
  compararSeveridad,
  PESOS,
  PUNTOS,
  SEVERIDAD_VERSION,
} from '../src/dominio/severidad.js';

/**
 * Severidad v2 (spec 2026-09-25-quitar-campos-del-reporte, D1):
 * puntaje = 2·T + F (3..12); bandas 3–4 baja, 5–7 media, 8–10 alta, 11–12 critica;
 * E1 (T = 4 → critica) y E3 (F = 4 → mínimo media); E2 desaparece.
 */
interface Caso {
  t: Tirante;
  f: Frecuencia;
  puntaje: number;
  base: Severidad;
  reglas: string[];
  banda: Severidad;
}

// Tabla de CA-C5, copiada literal de la spec: una fila por combinación T × F.
const TABLA_V2: readonly Caso[] = [
  { t: 'tobillo', f: 'primera_vez', puntaje: 3, base: 'baja', reglas: [], banda: 'baja' },
  { t: 'tobillo', f: 'ocasional', puntaje: 4, base: 'baja', reglas: [], banda: 'baja' },
  { t: 'tobillo', f: 'cada_lluvia_fuerte', puntaje: 5, base: 'media', reglas: [], banda: 'media' },
  { t: 'tobillo', f: 'permanente', puntaje: 6, base: 'media', reglas: [], banda: 'media' },
  { t: 'rodilla', f: 'primera_vez', puntaje: 5, base: 'media', reglas: [], banda: 'media' },
  { t: 'rodilla', f: 'ocasional', puntaje: 6, base: 'media', reglas: [], banda: 'media' },
  { t: 'rodilla', f: 'cada_lluvia_fuerte', puntaje: 7, base: 'media', reglas: [], banda: 'media' },
  { t: 'rodilla', f: 'permanente', puntaje: 8, base: 'alta', reglas: [], banda: 'alta' },
  { t: 'muslo', f: 'primera_vez', puntaje: 7, base: 'media', reglas: [], banda: 'media' },
  { t: 'muslo', f: 'ocasional', puntaje: 8, base: 'alta', reglas: [], banda: 'alta' },
  { t: 'muslo', f: 'cada_lluvia_fuerte', puntaje: 9, base: 'alta', reglas: [], banda: 'alta' },
  { t: 'muslo', f: 'permanente', puntaje: 10, base: 'alta', reglas: [], banda: 'alta' },
  { t: 'mas_70', f: 'primera_vez', puntaje: 9, base: 'alta', reglas: ['E1'], banda: 'critica' },
  { t: 'mas_70', f: 'ocasional', puntaje: 10, base: 'alta', reglas: ['E1'], banda: 'critica' },
  {
    t: 'mas_70',
    f: 'cada_lluvia_fuerte',
    puntaje: 11,
    base: 'critica',
    reglas: ['E1'],
    banda: 'critica',
  },
  { t: 'mas_70', f: 'permanente', puntaje: 12, base: 'critica', reglas: ['E1'], banda: 'critica' },
];

describe('matriz de severidad v2 (CLAUDE.md §9.1)', () => {
  it('CA-C5: la tabla de la spec cubre las 16 combinaciones T × F', () => {
    expect(TABLA_V2).toHaveLength(16);
    const claves = new Set(TABLA_V2.map((c) => `${c.t}/${c.f}`));
    for (const t of TIRANTES)
      for (const f of FRECUENCIAS) expect(claves.has(`${t}/${f}`)).toBe(true);
  });

  for (const c of TABLA_V2) {
    it(`CA-C5: ${c.t}/${c.f} → ${c.puntaje} ${c.base} ${c.reglas.join('+') || '—'} → ${c.banda} (v2)`, () => {
      const r = calcularSeveridad({ tirante_estimado: c.t, frecuencia: c.f });
      expect(r).toStrictEqual({
        puntaje: c.puntaje,
        banda_base: c.base,
        banda: c.banda,
        reglas: c.reglas,
        version: 2,
      });
    });
  }

  it('CA-C6: SEVERIDAD_VERSION es 2', () => {
    expect(SEVERIDAD_VERSION).toBe(2);
  });

  it('CA-C6: PESOS es { tirante: 2, frecuencia: 1 } y PUNTOS solo tiene tirante y frecuencia', () => {
    expect(PESOS).toStrictEqual({ tirante: 2, frecuencia: 1 });
    expect(Object.keys(PUNTOS)).toStrictEqual(['tirante', 'frecuencia']);
    expect(PUNTOS.tirante).toStrictEqual({ tobillo: 1, rodilla: 2, muslo: 3, mas_70: 4 });
    expect(PUNTOS.frecuencia).toStrictEqual({
      primera_vez: 1,
      ocasional: 2,
      cada_lluvia_fuerte: 3,
      permanente: 4,
    });
  });

  it('CA-C6: BANDAS es baja 3–4, media 5–7, alta 8–10, critica 11–12, contiguas y sin huecos', () => {
    expect(BANDAS).toStrictEqual([
      { banda: 'baja', min: 3, max: 4 },
      { banda: 'media', min: 5, max: 7 },
      { banda: 'alta', min: 8, max: 10 },
      { banda: 'critica', min: 11, max: 12 },
    ]);
    expect(BANDAS[0]?.min).toBe(3);
    expect(BANDAS[BANDAS.length - 1]?.max).toBe(12);
    for (let i = 1; i < BANDAS.length; i++) {
      expect(BANDAS[i]?.min).toBe((BANDAS[i - 1]?.max ?? Number.NaN) + 1);
    }
    for (let p = 3; p <= 12; p++) {
      expect(BANDAS.filter((b) => p >= b.min && p <= b.max)).toHaveLength(1);
    }
  });

  it('CA-C7: ninguna combinación aplica E2 ni E3; critica ⇔ T = 4; banda nunca baja de banda_base', () => {
    let n = 0;
    for (const t of TIRANTES)
      for (const f of FRECUENCIAS) {
        const r = calcularSeveridad({ tirante_estimado: t, frecuencia: f });
        expect(r.reglas).not.toContain('E2');
        expect(r.reglas).not.toContain('E3');
        expect(r.banda === 'critica').toBe(t === 'mas_70');
        expect(compararSeveridad(r.banda, r.banda_base)).toBeGreaterThanOrEqual(0);
        expect(r.puntaje).toBeGreaterThanOrEqual(3);
        expect(r.puntaje).toBeLessThanOrEqual(12);
        expect(r.version).toBe(2);
        n++;
      }
    expect(n).toBe(16);
  });

  it('CA-C7: es monótona: subir tirante o frecuencia nunca baja la banda', () => {
    for (let it = 0; it < TIRANTES.length; it++)
      for (let iff = 0; iff < FRECUENCIAS.length; iff++) {
        const t = TIRANTES[it] as Tirante;
        const f = FRECUENCIAS[iff] as Frecuencia;
        const base = calcularSeveridad({ tirante_estimado: t, frecuencia: f }).banda;
        const vecinos = [
          it < 3 ? { tirante_estimado: TIRANTES[it + 1] as Tirante, frecuencia: f } : null,
          iff < 3 ? { tirante_estimado: t, frecuencia: FRECUENCIAS[iff + 1] as Frecuencia } : null,
        ];
        for (const v of vecinos) {
          if (!v) continue;
          expect(compararSeveridad(calcularSeveridad(v).banda, base)).toBeGreaterThanOrEqual(0);
        }
      }
  });

  it('CA-C8: es función pura: con entrada congelada no muta y da resultados idénticos', () => {
    const entrada = Object.freeze({
      tirante_estimado: 'muslo' as const,
      frecuencia: 'permanente' as const,
    });
    const copia = { ...entrada };
    const a = calcularSeveridad(entrada);
    const b = calcularSeveridad(entrada);
    expect(a).toStrictEqual(b);
    expect(entrada).toStrictEqual(copia);
    expect(a.puntaje).toBe(10);
    expect(a.banda).toBe('alta');
  });
});
