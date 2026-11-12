'use client';

/**
 * Las categorías de la instalación para los componentes de cliente (CA2 del plan M4).
 *
 * Las ACTIVAS llegan del layout raíz, que las leyó en el servidor junto con la ciudad
 * (`ciudad-servidor.ts`) y por el mismo camino. El REGISTRO (las definiciones de `contracts`) se toma
 * del propio paquete; se deja inyectar por prop para que M4.3 y M4.4 prueben con dos categorías.
 *
 * `useCategorias` expone las activas que además están definidas en el registro, en orden canónico
 * (`activasDelRegistro`: el «falla cerrado» de la web), el registro y un `definicionDe(slug)`.
 *
 * `useCategoriaEfectiva` resuelve la categoría ANTES de la primera petición de datos (regla 2): en el
 * servidor y durante la hidratación devuelve `null` (estado neutro, nunca una categoría por defecto que
 * pediría datos de la que no es), y al montar en el cliente aplica la prioridad URL → guardada →
 * defecto, corrige la URL, guarda la efectiva como «última usada» y expone el anuncio para `aria-live`.
 */

import type { DefinicionCategoriaCualquiera, RegistroCategorias, SlugCategoria } from 'contracts';
import { REGISTRO_CATEGORIAS } from 'contracts';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import {
  activasDelRegistro,
  guardarPreferenciaCategoria,
  leerPreferenciaCategoria,
  resolverCategoriaDeUrl,
} from './categoria';
import { CATEGORIAS_ACTIVAS_POR_DEFECTO } from './configuracion';

export interface CategoriasContexto {
  /** Activas definidas en el registro, en orden canónico. */
  activas: readonly SlugCategoria[];
  registro: RegistroCategorias;
  /** La definición de un slug, o `undefined` si no está registrado. */
  definicionDe(slug: string): DefinicionCategoriaCualquiera | undefined;
}

const Contexto = createContext<CategoriasContexto | null>(null);

export function ProveedorCategorias({
  activas,
  registro = REGISTRO_CATEGORIAS,
  children,
}: {
  activas: readonly SlugCategoria[];
  registro?: RegistroCategorias;
  children: ReactNode;
}) {
  const valor = useMemo<CategoriasContexto>(
    () => ({
      activas: activasDelRegistro(activas, registro),
      registro,
      definicionDe: (slug: string) => registro.obtener(slug),
    }),
    [activas, registro],
  );
  return <Contexto value={valor}>{children}</Contexto>;
}

export function useCategorias(): CategoriasContexto {
  const valor = useContext(Contexto);
  if (!valor)
    throw new Error(
      'useCategorias() sin <ProveedorCategorias>: las categorías las reparte el layout raíz (src/app/layout.tsx).',
    );
  return valor;
}

/** Lo que ve un componente sin `<ProveedorCategorias>`: el registro de siempre y el respaldo de activas. */
const CONTEXTO_POR_DEFECTO: CategoriasContexto = {
  activas: activasDelRegistro(CATEGORIAS_ACTIVAS_POR_DEFECTO, REGISTRO_CATEGORIAS),
  registro: REGISTRO_CATEGORIAS,
  definicionDe: (slug: string) => REGISTRO_CATEGORIAS.obtener(slug),
};

/**
 * Como `useCategorias`, pero sin proveedor devuelve el registro de `contracts` y las activas de respaldo
 * en vez de lanzar. Es para las piezas de presentación que se pintan también sueltas —`TarjetaReporte` y
 * `HojaDetalle` se renderizan solas en las pruebas— y que de las categorías solo necesitan leer una
 * definición estática. A diferencia de la ciudad, el registro no depende de la instalación: no hay
 * riesgo de mostrar «otra» categoría por omisión. Las pantallas que deciden qué categoría se muestra
 * (el mapa, el formulario) siguen usando `useCategorias`, que exige el proveedor.
 */
export function useCategoriasOpcional(): CategoriasContexto {
  return useContext(Contexto) ?? CONTEXTO_POR_DEFECTO;
}

export interface CategoriaEfectiva {
  /** `null` hasta que el cliente resuelve: el estado neutro de la hidratación (regla 2). */
  categoria: SlugCategoria | null;
  /** Mensaje para `aria-live` si la URL traía una categoría inválida o inactiva; si no, `null`. */
  anuncio: string | null;
}

export function useCategoriaEfectiva(): CategoriaEfectiva {
  const { activas, registro } = useCategorias();
  const [estado, setEstado] = useState<CategoriaEfectiva>({ categoria: null, anuncio: null });

  useEffect(() => {
    const guardada = leerPreferenciaCategoria();
    const resuelto = resolverCategoriaDeUrl({
      href: window.location.href,
      activas,
      guardada,
      registro,
    });
    if (resuelto.urlNueva) {
      try {
        // Conserva el estado y el título actuales; solo cambia la URL (query y hash incluidos).
        window.history.replaceState(window.history.state, '', resuelto.urlNueva);
      } catch {
        // En entornos sin `history` o con restricciones: la URL queda como estaba, no es bloqueante.
      }
    }
    // La efectiva se guarda como «última usada», también si llegó por un enlace (ADR 0015).
    if (resuelto.efectiva) guardarPreferenciaCategoria(resuelto.efectiva);
    setEstado({ categoria: resuelto.efectiva, anuncio: resuelto.anuncio });
  }, [activas, registro]);

  return estado;
}
