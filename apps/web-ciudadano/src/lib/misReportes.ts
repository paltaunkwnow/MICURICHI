/**
 * «Mis reportes»: los reportes de la cuenta, en la vista del autor (`GET /api/v1/mis-reportes`,
 * contracts 0.11.0). Los ve en cualquier estado: mientras esperan su publicación, sin verificar,
 * verificados, resueltos y también si los retiraron del mapa o los sumaron a otro punto.
 *
 * Antes el navegador recordaba los identificadores enviados desde el dispositivo en
 * `localStorage` y preguntaba uno por uno a la vista pública. Esa lista se borra: la del servidor
 * es la de la cuenta, en cualquier teléfono, y no deja en el dispositivo rastro de qué se reportó.
 */
import type { QueryClient } from '@tanstack/react-query';
import type { MiReporte } from 'contracts';

/** Clave de la lista que guardaba el navegador hasta contracts 0.11.0. */
export const CLAVE_LISTA_VIEJA = 'curichi.mis-reportes.v1';

/** Borra la lista vieja del navegador, si quedó. Sin almacenamiento disponible, no hace nada. */
export function borrarListaVieja(): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage?.removeItem(CLAVE_LISTA_VIEJA);
  } catch {
    // Navegación privada o almacenamiento bloqueado: no hay nada que borrar.
  }
}

/** Prefijo de la consulta: `removeQueries` con él saca la lista de cualquier cuenta. */
export const CLAVE_MIS_REPORTES = ['mis-reportes'] as const;

/**
 * La clave lleva la cuenta: si en el mismo navegador entra otra persona, su lista es otra
 * consulta y nunca se le muestra, ni por un instante, la de quien estaba antes.
 */
export function claveMisReportes(usuarioId: string): readonly unknown[] {
  return [...CLAVE_MIS_REPORTES, usuarioId];
}

/**
 * Lo que es de la cuenta se va de la caché al perder la sesión (cerrarla o que venza). Lo público
 * —el mapa, los detalles— se queda: no depende de quién mira.
 */
export function olvidarDatosDeLaCuenta(cliente: Pick<QueryClient, 'removeQueries'>): void {
  cliente.removeQueries({ queryKey: [...CLAVE_MIS_REPORTES] });
}

export type SituacionAutor =
  | 'en-espera'
  | 'sin-verificar'
  | 'verificado'
  | 'resuelto'
  | 'retirado'
  | 'sumado';

type DatosDeSituacion = Pick<
  MiReporte,
  'estado' | 'verificado' | 'retirado' | 'segundos_para_publicar'
>;

/**
 * En qué está el reporte para quien lo envió. `faltan` es la cuenta regresiva de la pantalla,
 * que manda sobre `segundos_para_publicar`: ese dato es del momento de la respuesta y envejece.
 */
export function situacionDelAutor(p: DatosDeSituacion, faltan?: number): SituacionAutor {
  if (p.retirado || p.estado === 'rechazado' || p.estado === 'duplicado')
    return p.estado === 'duplicado' ? 'sumado' : 'retirado';
  if ((faltan ?? p.segundos_para_publicar) > 0) return 'en-espera';
  if (p.estado === 'resuelto') return 'resuelto';
  return p.verificado || p.estado === 'validado' ? 'verificado' : 'sin-verificar';
}

export interface ResumenMisReportes {
  todos: number;
  enEspera: number;
  sinVerificar: number;
  /** Verificados y resueltos: los que revisó un técnico y siguen en el mapa. */
  verificados: number;
  /** Retirados del mapa y sumados a otro punto. */
  retirados: number;
}

export function resumenDeMisReportes(lista: readonly DatosDeSituacion[]): ResumenMisReportes {
  const r: ResumenMisReportes = {
    todos: lista.length,
    enEspera: 0,
    sinVerificar: 0,
    verificados: 0,
    retirados: 0,
  };
  for (const p of lista) {
    const s = situacionDelAutor(p);
    if (s === 'en-espera') r.enEspera += 1;
    else if (s === 'sin-verificar') r.sinVerificar += 1;
    else if (s === 'verificado' || s === 'resuelto') r.verificados += 1;
    else r.retirados += 1;
  }
  return r;
}
