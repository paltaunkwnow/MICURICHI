import type { ReporteTecnicoFeature } from 'contracts';
import {
  coordenadas,
  distanciaDispositivo,
  etiquetaMetodo,
  etiquetaUbicacionTipo,
  precisionGps,
} from '@/lib/formato';
import { Dato } from './Dato';

/** Lista de datos del bloque «Ubicación» del detalle técnico. */
export function DatosUbicacion({ reporte }: { reporte: ReporteTecnicoFeature }) {
  const p = reporte.properties;
  const [lon, lat] = reporte.geometry.coordinates;
  return (
    <dl className="lista-datos">
      <Dato etiqueta="Distrito">
        {p.distrito ? `${p.distrito.codigo} · ${p.distrito.nombre}` : null}
      </Dato>
      <Dato etiqueta="Unidad vecinal">
        {p.unidad_vecinal ? `${p.unidad_vecinal.codigo} · ${p.unidad_vecinal.nombre}` : null}
      </Dato>
      <Dato etiqueta="Coordenadas (lat, lon)">
        <span className="font-mono">{coordenadas(lon, lat)}</span>
      </Dato>
      <Dato etiqueta="Método de ubicación">
        {etiquetaMetodo(p.ubicacion_metodo, p.distancia_dispositivo_m)}
      </Dato>
      <Dato etiqueta="Precisión del GPS">{precisionGps(p.precision_gps_m)}</Dato>
      <Dato etiqueta="Distancia al dispositivo">
        {distanciaDispositivo(p.distancia_dispositivo_m)}
      </Dato>
      <Dato etiqueta="Tipo de lugar">{etiquetaUbicacionTipo(p.ubicacion_tipo)}</Dato>
      <Dato etiqueta="Versión de capa">{p.version_capa}</Dato>
      {/*
        No se usa `precision_degradada`: ese campo describe la coordenada de ESTA respuesta, y la
        del técnico es siempre la exacta, así que acá valía "No" incluso para una vivienda cuyo
        punto público sí sale desplazado. Lo que el técnico necesita saber es qué ve el vecino, y
        eso lo decide `ubicacion_tipo` (§13).
      */}
      <Dato etiqueta="En el mapa público se ve">
        {p.ubicacion_tipo === 'vivienda_o_predio'
          ? 'Desplazado hasta 30 m para no señalar la vivienda'
          : 'En su sitio, redondeado a 5 decimales'}
      </Dato>
    </dl>
  );
}
