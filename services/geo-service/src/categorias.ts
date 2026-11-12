/**
 * Disponibilidad de categorías en geo-service (M3.4, ADR 0009, 0012, 0013).
 *
 * Mismo criterio que api-core (`services/api-core/src/categorias.ts`): una categoría está
 * DISPONIBLE («activa») cuando se cumplen LAS DOS cosas (regla 3 del plan M3):
 *   1. el catálogo `categoria` la tiene con `activa = true`, y
 *   2. el registro de categorías (`RegistroCategorias`) tiene su definición.
 * Si falta cualquiera de las dos, cuenta como INACTIVA (falla cerrado). El caso que no debería
 * pasar —activa en el catálogo pero sin definición en el registro— se registra en el log y se trata
 * como inactiva: preferimos no servir cifras de una categoría cuyo detalle no sabemos construir.
 *
 * El registro se INYECTA (por defecto `REGISTRO_CATEGORIAS`): así las pruebas activan una categoría
 * sintética (una fila en el catálogo más una definición en un registro propio) sin tocar `contracts`.
 *
 * geo-service es de SOLO LECTURA y solo tiene rutas PÚBLICAS (agregados y puntos críticos por UV),
 * así que acá vive solo la validación pública: `todas` y las categorías desconocidas o inactivas
 * dan 400. El catálogo se consulta con el rol `curichi_geo`, que tiene SELECT sobre `categoria`
 * desde la migración 0020.
 */
import {
  CATEGORIA_TODAS,
  type FiltroCategoria,
  REGISTRO_CATEGORIAS,
  type RegistroCategorias,
} from 'contracts';
import type { FastifyBaseLogger } from 'fastify';
import type pg from 'pg';

/**
 * Cuánto se recuerda la lista de categorías activas. 30 s, igual que api-core: suficiente para que
 * una ráfaga de lecturas no consulte el catálogo en cada una, y lo bastante corto para que activar
 * una categoría (acción rara, de M6 en adelante) se vea enseguida sin reiniciar el proceso.
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
 * Validación del filtro `categoria` de una lectura PÚBLICA (todas las rutas de cifras de
 * geo-service). Exige UNA categoría activa: `null` (desconocida), `todas` o una categoría conocida
 * pero inactiva dan 400 CATEGORIA_NO_DISPONIBLE (regla 2 del plan M3). Devuelve el slug a filtrar
 * cuando es válido. Mismo contrato que `categoriaPublica` de api-core.
 */
export async function categoriaPublica(
  prov: ProveedorCategorias,
  categoria: FiltroCategoria | null,
): Promise<{ ok: true; slug: string } | { ok: false }> {
  if (categoria === null || categoria === CATEGORIA_TODAS) return { ok: false };
  if (!(await prov.estaActiva(categoria))) return { ok: false };
  return { ok: true, slug: categoria };
}
