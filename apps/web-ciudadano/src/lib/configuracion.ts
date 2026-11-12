/**
 * Lectura de la configuración de la instalación desde api-core (`GET /api/v1/configuracion`): la
 * ciudad (contracts 0.7.0) y las categorías activas (0.20.0, ADR 0012).
 *
 * Corre en el servidor de Next, no en el navegador: el layout raíz la necesita ANTES de producir
 * el primer HTML, para que ninguna pantalla muestre otra ciudad ni un instante (un Santa Cruz que
 * parpadea y se convierte en Cochabamba es justo lo que no puede pasar) y para que la categoría se
 * resuelva antes de la primera petición de datos. Por eso tampoco la cachea Next al compilar: la
 * imagen es la misma para todas las ciudades.
 *
 * Reglas, todas probadas en `configuracion.test.ts`:
 *  - Se guarda {@link REVALIDAR_MS}. Vencido el plazo se responde con la que hay y se renueva por
 *    detrás: ninguna página espera por la renovación.
 *  - Las peticiones simultáneas comparten una sola consulta.
 *  - Solo vale una respuesta 200 que cumpla `ConfiguracionPublicaSchema`: un locale como `es_BO`
 *    haría lanzar RangeError a `Intl` en el navegador y la pantalla que formatea se caería.
 *  - Si api-core no responde y nunca respondió, se usa `CIUDAD_POR_DEFECTO` con las categorías de
 *    respaldo (`['inundacion']`) y se registra. Ese respaldo NO se guarda: la petición siguiente
 *    vuelve a preguntar.
 *  - Si ya se había leído una y la renovación falla, se sigue con la última buena.
 *
 * Las categorías activas se normalizan a su slug canónico (alias incluidos) y se dejan en orden
 * canónico; la validación contra el REGISTRO de definiciones (el «falla cerrado») la hace el contexto
 * del cliente (`activasDelRegistro`), que es quien tiene el registro y lo deja inyectar en pruebas.
 */
import {
  type Ciudad,
  CONFIG_DOMINIO,
  ConfiguracionPublicaSchema,
  normalizarSlugCategoria,
  SLUGS_CATEGORIA,
  type SlugCategoria,
} from 'contracts';

export const RUTA_CONFIGURACION = '/api/v1/configuracion';

/** Cada cuánto se vuelve a preguntar. La ciudad solo cambia al reconfigurar la instalación. */
export const REVALIDAR_MS = 300_000;

/**
 * Plazo de la consulta. El layout raíz la espera antes de responder cualquier página, así que un
 * api-core colgado no puede colgar la app entera: pasado el plazo se usa el respaldo.
 */
export const PLAZO_MS = 3_000;

/** Categorías activas de respaldo cuando api-core no responde (ADR 0012): solo Inundaciones. */
export const CATEGORIAS_ACTIVAS_POR_DEFECTO: readonly SlugCategoria[] = ['inundacion'];

/** La configuración resuelta que usa la app: la ciudad y las categorías activas (slugs canónicos). */
export interface ConfiguracionResuelta {
  ciudad: Ciudad;
  categoriasActivas: readonly SlugCategoria[];
}

export interface DependenciasLector {
  /** Base de api-core. Se lee en cada consulta: es configuración de tiempo de ejecución. */
  urlBase: () => string;
  pedir?: typeof fetch;
  ahora?: () => number;
  registrar?: (mensaje: string, causa?: unknown) => void;
  plazoMs?: number;
}

/**
 * Normaliza las categorías activas que manda api-core a sus slugs canónicos, en orden canónico. Sin el
 * campo (api-core viejo) se usa el respaldo. No filtra contra el registro: eso es del contexto.
 */
function categoriasActivasDe(crudas: readonly string[] | undefined): readonly SlugCategoria[] {
  if (crudas === undefined) return CATEGORIAS_ACTIVAS_POR_DEFECTO;
  const vistas = new Set<SlugCategoria>();
  for (const crudo of crudas) {
    const slug = normalizarSlugCategoria(crudo);
    if (slug !== null) vistas.add(slug);
  }
  return SLUGS_CATEGORIA.filter((slug) => vistas.has(slug));
}

export function crearLectorDeConfiguracion({
  urlBase,
  pedir = fetch,
  ahora = Date.now,
  registrar = console.error,
  plazoMs = PLAZO_MS,
}: DependenciasLector): () => Promise<ConfiguracionResuelta> {
  let vigente: { config: ConfiguracionResuelta; leidaEn: number } | null = null;
  let enCurso: Promise<ConfiguracionResuelta> | null = null;

  async function consultar(url: string): Promise<ConfiguracionResuelta> {
    // `no-store`: la caché de datos de Next no interviene. La de acá es la única, y así el
    // respaldo nunca queda guardado ni se escribe nada en el disco del contenedor.
    const r = await pedir(url, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(plazoMs),
    });
    if (r.status !== 200) throw new Error(`api-core respondió ${r.status}`);
    const leida = ConfiguracionPublicaSchema.safeParse(await r.json());
    if (!leida.success)
      throw new Error(
        `la configuración no cumple el contrato: ${leida.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`,
      );
    return {
      ciudad: leida.data.ciudad,
      categoriasActivas: categoriasActivasDe(leida.data.categorias_activas),
    };
  }

  /**
   * Una sola consulta a la vez; la que llegue bien reemplaza a la vigente. Todo va dentro de la
   * promesa, también leer la URL: una `API_CORE_URL` mal escrita se registra como cualquier otro
   * fallo en vez de escapar sin aviso.
   */
  function renovar(): Promise<ConfiguracionResuelta> {
    if (!enCurso)
      enCurso = (async () => {
        let url = RUTA_CONFIGURACION;
        try {
          url = `${urlBase().replace(/\/+$/, '')}${RUTA_CONFIGURACION}`;
          const config = await consultar(url);
          vigente = { config, leidaEn: ahora() };
          return config;
        } catch (causa) {
          const motivo = causa instanceof Error ? causa.message : String(causa);
          registrar(
            vigente
              ? `[configuracion] No se pudo renovar la configuración desde ${url} (${motivo}); se sigue usando la última leída: ${vigente.config.ciudad.nombre}.`
              : `[configuracion] No se pudo leer la configuración desde ${url} (${motivo}); se usa CIUDAD_POR_DEFECTO (${CONFIG_DOMINIO.CIUDAD_POR_DEFECTO.nombre}) hasta que api-core responda.`,
            causa,
          );
          throw causa;
        }
      })().finally(() => {
        enCurso = null;
      });
    return enCurso;
  }

  return async function leerConfiguracion(): Promise<ConfiguracionResuelta> {
    if (vigente) {
      if (ahora() - vigente.leidaEn >= REVALIDAR_MS)
        renovar().catch(() => {
          /* ya registrado; se sigue con la vigente */
        });
      return vigente.config;
    }
    try {
      return await renovar();
    } catch {
      return {
        ciudad: CONFIG_DOMINIO.CIUDAD_POR_DEFECTO,
        categoriasActivas: CATEGORIAS_ACTIVAS_POR_DEFECTO,
      };
    }
  };
}
