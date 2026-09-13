import { describe, expect, it } from 'vitest';
import { AFECTACIONES, DURACIONES, FRECUENCIAS, TIRANTES } from '../src/dominio/enums.js';
import { calcularSeveridad, compararSeveridad } from '../src/dominio/severidad.js';

describe('matriz de severidad (CLAUDE.md §9.1)', () => {
  // Casos de verificación exactos del manual: T D F A → puntaje, base, reglas, final
  const casos = [
    {
      t: 'tobillo',
      d: 'menos_30min',
      f: 'primera_vez',
      a: 'peatonal',
      puntaje: 5,
      base: 'baja',
      reglas: [],
      final: 'baja',
    },
    {
      t: 'rodilla',
      d: '30min_2h',
      f: 'ocasional',
      a: 'vehicular',
      puntaje: 10,
      base: 'media',
      reglas: [],
      final: 'media',
    },
    {
      t: 'tobillo',
      d: 'menos_30min',
      f: 'permanente',
      a: 'peatonal',
      puntaje: 8,
      base: 'baja',
      reglas: ['E3'],
      final: 'media',
    },
    {
      t: 'rodilla',
      d: 'menos_30min',
      f: 'cada_lluvia_fuerte',
      a: 'ingreso_viviendas',
      puntaje: 11,
      base: 'media',
      reglas: ['E2'],
      final: 'alta',
    },
    {
      t: 'mas_70',
      d: 'menos_30min',
      f: 'primera_vez',
      a: 'peatonal',
      puntaje: 11,
      base: 'media',
      reglas: ['E1'],
      final: 'critica',
    },
    {
      t: 'muslo',
      d: 'mas_12h',
      f: 'permanente',
      a: 'corte_total_via',
      puntaje: 18,
      base: 'critica',
      reglas: [],
      final: 'critica',
    },
  ] as const;

  for (const c of casos) {
    it(`${c.t}/${c.d}/${c.f}/${c.a} → ${c.puntaje} ${c.base} ${c.reglas.join('+') || '—'} → ${c.final}`, () => {
      const r = calcularSeveridad({
        tirante_estimado: c.t,
        duracion_estimada: c.d,
        frecuencia: c.f,
        afectacion: c.a,
      });
      expect(r.puntaje).toBe(c.puntaje);
      expect(r.banda_base).toBe(c.base);
      expect(r.reglas).toEqual([...c.reglas]);
      expect(r.banda).toBe(c.final);
    });
  }

  it('cubre las 256 combinaciones con puntaje 5..20 y banda válida', () => {
    let n = 0;
    for (const t of TIRANTES)
      for (const d of DURACIONES)
        for (const f of FRECUENCIAS)
          for (const a of AFECTACIONES) {
            const r = calcularSeveridad({
              tirante_estimado: t,
              duracion_estimada: d,
              frecuencia: f,
              afectacion: a,
            });
            expect(r.puntaje).toBeGreaterThanOrEqual(5);
            expect(r.puntaje).toBeLessThanOrEqual(20);
            expect(['baja', 'media', 'alta', 'critica']).toContain(r.banda);
            // las reglas solo suben, nunca bajan
            expect(compararSeveridad(r.banda, r.banda_base)).toBeGreaterThanOrEqual(0);
            n++;
          }
    expect(n).toBe(256);
  });

  it('es monótona: subir cualquier variable nunca baja la banda', () => {
    const escalas = { t: TIRANTES, d: DURACIONES, f: FRECUENCIAS, a: AFECTACIONES } as const;
    for (const t of TIRANTES)
      for (const d of DURACIONES)
        for (const f of FRECUENCIAS)
          for (const a of AFECTACIONES) {
            const base = calcularSeveridad({
              tirante_estimado: t,
              duracion_estimada: d,
              frecuencia: f,
              afectacion: a,
            }).banda;
            const it = escalas.t.indexOf(t);
            const id = escalas.d.indexOf(d);
            const iff = escalas.f.indexOf(f);
            const ia = escalas.a.indexOf(a);
            const vecinos = [
              it < 3
                ? {
                    tirante_estimado: escalas.t[it + 1]!,
                    duracion_estimada: d,
                    frecuencia: f,
                    afectacion: a,
                  }
                : null,
              id < 3
                ? {
                    tirante_estimado: t,
                    duracion_estimada: escalas.d[id + 1]!,
                    frecuencia: f,
                    afectacion: a,
                  }
                : null,
              iff < 3
                ? {
                    tirante_estimado: t,
                    duracion_estimada: d,
                    frecuencia: escalas.f[iff + 1]!,
                    afectacion: a,
                  }
                : null,
              ia < 3
                ? {
                    tirante_estimado: t,
                    duracion_estimada: d,
                    frecuencia: f,
                    afectacion: escalas.a[ia + 1]!,
                  }
                : null,
            ];
            for (const v of vecinos) {
              if (!v) continue;
              expect(compararSeveridad(calcularSeveridad(v).banda, base)).toBeGreaterThanOrEqual(0);
            }
          }
  });
});
