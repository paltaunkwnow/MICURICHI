import { DEFINICION_AREA_VERDE } from 'contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { UseFormReturn } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { type ValoresFormulario, valoresIniciales } from '@/lib/formulario-reporte';
import { crearAdaptadorGenerico } from './generico';
import { adaptadorFormularioDe } from './registro';

const AVISO =
  'Esto no es una denuncia. Se deriva a Desarrollo Social para ofrecer ayuda, no a seguridad. No subas fotos donde se vea la cara de la persona.';
const ahora = new Date('2026-10-22T12:00:00-04:00');

function valores(subtipo: string | null = 'persona_situacion_calle'): ValoresFormulario {
  return {
    ...valoresIniciales(),
    descripcion: 'Ejemplo sintético para comprobar el formulario de áreas verdes.',
    detalle: { gravedad_declarada: 'riesgo', tamano: 'rincon' },
    subtipo,
  } as ValoresFormulario;
}

function paso2(datos: ValoresFormulario, extraFoto = false) {
  const adaptador = adaptadorFormularioDe(DEFINICION_AREA_VERDE);
  const componente = extraFoto ? adaptador.ExtraPaso3 : adaptador.CuerpoPaso2;
  const form = {
    setValue: () => {},
    clearErrors: () => {},
  } as unknown as UseFormReturn<ValoresFormulario>;
  return componente
    ? renderToStaticMarkup(
        createElement(componente, {
          form,
          valores: datos,
          errores: {},
          definicion: DEFINICION_AREA_VERDE,
          ahora,
        }),
      )
    : '';
}

describe('Áreas verdes: envoltura del formulario declarativo real', () => {
  it('muestra el aviso literal y destino previsto con gravedad y tamaño intactos', () => {
    const marcado = paso2(valores());
    expect(marcado).toContain(AVISO);
    expect(marcado).toContain('Destino previsto: Desarrollo Social');
    expect(marcado).toContain('No hay derivación municipal automática.');
    expect(marcado).toContain('name="detalle.gravedad_declarada"');
    expect(marcado).toContain('name="detalle.tamano"');
    expect(marcado).not.toMatch(/oculta(?:mos|n)|difumina(?:mos|n)|sin fotos/);
  });

  it('deriva el aviso de la selección actual sin retener Persona al cambiar o reiniciar', () => {
    const datos = valores(null);
    expect(paso2(datos)).not.toContain(AVISO);
    datos.subtipo = 'persona_situacion_calle';
    expect(paso2(datos)).toContain(AVISO);
    datos.subtipo = 'arbol_rama_peligrosa';
    expect(paso2(datos)).not.toContain(AVISO);
    expect(paso2(datos)).toContain('Destino previsto: Parques y jardines');
    datos.subtipo = null;
    expect(paso2(datos)).not.toContain('Destino previsto:');
  });

  it('revisión y paso de fotos recuerdan el aviso, y cambian su destino sin texto stale', () => {
    const adaptador = adaptadorFormularioDe(DEFINICION_AREA_VERDE);
    const datos = valores();
    expect(adaptador.filasRevision(datos)).toContainEqual({
      etiqueta: 'Aviso',
      valor: AVISO,
      paso: 2,
    });
    expect(adaptador.filasRevision(datos)).toContainEqual({
      etiqueta: 'Destino previsto',
      valor: 'Desarrollo Social. No hay derivación municipal automática.',
      paso: 2,
    });
    expect(paso2(datos, true)).toContain(AVISO);
    datos.subtipo = 'pasto_sin_riego';
    expect(adaptador.filasRevision(datos)).not.toContainEqual(
      expect.objectContaining({ etiqueta: 'Aviso' }),
    );
    expect(adaptador.filasRevision(datos)).toContainEqual({
      etiqueta: 'Destino previsto',
      valor: 'Parques y jardines. No hay derivación municipal automática.',
      paso: 2,
    });
    expect(paso2(datos, true)).not.toContain(AVISO);
  });

  it('hereda validación, detalle y previsualización; el subtipo no cambia la severidad', () => {
    const adaptador = adaptadorFormularioDe(DEFINICION_AREA_VERDE);
    const generico = crearAdaptadorGenerico(DEFINICION_AREA_VERDE);
    const datos = valores();
    expect(adaptador.aDetalle(datos)).toEqual(generico.aDetalle(datos));
    expect(
      adaptador.esquemaFormulario.safeParse({ ...datos, lat: -17.78, lon: -63.18 }).success,
    ).toBe(true);
    for (const tipo of DEFINICION_AREA_VERDE.subtipos ?? []) {
      datos.subtipo = tipo.valor;
      expect(adaptador.previsualizarSeveridad(datos)).toEqual({ banda: 'alta' });
    }
    datos.detalle = { gravedad_declarada: 'riesgo' };
    expect(adaptador.esquemaFormulario.safeParse(datos).success).toBe(false);
    expect(adaptador.previsualizarSeveridad(datos)).toBeNull();
  });
});
