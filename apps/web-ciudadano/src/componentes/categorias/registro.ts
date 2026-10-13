import { PRESENTADOR_GENERICO } from './generico';
import { PRESENTADOR_INUNDACION } from './inundacion';
import type { PresentadorCategoria } from './tipos';

/**
 * Presentadores registrados por categoría (ADR 0021). Una categoría que necesite una presentación que
 * las preguntas declarativas no expresan suma acá la suya; las demás usan el presentador genérico, que
 * arma las filas desde su definición. El código común nunca pregunta por una categoría concreta.
 */
export const PRESENTADORES: Readonly<Record<string, PresentadorCategoria>> = {
  inundacion: PRESENTADOR_INUNDACION,
};

/** El presentador de una categoría: el registrado o, si no hay, el genérico. */
export function presentadorDe(
  slug: string,
  presentadores: Readonly<Record<string, PresentadorCategoria>> = PRESENTADORES,
): PresentadorCategoria {
  return presentadores[slug] ?? PRESENTADOR_GENERICO;
}
