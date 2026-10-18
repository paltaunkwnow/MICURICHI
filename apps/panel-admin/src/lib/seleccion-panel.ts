import type { RegistroCategorias } from 'contracts';
import { consultaReportes } from './consultas';
import { categoriaParaUrl } from './filtros';
export type ConteoCategoria = { valor: number; exacto: boolean };
export function textoConteo(
  conteo: ConteoCategoria | undefined,
  numero: (n: number) => string,
): string {
  return conteo ? `${conteo.exacto ? '' : '≥ '}${numero(conteo.valor)}` : '—';
}
export function nombreCategoria(
  slug: string,
  disponibles: RegistroCategorias['definiciones'],
): string {
  return slug === 'todas'
    ? 'Todas las categorías'
    : (disponibles.find((d) => d.slug === slug)?.nombre ?? slug);
}
export function anuncioCategoria(
  anterior: string | null,
  actual: string | null,
  disponibles: RegistroCategorias['definiciones'],
): string {
  return anterior !== null && anterior !== actual && actual !== null
    ? `Categoría seleccionada: ${nombreCategoria(actual, disponibles)}.`
    : '';
}
export function urlPanel(ruta: string, categoria: string | null): string {
  const [base, consulta = ''] = ruta.split('?');
  const sp = new URLSearchParams(consulta);
  if (categoria) sp.set('categoria', categoriaParaUrl(categoria));
  return sp.size ? `${base}?${sp}` : (base ?? ruta);
}
export function urlDetallePanel(id: string, categoria: string | null, volver?: string): string {
  const url = urlPanel(`/reportes/${encodeURIComponent(id)}`, categoria);
  const sp = new URLSearchParams(url.split('?')[1]);
  const retorno = validarRetornoBandeja(volver);
  if (retorno) sp.set('volver', retorno);
  return sp.size ? `${url.split('?')[0]}?${sp}` : url;
}
export function retornoBandeja(sp: URLSearchParams): string {
  return validarRetornoBandeja(sp.get('volver')) ?? '/reportes';
}
function validarRetornoBandeja(valor: string | null | undefined): string | null {
  if (
    !valor ||
    !/^\/reportes(?:\?|$)/.test(valor) ||
    [...valor].some((c) => c === '\\' || c.charCodeAt(0) <= 32)
  )
    return null;
  try {
    const url = new URL(valor, 'https://panel.invalid');
    return url.origin === 'https://panel.invalid' && url.pathname === '/reportes' && !url.hash
      ? valor
      : null;
  } catch {
    return null;
  }
}
/** Conteos globales, sin filtros de trabajo; misma clave que cualquier consulta equivalente. */
export function consultasConteosCategorias(
  _pantalla: string,
  categorias: readonly string[],
): ReturnType<typeof consultaReportes>[] {
  return categorias.length < 2
    ? []
    : ['todas', ...categorias].map((categoria) => consultaReportes({ categoria, limite: '1' }));
}
