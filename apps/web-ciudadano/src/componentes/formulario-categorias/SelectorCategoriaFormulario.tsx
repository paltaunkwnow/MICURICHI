'use client';

import type { RegistroCategorias, SlugCategoria } from 'contracts';
import { useState } from 'react';
import { iconoDeCategoria } from '@/componentes/categorias/iconos';

/**
 * «Categoría: X · Cambiar» en el paso 1 del reporte (ADR 0021). Solo se muestra con dos o más
 * categorías activas: con una, el armazón no lo pinta, así que el formulario no cambia. Elegir otra
 * no pierde la ubicación, las fotos ni la descripción (lo maneja `cambiarCategoria` del formulario);
 * acá solo se elige.
 */
export function SelectorCategoriaFormulario({
  activas,
  categoria,
  registro,
  onElegir,
}: {
  activas: readonly SlugCategoria[];
  categoria: SlugCategoria;
  registro: RegistroCategorias;
  onElegir: (slug: SlugCategoria) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const nombre = registro.obtener(categoria)?.nombre ?? categoria;
  return (
    <div className="mt-1.5" data-testid="categoria-del-reporte">
      <p className="ayuda">
        Categoría: <b className="text-tinta-900">{nombre}</b>{' '}
        <button
          type="button"
          className="font-bold text-agua-700"
          aria-expanded={abierto}
          data-testid="cambiar-categoria"
          onClick={() => setAbierto((v) => !v)}
        >
          Cambiar
        </button>
      </p>
      {abierto ? (
        <fieldset className="mt-2 flex flex-wrap gap-2" aria-label="Elegí la categoría del reporte">
          {activas.map((slug) => {
            const def = registro.obtener(slug);
            const Icono = iconoDeCategoria(def?.icono ?? '');
            return (
              <button
                key={slug}
                type="button"
                className={`chip ${slug === categoria ? 'font-semibold' : ''}`}
                aria-pressed={slug === categoria}
                data-testid={`elegir-categoria-${slug}`}
                onClick={() => {
                  onElegir(slug);
                  setAbierto(false);
                }}
              >
                <Icono size={16} aria-hidden="true" /> {def?.nombre ?? slug}
              </button>
            );
          })}
        </fieldset>
      ) : null}
    </div>
  );
}
