import { describe, expect, it } from 'vitest';
import {
  calcularSeveridadBasura,
  DEFINICION_BASURA,
  type DetalleBasura,
  DetalleBasuraSchema,
  SEVERIDAD_BASURA_VERSION,
} from '../src/index.js';

// Oráculo del plan aprobado §2: valores y matrices explícitos, sin usar índices del modelo.
const GRAVEDADES = ['bolsas_sueltas', 'acumulada_dias', 'ocupa_via', 'quema_o_desague'] as const;
const TAMANOS = ['bolsas', 'carretilla', 'camioneta', 'camion_o_mas'] as const;
const BANDAS = [
  ['baja', 'baja', 'media', 'alta'],
  ['media', 'media', 'alta', 'alta'],
  ['alta', 'alta', 'alta', 'critica'],
  ['critica', 'critica', 'critica', 'critica'],
] as const;
const PUNTAJES = [
  [2, 3, 4, 5],
  [3, 4, 5, 6],
  [4, 5, 6, 7],
  [5, 6, 7, 8],
] as const;
const ORDEN = ['baja', 'media', 'alta', 'critica'];
const CASOS = GRAVEDADES.flatMap((gravedad_declarada, g) =>
  TAMANOS.map((tamano, t) => ({
    gravedad_declarada,
    tamano,
    banda: BANDAS[g]![t]!,
    puntaje: PUNTAJES[g]![t]!,
  })),
);

describe('Basura v1: matriz aprobada independiente', () => {
  it.each(CASOS)('$gravedad_declarada / $tamano → $banda, índice $puntaje', (caso) => {
    const entrada = Object.freeze({
      gravedad_declarada: caso.gravedad_declarada,
      tamano: caso.tamano,
    });
    const esperado = { banda: caso.banda, puntaje: caso.puntaje, version: 1 };
    expect(calcularSeveridadBasura(entrada)).toEqual(esperado);
    expect(DEFINICION_BASURA.severidad.calcular(entrada)).toEqual(esperado);
    expect(calcularSeveridadBasura(entrada)).toEqual(esperado);
    expect(entrada).toEqual({ gravedad_declarada: caso.gravedad_declarada, tamano: caso.tamano });
  });

  it('es monótona en ambos ejes y conserva el piso de gravedad declarada', () => {
    for (let g = 0; g < 4; g++)
      for (let t = 0; t < 4; t++) {
        const resultado = calcularSeveridadBasura({
          gravedad_declarada: GRAVEDADES[g]!,
          tamano: TAMANOS[t]!,
        });
        const banda = ORDEN.indexOf(resultado.banda);
        expect(banda).toBeGreaterThanOrEqual(g);
        if (g > 0)
          expect(banda).toBeGreaterThanOrEqual(
            ORDEN.indexOf(
              calcularSeveridadBasura({
                gravedad_declarada: GRAVEDADES[g - 1]!,
                tamano: TAMANOS[t]!,
              }).banda,
            ),
          );
        if (t > 0)
          expect(banda).toBeGreaterThanOrEqual(
            ORDEN.indexOf(
              calcularSeveridadBasura({
                gravedad_declarada: GRAVEDADES[g]!,
                tamano: TAMANOS[t - 1]!,
              }).banda,
            ),
          );
      }
  });

  it('el mismo índice 3 puede ser baja o media y el máximo declarado siempre es crítico', () => {
    expect(
      calcularSeveridadBasura({ gravedad_declarada: GRAVEDADES[0], tamano: TAMANOS[1] }),
    ).toEqual({ puntaje: 3, banda: 'baja', version: 1 });
    expect(
      calcularSeveridadBasura({ gravedad_declarada: GRAVEDADES[1], tamano: TAMANOS[0] }),
    ).toEqual({ puntaje: 3, banda: 'media', version: 1 });
    for (const tamano of TAMANOS)
      expect(calcularSeveridadBasura({ gravedad_declarada: GRAVEDADES[3], tamano }).banda).toBe(
        'critica',
      );
    expect(SEVERIDAD_BASURA_VERSION).toBe(1);
  });
});

describe('Basura: rechazos estrictos sin defaults', () => {
  const valido = { gravedad_declarada: GRAVEDADES[1], tamano: TAMANOS[1] };
  it.each([
    undefined,
    null,
    [],
    'detalle',
    1,
    {},
    { gravedad_declarada: GRAVEDADES[0] },
    { tamano: TAMANOS[0] },
    { ...valido, gravedad_declarada: undefined },
    { ...valido, tamano: undefined },
    { ...valido, gravedad_declarada: null },
    { ...valido, tamano: null },
    { ...valido, gravedad_declarada: 'inventada' },
    { ...valido, tamano: 'enorme' },
    { ...valido, gravedad_declarada: 0 },
    { ...valido, tamano: false },
    { ...valido, subtipo: 'duplicado' },
    { ...valido, extra: true },
    { ...valido, profundidad_estimada: 'rodilla' },
    { profundidad_estimada: 'rodilla', frecuencia: 'ocasional' },
    { gravedad_declarada: 'peligroso', tamano: 'rueda' },
  ])('rechaza %j en esquema y cálculo', (entrada) => {
    expect(DetalleBasuraSchema.safeParse(entrada).success).toBe(false);
    expect(() => calcularSeveridadBasura(entrada as DetalleBasura)).toThrow();
  });
});
