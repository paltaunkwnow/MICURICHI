import { CONFIG_DOMINIO } from '../../dominio/config.js';
import type { DefinicionCategoria } from '../tipos.js';
import { type DetalleBasura, DetalleBasuraSchema } from './esquema.js';
import { calcularSeveridadBasura, SEVERIDAD_BASURA_VERSION } from './severidad.js';

/** Parámetros de la entrega local aprobada; validación municipal pendiente. */
export const DEFINICION_BASURA: DefinicionCategoria<DetalleBasura, 'basura'> = {
  slug: 'basura',
  nombre: 'Basura',
  nombreCorto: 'Basura',
  descripcion: 'Dónde se acumula basura en la ciudad, según los vecinos.',
  verbo: 'Reportar basura',
  preguntaUbicacion: '¿Dónde está la basura?',
  textos: {
    puntosDelMapa: 'puntos de basura',
    puntoSingular: 'Basura',
    listaVaciaCuerpo:
      'Que no haya reportes no significa que no haya basura. Si conocés un punto, sos el primero en marcarlo.',
    tituloPaso2: '¿Qué tan grave es y qué tamaño tiene?',
    avisoPercepcion:
      'la gravedad y el tamaño son estimaciones ciudadanas, no mediciones de residuos',
    descripcionReportar: 'Marcá dónde hay basura en tu barrio.',
  },
  icono: 'Trash2',
  colores: { c1: '#F1EBF8', c5: '#8462B8', c7: '#6B3FA0' },
  esquemaDetalle: DetalleBasuraSchema,
  detalleVersion: 1,
  subtipos: [
    { valor: 'microbasural', etiqueta: 'Microbasural' },
    { valor: 'contenedor_desbordado', etiqueta: 'Contenedor desbordado' },
    { valor: 'quema_basura', etiqueta: 'Quema de basura' },
    { valor: 'escombros_via', etiqueta: 'Escombros en la vía' },
    { valor: 'basura_canal', etiqueta: 'Basura en un canal' },
  ],
  preguntas: [
    {
      id: 'gravedad_declarada',
      etiqueta: '¿Qué tan grave es?',
      tipo: 'opcion_unica',
      obligatoria: true,
      opciones: [
        { valor: 'bolsas_sueltas', etiqueta: 'Unas bolsas sueltas' },
        { valor: 'acumulada_dias', etiqueta: 'Se acumula hace días' },
        { valor: 'ocupa_via', etiqueta: 'Ocupa la vereda o la calle' },
        { valor: 'quema_o_desague', etiqueta: 'Hay quema o tapa un desagüe' },
      ],
    },
    {
      id: 'tamano',
      etiqueta: '¿Qué tamaño tiene?',
      tipo: 'opcion_unica',
      obligatoria: true,
      opciones: [
        { valor: 'bolsas', etiqueta: 'Unas bolsas' },
        { valor: 'carretilla', etiqueta: 'Una carretilla' },
        { valor: 'camioneta', etiqueta: 'Una camioneta' },
        { valor: 'camion_o_mas', etiqueta: 'Un camión o más' },
      ],
    },
  ],
  severidad: { version: SEVERIDAD_BASURA_VERSION, calcular: calcularSeveridadBasura },
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
    'La gravedad y el tamaño de la basura son percepción ciudadana, no mediciones de residuos ' +
    'ni un diagnóstico técnico. La ubicación tiene el error del GPS o de la mano de la persona. ' +
    'La ausencia de reportes no significa ausencia de basura. Los reportes «NO SE HA VERIFICADO» ' +
    'pueden ser erróneos y requieren revisión técnica. El índice de severidad es auxiliar y no comparable ' +
    'con otras categorías. Reportar quema no sustituye la atención de emergencias. ' +
    'No hay derivación municipal automática. Los parámetros locales deben validarse con el municipio.',
  geometria: 'punto',
  componenteEspecialPaso2: 'basura/paso2',
};
