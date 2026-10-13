/**
 * Disponibilidad de categorías (M3, ADR 0009, 0012, 0013).
 *
 * Una categoría está DISPONIBLE («activa») cuando se cumplen LAS DOS cosas (regla 3 del plan M3):
 *   1. el catálogo `categoria` la tiene con `activa = true`, y
 *   2. el registro de categorías (`RegistroCategorias`) tiene su definición.
 * Si falta cualquiera de las dos, cuenta como INACTIVA (falla cerrado). El caso que no debería
 * pasar —activa en el catálogo pero sin definición en el registro— se registra en el log y se trata
 * como inactiva: preferimos no exponer una categoría cuyo detalle, severidad y campos públicos no
 * sabemos construir a arriesgarnos a servirla mal.
 *
 * El registro se INYECTA (por defecto `REGISTRO_CATEGORIAS`): así las pruebas activan una categoría
 * sintética (una fila en el catálogo más una definición en un registro propio) sin tocar `contracts`.
 *
 * La lista se cachea una ventana corta (`CATEGORIAS_ACTIVAS_TTL_MS`): las lecturas públicas la
 * consultan en cada petición y el conjunto cambia solo cuando el admin activa una categoría (M6+).
 */
import {
  CATEGORIA_TODAS,
  type DefinicionCategoriaCualquiera,
  type FiltroCategoria,
  REGISTRO_CATEGORIAS,
  type RegistroCategorias,
} from 'contracts';
import type { FastifyBaseLogger } from 'fastify';
import type pg from 'pg';

/**
 * Cuánto se recuerda la lista de categorías activas. 30 s: suficiente para que una ráfaga de
 * lecturas no consulte el catálogo en cada una, y lo bastante corto para que activar una categoría
 * (acción rara, de M6 en adelante) se vea enseguida sin reiniciar el proceso.
 */
export const CATEGORIAS_ACTIVAS_TTL_MS = 30_000;

export interface ProveedorCategorias {
  /** Slugs activos (catálogo.activa ∩ registro), en el orden del catálogo. Cacheado. */
  activas(): Promise<readonly string[]>;
  /** ¿El slug está activo (catálogo + registro)? */
  estaActiva(slug: string): Promise<boolean>;
  /** Olvida la caché; la próxima consulta vuelve al catálogo. */
  invalidar(): void;
}

export function crearProveedorCategorias(
  pool: Pick<pg.Pool, 'query'>,
  registro: RegistroCategorias = REGISTRO_CATEGORIAS,
  opciones: { ttlMs?: number; log?: FastifyBaseLogger } = {},
): ProveedorCategorias {
  const ttlMs = opciones.ttlMs ?? CATEGORIAS_ACTIVAS_TTL_MS;
  let cache: { expira: number; promesa: Promise<readonly string[]> } | null = null;

  async function consultar(): Promise<readonly string[]> {
    // `ORDER BY orden`: el catálogo guarda el orden canónico de presentación (el de SLUGS_CATEGORIA).
    const r = await pool.query<{ slug: string }>(
      'SELECT slug FROM categoria WHERE activa = true ORDER BY orden',
    );
    const activas: string[] = [];
    for (const { slug } of r.rows) {
      if (registro.tiene(slug)) activas.push(slug);
      else
        opciones.log?.warn(
          { slug },
          'categoría activa en el catálogo sin definición en el registro: se trata como inactiva (falla cerrado)',
        );
    }
    return activas;
  }

  function activas(): Promise<readonly string[]> {
    const ahora = Date.now();
    if (cache && cache.expira > ahora) return cache.promesa;
    const promesa = consultar();
    cache = { expira: ahora + ttlMs, promesa };
    // Un fallo de la base no se cachea: el siguiente intento vuelve a consultar en vez de quedarse
    // con un rechazo pegado durante toda la ventana.
    promesa.catch(() => {
      if (cache?.promesa === promesa) cache = null;
    });
    return promesa;
  }

  return {
    activas,
    async estaActiva(slug) {
      return (await activas()).includes(slug);
    },
    invalidar() {
      cache = null;
    },
  };
}

/**
 * Validación del filtro `categoria` de una lectura PÚBLICA (`GET /reportes`, `GET /reportes/:id`).
 * Las rutas públicas exigen UNA categoría activa: `null` (desconocida), `todas` o una categoría
 * conocida pero inactiva dan 400 CATEGORIA_NO_DISPONIBLE (regla 2 del plan M3). Devuelve el slug a
 * filtrar cuando es válido.
 */
