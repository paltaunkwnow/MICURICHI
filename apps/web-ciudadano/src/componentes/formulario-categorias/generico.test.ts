import { ReporteCrearCategoriaSchema } from 'contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { guardarBorrador, leerBorrador } from '@/lib/borrador';
import { DEFINICION_BACHE_DE_PRUEBA } from '@/lib/categoria-de-prueba';
import {
  armarEnvio,
  crearResolverFormulario,
  pasoDelError,
  type ValoresFormulario,
  valoresIniciales,
  valoresTrasCambiarCategoria,
} from '@/lib/formulario-reporte';
import { crearAdaptadorGenerico } from './generico';

const def = {
  ...DEFINICION_BACHE_DE_PRUEBA,
  subtipos: [{ valor: 'prueba', etiqueta: 'Subtipo sintético' }],
  ubicacionTipoPorDefecto: 'vivienda_o_predio' as const,
};
const opciones = {
  criteriaMode: 'firstError' as const,
  fields: {},
  shouldUseNativeValidation: false,
};
const completos = () =>
  ({
    ...valoresIniciales(),
    detalle: { tamano: 'grande', hay_riesgo: true, afecta_a: ['autos'] },
    subtipo: 'prueba',
    descripcion: 'Un reporte sintético para probar el adaptador.',
  }) as ValoresFormulario;
afterEach(() => vi.unstubAllGlobals());

describe('formulario declarativo de extremo a extremo, con definición sintética', () => {
  it('resuelve, envía y restaura detalle y subtipo sin campos ocultos de inundación', async () => {
    const adaptador = crearAdaptadorGenerico(def);
    const resuelto = await crearResolverFormulario(adaptador)(
      completos(),
      { ubicacion: { lat: -17.78, lon: -63.18 } },
      opciones,
    );
    expect(resuelto.errors).toEqual({});
    const valores = resuelto.values as ValoresFormulario;
    const cuerpo = armarEnvio(
      valores,
      { lat: -17.78, lon: -63.18 },
      [],
      { lat: -17.78, lon: -63.18, precision_m: 10, antiguedad_s: 1 },
      adaptador,
    );
    expect(cuerpo).toMatchObject({
      categoria: 'bache',
      subtipo: 'prueba',
      detalle: completos().detalle,
    });
    expect(ReporteCrearCategoriaSchema.safeParse(cuerpo).success).toBe(true);
    expect(def.esquemaDetalle.safeParse(cuerpo.detalle).success).toBe(true);
    expect(adaptador.filasRevision(valores)).toContainEqual({
      etiqueta: 'Subtipo',
      valor: 'Subtipo sintético',
      paso: 2,
    });
    const datos = new Map<string, string>();
    vi.stubGlobal('window', {
      sessionStorage: {
        setItem: (k: string, v: string) => datos.set(k, v),
        getItem: (k: string) => datos.get(k) ?? null,
      },
    });
    guardarBorrador({
      categoria: 'bache',
      paso: 4,
      ubicacion: null,
      resuelto: null,
      fotos: [],
      valores,
      clave: 'prueba',
    });
    const restaurado = leerBorrador('bache');
    expect(restaurado?.valores).toMatchObject({ subtipo: 'prueba', detalle: completos().detalle });
  });
  it('rechaza subtipo desconocido y detalle inválido en el paso 2', async () => {
    const adaptador = crearAdaptadorGenerico(def);
    const v = { ...completos(), subtipo: 'ajeno', detalle: { tamano: 'imposible' } };
    const r = await crearResolverFormulario(adaptador)(v, undefined, opciones);
    expect(r.errors).toHaveProperty('subtipo');
    expect(r.errors).toHaveProperty('detalle');
    expect(pasoDelError(Object.keys(r.errors), adaptador.pasoDeCampo)).toBe(2);
    expect(adaptador.puedeAvanzarPaso2(v, new Date())).toBe(false);
  });
  it('aplica el lugar por defecto y conserva solo un lugar elegido al cambiar', () => {
    const inicial = crearAdaptadorGenerico(def).valoresIniciales();
    expect(inicial.ubicacion_tipo).toBe('vivienda_o_predio');
    expect(valoresTrasCambiarCategoria(completos(), inicial, false).ubicacion_tipo).toBe(
      'vivienda_o_predio',
    );
    expect(valoresTrasCambiarCategoria(completos(), inicial, true).ubicacion_tipo).toBe(
      'via_publica',
    );
  });
});
