/**
 * Tipos del registro de categorías (ADR 0009, 0016, 0017, 0021, 0022).
 *
 * Una `DefinicionCategoria` reúne todo lo que una categoría aporta sobre el núcleo: textos, icono
 * (nombre, no componente: `contracts` no importa React), colores, esquema Zod del detalle, severidad
 * versionada, preguntas declarativas del paso 2, filtros con alcance, radio de recurrencia, regla de
 * cupo, campos públicos y de exportación, y la geometría. El núcleo pregunta a la definición en vez
 * de usar `if (categoria === …)` (ADR 0009 §6.3).
 */

import type { z } from 'zod';
import type { Severidad, UbicacionTipo } from '../dominio/enums.js';
import type { SlugCategoria } from './slugs.js';
import type { TextosCategoria } from './textos.js';

export type { SlugCategoria };

/** Opción de una pregunta o de un subtipo declarativo (ADR 0021). */
export interface OpcionPregunta {
  /** Valor que se guarda en el detalle; coincide con un valor del enum de ese campo. */
  valor: string;
  etiqueta: string;
  /** Texto de referencia o ayuda (p. ej. «<10 cm»). */
  ayuda?: string;
}

/** Cómo se responde una pregunta del paso 2. */
export type TipoPregunta = 'opcion_unica' | 'opcion_multiple' | 'booleana';

/** Pregunta declarativa del paso 2 «Qué pasa» (ADR 0021), dibujada por un renderizador común. */
export interface Pregunta {
  /** Clave en el detalle: coincide con una clave del esquema de detalle de la categoría. */
  id: string;
  etiqueta: string;
  tipo: TipoPregunta;
  /** Obligatoria en la interfaz; la validación real la hace el esquema de detalle. */
  obligatoria?: boolean;
  ayuda?: string;
  /** Presente en `opcion_unica` y `opcion_multiple`. */
  opciones?: readonly OpcionPregunta[];
}

/** Un filtro global sobrevive al cambio de categoría; uno de categoría se reinicia (ADR 0016). */
export type AlcanceFiltro = 'global' | 'categoria';

/** Definición de un filtro del mapa o de la bandeja. */
export interface FiltroDef {
  /** Identificador del filtro (p. ej. `severidad`). */
  id: string;
  etiqueta: string;
  /** Campo del reporte (núcleo o detalle) sobre el que opera. */
  campo: string;
  alcance: AlcanceFiltro;
}

/**
 * Ámbito del cupo (ADR 0017). Hoy `cuenta` y `cuenta+categoria`; se deja abierto con `string` para
 * ámbitos futuros sin cambiar el tipo (la base los implementa con un contador genérico).
 */
export type AmbitoCupo = 'cuenta' | 'cuenta+categoria' | (string & {});

/** Ventana de tiempo del cupo: día local de la ciudad u hora corrida. */
export type VentanaCupo = 'dia_local' | 'hora';

/** Política de cupo configurable por categoría e instalación (ADR 0017). */
export interface ReglaCupo {
  id: string;
  ambito: AmbitoCupo;
  ventana: VentanaCupo;
  limite: number;
}

/** Geometría del reporte. Hoy solo `punto` (ADR 0019); otra requiere su propio ADR. */
export type GeometriaCategoria = 'punto';

/** Colores de acento de la categoría (ADR 0022): pastilla, botón, leyenda y chip. */
export interface ColoresCategoria {
  c1: string;
  c5: string;
  c7: string;
}

/**
 * Severidad de la categoría: la ESCALA (4 bandas) es común, el CÁLCULO es de cada categoría. La
 * función pura devuelve puntaje (en la escala de la categoría) y banda (la común). `version` fija
 * con qué modelo se guardó (13.2 §5.4).
 */
export interface SeveridadCategoria<D> {
  version: number;
  /**
   * `reglas` (opcional, 0.20.0) son las de escalamiento aplicadas, en orden (p. ej. `['E1']` de
   * inundación cuando la profundidad supera 70 cm, §9.1). Una categoría que no escala puede omitirlas;
   * api-core las anota en la auditoría de creación cuando están.
   */
  calcular(detalle: D): { puntaje: number; banda: Severidad; reglas?: readonly string[] };
}

/** Columna del detalle que entra en la exportación, con el encabezado que usa el archivo. */
export interface CampoExportacion<D> {
  clave: keyof D & string;
  encabezado: string;
}

/**
 * Definición completa de una categoría. `D` es el tipo del detalle (inferido del esquema Zod). `S`
 * es el slug: por defecto los canónicos de la plataforma, pero el registro admite cualquier `string`
 * para que una categoría nueva (o una sintética de prueba) se sume sin tocar el núcleo (ADR 0009).
 */
export interface DefinicionCategoria<D, S extends string = SlugCategoria> {
  slug: S;
  nombre: string;
  nombreCorto: string;
  descripcion: string;
  /** Verbo del botón de reporte (p. ej. «Reportar un punto»). */
  verbo: string;
  /** Pregunta del paso 1 (p. ej. «¿Dónde se junta el agua?»). */
  preguntaUbicacion: string;
  /**
   * Textos de pantalla propios de la categoría (0.21.0): los que la web tenía fijos con «inundación»
   * y «agua». Opcional: una categoría que no los trae usa el respaldo de `textosDeCategoria`.
   */
  textos?: TextosCategoria;
  /** Nombre del icono de `lucide-react` (cadena; cada app lo resuelve a un componente). */
  icono: string;
  colores: ColoresCategoria;
  /** Esquema Zod del detalle: lo valida api-core y lo previsualiza el cliente. */
  esquemaDetalle: z.ZodType<D>;
  detalleVersion: number;
  /** Subtipos, cuando la categoría los tiene (baches, basura…). Inundación no. */
  subtipos?: readonly OpcionPregunta[];
  preguntas: readonly Pregunta[];
  severidad: SeveridadCategoria<D>;
  filtros: readonly FiltroDef[];
  /** Radio de recurrencia para el DBSCAN de puntos críticos (§9.2). */
  recurrenciaRadioM: number;
  cupo: ReglaCupo;
  ubicacionTipoPorDefecto: UbicacionTipo;
  /** Campos del detalle visibles en la vista pública del mapa. */
  camposPublicos: readonly (keyof D & string)[];
  camposExportacion: readonly CampoExportacion<D>[];
  /** Nota metodológica propia; se suma a la común (§9.4). */
  notaMetodologica: string;
  geometria: GeometriaCategoria;
  /**
   * Identificador de un componente React especial para el paso 2 (ADR 0021), resuelto por cada app.
   * En `contracts` es solo una cadena: el paquete no conoce componentes. Ausente = paso 2 declarativo.
   */
  componenteEspecialPaso2?: string;
  /** Texto de derivación (p. ej. «Mantenimiento vial»); la derivación real es backlog (13.2 §3.2). */
  derivaA?: string;
  /** Si un detalle dispara el aviso de emergencia (p. ej. «quema», árbol sobre cables). */
  avisoEmergencia?: (detalle: D) => boolean;
}
