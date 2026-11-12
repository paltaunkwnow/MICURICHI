import {
  CONFIG_DOMINIO,
  crearRegistroCategorias,
  DEFINICION_AREA_VERDE,
  DEFINICION_INUNDACION,
  ETIQUETAS,
} from 'contracts';
import { type ComponentProps, createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HojaDetalle } from '@/componentes/HojaDetalle';
import { TarjetaReporte } from '@/componentes/TarjetaReporte';
import {
  conCategorias,
  DEFINICION_BACHE_DE_PRUEBA,
  REGISTRO_DOS_CATEGORIAS,
  reporteDePrueba,
} from '@/lib/categoria-de-prueba';
import { ProveedorCiudad } from '@/lib/ciudad-contexto';
import { etiquetaCausa, etiquetaFrecuencia, etiquetaProfundidad } from '@/lib/formato';
import { archivosDeLaApp } from '@/lib/fuente-para-pruebas';
import { PRESENTADOR_AREA_VERDE } from './area-verde';
import { filasDeDetalle } from './filas';
import { PRESENTADOR_GENERICO } from './generico';
import { PRESENTADOR_INUNDACION } from './inundacion';
import { PRESENTADORES, presentadorDe } from './registro';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: '' }),
}));

/**
 * CA4 del plan M4, punto 5 (ADR 0021): el detalle y la tarjeta leen de un presentador por categoría.
 * Inundaciones es el JSX de hoy, movido sin cambios; una categoría sin presentador propio usa el
 * genérico, que arma las filas desde `camposPublicos` con las etiquetas de sus preguntas y opciones.
 */

const html = (nodo: ReactNode) =>
  renderToStaticMarkup(nodo as Parameters<typeof renderToStaticMarkup>[0]);

function conCiudad(hijo: ReactNode) {
  return createElement(
    ProveedorCiudad,
    { ciudad: CONFIG_DOMINIO.CIUDAD_POR_DEFECTO } as ComponentProps<typeof ProveedorCiudad>,
    hijo,
  );
}

/** Con el registro de dos categorías y las dos activas, como en M6. */
function conDosCategorias(hijo: ReactNode) {
  return conCiudad(conCategorias(['inundacion', 'bache'], hijo, REGISTRO_DOS_CATEGORIAS));
}

/** Las tres filas que el detalle tenía fijas, tal cual el JSX de antes de M4.3. */
function filasDeAntes(p: ReturnType<typeof reporteDePrueba>['properties']) {
  return html(
    createElement(
      'dl',
      null,
      createElement(
        'div',
        null,
        createElement('dt', null, ETIQUETAS.campos.profundidad),
        createElement('dd', null, etiquetaProfundidad(p.profundidad_estimada)),
      ),
      createElement(
        'div',
        null,
        createElement('dt', null, 'Frecuencia'),
        createElement('dd', null, etiquetaFrecuencia(p.frecuencia)),
      ),
      createElement(
        'div',
        null,
        createElement('dt', null, 'Causa presunta'),
        createElement('dd', null, etiquetaCausa(p.causa_presunta)),
      ),
    ),
  ).slice('<dl>'.length, -'</dl>'.length);
}

/** El contenido del `<dl class="kv">` del detalle. */
const filasDelDetalle = (marcado: string) => /<dl class="kv">(.*?)<\/dl>/s.exec(marcado)?.[1] ?? '';

