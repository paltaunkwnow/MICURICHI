'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCategoriasPanel } from './categorias-contexto';
import { categoriaParaUrl, resolverCategoriaPanel } from './filtros';

/** URL del panel, independiente de cualquier preferencia del mapa público. */
export function useCategoriaPanel() {
  const { estado, disponibles, registro } = useCategoriasPanel();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [avisoUrl, setAvisoUrl] = useState<string | null>(null);
  const resultado = useMemo(
    () =>
      resolverCategoriaPanel(
        sp.get('categoria'),
        disponibles.map((d) => d.slug),
        estado.configuracion !== null,
      ),
    [sp, disponibles, estado.configuracion],
  );
  const ultimoAmbito = useRef(resultado.categoria);
  const reinicioPendiente = useRef<string | null>(null);
  const urlActual = sp.toString();
  if (reinicioPendiente.current !== null && reinicioPendiente.current !== urlActual)
    reinicioPendiente.current = null;
  if (resultado.categoria !== null) {
    if (ultimoAmbito.current !== null && ultimoAmbito.current !== resultado.categoria)
      reinicioPendiente.current = urlActual;
    ultimoAmbito.current = resultado.categoria;
  }
  // Incluye cambios de disponibilidad con URL legada, antes de construir la primera query.
  const cambioAmbito = resultado.cambioAmbito || reinicioPendiente.current === urlActual;
  useEffect(() => {
    if (resultado.aviso) setAvisoUrl(resultado.aviso);
    if (!resultado.canonicalizar && !cambioAmbito) return;
    const siguiente = new URLSearchParams(sp.toString());
    if (cambioAmbito) {
      siguiente.delete('severidad');
      siguiente.delete('pagina');
      for (const def of registro.definiciones)
        for (const filtro of def.filtros)
          if (filtro.alcance === 'categoria') siguiente.delete(filtro.id);
    }
    if (resultado.categoria) siguiente.set('categoria', categoriaParaUrl(resultado.categoria));
    else siguiente.delete('categoria');
    router.replace(siguiente.size ? `${pathname}?${siguiente}` : pathname, { scroll: false });
  }, [resultado, sp, router, pathname, cambioAmbito, registro]);
  const cambiar = useCallback(
    (categoria: string) => {
      if (categoria === resultado.categoria) return;
      if (categoria !== 'todas' && !disponibles.some((d) => d.slug === categoria)) return;
      const siguiente = new URLSearchParams(sp.toString());
      siguiente.set('categoria', categoriaParaUrl(categoria));
      siguiente.delete('pagina');
      siguiente.delete('severidad');
      for (const def of registro.definiciones)
        for (const filtro of def.filtros)
          if (filtro.alcance === 'categoria') siguiente.delete(filtro.id);
      setAvisoUrl(null);
      router.replace(`${pathname}?${siguiente}`, { scroll: false });
    },
    [resultado.categoria, disponibles, registro, sp, pathname, router],
  );
  return {
    categoria: resultado.categoria,
    cambioAmbito,
    disponibles,
    registro,
    cambiar,
    aviso: estado.aviso ?? avisoUrl ?? resultado.aviso,
    limpiarAviso: () => setAvisoUrl(null),
  };
}
