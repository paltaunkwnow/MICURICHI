import {
  DEFINICION_AREA_VERDE,
  DEFINICION_BACHE,
  DEFINICION_BASURA,
  DEFINICION_INUNDACION,
  REGISTRO_CATEGORIAS,
  ReporteCrearCategoriaSchema,
} from 'contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { type UseFormReturn, useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adaptadorFormularioDe } from '@/componentes/formulario-categorias/registro';
import { activasDelRegistro, resolverCategoriaDeUrl } from './categoria';
import {
  armarEnvio,
  crearResolverFormulario,
  type ValoresFormulario,
  valoresIniciales,
  valoresTrasCambiarCategoria,
} from './formulario-reporte';

const punto = { lat: -17.78, lon: -63.18 };
const dispositivo = { ...punto, precision_m: 10, antiguedad_s: 1 };
const foto = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp';
const ahora = new Date('2026-10-22T12:00:00-04:00');
const nuevas = [DEFINICION_AREA_VERDE, DEFINICION_BASURA];
afterEach(() => vi.unstubAllEnvs());

describe('cuatro definiciones reales: formulario común, envío y cambio', () => {
  it.each(nuevas)(
    '$slug: render real conserva etiquetas y envío válido de todos los subtipos',
    async (def) => {
      const adaptador = adaptadorFormularioDe(def);
      const detalle = Object.fromEntries(def.preguntas.map((p) => [p.id, p.opciones?.[0]?.valor]));
      for (const tipo of def.subtipos ?? []) {
        let formulario: UseFormReturn<ValoresFormulario> | undefined;
        // SSR no ejecuta los efectos de montaje de useForm: cada selección necesita su montaje.
        function Montaje() {
          const form = useForm<ValoresFormulario>({
            defaultValues: {
              ...valoresIniciales(),
              ...adaptador.valoresIniciales(),
              descripcion: 'Reporte sintético para verificar las cuatro categorías.',
              subtipo: tipo.valor,
              detalle,
            },
          });
          formulario = form;
          return createElement(adaptador.CuerpoPaso2, {
            form,
            valores: form.getValues(),
            errores: {},
            definicion: def,
            ahora,
          });
        }
        const marcado = renderToStaticMarkup(createElement(Montaje));
        for (const pregunta of def.preguntas) {
          expect(marcado).toContain(pregunta.etiqueta);
          for (const opcion of pregunta.opciones ?? []) expect(marcado).toContain(opcion.etiqueta);
        }
        if (!formulario) throw new Error('No se montó el formulario real.');
        const valores = formulario.getValues();
        expect(valores.subtipo).toBe(tipo.valor);
        const resultado = await crearResolverFormulario(adaptador)(
          valores,
          { ubicacion: punto },
          {
            criteriaMode: 'firstError',
            fields: {},
            shouldUseNativeValidation: false,
          },
        );
        expect(resultado.errors).toEqual({});
        const cuerpo = armarEnvio(valores, punto, [{ objeto_key: foto }], dispositivo, adaptador);
        expect(ReporteCrearCategoriaSchema.safeParse(cuerpo).success).toBe(true);
        expect(def.esquemaDetalle.safeParse(cuerpo.detalle).success).toBe(true);
        expect(cuerpo).toMatchObject({
          categoria: def.slug,
          subtipo: tipo.valor,
          detalle,
          fotos: [foto],
          dispositivo,
        });
        expect(cuerpo).not.toHaveProperty('severidad');
        expect(cuerpo).not.toHaveProperty('distrito_id');
        expect(cuerpo).not.toHaveProperty('profundidad_estimada');
        expect(adaptador.filasRevision(valores)).toContainEqual({
          etiqueta: 'Tipo de problema',
          valor: tipo.etiqueta,
          paso: 2,
        });
      }
    },
  );

  it('cambia Persona a Basura sin mezclar detalle/subtipo ni perder fotos y ubicación', () => {
    const area = adaptadorFormularioDe(DEFINICION_AREA_VERDE);
    const basura = adaptadorFormularioDe(DEFINICION_BASURA);
    const datos = {
      ...valoresIniciales(),
      ...area.valoresIniciales(),
      ...punto,
      subtipo: 'persona_situacion_calle',
      detalle: { gravedad_declarada: 'riesgo', tamano: 'rincon' },
      fotos: [foto],
      descripcion: 'Ejemplo sintético de cambio de categoría.',
    } as ValoresFormulario;
    const nuevos = valoresTrasCambiarCategoria(datos, basura.valoresIniciales());
    expect(nuevos).toMatchObject({
      ...punto,
      fotos: [foto],
      detalle: {},
      descripcion: datos.descripcion,
    });
    expect(nuevos.subtipo).toBeUndefined();
    expect(basura.filasRevision(nuevos)).toEqual([]);
    expect(basura.previsualizarSeveridad(nuevos)).toBeNull();
  });

  it('registro y catálogo siguen siendo necesarios y la URL admite las cuatro sin activarlas', () => {
    const activas = ['inundacion', 'bache', 'area_verde', 'basura'] as const;
    expect(REGISTRO_CATEGORIAS.slugs).toEqual(activas);
    expect(activasDelRegistro(['inundacion'], REGISTRO_CATEGORIAS)).toEqual(['inundacion']);
    expect(activasDelRegistro(activas, REGISTRO_CATEGORIAS)).toEqual(activas);
    for (const def of [DEFINICION_INUNDACION, DEFINICION_BACHE, ...nuevas]) {
      const resultado = resolverCategoriaDeUrl({
        href: `https://ejemplo.test/mapa?categoria=${def.slug}`,
        activas,
        guardada: null,
        registro: REGISTRO_CATEGORIAS,
      });
      expect(resultado.efectiva).toBe(def.slug);
    }
  });
});

describe('salida Next optativa de la instalación local', () => {
  it.each(['', '0', 'true', '1'])(
    'solo el valor literal 1 activa el directorio propio (%j)',
    async (valor) => {
      vi.stubEnv('CURICHI_INSTALACION_LOCAL', valor);
      vi.resetModules();
      const config = (await import('../../next.config')).default;
      expect(config.distDir).toBe(valor === '1' ? '.next-multitematica' : undefined);
      expect(config.output).toBe('standalone');
      expect(config.rewrites).toBeUndefined();
      expect(config.env).toBeUndefined();
    },
  );
});
