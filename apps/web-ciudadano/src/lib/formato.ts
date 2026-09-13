import {
  COLORES_SEVERIDAD,
  CONFIG_DOMINIO,
  distanciaAproximadaM,
  ETIQUETAS,
  type Severidad,
  type UnidadAdministrativa,
} from 'contracts';
import type { ReporteFeature } from './api';

export const SEVERIDADES_ORDEN: Severidad[] = ['critica', 'alta', 'media', 'baja'];

export function etiquetaSeveridad(s: Severidad) {
  return ETIQUETAS.severidad[s];
}
export function colorSeveridad(s: Severidad) {
  return COLORES_SEVERIDAD[s];
}
export function etiquetaTirante(t: ReporteFeature['properties']['tirante_estimado']) {
  const e = ETIQUETAS.tirante[t];
  return `${e.corta} · ${e.rango}`;
}
export function etiquetaDuracion(d: ReporteFeature['properties']['duracion_estimada']) {
  return ETIQUETAS.duracion[d];
}
export function etiquetaFrecuencia(f: ReporteFeature['properties']['frecuencia']) {
  return ETIQUETAS.frecuencia[f];
}
export function etiquetaAfectacion(a: ReporteFeature['properties']['afectacion']) {
  return ETIQUETAS.afectacion[a];
}
export function etiquetaCausa(c: ReporteFeature['properties']['causa_presunta']) {
  return ETIQUETAS.causa_presunta[c];
}
export function etiquetaEstado(e: ReporteFeature['properties']['estado']) {
  return ETIQUETAS.estado[e];
}

export function tituloReporte(p: ReporteFeature['properties']) {
  if (p.direccion_aprox) return p.direccion_aprox;
  const uv = p.unidad_vecinal?.nombre ?? 'Unidad vecinal sin datos';
  return uv;
}

export function subtituloReporte(p: ReporteFeature['properties'], distanciaM?: number | null) {
  const partes = [
    p.unidad_vecinal ? `UV ${p.unidad_vecinal.codigo}` : null,
    p.distrito ? `Distrito ${p.distrito.codigo}` : null,
  ];
  if (distanciaM != null)
    partes.push(
      distanciaM < 1000
        ? `a ${Math.round(distanciaM)} m de vos`
        : `a ${(distanciaM / 1000).toFixed(1)} km de vos`,
    );
  return partes.filter(Boolean).join(' · ');
}

export function distanciaDesde(
  usuario: { lat: number; lon: number } | null,
  f: ReporteFeature,
): number | null {
  if (!usuario) return null;
  const [lon, lat] = f.geometry.coordinates;
  return distanciaAproximadaM(usuario.lat, usuario.lon, lat, lon);
}

export function fechaCorta(iso: string) {
  return new Intl.DateTimeFormat('es-BO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

/** Título del panel: "N puntos cerca de vos" (singular cuando corresponde). */
export function tituloPuntos(n: number | undefined) {
  if (n === undefined) return 'Buscando puntos cerca de vos';
  return n === 1 ? '1 punto cerca de vos' : `${n} puntos cerca de vos`;
}

/** Chip flotante del mapa: "Distrito 07 · UV-123 · capa oficial vigente". */
export function textoCapaOficial(
  distrito: UnidadAdministrativa | null | undefined,
  uv: UnidadAdministrativa | null | undefined,
) {
  const partes = [distrito ? `Distrito ${distrito.codigo}` : null, uv ? `UV-${uv.codigo}` : null];
  const base = partes.filter(Boolean).join(' · ');
  return base ? `${base} · capa oficial vigente` : 'Fuera de la cobertura municipal';
}

/** Contador del campo de descripción: "Mínimo 10 caracteres · 0/1000". */
export function contadorDescripcion(largo: number) {
  return `Mínimo ${CONFIG_DOMINIO.DESCRIPCION_MIN} caracteres · ${largo}/${CONFIG_DOMINIO.DESCRIPCION_MAX}`;
}

/**
 * Las URLs de fotos llegan absolutas desde api-core; se pasan a relativas para que salgan
 * por el rewrite de Next (mismo origen, sin CORS). Si no es una foto de la API, se deja igual.
 */
export function urlFotoRelativa(url: string) {
  const i = url.indexOf('/api/v1/fotos/');
  return i >= 0 ? url.slice(i) : url;
}
