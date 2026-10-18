import type { DefinicionCategoriaCualquiera } from 'contracts';
import type { ValoresFormulario } from '@/lib/formulario-reporte';
import { crearAdaptadorGenerico } from './generico';
import { ADAPTADOR_INUNDACION } from './inundacion';
import type { AdaptadorFormularioCategoria } from './tipos';

/**
 * Adaptadores de formulario con COMPONENTE ESPECIAL (ADR 0021), por identificador. Imita al
 * registro de presentadores: una categoría con un paso 2 que las preguntas declarativas no expresan
 * (Inundaciones, con la referencia corporal y la lógica del sumidero) suma el suyo acá; las demás
 * usan el renderizador declarativo. El código común nunca pregunta por una categoría concreta.
 */
export const ADAPTADORES_FORMULARIO: Readonly<Record<string, AdaptadorFormularioCategoria>> = {
  'inundacion/paso2': ADAPTADOR_INUNDACION,
};

/** El adaptador de formulario de una categoría: el registrado o, si no hay, el declarativo de su definición. */
export function adaptadorFormularioDe(
  definicion: DefinicionCategoriaCualquiera,
  adaptadores: Readonly<Record<string, AdaptadorFormularioCategoria>> = ADAPTADORES_FORMULARIO,
): AdaptadorFormularioCategoria {
  const id = definicion.componenteEspecialPaso2;
  if (id === undefined) return crearAdaptadorGenerico(definicion);
  if (!Object.hasOwn(adaptadores, id) || !adaptadores[id])
    throw new Error(`Componente especial no registrado: ${id}`);
  const adaptador = adaptadores[id];
  if (adaptador.slug === definicion.slug) return adaptador;
  return {
    ...adaptador,
    slug: definicion.slug,
    // El componente puede reutilizar sus controles, pero el detalle lo decide la definición
    // efectiva. Los errores vuelven a los controles planos originales cuando tienen un paso.
    esquemaFormulario: adaptador.esquemaFormulario.superRefine((datos, contexto) => {
      const detalle = definicion.esquemaDetalle.safeParse(
        adaptador.aDetalle(datos as ValoresFormulario),
      );
      if (!detalle.success)
        for (const problema of detalle.error.issues) {
          const primero = problema.path[0];
          const plano =
            typeof primero === 'string' && Object.hasOwn(adaptador.pasoDeCampo, primero);
          contexto.addIssue({
            code: 'custom',
            message: problema.message,
            path: plano ? problema.path : ['detalle', ...problema.path],
          });
        }
    }),
    pasoDeCampo: { ...adaptador.pasoDeCampo, detalle: 2 },
    valoresIniciales: () => ({
      ...adaptador.valoresIniciales(),
      ubicacion_tipo: definicion.ubicacionTipoPorDefecto,
    }),
    previsualizarSeveridad: (valores) => {
      const detalle = definicion.esquemaDetalle.safeParse(adaptador.aDetalle(valores));
      return detalle.success ? { banda: definicion.severidad.calcular(detalle.data).banda } : null;
    },
  };
}
