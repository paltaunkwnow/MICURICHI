/** Conversión de filas de reporte a las vistas pública (jitter) y técnica (exacta). CLAUDE.md §13. */
import {
  CONFIG_DOMINIO,
  coordenadaPublica,
  type ReportePublico,
  type ReporteTecnico,
} from 'contracts';

export interface FilaReporte {
  id: string;
  lon: number;
  lat: number;
  /** Punto ya degradado que guarda la base (`geom_publico`); NULL si aún no se calculó. */
  lon_publico?: number | null;
  lat_publico?: number | null;
  creado_en: Date;
  actualizado_en: Date;
  evento_en: Date | null;
  autor_id: string | null;
  distrito_id: string;
  distrito_codigo: string | null;
  distrito_nombre: string | null;
  unidad_vecinal_id: string;
  uv_codigo: string | null;
  uv_nombre: string | null;
  manzana_id: string | null;
  version_capa: string | null;
  resolucion_flags: Record<string, unknown>;
  ubicacion_metodo: 'gps' | 'manual';
  precision_gps_m: string | null;
  ubicacion_tipo: 'via_publica' | 'vivienda_o_predio' | 'otro';
  direccion_aprox: string | null;
  descripcion: string;
  tirante_estimado: ReportePublico['tirante_estimado'];
  duracion_estimada: ReportePublico['duracion_estimada'];
  frecuencia: ReportePublico['frecuencia'];
  afectacion: ReportePublico['afectacion'];
  causa_presunta: ReportePublico['causa_presunta'];
  sumidero_cercano: ReporteTecnico['sumidero_cercano'];
  sumidero_estado: ReporteTecnico['sumidero_estado'];
  agua_brota_sumidero: boolean | null;
  severidad_calculada: ReportePublico['severidad'];
  severidad_puntaje: number;
  severidad_manual: ReportePublico['severidad'] | null;
  severidad_motivo: string | null;
  estado: ReportePublico['estado'];
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
         r.creado_en, r.actualizado_en, r.evento_en, r.autor_id,
         r.distrito_id, d.codigo AS distrito_codigo, d.nombre AS distrito_nombre,
         r.unidad_vecinal_id, u.codigo AS uv_codigo, u.nombre AS uv_nombre, r.manzana_id, r.version_capa, r.resolucion_flags,
         r.ubicacion_metodo, r.precision_gps_m, r.ubicacion_tipo, r.direccion_aprox, r.descripcion,
         r.tirante_estimado, r.duracion_estimada, r.frecuencia, r.afectacion, r.causa_presunta,
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

/**
 * `salJitter` es un secreto del servidor. Sin él la semilla del desplazamiento sería el `id`
 * del reporte, que se publica en la propia respuesta: como el algoritmo está en el repositorio,
 * cualquiera podría recalcular el offset y recuperar la coordenada exacta de la vivienda.
 */
export function vistaPublica(
  f: FilaReporte,
  urlBase: string,
  salJitter: string,
  exacta = false,
): { lon: number; lat: number; props: ReportePublico } {
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
      // La manzana se oculta exactamente cuando se aplica jitter, y por la misma razón que la
      // dirección. El desplazamiento público es de hasta 30 m; una manzana real de Santa Cruz
      // mide del orden de 100 m de lado, así que publicar las dos cosas juntas deja la ubicación
      // en la intersección de un disco de 30 m con el polígono de la cuadra — bastante más
      // estrecho que el disco solo, y en una esquina puede quedar en unos pocos metros.
      // Con las 1 152 manzanas sintéticas la diferencia era teórica; con las 27 527 reales, no.
      // En vía pública no hay jitter (el punto ya sale en su sitio), así que ahí no se esconde.
      manzana_id: degradar ? null : f.manzana_id,
      direccion_aprox: degradar ? null : f.direccion_aprox,
      descripcion: f.descripcion,
      fotos: (f.fotos ?? []).map((k) => urlFoto(urlBase, k)),
      tirante_estimado: f.tirante_estimado,
      duracion_estimada: f.duracion_estimada,
      frecuencia: f.frecuencia,
      afectacion: f.afectacion,
      causa_presunta: f.causa_presunta,
      severidad: f.severidad_manual ?? f.severidad_calculada,
      severidad_calculada: f.severidad_calculada,
      estado: f.estado,
      punto_critico_id: f.punto_critico_id,
      n_reportes_punto: f.n_reportes_punto,
      precision_degradada: degradar,
    },
  };
}

export function vistaTecnica(
  f: FilaReporte,
  urlBase: string,
): { lon: number; lat: number; props: ReporteTecnico } {
  // El técnico ve la coordenada exacta: no hay jitter y la sal es irrelevante.
  const base = vistaPublica(f, urlBase, '', true);
  return {
    lon: base.lon,
    lat: base.lat,
    props: {
      ...base.props,
      ubicacion_metodo: f.ubicacion_metodo,
      precision_gps_m: f.precision_gps_m === null ? null : Number(f.precision_gps_m),
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

export function aFeature(v: { lon: number; lat: number; props: ReportePublico | ReporteTecnico }) {
  return {
    type: 'Feature' as const,
    id: v.props.id,
    geometry: { type: 'Point' as const, coordinates: [v.lon, v.lat] as [number, number] },
    properties: v.props,
  };
}
