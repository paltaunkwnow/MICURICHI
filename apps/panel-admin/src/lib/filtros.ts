import {
  BboxSchema,
  ESTADOS_REPORTE,
  type EstadoReporte,
  SEVERIDADES,
  type Severidad,
} from 'contracts';
import type { ParametrosConsulta } from './api';

/** Tamaño de página fijo de la tabla del panel. */
export const LIMITE_PAGINA = 50;

/** Filtros de la tabla; viven en la URL para poder compartir enlaces. */
export interface FiltrosReportes {
  estado: EstadoReporte[];
  severidad: Severidad[];
  distrito_id: string;
  unidad_vecinal_id: string;
  /** Área visible del mapa "minLon,minLat,maxLon,maxLat"; vacío = no filtra por área. */
  bbox: string;
  desde: string;
  hasta: string;
  pagina: number;
}

export const FILTROS_VACIOS: FiltrosReportes = {
  estado: [],
  severidad: [],
  distrito_id: '',
  unidad_vecinal_id: '',
  bbox: '',
  desde: '',
  hasta: '',
  pagina: 1,
};

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function listaValida<T extends string>(valor: string | null, permitidos: readonly T[]): T[] {
  if (!valor) return [];
  const vistos = new Set<T>();
  for (const parte of valor.split(',')) {
    const v = parte.trim() as T;
    if (permitidos.includes(v)) vistos.add(v);
  }
  return [...vistos];
}

function fechaValida(valor: string | null): string {
  return valor && RE_FECHA.test(valor) ? valor : '';
}

/** bbox solo si cumple `BboxSchema` de contracts (formato y min < max); si no, vacío. */
function bboxValido(valor: string | null): string {
  return valor && BboxSchema.safeParse(valor).success ? valor : '';
}

/** Lee los filtros desde los parámetros de la URL, descartando valores inválidos. */
export function leerFiltros(sp: URLSearchParams): FiltrosReportes {
  const pagina = Number.parseInt(sp.get('pagina') ?? '1', 10);
  return {
    estado: listaValida(sp.get('estado'), ESTADOS_REPORTE),
    severidad: listaValida(sp.get('severidad'), SEVERIDADES),
    distrito_id: sp.get('distrito_id')?.trim() ?? '',
    unidad_vecinal_id: sp.get('unidad_vecinal_id')?.trim() ?? '',
    bbox: bboxValido(sp.get('bbox')),
    desde: fechaValida(sp.get('desde')),
    hasta: fechaValida(sp.get('hasta')),
    pagina: Number.isFinite(pagina) && pagina >= 1 ? pagina : 1,
  };
}

/** Serializa a la URL solo lo que tiene valor (la página 1 se omite). */
export function serializarFiltros(f: FiltrosReportes): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.estado.length) sp.set('estado', f.estado.join(','));
  if (f.severidad.length) sp.set('severidad', f.severidad.join(','));
  if (f.distrito_id) sp.set('distrito_id', f.distrito_id);
  if (f.unidad_vecinal_id) sp.set('unidad_vecinal_id', f.unidad_vecinal_id);
  if (f.bbox) sp.set('bbox', f.bbox);
  if (f.desde) sp.set('desde', f.desde);
  if (f.hasta) sp.set('hasta', f.hasta);
  if (f.pagina > 1) sp.set('pagina', String(f.pagina));
  return sp;
}

/** Parámetros para GET /api/v1/reportes (con paginación). */
export function parametrosConsulta(f: FiltrosReportes): ParametrosConsulta {
  return {
    ...parametrosExportacion(f),
    pagina: String(f.pagina),
    limite: String(LIMITE_PAGINA),
  };
}

/** Los mismos filtros sin paginación: GET /api/v1/exportar devuelve toda la selección. */
export function parametrosExportacion(f: FiltrosReportes): ParametrosConsulta {
  const filtroDeZona = f.distrito_id !== '' || f.unidad_vecinal_id !== '';
  return {
    estado: f.estado.length ? f.estado.join(',') : undefined,
    severidad: f.severidad.length ? f.severidad.join(',') : undefined,
    distrito_id: f.distrito_id || undefined,
    unidad_vecinal_id: f.unidad_vecinal_id || undefined,
    // El área del mapa solo acota cuando no hay un filtro de zona explícito: si ya se eligió un
    // distrito o una UV, la tabla trae todos sus reportes, no solo los que caen en la vista (mismo
    // criterio que la app pública en VistaMapa). Así tampoco se pisan el filtro de zona y el bbox.
    bbox: filtroDeZona ? undefined : f.bbox || undefined,
    desde: f.desde || undefined,
    hasta: f.hasta || undefined,
  };
}

/**
 * Deja los filtros explícitos en blanco (incluido el bbox): lo que hace «Limpiar filtros». El
 * interruptor «Filtrar por el área del mapa» es aparte; si sigue activo, el próximo movimiento
 * vuelve a poner el bbox.
 */
export const CAMBIO_LIMPIAR_FILTROS = {
  estado: [],
  severidad: [],
  distrito_id: '',
  unidad_vecinal_id: '',
  bbox: '',
  desde: '',
  hasta: '',
} satisfies Partial<FiltrosReportes>;

export function hayFiltros(f: FiltrosReportes) {
  return (
    f.estado.length > 0 ||
    f.severidad.length > 0 ||
    f.distrito_id !== '' ||
    f.unidad_vecinal_id !== '' ||
    f.desde !== '' ||
    f.hasta !== ''
  );
}

export function alternarEnLista<T>(lista: T[], valor: T): T[] {
  return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
}
