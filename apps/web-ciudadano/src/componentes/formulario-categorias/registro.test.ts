import { DEFINICION_INUNDACION } from 'contracts';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  armarEnvio,
  crearResolverFormulario,
  type ValoresFormulario,
  valoresIniciales,
} from '@/lib/formulario-reporte';
import { ADAPTADOR_INUNDACION } from './inundacion';
import { adaptadorFormularioDe } from './registro';

describe('ADR 0021: el identificador especial decide el adaptador', () => {
  it('al reutilizar valida la definición efectiva y envía su categoría y severidad', async () => {
    const def = {
      ...DEFINICION_INUNDACION,
      slug: 'bache' as const,
      esquemaDetalle: DEFINICION_INUNDACION.esquemaDetalle.and(
        z.object({ frecuencia: z.literal('permanente') }),
      ),
      severidad: { version: 1, calcular: () => ({ puntaje: 42, banda: 'critica' as const }) },
    };
    const a = adaptadorFormularioDe(def);
    const resolver = crearResolverFormulario(a);
    const valores = {
      ...valoresIniciales(),
      ...a.valoresIniciales(),
      profundidad_estimada: 'rodilla',
      frecuencia: 'ocasional',
      descripcion: 'Reporte sintético de prueba para reutilización.',
    } as ValoresFormulario;
    const opciones = {
      criteriaMode: 'firstError' as const,
      fields: {},
      shouldUseNativeValidation: false,
    };
    const contexto = { ubicacion: { lat: -17.78, lon: -63.18 } };
    const invalido = await resolver(valores, contexto, opciones);
    expect(invalido.errors).toHaveProperty('frecuencia');
    const valido = await resolver({ ...valores, frecuencia: 'permanente' }, contexto, opciones);
    expect(valido.errors).toEqual({});
    const cuerpo = armarEnvio(
      valido.values as ValoresFormulario,
      contexto.ubicacion,
      [],
      { ...contexto.ubicacion, precision_m: 10, antiguedad_s: 1 },
      a,
    );
    expect(cuerpo.categoria).toBe('bache');
    expect(def.esquemaDetalle.safeParse(cuerpo.detalle).success).toBe(true);
    expect(a.previsualizarSeveridad(valido.values as ValoresFormulario)).toEqual({
      banda: 'critica',
    });
  });
  it('resuelve el identificador de la definición y conserva Inundaciones', () => {
    expect(adaptadorFormularioDe(DEFINICION_INUNDACION)).toBe(ADAPTADOR_INUNDACION);
    const especial = { ...ADAPTADOR_INUNDACION };
    expect(
      adaptadorFormularioDe(
        { ...DEFINICION_INUNDACION, componenteEspecialPaso2: 'prueba/paso2' },
        { 'prueba/paso2': especial },
      ),
    ).toBe(especial);
  });

  it('sin identificador usa preguntas declarativas incluso con un slug registrado', () => {
    const adaptador = adaptadorFormularioDe({
      ...DEFINICION_INUNDACION,
      componenteEspecialPaso2: undefined,
    });
    expect(adaptador.CuerpoPaso2).not.toBe(ADAPTADOR_INUNDACION.CuerpoPaso2);
    expect(adaptador.ExtraPaso3).toBeUndefined();
    expect(adaptador.aDetalle({ detalle: { prueba: true } } as never)).toEqual({ prueba: true });
  });

  it.each(['desconocido/paso2', '', 'constructor', 'toString', '__proto__'])(
    'rechaza explícitamente el identificador no registrado %j',
    (identificador) => {
      expect(() =>
        adaptadorFormularioDe({
          ...DEFINICION_INUNDACION,
          componenteEspecialPaso2: identificador,
        }),
      ).toThrow(/componente especial.*registrado/i);
    },
  );

  it('no consulta propiedades heredadas ni ejecuta sus getters', () => {
    const leerHeredado = vi.fn(() => ADAPTADOR_INUNDACION);
    const prototipo = Object.defineProperty({}, 'heredado/paso2', { get: leerHeredado });
    expect(() =>
      adaptadorFormularioDe(
        { ...DEFINICION_INUNDACION, componenteEspecialPaso2: 'heredado/paso2' },
        Object.create(prototipo),
      ),
    ).toThrow(/componente especial.*registrado/i);
    expect(leerHeredado).not.toHaveBeenCalled();
  });
});
