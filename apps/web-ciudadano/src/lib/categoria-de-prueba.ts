/**
 * Una segunda categoría SINTÉTICA para probar la web con dos categorías activas mientras el registro
 * real solo tiene Inundaciones (D3 del plan M4: meter una de prueba en el bundle del navegador sería
 * código de prueba en producción, así que vive acá y solo la importan los `*.test.ts`). Se inyecta
 * con `<ProveedorCategorias registro={…}>`, igual que `DEF_BACHE` en `api-core/test/cupo-diario.test.ts`.
 */
import {
  crearRegistroCategorias,
  DEFINICION_INUNDACION,
  type DefinicionCategoriaCualquiera,
  type RegistroCategorias,
  type SlugCategoria,
} from 'contracts';
import { type ComponentProps, createElement, type ReactElement, type ReactNode } from 'react';
import type { ReporteFeature } from './api';
import { ProveedorCategorias } from './categorias-contexto';

export const DEFINICION_BACHE_DE_PRUEBA = {
  ...DEFINICION_INUNDACION,
  slug: 'bache',
  nombre: 'Baches',
  nombreCorto: 'Bache',
  descripcion: 'Dónde está roto el pavimento, según los vecinos.',
  icono: 'TrafficCone',
  colores: { c1: '#F6EDE3', c5: '#9C6A35', c7: '#7A4E1E' },
  textos: {
    puntosDelMapa: 'puntos de bache',
    puntoSingular: 'Punto de bache',
    listaVaciaCuerpo: 'Que no haya puntos no significa que no haya baches (texto sintético).',
    tituloPaso2: '¿Qué tan grande es el bache?',
    avisoPercepcion: 'el tamaño se estima a ojo',
    descripcionReportar: 'Marcá el bache que ves en tu calle.',
  },
  preguntas: [
    {
      id: 'tamano',
      etiqueta: 'Tamaño del bache',
      tipo: 'opcion_unica',
      opciones: [
        { valor: 'chico', etiqueta: 'Chico, como un plato' },
        { valor: 'grande', etiqueta: 'Grande, como una llanta' },
      ],
    },
    { id: 'hay_riesgo', etiqueta: '¿Es peligroso para el tránsito?', tipo: 'booleana' },
    {
      id: 'afecta_a',
      etiqueta: 'Afecta a',
      tipo: 'opcion_multiple',
      opciones: [
        { valor: 'autos', etiqueta: 'Autos' },
        { valor: 'motos', etiqueta: 'Motos' },
      ],
    },
    { id: 'interna', etiqueta: 'Dato interno', tipo: 'opcion_unica' },
  ],
  // `interna` NO es pública: el presentador genérico no puede mostrarla aunque el detalle la traiga.
  camposPublicos: ['tamano', 'hay_riesgo', 'afecta_a'],
  componenteEspecialPaso2: undefined,
} as unknown as DefinicionCategoriaCualquiera;

/** Inundaciones y la sintética: el registro con dos categorías, en el orden de la plataforma. */
export const REGISTRO_DOS_CATEGORIAS: RegistroCategorias = crearRegistroCategorias([
  DEFINICION_INUNDACION,
  DEFINICION_BACHE_DE_PRUEBA,
]);

/**
 * `hijo` dentro de `<ProveedorCategorias>` con esas activas y ese registro (el real, si no se pasa
 * otro). Los hijos van en las props porque el tipo del proveedor los pide ahí.
 */
export function conCategorias(
  activas: readonly SlugCategoria[],
  hijo: ReactNode,
  registro?: RegistroCategorias,
): ReactElement {
  // Las props van como `ComponentProps` porque el tipo del proveedor pide los hijos ahí y `createElement`
  // los recibe como tercer argumento.
  return createElement(
    ProveedorCategorias,
    { activas, registro } as unknown as ComponentProps<typeof ProveedorCategorias>,
    hijo,
  );
}

/** Un reporte público de prueba. Sin `categoria` ni `detalle` es la respuesta anterior a 0.20.0. */
export function reporteDePrueba(extra: Record<string, unknown> = {}): ReporteFeature {
  return {
    type: 'Feature',
    id: '22222222-2222-4222-8222-222222222222',
    geometry: { type: 'Point', coordinates: [-63.18, -17.78] },
    properties: {
      id: '22222222-2222-4222-8222-222222222222',
      creado_en: '2026-09-27T10:00:00-04:00',
      evento_en: null,
      distrito: { id: 'distrito_municipal:01', codigo: '01', nombre: 'Distrito 01' },
      unidad_vecinal: { id: 'unidad_vecinal:57', codigo: '57', nombre: 'Unidad Vecinal 57' },
      descripcion: 'Se junta el agua en la esquina después de cada lluvia fuerte.',
      fotos: [],
      profundidad_estimada: 'rodilla',
      frecuencia: 'cada_lluvia_fuerte',
      causa_presunta: 'desconocida',
      severidad: 'alta',
      severidad_calculada: 'alta',
      estado: 'validado',
      verificado: true,
      punto_critico_id: null,
      n_reportes_punto: null,
      precision_degradada: false,
      ...extra,
    },
  } as ReporteFeature;
}
