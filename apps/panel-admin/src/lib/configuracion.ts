/**
 * Lectura de la ciudad desde api-core (`GET /api/v1/configuracion`, contracts 0.7.0). Mismas
 * reglas que `apps/web-ciudadano/src/lib/configuracion.ts`: las dos apps de una instalación
 * tienen que mostrar la misma ciudad.
 *
 * Corre en el servidor de Next, no en el navegador: el layout raíz la necesita ANTES del primer
 * HTML, para que el mapa no abra en otra ciudad ni las fechas cambien de zona al hidratar. Por
 * eso tampoco se fija al compilar: la imagen es la misma para todas las ciudades.
 *
 * Reglas, todas probadas en `configuracion.test.ts`:
 *  - Se guarda {@link REVALIDAR_MS}. Vencido el plazo se responde con la que hay y se renueva por
 *    detrás: ninguna página espera por la renovación.
 *  - Las peticiones simultáneas comparten una sola consulta.
 *  - Solo vale una respuesta 200 que cumpla `ConfiguracionPublicaSchema`: un locale como `es_BO`
 *    haría lanzar RangeError a `Intl` en el navegador y la pantalla que formatea se caería.
 *  - Si api-core no responde y nunca respondió, se usa `CIUDAD_POR_DEFECTO` y se registra. Ese
 *    respaldo NO se guarda: la petición siguiente vuelve a preguntar.
 *  - Si ya se había leído una y la renovación falla, se sigue con la última buena.
 *  - La caché es esta, en memoria (`cache: 'no-store'` para la de datos de Next): el respaldo nunca
 *    queda guardado y el contenedor no necesita escribir en disco.
 */
import { type Ciudad, CONFIG_DOMINIO, ConfiguracionPublicaSchema } from 'contracts';

export const RUTA_CONFIGURACION = '/api/v1/configuracion';

/** Cada cuánto se vuelve a preguntar. La ciudad solo cambia al reconfigurar la instalación. */
export const REVALIDAR_MS = 300_000;

/**
 * Plazo de la consulta. El layout raíz la espera antes de responder cualquier página, así que un
 * api-core colgado no puede colgar el panel entero: pasado el plazo se usa el respaldo.
 */
export const PLAZO_MS = 3_000;

export interface DependenciasLector {
  /** Base de api-core. Se lee en cada consulta: es configuración de tiempo de ejecución. */
  urlBase: () => string;
  pedir?: typeof fetch;
  ahora?: () => number;
  registrar?: (mensaje: string, causa?: unknown) => void;
  plazoMs?: number;
}

export function crearLectorDeCiudad({
  urlBase,
  pedir = fetch,
  ahora = Date.now,
  registrar = console.error,
  plazoMs = PLAZO_MS,
}: DependenciasLector): () => Promise<Ciudad> {
  let vigente: { ciudad: Ciudad; leidaEn: number } | null = null;
  let enCurso: Promise<Ciudad> | null = null;

  async function consultar(url: string): Promise<Ciudad> {
    const r = await pedir(url, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(plazoMs),
    });
    if (r.status !== 200) throw new Error(`api-core respondió ${r.status}`);
    let cuerpo: unknown;
    try {
      cuerpo = await r.json();
    } catch {
      throw new Error('api-core respondió algo que no es JSON');
    }
    const leida = ConfiguracionPublicaSchema.safeParse(cuerpo);
    if (!leida.success)
      throw new Error(
        `la configuración no cumple el contrato: ${leida.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`,
      );
    return leida.data.ciudad;
  }

  /** Una sola consulta a la vez; la que llegue bien reemplaza a la vigente. */
  function renovar(): Promise<Ciudad> {
    if (!enCurso) {
      let url = `API_CORE_URL${RUTA_CONFIGURACION}`;
      // `urlBase` valida `API_CORE_URL` y lanza si está mal escrita: dentro de la cadena, para
      // que ese error se registre como cualquier otro en vez de perderse.
      enCurso = Promise.resolve()
        .then(() => {
          url = `${urlBase().replace(/\/+$/, '')}${RUTA_CONFIGURACION}`;
          return consultar(url);
        })
        .then((ciudad) => {
          vigente = { ciudad, leidaEn: ahora() };
          return ciudad;
        })
        .catch((causa: unknown) => {
          const motivo = causa instanceof Error ? causa.message : String(causa);
          registrar(
            vigente
              ? `[configuracion] No se pudo renovar la ciudad desde ${url} (${motivo}); se sigue usando la última leída: ${vigente.ciudad.nombre}.`
              : `[configuracion] No se pudo leer la ciudad desde ${url} (${motivo}); se usa CIUDAD_POR_DEFECTO (${CONFIG_DOMINIO.CIUDAD_POR_DEFECTO.nombre}) hasta que api-core responda.`,
            causa,
          );
          throw causa;
        })
        .finally(() => {
          enCurso = null;
        });
    }
    return enCurso;
  }

  return async function leerCiudad(): Promise<Ciudad> {
    if (vigente) {
      if (ahora() - vigente.leidaEn >= REVALIDAR_MS)
        renovar().catch(() => {
          /* ya registrado; se sigue con la vigente */
        });
      return vigente.ciudad;
    }
    try {
      return await renovar();
    } catch {
      return CONFIG_DOMINIO.CIUDAD_POR_DEFECTO;
    }
  };
}
