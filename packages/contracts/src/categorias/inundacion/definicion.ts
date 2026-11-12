/**
 * Definición de la categoría Inundaciones (ADR 0009, 0022). Es el módulo 1 de la plataforma: la
 * misma lógica del sistema actual, descrita como datos, sin cambiar su comportamiento. Textos,
 * severidad, radio y cupo se toman de las fuentes existentes (ETIQUETAS, `dominio/severidad`,
 * `CONFIG_DOMINIO`), no se reescriben.
 */

import { CONFIG_DOMINIO, NOTA_METODOLOGICA } from '../../dominio/config.js';
import {
  CAUSAS_PRESUNTAS,
  ETIQUETAS,
  FRECUENCIAS,
  PROFUNDIDADES,
  SUMIDERO_CERCANO,
  SUMIDERO_ESTADOS,
} from '../../dominio/enums.js';
import { calcularSeveridad, SEVERIDAD_VERSION } from '../../dominio/severidad.js';
import type {
  CampoExportacion,
  DefinicionCategoria,
  FiltroDef,
  Pregunta,
  ReglaCupo,
} from '../tipos.js';
import { type DetalleInundacion, DetalleInundacionSchema } from './esquema.js';

/** Preguntas del paso 2, con los textos y las opciones de la interfaz actual. */
const PREGUNTAS: readonly Pregunta[] = [
  {
    id: 'profundidad_estimada',
    etiqueta: ETIQUETAS.campos.profundidad_estimada,
    ayuda: '¿Hasta dónde llegaba el agua? Tomá tu cuerpo como referencia.',
    tipo: 'opcion_unica',
    obligatoria: true,
    opciones: PROFUNDIDADES.map((p) => ({
      valor: p,
      etiqueta: ETIQUETAS.profundidad[p].corta,
      ayuda: ETIQUETAS.profundidad[p].rango,
    })),
  },
  {
    id: 'frecuencia',
    etiqueta: 'Frecuencia',
    tipo: 'opcion_unica',
    obligatoria: true,
    opciones: FRECUENCIAS.map((f) => ({ valor: f, etiqueta: ETIQUETAS.frecuencia[f] })),
  },
  {
    id: 'causa_presunta',
    etiqueta: '¿Por qué creés que pasa?',
    tipo: 'opcion_unica',
    obligatoria: false,
    opciones: CAUSAS_PRESUNTAS.map((c) => ({ valor: c, etiqueta: ETIQUETAS.causa_presunta[c] })),
  },
  {
    id: 'sumidero_cercano',
    etiqueta: ETIQUETAS.campos.sumidero_cercano,
    tipo: 'opcion_unica',
    obligatoria: false,
    opciones: SUMIDERO_CERCANO.map((v) => ({ valor: v, etiqueta: ETIQUETAS.sumidero_cercano[v] })),
  },
  {
    id: 'sumidero_estado',
    etiqueta: ETIQUETAS.campos.sumidero_estado,
    tipo: 'opcion_unica',
    obligatoria: false,
    opciones: SUMIDERO_ESTADOS.map((v) => ({ valor: v, etiqueta: ETIQUETAS.sumidero_estado[v] })),
  },
  {
    id: 'agua_brota_sumidero',
    etiqueta: 'El agua brota del sumidero cuando llueve',
    tipo: 'booleana',
    obligatoria: false,
  },
];

/** Severidad: la v2 (`cada_lluvia_fuerte`) REEXPORTADA de `dominio/severidad`, sin moverla ni tocarla. */
const SEVERIDAD = {
  version: SEVERIDAD_VERSION,
  calcular(detalle: DetalleInundacion) {
    const r = calcularSeveridad({
      profundidad_estimada: detalle.profundidad_estimada,
      frecuencia: detalle.frecuencia,
    });
    // `reglas` (E1, E3): la anotación del escalamiento que la auditoría de creación guarda (§9.1).
    return { puntaje: r.puntaje, banda: r.banda, reglas: r.reglas };
  },
};

