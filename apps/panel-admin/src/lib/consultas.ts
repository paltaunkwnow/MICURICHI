import { type QueryClient, type QueryFunctionContext, queryOptions } from '@tanstack/react-query';
import type { PuntoLatLon, VentanaResumen } from 'contracts';
import {
  obtenerAgregadosUv,
  obtenerCapasMapa,
  obtenerDistritos,
  obtenerIndicadores,
  obtenerReporte,
  obtenerReportes,
  obtenerReportesPublicos,
  obtenerResumenEjecutivo,
  obtenerUnidadesVecinales,
  type ParametrosConsulta,
} from './api';
import { parametrosCandidatosFusion } from './fusion-cercana';

/**
 * Consultas de TanStack Query del panel, en un solo lugar para que las pantallas y las pruebas
 * usen las mismas claves y los mismos tiempos.
 *
 * Bandeja, detalle, indicadores y ejecutivo se refrescan solos cada 10 s: un reporte publicado se
 * ve sin recargar. Con la pestaña oculta no se pide nada y al volver se pide una vez. api-core no
 * guarda estas cifras en caché, así que `staleTime` 0: lo que se muestra es lo último que se pidió.
 * Los agregados por UV («UV con mayor incidencia») son cifras de geo-service y siguen el mismo
 * ritmo, pero sin la marca de sondeo: esa cabecera es de api-core, que es quien tiene sesión.
 * La geometría (distritos, unidades vecinales) se pide una sola vez; la lista de capas del mapa
 * vence a los `PLAZO_LISTA_CAPAS_MS`, porque es la que trae la URL con huella de cada capa y un
 * administrador puede activar otra versión con la pantalla abierta.
 */
export const INTERVALO_SONDEO_MS = 10_000;

/** El panel ejecutivo muestra siempre el histórico completo: no tiene selector de período. */
export const VENTANA_EJECUTIVO: VentanaResumen = 'todo';

/** Ritmo de lo que se refresca solo: cada 10 s, nunca con la pestaña oculta, sin caché. */
const REFRESCO = {
  refetchInterval: INTERVALO_SONDEO_MS,
  refetchIntervalInBackground: false,
  staleTime: 0,
} as const;

/**
 * Lo mismo para lo que se pide a api-core: sus refrescos salen con `CABECERA_SONDEO`, para que un
 * panel abierto en una pantalla no mantenga viva la sesión (`esSondeo`).
 */
const SONDEO = { ...REFRESCO, meta: { sondeo: true } } as const;

const GEOMETRIA = { staleTime: Number.POSITIVE_INFINITY } as const;

/**
 * `/geo/v1/capas` es liviana y `public, no-cache`: vencerla cuesta una petición chica al volver a
 * la pestaña o al abrir otra pantalla con mapa. Lo que no alcanza a cubrir este plazo lo cubre el
 * 410 CAPA_CAMBIO de una tesela vieja (`capas-mapa.ts`).
 */
export const PLAZO_LISTA_CAPAS_MS = 60_000;

/**
 * true si la petición que sale es un refresco automático de una consulta con `meta.sondeo`: la
 * consulta ya se intentó (con datos o con error), así que la disparó el intervalo, la vuelta a la
 * pestaña o una invalidación después de moderar. La primera carga de cada clave (abrir la
 * pantalla, cambiar un filtro o de página) la pide la persona y sí renueva la inactividad de la
 * sesión. Mirar solo los datos no alcanzaba: si la primera carga fallaba, cada refresco salía como
 * pedido de la persona y la sesión no vencía nunca.
 */
export function esSondeo(ctx: Pick<QueryFunctionContext, 'client' | 'queryKey' | 'meta'>): boolean {
  if (ctx.meta?.sondeo !== true) return false;
  const estado = ctx.client.getQueryState(ctx.queryKey);
  return !!estado && (estado.dataUpdatedAt > 0 || estado.errorUpdatedAt > 0);
}

// --- Pantallas de trabajo: sondeo cada 10 s ---------------------------------------------------

/** Bandeja (y sus conteos de «esperan revisión»): lista técnica con los filtros de la URL. */
export function consultaReportes(params: ParametrosConsulta) {
  return queryOptions({
    queryKey: ['reportes', params],
    queryFn: (ctx) => obtenerReportes(params, ctx.signal, { sondeo: esSondeo(ctx) }),
    ...SONDEO,
  });
}

export function consultaReportesPublicos(params: ParametrosConsulta) {
  return queryOptions({
    queryKey: ['reportes-publicos', params],
    queryFn: (ctx) => obtenerReportesPublicos(params, ctx.signal, { sondeo: esSondeo(ctx) }),
    ...SONDEO,
  });
}

