'use client';

import type { RegistroCategorias } from 'contracts';
import { Layers } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useFormato } from '@/lib/ciudad-contexto';
import { anuncioCategoria, type ConteoCategoria, textoConteo } from '@/lib/seleccion-panel';
import { IconoCategoria } from './InsigniaCategoria';
export interface PropsSelectorCategoria {
  disponibles: RegistroCategorias['definiciones'];
  categoria: string | null;
  conteos: Record<string, ConteoCategoria | undefined>;
  onCambiar: (categoria: string) => void;
  universo: string;
}
export function SelectorCategoria({
  disponibles,
  categoria,
  conteos,
  onCambiar,
  universo,
}: PropsSelectorCategoria) {
  const { numero } = useFormato();
  const anterior = useRef(categoria);
  const [anuncio, setAnuncio] = useState('');
  useEffect(() => {
    if (anterior.current !== categoria)
      setAnuncio(anuncioCategoria(anterior.current, categoria, disponibles));
    anterior.current = categoria;
  }, [categoria, disponibles]);
  return (
    <section
      aria-label="Categoría de los reportes"
      className={disponibles.length === 1 ? 'sr-only' : 'space-y-2'}
    >
      {disponibles.length === 0 ? (
        <p>No hay categorías disponibles para consultar.</p>
      ) : disponibles.length > 1 ? (
        <>
          <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0" aria-label="Elegir categoría">
            {['todas', ...disponibles.map((d) => d.slug)].map((slug) => {
              const def = disponibles.find((d) => d.slug === slug);
              return (
                <button
                  key={slug}
                  type="button"
                  className="btn btn-secundario min-h-12 min-w-12"
                  aria-pressed={categoria === slug}
                  onClick={() => {
                    if (categoria !== slug) onCambiar(slug);
                  }}
                  style={
                    def
                      ? {
                          borderColor: def.colores.c7,
                          color: def.colores.c7,
                          background: categoria === slug ? def.colores.c1 : undefined,
                        }
                      : undefined
                  }
                >
                  {def ? (
                    <>
                      <IconoCategoria nombre={def.icono} />
                      {def.nombre}
                    </>
                  ) : (
                    <>
                      <Layers size={18} aria-hidden="true" />
                      Todas
                    </>
                  )}
                  <span>{textoConteo(conteos[slug], numero)}</span>
                </button>
              );
            })}
          </fieldset>
          <p className="text-sm text-tinta-600">{universo}</p>
        </>
      ) : null}
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="anuncio-categoria-panel"
      >
        {anuncio}
      </p>
    </section>
  );
}