/** Severidad se reinicia al cambiar de categoría (ADR 0016), así que es un filtro de categoría. */
const FILTROS: readonly FiltroDef[] = [
  { id: 'severidad', etiqueta: 'Severidad', campo: 'severidad', alcance: 'categoria' },
];

/** Cupo: `cuenta+categoria`, día local, con el límite leído de CONFIG (sin un `3` literal, ADR 0017). */
const CUPO: ReglaCupo = {
  id: 'reportes_por_dia',
  ambito: 'cuenta+categoria',
  ventana: 'dia_local',
  limite: CONFIG_DOMINIO.REPORTES_POR_DIA_POR_CUENTA,
};

/** Campos del detalle que ve el público (los de dominio de `ReportePublicoSchema`). */
const CAMPOS_PUBLICOS = [
  'profundidad_estimada',
  'frecuencia',
  'causa_presunta',
] as const satisfies readonly (keyof DetalleInundacion)[];

/**
 * Columnas de dominio de la exportación, con el mismo encabezado snake_case que usa hoy el CSV de
 * `services/api-core/src/rutas/admin.ts` (las comunes —id, estado, severidad, lat, lon…— son del
 * núcleo y no van acá).
 */
const CAMPOS_EXPORTACION = [
  { clave: 'profundidad_estimada', encabezado: 'profundidad_estimada' },
  { clave: 'frecuencia', encabezado: 'frecuencia' },
  { clave: 'causa_presunta', encabezado: 'causa_presunta' },
  { clave: 'sumidero_cercano', encabezado: 'sumidero_cercano' },
  { clave: 'sumidero_estado', encabezado: 'sumidero_estado' },
  { clave: 'agua_brota_sumidero', encabezado: 'agua_brota_sumidero' },
] as const satisfies readonly CampoExportacion<DetalleInundacion>[];

export const DEFINICION_INUNDACION: DefinicionCategoria<DetalleInundacion> = {
  slug: 'inundacion',
  nombre: 'Inundaciones',
  nombreCorto: 'Inundación',
  descripcion: 'Dónde se junta el agua en la ciudad, según los vecinos.',
  verbo: 'Reportar un punto',
  preguntaUbicacion: '¿Dónde se junta el agua?',
  // Textos de pantalla propios de la categoría (0.21.0), idénticos a los que la web tenía fijos: con
  // una sola categoría activa no cambia nada visible. Cómo los compone la web, en `../textos.ts`.
  textos: {
    puntosDelMapa: 'puntos de inundación',
    puntoSingular: 'Punto de inundación',
    listaVaciaCuerpo:
      'Que no haya puntos no significa que no se anegue. Si conocés un lugar donde se junta el agua, sos el primero en marcarlo.',
    tituloPaso2: '¿Hasta dónde llegó y cada cuánto pasa?',
    avisoPercepcion: 'la profundidad se estima por referencia corporal',
    descripcionReportar: 'Marcá dónde se junta el agua en tu barrio.',
  },
  icono: 'Waves',
  colores: { c1: '#E3EEF5', c5: '#0D6189', c7: '#0A4A69' },
  esquemaDetalle: DetalleInundacionSchema,
  // Primera versión del detalle como módulo. La fórmula de severidad tiene su propia versión (2).
  detalleVersion: 1,
  preguntas: PREGUNTAS,
  severidad: SEVERIDAD,
  filtros: FILTROS,
  recurrenciaRadioM: CONFIG_DOMINIO.RECURRENCIA_RADIO_M,
  cupo: CUPO,
  // Valor por defecto de partida; el vecino lo elige en el formulario (no cambia el comportamiento).
  ubicacionTipoPorDefecto: 'via_publica',
  camposPublicos: CAMPOS_PUBLICOS,
  camposExportacion: CAMPOS_EXPORTACION,
  notaMetodologica: NOTA_METODOLOGICA,
  geometria: 'punto',
  // El paso 2 actual de inundación es un componente especial con referencia corporal (ADR 0021);
  // cada app resuelve este identificador a su componente.
  componenteEspecialPaso2: 'inundacion/paso2',
};