export async function categoriaPublica(
  prov: ProveedorCategorias,
  categoria: FiltroCategoria | null,
): Promise<{ ok: true; slug: string } | { ok: false }> {
  if (categoria === null || categoria === CATEGORIA_TODAS) return { ok: false };
  if (!(await prov.estaActiva(categoria))) return { ok: false };
  return { ok: true, slug: categoria };
}

/**
 * Validación del filtro `categoria` de una lectura del PANEL (`/tecnico/reportes`, `/exportar`,
 * `/indicadores`, `/ejecutivo/resumen`). El panel admite `todas` (sin filtro de categoría) y
 * cualquier categoría CONOCIDA, esté activa o no; un valor desconocido (`null`) lo rechaza la ruta
 * con su propio código de validación (regla 2). No consulta el catálogo: no depende de la actividad.
 *
 * Devuelve `{ ok: true, slug }` con el slug a filtrar, o `slug: undefined` para `todas` (sin filtro).
 */
export function categoriaPanel(
  categoria: FiltroCategoria | null,
): { ok: true; slug: string | undefined } | { ok: false } {
  if (categoria === null) return { ok: false };
  if (categoria === CATEGORIA_TODAS) return { ok: true, slug: undefined };
  return { ok: true, slug: categoria };
}

/**
 * Límite efectivo del cupo de reportes de una categoría (ADR 0017, M3). El override de instalación
 * (`cfg.reportesPorDiaOverride`, de `REPORTES_POR_DIA_POR_CUENTA`) reemplaza el límite de la
 * `ReglaCupo` de CADA categoría; sin él, cada categoría usa el suyo (`def.cupo.limite`).
 */
export function limiteReportesDe(
  def: DefinicionCategoriaCualquiera,
  override: number | null,
): number {
  return override ?? def.cupo.limite;
}

/**
 * Ámbitos de cupo de REPORTES que api-core sabe aplicar hoy: cada reporte cuenta en la fila
 * `(cuenta, categoría)`. El ámbito `cuenta` (sin categoría) es el del cupo GLOBAL de fotos, que no
 * se configura por categoría (ADR 0017). Una categoría con otro ámbito no se puede contar bien, así
 * que preferimos no arrancar a cobrar mal el cupo.
 */
const AMBITOS_REPORTE_CONOCIDOS = new Set(['cuenta+categoria']);
/** Ventanas de cupo que api-core sabe calcular hoy (la medianoche de la ciudad). */
const VENTANAS_CONOCIDAS = new Set(['dia_local']);

/**
 * Valida (pura) que cada definición activa tenga una `ReglaCupo` que api-core sepa aplicar. Lanza
 * si alguna trae un `ambito` o una `ventana` desconocidos: el cupo es un control antiabuso, y
 * aplicarlo mal (o no aplicarlo) es peor que no arrancar. Falla cerrado (regla 3 del plan M3).
 */
export function validarReglasDeCupo(definiciones: readonly DefinicionCategoriaCualquiera[]): void {
  for (const def of definiciones) {
    const { ambito, ventana } = def.cupo;
    if (!AMBITOS_REPORTE_CONOCIDOS.has(ambito) || !VENTANAS_CONOCIDAS.has(ventana))
      throw new Error(
        `La categoría «${def.slug}» tiene una regla de cupo que api-core no sabe aplicar ` +
          `(ambito=${ambito}, ventana=${ventana}). Ámbitos admitidos: ${[...AMBITOS_REPORTE_CONOCIDOS].join(', ')}; ` +
          `ventanas: ${[...VENTANAS_CONOCIDAS].join(', ')}. Corregí la definición o no actives la categoría.`,
      );
  }
}

/**
 * Comprueba en el ARRANQUE que las categorías ACTIVAS (catálogo ∩ registro) tengan reglas de cupo
 * aplicables. Lee el catálogo de la base y pide cada definición al registro; una categoría activa
 * sin definición ya se trata como inactiva en otro lado, así que aquí solo se valida lo que de
 * verdad se va a servir. Lo llama `servidor.ts` tras comprobar privilegios y antes de escuchar.
 */
export async function verificarReglasDeCupoActivas(
  pool: Pick<pg.Pool, 'query'>,
  registro: RegistroCategorias = REGISTRO_CATEGORIAS,
): Promise<void> {
  const r = await pool.query<{ slug: string }>('SELECT slug FROM categoria WHERE activa = true');
  const definiciones: DefinicionCategoriaCualquiera[] = [];
  for (const { slug } of r.rows) {
    const def = registro.obtener(slug);
    if (def) definiciones.push(def);
  }
  validarReglasDeCupo(definiciones);
}
