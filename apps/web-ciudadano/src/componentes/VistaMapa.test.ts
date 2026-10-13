import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CONFIG_DOMINIO, type SlugCategoria } from 'contracts';
import { type ComponentProps, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { conCategorias, REGISTRO_DOS_CATEGORIAS } from '@/lib/categoria-de-prueba';
import { ProveedorCiudad } from '@/lib/ciudad-contexto';
import { leerFuente } from '@/lib/fuente-para-pruebas';
import { VistaMapa } from './VistaMapa';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * CA4 del plan M4 sobre la pantalla del mapa. Sin DOM no corren los efectos, así que lo que se ve es
 * justo el estado de la hidratación: la categoría todavía sin resolver (regla 2). Lo que pasa después
 * (lecturas, cambio, anuncio) se comprueba leyendo el código y con las funciones puras de
 * `categoria-mapa.test.ts`; el recorrido en un navegador es de las E2E.
 */

function pantalla(activas: SlugCategoria[]) {
  const peticiones = vi.fn();
  vi.stubGlobal('fetch', peticiones);
  const arbol = createElement(
    QueryClientProvider,
    { client: new QueryClient() },
    createElement(
      ProveedorCiudad,
      { ciudad: CONFIG_DOMINIO.CIUDAD_POR_DEFECTO } as ComponentProps<typeof ProveedorCiudad>,
      conCategorias(activas, createElement(VistaMapa), REGISTRO_DOS_CATEGORIAS),
    ),
  );
  return { marcado: renderToStaticMarkup(arbol), peticiones };
}

afterEach(() => vi.unstubAllGlobals());

describe('el mapa con una sola categoría activa es el de siempre', () => {
  const { marcado, peticiones } = pantalla(['inundacion']);

  it('sin selector ni región de anuncio', () => {
    expect(marcado).not.toContain('tablist');
    expect(marcado).not.toContain('role="tab"');
    expect(marcado).not.toContain('anuncio-categoria');
    expect(marcado).not.toContain('selector-categoria');
  });

  it('el título accesible nombra los puntos de inundación de la ciudad', () => {
    expect(marcado).toContain(
      `<h1 class="sr-only">Mapa de puntos de inundación de ${CONFIG_DOMINIO.CIUDAD_POR_DEFECTO.nombre}</h1>`,
    );
  });

  it('los enlaces a /reportar son exactamente /reportar', () => {
    const enlaces = [...marcado.matchAll(/<a [^>]*href="(\/reportar[^"]*)"/g)].map((m) => m[1]);
    expect(enlaces.length).toBeGreaterThanOrEqual(1);
    for (const href of enlaces) expect(href).toBe('/reportar');
  });

  it('mientras la categoría no se resuelve dice «Buscando» y no el estado vacío ni un fallo', () => {
    expect(marcado).toContain('Buscando puntos…');
    expect(marcado).toContain('Buscando reportes…');
    expect(marcado).not.toContain('Todavía nadie reportó en esta zona');
    expect(marcado).not.toContain('Sin conexión con el servidor');
    expect(marcado).not.toContain('Ningún punto coincide');
  });

  it('la leyenda no lleva la línea de la categoría', () => {
    expect(marcado).toContain('data-testid="leyenda-mapa"');
    expect(marcado).not.toContain('leyenda-categoria');
  });

  it('no se pide nada al servidor mientras la categoría no se resolvió', () => {
    expect(peticiones).not.toHaveBeenCalled();
  });
});

describe('el mapa con dos categorías activas', () => {
  const { marcado, peticiones } = pantalla(['inundacion', 'bache']);

  it('dibuja el selector en la columna de escritorio y en el panel flotante de móvil', () => {
    expect(marcado.match(/role="tablist"/g)).toHaveLength(2);
    expect(marcado).toContain('data-testid="selector-categoria"');
    expect(marcado).toContain('data-testid="selector-categoria-movil"');
    expect(marcado).toContain('data-testid="selector-categoria-bache"');
  });

  it('antes de resolver la categoría ninguna pestaña está seleccionada', () => {
    expect(marcado).not.toContain('aria-selected="true"');
    expect(marcado).toContain('Buscando puntos…');
  });

  it('hay una región viva para anunciar el cambio', () => {
    expect(marcado).toMatch(
      /<p[^>]*role="status"[^>]*aria-live="polite"[^>]*data-testid="anuncio-categoria"/,
    );
  });

  it('tampoco pide nada hasta saber la categoría', () => {
    expect(peticiones).not.toHaveBeenCalled();
  });
});

describe('el código del mapa lee por categoría', () => {
  const vista = leerFuente('componentes/VistaMapa.tsx');
  const portada = leerFuente('componentes/Portada.tsx');

  it('toda lectura lleva la categoría efectiva y espera a tenerla', () => {
    expect(vista).toMatch(/const filtros = useMemo\([\s\S]*?categoria: categoria \?\? undefined/);
    expect(vista).toMatch(/queryKey: \['reportes', filtros\]/);
    expect(vista).toMatch(/queryKey: \['agregados', categoria\]/);
    expect(vista).toMatch(/obtenerAgregados\(categoria as SlugCategoria, signal\)/);
    expect(vista.match(/enabled: categoria !== null/g)).toHaveLength(2);
  });

  it('la lista no conserva el dato previo de otra categoría y los agregados no conservan ninguno', () => {
    expect(vista).not.toMatch(/placeholderData:s*keepPreviousData|import {[^}]*keepPreviousData/);
    expect(vista).toMatch(/placeholderData: \(previos, consultaPrevia\) =>/);
    expect(vista).toMatch(/conservarSoloDeLaMismaCategoria\(categoria, previos/);
    const agregados = /const agregados = useQuery\(\{[\s\S]*?\}\);/.exec(vista)?.[0] ?? '';
    expect(agregados).not.toContain('placeholderData');
  });

  it('el cambio de categoría reinicia por alcance, escribe la URL y guarda la preferencia', () => {
    expect(vista).toMatch(/reiniciarAlCambiarCategoria\(/);
    expect(vista).toMatch(
      /urlTrasElegirCategoria\(window\.location\.href, slug, activas\.length\)/,
    );
    expect(vista).toMatch(/window\.history\.replaceState\(/);
    expect(vista).toMatch(/guardarPreferenciaCategoria\(slug\)/);
    expect(vista).toMatch(/textoAnuncioCategoria\(/);
  });

  it('el mapa descarta los conteos de la categoría anterior con la clave de datos', () => {
    expect(vista).toMatch(/claveDeDatos=\{categoria \?\? undefined\}/);
    const mapa = leerFuente('componentes/Mapa.tsx');
    expect(mapa).toMatch(/reiniciarConteos\(/);
    expect(mapa).toMatch(/\}, \[capas, agregados, capaVisible, claveDeDatos\]\)/);
  });

  it('la portada pide con la primera categoría activa, sin leer la preferencia del dispositivo', () => {
    expect(portada).toMatch(/queryKey: \['reportes', \{ limite: '60', categoria \}\]/);
    expect(portada).toMatch(/obtenerReportes\(\{ limite: '60', categoria \}, signal\)/);
    expect(portada).toMatch(/useCategorias\(\)\.activas\[0\]/);
    expect(portada).not.toMatch(/leerPreferenciaCategoria|useCategoriaEfectiva/);
  });
});

describe('los textos de pantalla salen de la definición de la categoría (0.21.0)', () => {
  it('ninguna pantalla común conserva el literal de inundación que ahora trae la definición', () => {
    const literales: Array<[string, RegExp]> = [
      ['componentes/VistaMapa.tsx', /no se anegue|puntos de inundación/],
      ['componentes/HojaDetalle.tsx', /referencia corporal|ETIQUETAS\.campos/],
      ['componentes/TarjetaReporte.tsx', /etiquetaProfundidad/],
      ['componentes/Mapa.tsx', /puntos de inundación/],
      ['app/reporte/[id]/page.tsx', /Punto de inundación/],
      ['app/reportar/page.tsx', /dónde se junta el agua/],
      ['lib/ciudad.ts', /puntos de inundación/],
    ];
    for (const [ruta, patron] of literales) {
      // Los comentarios pueden explicar de dónde venía el literal; se mira solo el código.
      const codigo = leerFuente(ruta)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(codigo, ruta).not.toMatch(patron);
    }
  });

  it('las páginas toman el título, el vacío y la descripción de la definición', () => {
    expect(leerFuente('app/reporte/[id]/page.tsx')).toMatch(/textos\.puntoSingular/);
    expect(leerFuente('app/reportar/page.tsx')).toMatch(/export async function generateMetadata/);
    expect(leerFuente('app/reportar/page.tsx')).toMatch(/descripcionReportar/);
    expect(leerFuente('app/reportar/page.tsx')).toMatch(/obtenerCategoriasActivas\(\)/);
    expect(leerFuente('componentes/VistaMapa.tsx')).toMatch(/cuerpo=\{textos\.listaVaciaCuerpo\}/);
    expect(leerFuente('componentes/HojaDetalle.tsx')).toMatch(/textos\.avisoPercepcion/);
  });
});