export function consultaReporte(id: string) {
  return queryOptions({
    queryKey: ['reporte', id],
    queryFn: (ctx) => obtenerReporte(id, ctx.signal, { sondeo: esSondeo(ctx) }),
    ...SONDEO,
  });
}

/**
 * Reportes validados cerca de uno, para elegir con cuál se fusiona. Usa el filtro `bbox` de la
 * lista técnica (la que ve la coordenada exacta) con la caja del radio; la distancia exacta se
 * resuelve después, en el cliente (`lib/fusion-cercana.ts`). Sale solo con el formulario de fusión
 * abierto (`abierto`) y la clave lleva el radio y la caja, así que ampliar la búsqueda es otra
 * consulta. No es una pantalla que se refresque sola: la pide la persona al abrir el formulario
 * (renueva la sesión, sin marca de sondeo) y `staleTime` 0 vuelve a pedirla al reabrirlo.
 */
export function consultaCandidatosFusion(centro: PuntoLatLon, radioM: number, abierto: boolean) {
  const params = parametrosCandidatosFusion(centro, radioM);
  return queryOptions({
    queryKey: ['reportes-candidatos-fusion', { bbox: params.bbox, radio_m: radioM }],
    queryFn: (ctx) => obtenerReportes(params, ctx.signal),
    enabled: abierto,
    staleTime: 0,
  });
}

/**
 * Indicadores del panel, con los filtros de las tortas (0.16.0): `severidad` (lista) y, al tocar
 * un distrito, `distrito_id`. Sin filtros es la consulta de siempre; el `queryKey` incluye los
 * parámetros, así que cambiar un filtro pide de nuevo y `invalidarTrasActivarCapa` sigue casando
 * por el prefijo `['indicadores']`.
 */
export function consultaIndicadores(params: ParametrosConsulta = {}) {
  return queryOptions({
    queryKey: ['indicadores', params],
    queryFn: (ctx) => obtenerIndicadores(params, ctx.signal, { sondeo: esSondeo(ctx) }),
    ...SONDEO,
  });
}

export function consultaResumenEjecutivo() {
  return queryOptions({
    queryKey: ['ejecutivo', 'resumen', VENTANA_EJECUTIVO],
    queryFn: (ctx) =>
      obtenerResumenEjecutivo(VENTANA_EJECUTIVO, ctx.signal, { sondeo: esSondeo(ctx) }),
    ...SONDEO,
  });
}

// --- Geometría ------------------------------------------------------------------------------

export function consultaCapasMapa() {
  return queryOptions({
    queryKey: ['geo', 'capas'],
    queryFn: ({ signal }) => obtenerCapasMapa(signal),
    staleTime: PLAZO_LISTA_CAPAS_MS,
  });
}

export function consultaDistritos() {
  return queryOptions({
    queryKey: ['geo', 'distritos'],
    // La lista de capas sale de la caché del mapa: la bandeja monta las dos consultas a la vez y
    // así `/geo/v1/capas` se pide una sola vez.
    queryFn: async ({ signal, client }) =>
      obtenerDistritos(signal, await client.ensureQueryData(consultaCapasMapa())),
    ...GEOMETRIA,
  });
}

export function consultaUnidadesVecinales() {
  return queryOptions({
    queryKey: ['geo', 'unidades-vecinales'],
    queryFn: () => obtenerUnidadesVecinales(),
    ...GEOMETRIA,
  });
}

/**
 * Cuántos reportes tiene cada UV. Aunque salen de geo-service y llevan la clave `['geo', …]` (se
 * invalidan con la capa), no son geometría: cambian con cada reporte, así que siguen el ritmo de
 * las demás cifras y no la caché infinita de la geometría. Sin `meta.sondeo`: geo-service no tiene
 * sesión que renovar.
 */
export function consultaAgregadosUv() {
  return queryOptions({
    queryKey: ['geo', 'agregados-uv'],
    queryFn: ({ signal }) => obtenerAgregadosUv(signal),
    ...REFRESCO,
  });
}

/**
 * Después de activar una versión de capa: la tabla de versiones, los indicadores (traen las capas
 * vigentes) y toda la geometría. Sin `['geo']` el mapa y los selectores seguían en la capa vieja
 * hasta recargar la página.
 */
export function invalidarTrasActivarCapa(cliente: QueryClient): Promise<unknown> {
  return Promise.all([
    cliente.invalidateQueries({ queryKey: ['capas-versiones'] }),
    cliente.invalidateQueries({ queryKey: ['indicadores'] }),
    cliente.invalidateQueries({ queryKey: ['geo'] }),
  ]);
}
