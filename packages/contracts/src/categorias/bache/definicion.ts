import { CONFIG_DOMINIO } from '../../dominio/config.js';
import type { DefinicionCategoria } from '../tipos.js';
import { type DetalleBache, DetalleBacheSchema } from './esquema.js';
import { calcularSeveridadBache, SEVERIDAD_BACHE_VERSION } from './severidad.js';

/** Parámetros aprobados para el piloto local; validación municipal pendiente (ADR 0024). */
export const DEFINICION_BACHE: DefinicionCategoria<DetalleBache, 'bache'> = {
  slug: 'bache',
  nombre: 'Baches',
  nombreCorto: 'Bache',
  descripcion: 'Dónde hay baches en la ciudad, según los vecinos.',
  verbo: 'Reportar un bache',
  preguntaUbicacion: '¿Dónde está el bache?',
  textos: {
    puntosDelMapa: 'puntos de baches',
    puntoSingular: 'Bache',
    listaVaciaCuerpo:
      'Que no haya reportes no significa que no haya baches. Si conocés uno, sos el primero en marcarlo.',
    tituloPaso2: '¿Qué tan grave es y qué tamaño tiene?',
    avisoPercepcion:
      'la gravedad y el tamaño son estimaciones ciudadanas, no mediciones de pavimento',
    descripcionReportar: 'Marcá dónde hay un bache en tu barrio.',
  },
  icono: 'TrafficCone',
  colores: { c1: '#F6EDE3', c5: '#9C6A35', c7: '#7A4E1E' },
  esquemaDetalle: DetalleBacheSchema,
  detalleVersion: 1,
  subtipos: [
    { valor: 'bache', etiqueta: 'Bache', ayuda: 'Pozo en el asfalto' },
    { valor: 'hundimiento_calzada', etiqueta: 'Hundimiento de calzada', ayuda: 'La calle cedió' },
    {
      valor: 'tapa_alcantarilla_faltante',
      etiqueta: 'Tapa de alcantarilla faltante',
      ayuda: 'Pozo abierto',
    },
    { valor: 'asfalto_levantado', etiqueta: 'Asfalto levantado', ayuda: 'Capa suelta o rota' },
    {
      valor: 'calle_tierra_intransitable',
      etiqueta: 'Calle de tierra intransitable',
      ayuda: 'Barro o zanjas',
    },
  ],
  preguntas: [
    {
      id: 'gravedad_declarada',
      etiqueta: '¿Qué tan grave es?',
      tipo: 'opcion_unica',
      obligatoria: true,
      opciones: [
        { valor: 'se_puede_pasar', etiqueta: 'Molesta, pero se puede pasar' },
        { valor: 'hay_que_esquivar', etiqueta: 'Hay que esquivarlo' },
        { valor: 'peligroso', etiqueta: 'Es peligroso, sobre todo de noche' },
        { valor: 'causo_accidente', etiqueta: 'Ya causó un accidente' },
      ],
    },
    {
      id: 'tamano',
      etiqueta: '¿Qué tamaño tiene?',
      tipo: 'opcion_unica',
      obligatoria: true,
      opciones: [
        { valor: 'plato', etiqueta: 'Como un plato' },
        { valor: 'rueda', etiqueta: 'Como una rueda' },
        { valor: 'medio_carril', etiqueta: 'Medio carril' },
        { valor: 'todo_el_carril', etiqueta: 'Todo el carril' },
      ],
    },
  ],
  severidad: { version: SEVERIDAD_BACHE_VERSION, calcular: calcularSeveridadBache },
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
    'La gravedad y el tamaño de los baches son percepción ciudadana, no una medición de pavimento ' +
    'ni un diagnóstico técnico. «Ya causó un accidente» es una declaración, no una comprobación de accidente. ' +
    'La ubicación tiene el error del GPS o de la mano de la persona. La ausencia de reportes no significa ' +
    'ausencia de baches. Los reportes «NO SE HA VERIFICADO» pueden ser erróneos y requieren revisión técnica. ' +
    'El índice de severidad es auxiliar y no comparable con otras categorías. Cualquier intervención ' +
    'requiere estudio técnico formal. Los parámetros del piloto deben validarse con el municipio.',
  geometria: 'punto',
};
