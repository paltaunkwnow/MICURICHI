import {
  type CausaPresunta,
  type Ciudad,
  COLORES_SEVERIDAD,
  type EstadoReporte,
  ETIQUETAS,
  type Frecuencia,
  type Profundidad,
  type Rol,
  type Severidad,
  type SumideroCercano,
  type SumideroEstado,
  type TipoCapa,
  type UbicacionMetodo,
  type UbicacionTipo,
} from 'contracts';

/** Lo que el formato toma de la ciudad del despliegue: el locale de `Intl` y la zona horaria. */
export type Regional = Pick<Ciudad, 'locale' | 'zona_horaria'>;

/** Fechas y números con el locale y la zona horaria de la ciudad. */
export interface Formato {
  /** «01 mar 2026», o «—» si no hay fecha. */
  fechaCorta(iso: string | null | undefined): string;
  /** «01 mar 2026, 23:30», o «—» si no hay fecha. */
  fechaHora(iso: string | null | undefined): string;
  /** Con el separador de miles del locale: «61.234» en es-BO, «61,234» en es-MX. */
  numero(n: number): string;
}

/**
 * Formato de una ciudad. No hay formateadores sueltos con una ciudad por defecto: la zona y el
 * locale llegan de api-core (`GET /api/v1/configuracion`), y un valor fijo acá mostraría la hora
 * de otra ciudad sin que nada fallara. En los componentes, `useFormato()` (`ciudad-contexto.tsx`).
 */
export function crearFormato(regional: Regional): Formato {
  const corta = new Intl.DateTimeFormat(regional.locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: regional.zona_horaria,
  });
  const conHora = new Intl.DateTimeFormat(regional.locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: regional.zona_horaria,
  });
  const numeros = new Intl.NumberFormat(regional.locale);
  return {
    fechaCorta: (iso) => (iso ? corta.format(new Date(iso)) : '—'),
    fechaHora: (iso) => (iso ? conHora.format(new Date(iso)) : '—'),
    numero: (n) => numeros.format(n),
  };
}

export const SEVERIDADES_ORDEN: Severidad[] = ['critica', 'alta', 'media', 'baja'];
export const ESTADOS_ORDEN: EstadoReporte[] = [
  'nuevo',
  'validado',
  'resuelto',
  'duplicado',
  'rechazado',
];

export function etiquetaSeveridad(s: Severidad) {
  return ETIQUETAS.severidad[s];
}
export function colorSeveridad(s: Severidad) {
  return COLORES_SEVERIDAD[s];
}
export function etiquetaEstado(e: EstadoReporte) {
  return ETIQUETAS.estado[e];
}
export function etiquetaProfundidad(p: Profundidad) {
  const e = ETIQUETAS.profundidad[p];
  return `${e.corta} · ${e.rango}`;
}
export function etiquetaFrecuencia(f: Frecuencia) {
  return ETIQUETAS.frecuencia[f];
}
export function etiquetaCausa(c: CausaPresunta) {
  return ETIQUETAS.causa_presunta[c];
}
export function etiquetaUbicacionTipo(u: UbicacionTipo) {
  return ETIQUETAS.ubicacion_tipo[u];
}
export function etiquetaSumideroCercano(s: SumideroCercano) {
  return ETIQUETAS.sumidero_cercano[s];
}
export function etiquetaSumideroEstado(s: SumideroEstado) {
  return ETIQUETAS.sumidero_estado[s];
}
export function etiquetaCapa(c: TipoCapa | string) {
  return c in ETIQUETAS.tipo_capa ? ETIQUETAS.tipo_capa[c as TipoCapa] : c;
}
/**
 * Distancia entre el punto y el GPS del teléfono al enviar. `null` en los reportes anteriores a
 * la ubicación obligatoria (contracts 0.9.0); `undefined` si responde un api-core anterior, que
 * puede seguir corriendo mientras se despliega el nuevo.
 */
type DistanciaDispositivo = number | null | undefined;

/**
 * Desde 0.9.0 el método lo deriva api-core: «gps» si el punto quedó a max(2 m, precisión
 * declarada) o menos del teléfono al enviar, así que puede estar a varios metros; «manual» si la
 * persona lo movió más allá, siempre dentro del radio. Cuántos metros lo dice la fila «Distancia
 * al dispositivo» (`distanciaDispositivo`): no se repite acá. Antes de 0.9.0 «manual» era un clic
 * en cualquier parte del mapa: sin distancia guardada no se promete nada.
 */
export function etiquetaMetodo(m: UbicacionMetodo, distanciaM: DistanciaDispositivo) {
  const sinDistancia = distanciaM === null || distanciaM === undefined;
  if (m === 'gps') {
    return sinDistancia
      ? 'En la posición del teléfono'
      : 'En la posición del teléfono (dentro de su margen de error)';
  }
  if (sinDistancia) return 'Selección manual en el mapa, sin control de distancia al teléfono';
  return 'Movido a mano por la persona';
}

export function distanciaDispositivo(m: DistanciaDispositivo) {
  if (m === null || m === undefined) {
    return 'Sin dato: el reporte es anterior a la ubicación obligatoria';
  }
  return `a ${Math.round(m)} m del teléfono`;
}
export function etiquetaRol(r: Rol) {
  return ETIQUETAS.rol[r];
}
export function etiquetaSiNo(v: boolean | null | undefined) {
  if (v === null || v === undefined) return 'Sin dato';
  return v ? 'Sí' : 'No';
}

/** Porcentaje entero de `parte` sobre `total`; 0 si el total es 0. */
export function porcentaje(parte: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((parte / total) * 100);
}

export function coordenadas(lon: number, lat: number) {
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
}

export function precisionGps(m: number | null) {
  if (m === null) return 'Sin dato';
  return `± ${Math.round(m)} m`;
}

export function idCorto(id: string) {
  return id.slice(0, 8);
}

/**
 * Avisos legibles a partir de resolucion_flags (CLAUDE.md §7.4): borde entre UV,
 * asignación por proximidad y distrito discrepante.
 */
export function avisosResolucion(flags: Record<string, unknown> | null | undefined): string[] {
  if (!flags) return [];
  const avisos: string[] = [];
  if (flags.en_limite === true) avisos.push('Punto en el borde de dos UV');
  if (flags.asignado_por_proximidad === true) {
    const d = typeof flags.distancia_m === 'number' ? Math.round(flags.distancia_m) : null;
    avisos.push(d === null ? 'Asignado por proximidad' : `Asignado por proximidad (${d} m)`);
  }
  if (flags.distrito_discrepante === true) avisos.push('Distrito discrepante');
  return avisos;
}

/**
 * «UV-105», no «UV UV-105»: los códigos de las capas pueden traer ya el prefijo, y eso depende de
 * lo que entregue el municipio. Se normaliza en un solo sitio, igual que en la app pública.
 */
export function etiquetaUnidadVecinal(codigo: string | null | undefined): string {
  if (!codigo) return '—';
  return /^uv/i.test(codigo) ? codigo.toUpperCase() : `UV ${codigo}`;
}

/** «Distrito 02» a partir de `D02`, `DM-2` o `2`. */
export function etiquetaDistrito(codigo: string | null | undefined): string {
  if (!codigo) return '—';
  return `Distrito ${codigo.replace(/^(dm|d)[\s-]*(?=\d)/i, '')}`;
}
