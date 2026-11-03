import { DEFINICION_BASURA } from 'contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { UseFormReturn } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { type ValoresFormulario, valoresIniciales } from '@/lib/formulario-reporte';
import { crearAdaptadorGenerico } from './generico';
import { adaptadorFormularioDe } from './registro';

const AVISO = 'Reportar quema de basura no sustituye la atención de emergencias.';
const ahora = new Date('2026-10-22T12:00:00-04:00');

describe('Basura: aviso sobre el formulario declarativo real', () => {
  it('seleccionar y cambiar Quema actualiza el formulario y la revisión sin escalar severidad', () => {
    const adaptador = adaptadorFormularioDe(DEFINICION_BASURA);
    const datos = {
      ...valoresIniciales(),
      subtipo: undefined,
      detalle: { gravedad_declarada: 'bolsas_sueltas', tamano: 'bolsas' },
    } as ValoresFormulario;
    const form = {
      setValue: () => {},
      clearErrors: () => {},
    } as unknown as UseFormReturn<ValoresFormulario>;
    const marcado = () =>
      renderToStaticMarkup(
        createElement(adaptador.CuerpoPaso2, {
          form,
          valores: datos,
          errores: {},
          definicion: DEFINICION_BASURA,
          ahora,
        }),
      );
    expect(marcado()).not.toContain(AVISO);
    datos.subtipo = 'quema_basura';
    expect(marcado()).toContain(AVISO);
    expect(marcado()).toContain('role="status"');
    expect(marcado()).toContain('name="detalle.gravedad_declarada"');
    expect(marcado()).toContain('name="detalle.tamano"');
    expect(marcado()).not.toMatch(/911|112|110/);
    expect(adaptador.filasRevision(datos)).toContainEqual({
      etiqueta: 'Aviso',
      valor: AVISO,
      paso: 2,
    });
    expect(adaptador.previsualizarSeveridad(datos)).toEqual({ banda: 'baja' });
    datos.subtipo = 'microbasural';
    expect(marcado()).not.toContain(AVISO);
    expect(adaptador.filasRevision(datos)).not.toContainEqual(
      expect.objectContaining({ etiqueta: 'Aviso' }),
    );
    expect(adaptador.previsualizarSeveridad(datos)).toEqual({ banda: 'baja' });
    datos.subtipo = null;
    expect(marcado()).not.toContain(AVISO);
  });

  it('conserva exactamente las reglas y el detalle del genérico, incluidos negativos', () => {
    const adaptador = adaptadorFormularioDe(DEFINICION_BASURA);
    const generico = crearAdaptadorGenerico(DEFINICION_BASURA);
    const datos = {
      ...valoresIniciales(),
      lat: -17.78,
      lon: -63.18,
      descripcion: 'Ejemplo sintético de basura acumulada en la vereda.',
      subtipo: 'quema_basura',
      detalle: { gravedad_declarada: 'ocupa_via', tamano: 'carretilla' },
    } as ValoresFormulario;
    expect(adaptador.prepararParaValidar(datos)).toEqual(generico.prepararParaValidar(datos));
    expect(adaptador.aDetalle(datos)).toEqual(generico.aDetalle(datos));
    expect(adaptador.esquemaFormulario.safeParse(datos).success).toBe(true);
    for (const detalle of [
      {},
      { ...datos.detalle, profundidad_estimada: 'rodilla' },
      { gravedad_declarada: 'riesgo', tamano: 'rincon' },
    ]) {
      expect(adaptador.esquemaFormulario.safeParse({ ...datos, detalle }).success).toBe(false);
    }
    expect(adaptador.esquemaFormulario.safeParse({ ...datos, subtipo: 'otro' }).success).toBe(
      false,
    );
  });
});
