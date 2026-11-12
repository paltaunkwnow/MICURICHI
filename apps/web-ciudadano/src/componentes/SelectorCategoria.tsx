'use client';

import type { ColoresCategoria, SlugCategoria } from 'contracts';
import type { LucideIcon } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef } from 'react';
import { useCategorias } from '@/lib/categorias-contexto';
import { destinoTrasTecla } from '@/lib/teclado-pestanas';
import { iconoDeCategoria } from './categorias/iconos';

/** Una pestaña del selector: lo que se necesita de la definición de una categoría activa. */
export interface ItemPestana {
  slug: SlugCategoria;
  nombre: string;
  Icono: LucideIcon;
  colores: ColoresCategoria;
}

interface PropsPestanas {
  items: readonly ItemPestana[];
  /** La categoría efectiva; `null` mientras no se resolvió (servidor e hidratación): ninguna activa. */
  categoria: SlugCategoria | null;
  onCambiar: (slug: SlugCategoria) => void;
  /** Mueve el foco a la pestaña de ese índice (lo hace el contenedor, que tiene los elementos). */
  enfocar: (indice: number) => void;
  /** Guarda el elemento de cada pestaña para `enfocar` y para acercar la activa a la vista. */
  registrar: (indice: number, el: HTMLButtonElement | null) => void;
  testId: string;
  className?: string;
}

/**
 * Las pestañas, sin estado ni efectos: una función pura de sus props, así se prueba sin DOM llamándola
 * y leyendo los manejadores de cada botón.
 *
 * *Roving tabindex*: solo la pestaña activa entra en el orden de tabulación (la primera, mientras
 * ninguna está elegida). Flechas izquierda y derecha, Inicio y Fin mueven el foco y activan la
 * pestaña (`lib/teclado-pestanas.ts`). El color de la categoría es solo el acento de la activa; el
 * anillo de foco es el de la marca (`:focus-visible` global), nunca el de la categoría.
 */
export function PestanasCategoria({
  items,
  categoria,
  onCambiar,
  enfocar,
  registrar,
  testId,
  className = '',
}: PropsPestanas) {
  const alTeclear = (e: KeyboardEvent<HTMLButtonElement>, indice: number) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const destino = destinoTrasTecla(
      e.key,
      indice,
      items.map((i) => i.slug),
    );
    if (!destino) return;
    // Sin esto la flecha también desplazaría la página o el contenedor.
    e.preventDefault();
    enfocar(destino.indice);
    onCambiar(destino.pestana);
  };

  return (
    <div
      role="tablist"
      aria-label="Categorías"
      className={`pestanas-categoria ${className}`}
      data-testid={testId}
    >
      {items.map(({ slug, nombre, Icono, colores }, i) => {
        const activa = slug === categoria;
        return (
          <button
            key={slug}
            ref={(el) => registrar(i, el)}
            type="button"
            role="tab"
            aria-selected={activa}
            tabIndex={activa || (categoria === null && i === 0) ? 0 : -1}
            className="pestana-categoria"
            data-testid={`${testId}-${slug}`}
            style={
              activa
                ? { background: colores.c1, color: colores.c7, borderColor: colores.c5 }
                : undefined
            }
            onClick={() => onCambiar(slug)}
            onKeyDown={(e) => alTeclear(e, i)}
          >
            <Icono size={18} aria-hidden="true" />
            {nombre}
          </button>
        );
      })}
    </div>
  );
}

interface Props {
  categoria: SlugCategoria | null;
  onCambiar: (slug: SlugCategoria) => void;
  /**
   * Base de los identificadores de prueba. El selector se dibuja dos veces —columna de escritorio y
   * panel flotante de móvil— y solo una está visible, como el detalle (`hoja-detalle` y
   * `hoja-detalle-movil`).
   */
  testId?: string;
  className?: string;
}

/**
 * Selector de categoría del mapa (ADR 0013 y 0022, doc 14 §2.4): una pestaña por categoría ACTIVA, en
 * el orden canónico, con su icono y su nombre (la identidad es icono + nombre, el color solo acento).
 * Con menos de dos categorías activas no dibuja nada: mientras solo hay Inundaciones, la pantalla es
 * la de siempre. Objetivos de 48 px (`.pestana-categoria`). La pestaña activa se acerca a la vista
 * al elegirse, sin animación: con cuatro categorías en un celular la lista se desplaza a los lados.
 */
export function SelectorCategoria({
  categoria,
  onCambiar,
  testId = 'selector-categoria',
  className = '',
}: Props) {
  const { activas, definicionDe } = useCategorias();
  const pestanas = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (categoria === null) return;
    pestanas.current[activas.indexOf(categoria)]?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'instant',
    });
  }, [categoria, activas]);

  if (activas.length < 2) return null;

  const items: ItemPestana[] = [];
  for (const slug of activas) {
    const def = definicionDe(slug);
    if (def)
      items.push({
        slug,
        nombre: def.nombre,
        Icono: iconoDeCategoria(def.icono),
        colores: def.colores,
      });
  }

  return (
    <PestanasCategoria
      items={items}
      categoria={categoria}
      onCambiar={onCambiar}
      enfocar={(i) => pestanas.current[i]?.focus()}
      registrar={(i, el) => {
        pestanas.current[i] = el;
      }}
      testId={testId}
      className={className}
    />
  );
}
