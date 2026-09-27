/**
 * Conversión de filas de reporte a las vistas pública (jitter), técnica (exacta) y del autor
 * (exacta, con la demora). CLAUDE.md §13.
 */
import {
  CONFIG_DOMINIO,
  coordenadaPublica,
  type EstadoReporte,
  type MiReporte,
  type ReportePublico,
  type ReporteTecnico,
} from 'contracts';
import { esEstadoPublico, esRetirado, esVerificado } from './visibilidad.js';

export interface FilaReporte {
  id: string;
  lon: number;
  lat: number;
  /** Punto ya degradado que guarda la base (`geom_publico`); NULL si aún no se calculó. */
  lon_publico?: number | null;
  lat_publico?: number | null;
  creado_en: Date;
  /** Desde cuándo lo ve el público (migración 0015). */
  publicar_en: Date;
  /** Segundos que faltan para `publicar_en`, calculados en la base al leer (0 si ya pasó). */
  segundos_para_publicar: number;
  actualizado_en: Date;
  evento_en: Date | null;
  autor_id: string | null;
  distrito_id: string;
  distrito_codigo: string | null;
  distrito_nombre: string | null;
  unidad_vecinal_id: string;
  uv_codigo: string | null;
  uv_nombre: string | null;
  version_capa: string | null;
  resolucion_flags: Record<string, unknown>;
  ubicacion_metodo: 'gps' | 'manual';
  precision_gps_m: string | null;
  /** Metros entre el punto y el teléfono al enviar (0013); null en los reportes anteriores. */
  distancia_dispositivo_m: number | null;
  ubicacion_tipo: 'via_publica' | 'vivienda_o_predio' | 'otro';
  descripcion: string;
  profundidad_estimada: ReportePublico['profundidad_estimada'];
  frecuencia: ReportePublico['frecuencia'];
  causa_presunta: ReportePublico['causa_presunta'];
  sumidero_cercano: ReporteTecnico['sumidero_cercano'];
  sumidero_estado: ReporteTecnico['sumidero_estado'];
  agua_brota_sumidero: boolean | null;
  severidad_calculada: ReportePublico['severidad'];
  severidad_puntaje: number;
  severidad_manual: ReportePublico['severidad'] | null;
  severidad_motivo: string | null;
  estado: EstadoReporte;
  estado_motivo: string | null;
  fusionado_en_id: string | null;
  punto_critico_id: string | null;
  n_reportes_punto: number | null;
  validado_por: string | null;
  validado_en: Date | null;
  fotos: string[] | null;
}

export const SELECT_REPORTE = `
  SELECT r.id, ST_X(r.geom) AS lon, ST_Y(r.geom) AS lat,
         ST_X(r.geom_publico) AS lon_publico, ST_Y(r.geom_publico) AS lat_publico,
         r.creado_en, r.publicar_en,
         GREATEST(0, ceil(extract(epoch FROM r.publicar_en - now())))::int AS segundos_para_publicar,
         r.actualizado_en, r.evento_en, r.autor_id,
         r.distrito_id, d.codigo AS distrito_codigo, d.nombre AS distrito_nombre,
         r.unidad_vecinal_id, u.codigo AS uv_codigo, u.nombre AS uv_nombre, r.version_capa, r.resolucion_flags,
         r.ubicacion_metodo, r.precision_gps_m, r.distancia_dispositivo_m, r.ubicacion_tipo, r.descripcion,
         r.profundidad_estimada, r.frecuencia, r.causa_presunta,
         r.sumidero_cercano, r.sumidero_estado, r.agua_brota_sumidero,
         r.severidad_calculada, r.severidad_puntaje, r.severidad_manual, r.severidad_motivo,
         r.estado, r.estado_motivo, r.fusionado_en_id, r.punto_critico_id, pc.n_reportes AS n_reportes_punto,
         r.validado_por, r.validado_en,
         (SELECT array_agg(f.objeto_key ORDER BY f.creado_en) FROM reporte_foto f WHERE f.reporte_id = r.id AND f.exif_sanitizado) AS fotos
  FROM reporte_inundacion r
  -- Se une por (id, version_capa) y NO contra la vista vigente. Para eso está version_capa
  -- (§7.1): es la versión con la que se resolvió el reporte. Uniendo contra la vigente, el día
  -- que el municipio activa una entrega nueva todos los reportes anteriores se quedan sin
  -- nombre, y como el código cae al id, al vecino le aparecía «unidad_vecinal:UV-105» donde
  -- tenía que leer el nombre de su barrio. Comprobado al pasar de las capas sintéticas a las
  -- reales. La geometría del reporte no cambia; lo que cambia es de qué capa se lee su nombre.
  LEFT JOIN geo.unidad_vecinal u ON u.id = r.unidad_vecinal_id AND u.version_capa = r.version_capa
  LEFT JOIN geo.distrito_municipal d ON d.id = r.distrito_id AND d.version_capa = r.version_capa
  LEFT JOIN punto_critico pc ON pc.id = r.punto_critico_id`;

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);

export function urlFoto(base: string, key: string) {
  return `${base}/api/v1/fotos/${key}`;
}

/** Propiedades comunes a las tres vistas, con el estado tal cual está en la base. */
type PropsBase = Omit<ReportePublico, 'estado'> & { estado: EstadoReporte; verificado: boolean };

/**
 * `salJitter` es un secreto del servidor. Sin él la semilla del desplazamiento sería el `id`
 * del reporte, que se publica en la propia respuesta: como el algoritmo está en el repositorio,
 * cualquiera podría recalcular el offset y recuperar la coordenada exacta de la vivienda.
 */