describe('Áreas verdes: aviso y destino previstos en el detalle público', () => {
  it('Persona conserva foto, preguntas y severidad recibida; al cambiar desaparece su aviso', () => {
    const aviso =
      'Esto no es una denuncia. Se deriva a Desarrollo Social para ofrecer ayuda, no a seguridad. No subas fotos donde se vea la cara de la persona.';
    const reporte = reporteDePrueba({
      categoria: 'area_verde',
      subtipo: 'persona_situacion_calle',
      detalle: { gravedad_declarada: 'descuidado', tamano: 'rincon' },
      profundidad_estimada: null,
      frecuencia: null,
      causa_presunta: null,
      severidad: 'critica',
      severidad_calculada: 'critica',
      fotos: ['/api/v1/fotos/sintetica.webp'],
    });
    const mostrar = () =>
      html(conCiudad(conCategorias(['area_verde'], createElement(HojaDetalle, { reporte }))));
    expect(mostrar()).toContain(aviso);
    expect(mostrar()).toContain('<dt>Destino previsto</dt><dd>Desarrollo Social');
    expect(mostrar()).toContain('No hay derivación municipal automática.');
    expect(mostrar()).toContain('<dt>¿Qué tan grave es?</dt><dd>Se ve descuidado</dd>');
    expect(mostrar()).toContain('<dt>¿Qué tamaño tiene?</dt><dd>Un rincón</dd>');
    expect(mostrar()).toContain('Severidad crítica');
    expect(mostrar()).toContain('/api/v1/fotos/sintetica.webp');
    reporte.properties.subtipo = 'juegos_infantiles_rotos';
    const cambiado = mostrar();
    expect(cambiado).not.toContain(aviso);
    expect(cambiado).toContain('<dt>Destino previsto</dt><dd>Parques y jardines');
    expect(cambiado).toContain('/api/v1/fotos/sintetica.webp');
    expect(DEFINICION_AREA_VERDE.slug).toBe('area_verde');
  });
});

