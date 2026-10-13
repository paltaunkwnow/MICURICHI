import { keepPreviousData, QueryClient, type QueryKey, QueryObserver } from '@tanstack/react-query';
import { REGISTRO_CATEGORIAS } from 'contracts';
import { describe, expect, it } from 'vitest';
import {
  CATEGORIA_DE_REPORTE_SIN_CAMPO,
  categoriaDeClaveDeReportes,
  categoriaDeReporte,
  conservarSoloDeLaMismaCategoria,
  hrefReportar,
  TEXTOS_CATEGORIA_POR_DEFECTO,
  textoAnuncioCategoria,
  textosParaCategoria,
  urlTrasElegirCategoria,
} from './categoria';
import { REGISTRO_DOS_CATEGORIAS } from './categoria-de-prueba';
import { etiquetaDelMapa, tituloDelMapa } from './ciudad';

/**
 * CA4 del plan M4 (parte pura): las lecturas del mapa no mezclan categorías, los enlaces a
 * `/reportar` llevan la categoría solo cuando hay más de una activa (D1) y los textos de pantalla
 * que salen de la definición dan EXACTAMENTE los literales de hoy con Inundaciones.
 */

type Datos = { features: string[] };

describe('placeholderData de la lista del mapa: nunca puntos de otra categoría (regla 2)', () => {
  const previos: Datos = { features: ['punto-de-inundacion'] };

  it('conserva lo último bueno al mover el mapa (misma categoría, otro bbox)', () => {
    const clave: QueryKey = ['reportes', { categoria: 'inundacion', bbox: 'a' }];
    expect(conservarSoloDeLaMismaCategoria('inundacion', previos, clave)).toBe(previos);
  });

  it('al cambiar de categoría NO conserva nada: la lista queda en «buscando»', () => {
    const clave: QueryKey = ['reportes', { categoria: 'inundacion', bbox: 'a' }];
    expect(conservarSoloDeLaMismaCategoria('bache', previos, clave)).toBeUndefined();
  });

  it('un dato previo de clave sin categoría (o ajena) no se conserva', () => {
    expect(
      conservarSoloDeLaMismaCategoria('inundacion', previos, ['reportes', {}]),
    ).toBeUndefined();
    expect(conservarSoloDeLaMismaCategoria('inundacion', previos, ['reportes'])).toBeUndefined();
    expect(conservarSoloDeLaMismaCategoria('inundacion', previos, undefined)).toBeUndefined();
    expect(categoriaDeClaveDeReportes(['reportes', 'texto'])).toBeUndefined();
  });

  it('sin dato previo, o con la categoría todavía sin resolver, no devuelve nada', () => {
    const clave: QueryKey = ['reportes', { categoria: 'inundacion' }];
    expect(conservarSoloDeLaMismaCategoria('inundacion', undefined, clave)).toBeUndefined();
    expect(conservarSoloDeLaMismaCategoria(null, previos, clave)).toBeUndefined();
  });

  it('con un QueryObserver real: mover el mapa conserva la lista; cambiar de categoría la vacía', async () => {
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const resolvers = new Map<string, (d: Datos) => void>();
    const opciones = (categoria: string, bbox: string, conservar = true) => ({
      queryKey: ['reportes', { categoria, bbox }] as QueryKey,
      queryFn: () =>
        new Promise<Datos>((resolver) => {
          resolvers.set(`${categoria}:${bbox}`, resolver);
        }),
      placeholderData: conservar
        ? (p: Datos | undefined, q?: { queryKey: QueryKey }) =>
            conservarSoloDeLaMismaCategoria(categoria, p, q?.queryKey)
        : keepPreviousData,
    });
    const vaciarCola = () => new Promise((r) => setTimeout(r, 0));

    const observador = new QueryObserver<Datos>(cliente, opciones('inundacion', 'a'));
    const desuscribir = observador.subscribe(() => {});
    await vaciarCola();
    resolvers.get('inundacion:a')?.(previos);
    await vaciarCola();
    expect(observador.getCurrentResult().data).toBe(previos);

    // Mismo mapa, otra vista: sigue la lista anterior mientras llega la nueva.
    observador.setOptions(opciones('inundacion', 'b'));
    expect(observador.getCurrentResult().data).toBe(previos);
    expect(observador.getCurrentResult().isPlaceholderData).toBe(true);
    await vaciarCola();
    resolvers.get('inundacion:b')?.({ features: ['otra-vista'] });
    await vaciarCola();

    // Otra categoría: ni un punto de la anterior mientras carga.
    observador.setOptions(opciones('bache', 'b'));
    expect(observador.getCurrentResult().data).toBeUndefined();
    expect(observador.getCurrentResult().isPending).toBe(true);

    // Control: con `keepPreviousData` —lo que había— la lista de la otra categoría SÍ se colaba.
    const control = new QueryObserver<Datos>(cliente, opciones('inundacion', 'c', false));
    const desuscribirControl = control.subscribe(() => {});
    await vaciarCola();
    resolvers.get('inundacion:c')?.(previos);
    await vaciarCola();
    control.setOptions(opciones('bache', 'c', false));
    expect(control.getCurrentResult().data).toBe(previos);

    desuscribir();
    desuscribirControl();
    cliente.clear();
  });
});