function vistaBase(
  f: FilaReporte,
  urlBase: string,
  salJitter: string,
  exacta: boolean,
): { lon: number; lat: number; props: PropsBase } {
  const degradar = !exacta && f.ubicacion_tipo === 'vivienda_o_predio';
  let { lat, lon } = f;
  if (!exacta) {
    // Se prefiere el punto guardado: es exactamente el mismo que usa el filtro por bbox, así que
    // lo que se devuelve y lo que se filtra no pueden discrepar. El cálculo queda de respaldo
    // para filas que todavía no lo tengan (reportes anteriores a la migración 0005).
    ({ lat, lon } =
      f.lat_publico != null && f.lon_publico != null
        ? { lat: f.lat_publico, lon: f.lon_publico }
        : coordenadaPublica(
            lat,
            lon,
            f.id,
            salJitter,
            f.ubicacion_tipo,
            CONFIG_DOMINIO.JITTER_PUBLICO_M,
            CONFIG_DOMINIO.PRECISION_PUBLICA_DECIMALES,
          ));
  }
  return {
    lon,
    lat,
    props: {
      id: f.id,
      creado_en: iso(f.creado_en)!,
      evento_en: iso(f.evento_en),
      distrito: f.distrito_id
        ? {
            id: f.distrito_id,
            codigo: f.distrito_codigo ?? f.distrito_id.split(':').pop() ?? '',
            nombre: f.distrito_nombre ?? f.distrito_id,
          }
        : null,
      unidad_vecinal: f.unidad_vecinal_id
        ? {
            id: f.unidad_vecinal_id,
            codigo: f.uv_codigo ?? f.unidad_vecinal_id.split(':').pop() ?? '',
            nombre: f.uv_nombre ?? f.unidad_vecinal_id,
          }
        : null,
      descripcion: f.descripcion,
      fotos: (f.fotos ?? []).map((k) => urlFoto(urlBase, k)),
      profundidad_estimada: f.profundidad_estimada,
      frecuencia: f.frecuencia,
      causa_presunta: f.causa_presunta,
      severidad: f.severidad_manual ?? f.severidad_calculada,
      severidad_calculada: f.severidad_calculada,
      estado: f.estado,
      verificado: esVerificado(f.estado),
      punto_critico_id: f.punto_critico_id,
      n_reportes_punto: f.n_reportes_punto,
      precision_degradada: degradar,
    },
  };
}

/**
 * Vista pública. Solo para filas que ya pasaron por `condicionPublico`: si llega un rechazado o
 * un duplicado es un error de la consulta, y se corta con un 500 antes que publicarlo.
 */
export function vistaPublica(
  f: FilaReporte,
  urlBase: string,
  salJitter: string,
): { lon: number; lat: number; props: ReportePublico } {
  const base = vistaBase(f, urlBase, salJitter, false);
  const estado = base.props.estado;
  if (!esEstadoPublico(estado))
    throw new Error(`vista pública de un reporte en estado no público (${estado})`);
  return { ...base, props: { ...base.props, estado } };
}

export function vistaTecnica(
  f: FilaReporte,
  urlBase: string,
): { lon: number; lat: number; props: ReporteTecnico } {
  // El técnico ve la coordenada exacta: no hay jitter y la sal es irrelevante.
  const base = vistaBase(f, urlBase, '', true);
  return {
    lon: base.lon,
    lat: base.lat,
    props: {
      ...base.props,
      ubicacion_metodo: f.ubicacion_metodo,
      precision_gps_m: f.precision_gps_m === null ? null : Number(f.precision_gps_m),
      distancia_dispositivo_m: f.distancia_dispositivo_m,
      ubicacion_tipo: f.ubicacion_tipo,
      sumidero_cercano: f.sumidero_cercano,
      sumidero_estado: f.sumidero_estado,
      agua_brota_sumidero: f.agua_brota_sumidero,
      severidad_manual: f.severidad_manual,
      severidad_motivo: f.severidad_motivo,
      severidad_puntaje: f.severidad_puntaje,
      estado_motivo: f.estado_motivo,
      fusionado_en_id: f.fusionado_en_id,
      validado_por: f.validado_por,
      validado_en: iso(f.validado_en),
      actualizado_en: iso(f.actualizado_en)!,
      version_capa: f.version_capa,
      resolucion_flags: f.resolucion_flags ?? {},
      autor_id: f.autor_id,
    },
  };
}

/**
 * Vista del AUTOR (contracts 0.11.0): la respuesta de `POST /reportes` (201 y replay) y cada
 * elemento de `GET /mis-reportes`. Coordenada exacta —la eligió él— y, en cualquier estado, cuándo
 * se publica y si lo retiraron. Nunca el autor ni campos de moderación; sale con `private, no-store`.
 */
export function vistaMiReporte(
  f: FilaReporte,
  urlBase: string,
): { lon: number; lat: number; props: MiReporte } {
  const base = vistaBase(f, urlBase, '', true);
  return {
    ...base,
    props: {
      ...base.props,
      publicar_en: iso(f.publicar_en)!,
      segundos_para_publicar: f.segundos_para_publicar,
      retirado: esRetirado(f.estado),
    },
  };
}

export function aFeature<P extends ReportePublico | ReporteTecnico | MiReporte>(v: {
  lon: number;
  lat: number;
  props: P;
}) {
  return {
    type: 'Feature' as const,
    id: v.props.id,
    geometry: { type: 'Point' as const, coordinates: [v.lon, v.lat] as [number, number] },
    properties: v.props,
  };
}