describe('el registro de presentadores', () => {
  it('Inundaciones y Áreas verdes tienen el suyo; las demás usan el genérico', () => {
    expect(presentadorDe('inundacion')).toBe(PRESENTADOR_INUNDACION);
    expect(presentadorDe('bache')).toBe(PRESENTADOR_GENERICO);
    expect(presentadorDe('lo-que-sea')).toBe(PRESENTADOR_GENERICO);
    expect(presentadorDe('area_verde')).toBe(PRESENTADOR_AREA_VERDE);
    expect(Object.keys(PRESENTADORES)).toEqual(['inundacion', 'area_verde']);
  });

  it('una categoría que registra el suyo lo recibe, y el código común no pregunta por Inundaciones', () => {
    const propio = { ...PRESENTADOR_GENERICO };
    expect(presentadorDe('bache', { bache: propio })).toBe(propio);
    // ADR 0009 §6.3: el núcleo pregunta a la definición, no compara contra una categoría concreta.
    const culpables = archivosDeLaApp()
      .filter(({ texto }) =>
        /[!=]==?\s*['"]inundacion['"]|['"]inundacion['"]\s*[!=]==?/.test(texto),
      )
      .map(({ ruta }) => ruta);
    expect(culpables).toEqual([]);
  });
});

describe('Inundaciones: el detalle y la tarjeta dicen lo de hoy', () => {
  it('el detalle de un reporte con campos planos (sin detalle) es el JSX de antes', () => {
    const r = reporteDePrueba();
    const detalle = html(conCiudad(createElement(HojaDetalle, { reporte: r })));
    expect(filasDelDetalle(detalle).startsWith(filasDeAntes(r.properties))).toBe(true);
    // Y las etiquetas son las de hoy, no las de las preguntas de la definición.
    expect(detalle).toContain('<dt>Frecuencia</dt>');
    expect(detalle).toContain('<dt>Causa presunta</dt>');
    expect(detalle).toContain(`<dt>${ETIQUETAS.campos.profundidad}</dt>`);
  });

  it('con el detalle de la respuesta (0.20.0) dice lo mismo que con los campos planos', () => {
    const plano = reporteDePrueba();
    const conDetalle = reporteDePrueba({
      categoria: 'inundacion',
      detalle: {
        profundidad_estimada: 'rodilla',
        frecuencia: 'cada_lluvia_fuerte',
        causa_presunta: 'desconocida',
      },
    });
    const a = html(conCiudad(createElement(HojaDetalle, { reporte: plano })));
    const b = html(conCiudad(createElement(HojaDetalle, { reporte: conDetalle })));
    expect(filasDelDetalle(b)).toBe(filasDelDetalle(a));
  });

  it('el detalle manda sobre el campo plano; un valor que no se conoce vuelve al plano', () => {
    const delDetalle = reporteDePrueba({ detalle: { profundidad_estimada: 'muslo' } });
    expect(html(conCiudad(createElement(HojaDetalle, { reporte: delDetalle })))).toContain(
      etiquetaProfundidad('muslo'),
    );
    const invalido = reporteDePrueba({ detalle: { profundidad_estimada: 'hasta-la-luna' } });
    expect(html(conCiudad(createElement(HojaDetalle, { reporte: invalido })))).toContain(
      etiquetaProfundidad('rodilla'),
    );
  });

  it('un detalle válido tiene prioridad incluso cuando los tres planos son nulos', () => {
    const r = reporteDePrueba({
      profundidad_estimada: null,
      frecuencia: null,
      causa_presunta: null,
      detalle: {
        profundidad_estimada: 'muslo',
        frecuencia: 'permanente',
        causa_presunta: 'sumidero_tapado',
      },
    });
    const marcado = html(conCiudad(createElement(HojaDetalle, { reporte: r })));
    expect(marcado).toContain(etiquetaProfundidad('muslo'));
    expect(marcado).toContain(etiquetaFrecuencia('permanente'));
    expect(marcado).toContain(etiquetaCausa('sumidero_tapado'));
    expect(marcado).not.toContain('Sin datos');
  });

  it.each([null, undefined, 'inventado', 12, false, {}])(
    'un detalle malformado (%j) conserva los tres planos válidos',
    (valor) => {
      const r = reporteDePrueba({
        detalle: { profundidad_estimada: valor, frecuencia: valor, causa_presunta: valor },
      });
      const marcado = html(conCiudad(createElement(HojaDetalle, { reporte: r })));
      expect(filasDelDetalle(marcado).startsWith(filasDeAntes(r.properties))).toBe(true);
    },
  );

  it.each([null, undefined, 'inventado', '__proto__', 12])(
    'sin detalle ni planos válidos (%j) muestra ausencia y no inventa agua',
    (valor) => {
      const r = reporteDePrueba({
        profundidad_estimada: valor,
        frecuencia: valor,
        causa_presunta: valor,
        detalle: { profundidad_estimada: 'ajena', frecuencia: null, causa_presunta: false },
      });
      const marcado = html(conCiudad(createElement(HojaDetalle, { reporte: r })));
      expect(filasDelDetalle(marcado).match(/<dd>Sin datos<\/dd>/g)).toHaveLength(3);
      const tarjeta = html(createElement(TarjetaReporte, { reporte: r }));
      expect(tarjeta).toContain('<span class="mini">Sin datos</span>');
      expect(filasDelDetalle(marcado)).not.toMatch(/Rodilla|Tobillo|Muslo|Desconocida/);
    },
  );

  it('la tarjeta lleva la pastilla de profundidad corta y la de cantidad de reportes', () => {
    const r = reporteDePrueba();
    const tarjeta = html(createElement(TarjetaReporte, { reporte: r }));
    const corta = etiquetaProfundidad('rodilla').split(' · ')[0];
    expect(tarjeta).toContain(
      `<span class="mini">${corta}</span><span class="mini">1 reporte</span>`,
    );
  });

  it('el aviso de percepción y el enlace «Me pasa a mí» son los de siempre con una sola activa', () => {
    const marcado = html(conCiudad(createElement(HojaDetalle, { reporte: reporteDePrueba() })));
    expect(marcado).toContain(
      'Dato de percepción, no medido: la profundidad se estima por referencia corporal y la ubicación tiene el error del GPS.',
    );
    expect(marcado).toContain('href="/reportar?lat=-17.78&amp;lon=-63.18"');
    expect(marcado).not.toContain('categoria=');
  });
});

describe('una categoría sin presentador propio usa el genérico (definición sintética)', () => {
  const detalle = {
    tamano: 'grande',
    hay_riesgo: true,
    afecta_a: ['autos', 'motos'],
    interna: 'no-se-publica',
  };
  const bache = reporteDePrueba({ categoria: 'bache', detalle });

  it('arma las filas desde camposPublicos con la etiqueta de la pregunta y la de la opción', () => {
    expect(filasDeDetalle(DEFINICION_BACHE_DE_PRUEBA, detalle)).toEqual([
      { clave: 'tamano', etiqueta: 'Tamaño del bache', valor: 'Grande, como una llanta' },
      { clave: 'hay_riesgo', etiqueta: '¿Es peligroso para el tránsito?', valor: 'Sí' },
      { clave: 'afecta_a', etiqueta: 'Afecta a', valor: 'Autos, Motos' },
    ]);
  });

  it('un valor sin opción conocida se muestra tal cual, un falso dice «No» y lo ausente no hace fila', () => {
    expect(
      filasDeDetalle(DEFINICION_BACHE_DE_PRUEBA, { tamano: 'gigante', hay_riesgo: false }).map(
        (f) => [f.etiqueta, f.valor],
      ),
    ).toEqual([
      ['Tamaño del bache', 'gigante'],
      ['¿Es peligroso para el tránsito?', 'No'],
    ]);
    expect(filasDeDetalle(DEFINICION_BACHE_DE_PRUEBA, {})).toEqual([]);
    expect(filasDeDetalle(DEFINICION_BACHE_DE_PRUEBA, undefined)).toEqual([]);
    expect(filasDeDetalle(undefined, detalle)).toEqual([]);
  });

  it('el detalle de la hoja muestra esas filas y nada de inundación ni lo que no es público', () => {
    const marcado = html(conDosCategorias(createElement(HojaDetalle, { reporte: bache })));
    const filas = filasDelDetalle(marcado);
    expect(filas).toContain('<dt>Tamaño del bache</dt><dd>Grande, como una llanta</dd>');
    expect(filas).toContain('<dt>¿Es peligroso para el tránsito?</dt><dd>Sí</dd>');
    expect(filas).toContain('<dt>Afecta a</dt><dd>Autos, Motos</dd>');
    expect(filas).not.toMatch(/Profundidad|Frecuencia|Causa presunta/);
    expect(marcado).not.toContain('no-se-publica');
    expect(marcado).not.toContain('Dato interno');
    // Lo común sigue: cuántos vecinos y cuándo.
    expect(filas).toContain('<dt>Reportes</dt>');
    expect(filas).toContain('<dt>Reportado</dt>');
  });

  it('el aviso de percepción y «Me pasa a mí» son de su categoría', () => {
    const marcado = html(conDosCategorias(createElement(HojaDetalle, { reporte: bache })));
    expect(marcado).toContain(
      'Dato de percepción, no medido: el tamaño se estima a ojo y la ubicación tiene el error del GPS.',
    );
    expect(marcado).toContain('href="/reportar?lat=-17.78&amp;lon=-63.18&amp;categoria=bache"');
  });

  it('con dos activas, «Me pasa a mí» de un reporte sin categoría lleva la de siempre', () => {
    const marcado = html(
      conDosCategorias(createElement(HojaDetalle, { reporte: reporteDePrueba() })),
    );
    expect(marcado).toContain(
      'href="/reportar?lat=-17.78&amp;lon=-63.18&amp;categoria=inundacion"',
    );
  });

  it('la tarjeta lleva el primer dato público de la categoría', () => {
    const marcado = html(conDosCategorias(createElement(TarjetaReporte, { reporte: bache })));
    expect(marcado).toContain('<span class="mini">Grande, como una llanta</span>');
    expect(marcado).not.toMatch(/Rodilla|Tobillo|Muslo/);
    // Sin datos públicos, no hay pastilla (y la de cantidad de reportes sigue).
    const sinDatos = html(
      conDosCategorias(
        createElement(TarjetaReporte, {
          reporte: reporteDePrueba({ categoria: 'bache', detalle: {} }),
        }),
      ),
    );
    // La envoltura de pastillas queda solo con la de cantidad de reportes.
    expect(sinDatos).toContain(
      '<span class="mt-2 flex flex-wrap gap-1.5"><span class="mini">1 reporte</span></span>',
    );
  });

  it('con un registro explícito sin definición no inventa filas', () => {
    const sinBache = crearRegistroCategorias([DEFINICION_INUNDACION]);
    expect(sinBache.obtener('bache')).toBeUndefined();
    const marcado = html(
      conCiudad(
        conCategorias(
          ['inundacion', 'bache'],
          createElement(HojaDetalle, { reporte: bache }),
          sinBache,
        ),
      ),
    );
    expect(filasDelDetalle(marcado)).not.toContain('Tamaño del bache');
    expect(filasDelDetalle(marcado)).toContain('<dt>Reportes</dt>');
  });
});