describe('enlaces a /reportar desde el mapa (D1)', () => {
  it('con una sola categoría activa el enlace es exactamente /reportar', () => {
    expect(hrefReportar({ categoria: 'inundacion', cantidadActivas: 1 })).toBe('/reportar');
    expect(hrefReportar({ categoria: null, cantidadActivas: 1 })).toBe('/reportar');
    expect(hrefReportar({ categoria: 'bache', cantidadActivas: 1 })).toBe('/reportar');
  });

  it('«Me pasa a mí» con una sola activa conserva lat y lon tal cual, sin categoría', () => {
    expect(
      hrefReportar({ categoria: 'inundacion', cantidadActivas: 1, lat: -17.78, lon: -63.18 }),
    ).toBe('/reportar?lat=-17.78&lon=-63.18');
  });

  it('con dos o más activas lleva la categoría en su forma pública', () => {
    expect(hrefReportar({ categoria: 'bache', cantidadActivas: 2 })).toBe(
      '/reportar?categoria=bache',
    );
    expect(hrefReportar({ categoria: 'area_verde', cantidadActivas: 4 })).toBe(
      '/reportar?categoria=area-verde',
    );
    expect(hrefReportar({ categoria: 'Baches', cantidadActivas: 2 })).toBe(
      '/reportar?categoria=bache',
    );
  });

  it('con dos o más activas «Me pasa a mí» conserva lat y lon y suma la categoría', () => {
    expect(hrefReportar({ categoria: 'bache', cantidadActivas: 2, lat: -17.78, lon: -63.18 })).toBe(
      '/reportar?lat=-17.78&lon=-63.18&categoria=bache',
    );
  });

  it('una categoría que no se reconoce no se pone en el enlace', () => {
    expect(hrefReportar({ categoria: 'tortugas', cantidadActivas: 3 })).toBe('/reportar');
    expect(hrefReportar({ categoria: undefined, cantidadActivas: 3 })).toBe('/reportar');
  });
});

describe('la URL después de elegir una categoría en el selector (D1)', () => {
  const BASE = 'https://localhost/?uv=57#detalle';

  it('con dos o más activas escribe la forma pública y conserva el resto', () => {
    expect(urlTrasElegirCategoria(BASE, 'bache', 2)).toBe(
      'https://localhost/?uv=57&categoria=bache#detalle',
    );
    expect(urlTrasElegirCategoria('https://localhost/', 'area_verde', 3)).toBe(
      'https://localhost/?categoria=area-verde',
    );
  });

  it('reemplaza la categoría anterior', () => {
    expect(urlTrasElegirCategoria('https://localhost/?categoria=bache', 'inundacion', 2)).toBe(
      'https://localhost/?categoria=inundacion',
    );
  });

  it('si la URL ya dice la categoría, no hay nada que hacer', () => {
    expect(urlTrasElegirCategoria('https://localhost/?categoria=bache', 'bache', 2)).toBeNull();
  });

  it('con una sola activa el parámetro no existe: se quita si estaba y no se agrega', () => {
    expect(
      urlTrasElegirCategoria('https://localhost/?categoria=inundacion&uv=1', 'inundacion', 1),
    ).toBe('https://localhost/?uv=1');
    expect(urlTrasElegirCategoria('https://localhost/?uv=1', 'inundacion', 1)).toBeNull();
    expect(urlTrasElegirCategoria('https://localhost/', 'inundacion', 1)).toBeNull();
  });
});

