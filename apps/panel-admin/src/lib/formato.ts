import {
  type Afectacion,
  type CausaPresunta,
  COLORES_SEVERIDAD,
  type Duracion,
  type EstadoReporte,
  ETIQUETAS,
  type Frecuencia,
  type Rol,
  type Severidad,
  type SumideroCercano,
  type SumideroEstado,
  type TipoCapa,
  type Tirante,
  type UbicacionMetodo,
  type UbicacionTipo,
} from 'contracts';

/** Zona horaria de Santa Cruz de la Sierra (UTC-4, sin horario de verano). */
export const ZONA_HORARIA = 'America/La_Paz';

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
export function etiquetaTirante(t: Tirante) {
  const e = ETIQUETAS.tirante[t];
  return `${e.corta} · ${e.rango}`;
}
export function etiquetaDuracion(d: Duracion) {
  return ETIQUETAS.duracion[d];
}
export function etiquetaFrecuencia(f: Frecuencia) {
  return ETIQUETAS.frecuencia[f];
}
export function etiquetaAfectacion(a: Afectacion) {
  return ETIQUETAS.afectacion[a];
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
export function etiquetaMetodo(m: UbicacionMetodo) {
  return m === 'gps' ? 'GPS del dispositivo' : 'Selección manual en el mapa';
}
export function etiquetaRol(r: Rol) {
  return r === 'admin' ? 'Administrador' : r === 'tecnico' ? 'Técnico' : 'Ciudadano';
}
export function etiquetaSiNo(v: boolean | null | undefined) {
  if (v === null || v === undefined) return 'Sin dato';
  return v ? 'Sí' : 'No';
}

export function fechaCorta(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-BO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: ZONA_HORARIA,
  }).format(new Date(iso));
}

export function fechaHora(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-BO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: ZONA_HORARIA,
  }).format(new Date(iso));
}

export function numero(n: number) {
  return new Intl.NumberFormat('es-BO').format(n);
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
