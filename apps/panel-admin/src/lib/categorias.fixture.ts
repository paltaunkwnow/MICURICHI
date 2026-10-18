import {
  crearRegistroCategorias,
  DEFINICION_INUNDACION,
  type DefinicionCategoria,
} from 'contracts';
import { z } from 'zod';
import type { ReportePanel } from './reportes-panel';

/** Definiciones y reportes SINTETICOS: importados solo por pruebas del panel. */
export const esquemaSintetico = z
  .object({
    tipo: z.enum(['hueco', 'grieta']),
    riesgo: z.boolean(),
    efectos: z.array(z.enum(['paso', 'ruido'])),
  })
  .strict();
export const categoriaSintetica: DefinicionCategoria<z.infer<typeof esquemaSintetico>, 'bache'> = {
  ...DEFINICION_INUNDACION,
  slug: 'bache',
  nombre: 'Baches de prueba',
  nombreCorto: 'Baches',
  descripcion: 'Definicion sintetica para pruebas',
  verbo: 'Reportar un daño de prueba',
  preguntaUbicacion: '¿Dónde está el daño de prueba?',
  textos: undefined,
  icono: 'TrafficCone',
  colores: { c1: '#fff7ed', c5: '#c2410c', c7: '#7c2d12' },
  esquemaDetalle: esquemaSintetico,
  detalleVersion: 7,
  componenteEspecialPaso2: undefined,
  avisoEmergencia: undefined,
  severidad: {
    version: 9,
    calcular: () => {
      throw new Error('El panel no calcula severidad');
    },
  },
  preguntas: [
    {
      id: 'tipo',
      etiqueta: 'Tipo de daño',
      tipo: 'opcion_unica',
      opciones: [
        { valor: 'hueco', etiqueta: 'Hueco en la vía' },
        { valor: 'grieta', etiqueta: 'Grieta visible' },
      ],
    },
    { id: 'riesgo', etiqueta: 'Riesgo al pasar', tipo: 'booleana' },
    {
      id: 'efectos',
      etiqueta: 'Efectos observados',
      tipo: 'opcion_multiple',
      opciones: [
        { valor: 'paso', etiqueta: 'Dificulta el paso' },
        { valor: 'ruido', etiqueta: 'Ruido al pasar' },
      ],
    },
  ],
  subtipos: [{ valor: 'calzada', etiqueta: 'Calzada de prueba' }],
  camposPublicos: ['tipo'],
  camposExportacion: [{ clave: 'tipo', encabezado: 'Tipo de daño' }],
  notaMetodologica: 'Nota sintetica de mantenimiento vial, no es un diagnostico.',
};
export const registroSintetico = crearRegistroCategorias([
  DEFINICION_INUNDACION,
  categoriaSintetica,
]);
export function reporteSintetico(categoria = 'inundacion'): ReportePanel {
  return {
    type: 'Feature',
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    geometry: { type: 'Point', coordinates: [-63.18, -17.78] },
    properties: {
      id: 'aaaaaaaa-0000-4000-8000-000000000001',
      categoria,
      subtipo: categoria === 'bache' ? 'calzada' : null,
      detalle:
        categoria === 'inundacion'
          ? {
              profundidad_estimada: 'rodilla',
              frecuencia: 'ocasional',
              causa_presunta: 'desconocida',
              sumidero_cercano: null,
              sumidero_estado: null,
              agua_brota_sumidero: null,
            }
          : { tipo: 'hueco', riesgo: true, efectos: ['paso'] },
      creado_en: '2026-10-15T12:00:00Z',
      evento_en: null,
      actualizado_en: '2026-10-15T12:00:00Z',
      distrito: null,
      unidad_vecinal: null,
      descripcion: 'Reporte sintetico para verificar el panel.',
      fotos: [],
      profundidad_estimada: categoria === 'inundacion' ? 'rodilla' : null,
      frecuencia: categoria === 'inundacion' ? 'ocasional' : null,
      causa_presunta: categoria === 'inundacion' ? 'desconocida' : null,
      sumidero_cercano: null,
      sumidero_estado: null,
      agua_brota_sumidero: null,
      severidad: 'media',
      severidad_calculada: 'media',
      severidad_manual: null,
      severidad_motivo: null,
      severidad_puntaje: 6,
      estado: 'nuevo',
      estado_motivo: null,
      verificado: false,
      punto_critico_id: null,
      n_reportes_punto: null,
      precision_degradada: false,
      ubicacion_metodo: 'gps',
      precision_gps_m: 5,
      distancia_dispositivo_m: 0,
      ubicacion_tipo: 'via_publica',
      fusionado_en_id: null,
      validado_por: null,
      validado_en: null,
      version_capa: 'SINTETICA',
      resolucion_flags: {},
      autor_id: null,
    },
  };
}
