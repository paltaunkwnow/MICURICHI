import { CONFIG_DOMINIO } from '../../dominio/config.js';
import type { DefinicionCategoria } from '../tipos.js';
import { type DetalleAreaVerde, DetalleAreaVerdeSchema } from './esquema.js';
import { calcularSeveridadAreaVerde, SEVERIDAD_AREA_VERDE_VERSION } from './severidad.js';

/** Parámetros de la entrega local aprobada; privacidad en producción pendiente (ADR 0018). */
export const DEFINICION_AREA_VERDE: DefinicionCategoria<DetalleAreaVerde, 'area_verde'> = {
  slug: 'area_verde',
  nombre: 'Áreas verdes',
  nombreCorto: 'Área verde',
  descripcion: 'Cómo están las áreas verdes de la ciudad, según los vecinos.',
  verbo: 'Reportar un área verde',
  preguntaUbicacion: '¿Dónde está el problema en el área verde?',
  textos: {
    puntosDelMapa: 'puntos de áreas verdes',
    puntoSingular: 'Área verde',
    listaVaciaCuerpo:
      'Que no haya reportes no significa que no haya problemas en las áreas verdes. Si conocés uno, sos el primero en marcarlo.',
    tituloPaso2: '¿Qué tan grave es y qué tamaño tiene?',
    avisoPercepcion:
      'la gravedad y el tamaño son estimaciones ciudadanas, no mediciones del área verde',
    descripcionReportar: 'Marcá un problema en un área verde de tu barrio.',
  },
  icono: 'Trees',
  colores: { c1: '#E1F2EE', c5: '#2E8B76', c7: '#0F6E5C' },
  esquemaDetalle: DetalleAreaVerdeSchema,
  detalleVersion: 1,
  subtipos: [
    { valor: 'parque_plaza_descuidada', etiqueta: 'Parque o plaza descuidada' },
    { valor: 'juegos_infantiles_rotos', etiqueta: 'Juegos infantiles rotos' },
    { valor: 'arbol_rama_peligrosa', etiqueta: 'Árbol caído o rama peligrosa' },
    { valor: 'pasto_sin_riego', etiqueta: 'Pasto seco o sin riego' },
    { valor: 'persona_situacion_calle', etiqueta: 'Persona en situación de calle' },
  ],
  preguntas: [
    {
      id: 'gravedad_declarada',
      etiqueta: '¿Qué tan grave es?',
      tipo: 'opcion_unica',
      obligatoria: true,
      opciones: [
        { valor: 'descuidado', etiqueta: 'Se ve descuidado' },
        { valor: 'uso_limitado', etiqueta: 'Ya no se puede usar bien' },
        { valor: 'riesgo', etiqueta: 'Es un riesgo para quien va' },
        { valor: 'peligro_inmediato', etiqueta: 'Peligro inmediato' },
      ],
    },
    {
      id: 'tamano',
      etiqueta: '¿Qué tamaño tiene?',
      tipo: 'opcion_unica',
      obligatoria: true,
      opciones: [
        { valor: 'rincon', etiqueta: 'Un rincón' },
        { valor: 'media_plaza', etiqueta: 'Media plaza' },
        { valor: 'casi_toda_plaza', etiqueta: 'Casi toda la plaza' },
        { valor: 'toda_area_verde', etiqueta: 'Toda el área verde' },
      ],
    },
  ],
  severidad: { version: SEVERIDAD_AREA_VERDE_VERSION, calcular: calcularSeveridadAreaVerde },
  filtros: [{ id: 'severidad', etiqueta: 'Severidad', campo: 'severidad', alcance: 'categoria' }],
  recurrenciaRadioM: 10,
  cupo: {
    id: 'reportes_por_dia',
    ambito: 'cuenta+categoria',
    ventana: 'dia_local',
    limite: CONFIG_DOMINIO.REPORTES_POR_DIA_POR_CUENTA,
  },
  ubicacionTipoPorDefecto: 'via_publica',
  camposPublicos: ['gravedad_declarada', 'tamano'],
  camposExportacion: [
    { clave: 'gravedad_declarada', encabezado: 'gravedad_declarada' },
    { clave: 'tamano', encabezado: 'tamano' },
  ],
  notaMetodologica:
    'La gravedad y el tamaño en áreas verdes son percepción ciudadana, no mediciones ' +
    'ni un diagnóstico técnico. La ubicación tiene el error del GPS o de la mano de la persona. ' +
    'La ausencia de reportes no significa ausencia de problemas. Los reportes «NO SE HA VERIFICADO» ' +
    'pueden ser erróneos y requieren revisión técnica. El índice de severidad es auxiliar y no comparable ' +
    'con otras categorías. Persona en situación de calle: esto no es una denuncia; el destino previsto ' +
    'es Desarrollo Social para ofrecer ayuda, no seguridad. No subas fotos donde se vea la cara de la persona. ' +
    'Para los demás subtipos se prevé Parques y jardines. No hay derivación municipal automática. ' +
    'En este entorno local se conserva el comportamiento de fotos autorizado: no hay ocultación ni ' +
    'difuminado garantizados. Las pruebas usan personas y fotos sintéticas. Visibilidad, fotos, moderación, ' +
    'retención y marco legal deben resolverse antes de producción. Los parámetros locales deben validarse con el municipio.',
  geometria: 'punto',
  componenteEspecialPaso2: 'area_verde/paso2',
};
