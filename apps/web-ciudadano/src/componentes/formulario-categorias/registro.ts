import type { DefinicionCategoriaCualquiera } from 'contracts';
import { crearAdaptadorGenerico } from './generico';
import { ADAPTADOR_INUNDACION } from './inundacion';
import type { AdaptadorFormularioCategoria } from './tipos';

/**
 * Adaptadores de formulario por categoría con COMPONENTE ESPECIAL (ADR 0021), por slug. Imita al
 * registro de presentadores: una categoría con un paso 2 que las preguntas declarativas no expresan
 * (Inundaciones, con la referencia corporal y la lógica del sumidero) suma el suyo acá; las demás
 * usan el renderizador declarativo. El código común nunca pregunta por una categoría concreta.
 */
export const ADAPTADORES_FORMULARIO: Readonly<Record<string, AdaptadorFormularioCategoria>> = {
  inundacion: ADAPTADOR_INUNDACION,
};

/** El adaptador de formulario de una categoría: el registrado o, si no hay, el declarativo de su definición. */
export function adaptadorFormularioDe(
  definicion: DefinicionCategoriaCualquiera,
  adaptadores: Readonly<Record<string, AdaptadorFormularioCategoria>> = ADAPTADORES_FORMULARIO,
): AdaptadorFormularioCategoria {
  return adaptadores[definicion.slug] ?? crearAdaptadorGenerico(definicion);
}