describe('anuncio de lectores de pantalla al cambiar de categoría', () => {
  it('«Mostrando X: N puntos», con singular y separador de miles de la ciudad', () => {
    expect(textoAnuncioCategoria('Baches', 12, 'es-BO')).toBe('Mostrando Baches: 12 puntos');
    expect(textoAnuncioCategoria('Baches', 1, 'es-BO')).toBe('Mostrando Baches: 1 punto');
    expect(textoAnuncioCategoria('Basura', 0, 'es-BO')).toBe('Mostrando Basura: 0 puntos');
    expect(textoAnuncioCategoria('Inundaciones', 1234, 'es-BO')).toBe(
      'Mostrando Inundaciones: 1.234 puntos',
    );
  });
});

describe('los textos de pantalla salen de la definición y con Inundaciones son los de hoy', () => {
  const t = textosParaCategoria(REGISTRO_CATEGORIAS, 'inundacion');

  it('el título del mapa y el nombre accesible por defecto', () => {
    expect(tituloDelMapa({ nombre: 'Santa Cruz de la Sierra' }, t)).toBe(
      'Mapa de puntos de inundación de Santa Cruz de la Sierra',
    );
    // Sin textos (los que no pasan la categoría) es lo mismo: la de por defecto.
    expect(tituloDelMapa({ nombre: 'Cochabamba' })).toBe(
      'Mapa de puntos de inundación de Cochabamba',
    );
    expect(etiquetaDelMapa(t)).toBe('Mapa de puntos de inundación');
    expect(etiquetaDelMapa()).toBe('Mapa de puntos de inundación');
  });

  it('el h1 del detalle, el cuerpo de la lista vacía y la descripción de /reportar', () => {
    expect(`${t.puntoSingular} en Unidad Vecinal 57`).toBe(
      'Punto de inundación en Unidad Vecinal 57',
    );
    expect(t.listaVaciaCuerpo).toBe(
      'Que no haya puntos no significa que no se anegue. Si conocés un lugar donde se junta el agua, sos el primero en marcarlo.',
    );
    expect(t.descripcionReportar).toBe('Marcá dónde se junta el agua en tu barrio.');
  });

  it('el aviso de percepción del detalle', () => {
    expect(
      `Dato de percepción, no medido: ${t.avisoPercepcion} y la ubicación tiene el error del GPS.`,
    ).toBe(
      'Dato de percepción, no medido: la profundidad se estima por referencia corporal y la ubicación tiene el error del GPS.',
    );
  });

  it('los textos por defecto son los de Inundaciones', () => {
    expect(TEXTOS_CATEGORIA_POR_DEFECTO).toEqual(t);
  });

  it('otra categoría trae los suyos; una desconocida o ausente cae a los de por defecto', () => {
    const bache = textosParaCategoria(REGISTRO_DOS_CATEGORIAS, 'bache');
    expect(tituloDelMapa({ nombre: 'Santa Cruz' }, bache)).toBe(
      'Mapa de puntos de bache de Santa Cruz',
    );
    expect(bache.avisoPercepcion).toBe('el tamaño se estima a ojo');
    expect(textosParaCategoria(REGISTRO_DOS_CATEGORIAS, 'tortugas')).toEqual(t);
    expect(textosParaCategoria(REGISTRO_DOS_CATEGORIAS, null)).toEqual(t);
    expect(textosParaCategoria(REGISTRO_DOS_CATEGORIAS, undefined)).toEqual(t);
  });
});

describe('la categoría de un reporte', () => {
  it('es la del servidor o, si la respuesta es anterior a 0.20.0, la de siempre', () => {
    expect(categoriaDeReporte({})).toBe('inundacion');
    expect(categoriaDeReporte({ categoria: undefined })).toBe(CATEGORIA_DE_REPORTE_SIN_CAMPO);
    expect(categoriaDeReporte({ categoria: 'bache' })).toBe('bache');
  });
});
