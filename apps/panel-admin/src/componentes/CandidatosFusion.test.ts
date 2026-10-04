import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { disparar, elementosDelArbol } from '@/lib/arbol-elementos.fixture';
import type { CandidatoFusion } from '@/lib/fusion-cercana';
import { CandidatosFusion } from './CandidatosFusion';

/**
 * La lista de reportes cercanos para fusionar (T8). Sin DOM: se renderiza a HTML estático y se
 * leen sus textos y atributos. La lógica (caja, distancia, orden) está probada en
 * `lib/fusion-cercana.test.ts`; el cableado con la consulta, en `PanelAcciones.test.ts`.
 */

const CANDIDATOS: CandidatoFusion[] = [
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    idCorto: 'aaaaaaaa',
    unidadVecinal: 'UV 105',
    distanciaM: 35.2,
    descripcion: 'Agua acumulada frente a la escuela',
  },
  {
    id: 'bbbbbbbb-0000-4000-8000-000000000002',
    idCorto: 'bbbbbbbb',
    unidadVecinal: 'Sin UV',
    distanciaM: 80,
    descripcion: 'Calle anegada desde ayer',
  },
  {
    id: 'cccccccc-0000-4000-8000-000000000003',
    idCorto: 'cccccccc',
    unidadVecinal: 'UV 106',
    distanciaM: 99.4,
    descripcion: '',
  },
];

type Props = Parameters<typeof CandidatosFusion>[0];

function props(parcial: Partial<Props> = {}): Props {
  return {
    estado: 'listo',
    radioM: 100,
    candidatos: CANDIDATOS,
    aviso: null,
    elegido: '',
    onElegir: () => {},
    onAmpliar: () => {},
    onReintentar: () => {},
    ...parcial,
  };
}

const render = (parcial: Partial<Props> = {}) =>
  renderToStaticMarkup(createElement(CandidatosFusion, props(parcial)));

/** El texto que ve la persona: sin etiquetas ni los `<!-- -->` que React pone entre textos. */
function visible(html: string): string {
  return html
    .replace(/<!--.*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** La región viva (siempre montada) donde se anuncia el estado de la búsqueda. */
const REGION_VIVA =
  /<output[^>]*aria-live="polite"[^>]*data-testid="fusion-estado"[^>]*>(.*?)<\/output>/;

/** Todos los `<label … data-testid="fusion-candidato">…</label>`, uno por opción. */
function opciones(html: string): string[] {
  return html.match(/<label[^>]*data-testid="fusion-candidato"[^>]*>.*?<\/label>/g) ?? [];
}

describe('CandidatosFusion: la lista', () => {
  const html = render();

  it('es un grupo con rótulo que dice el radio vigente', () => {
    expect(html).toMatch(/<fieldset[^>]*data-testid="fusion-cercanos"/);
    expect(html).toMatch(/<legend[^>]*>Reportes validados a menos de 100 m<\/legend>/);
  });

  it('el rótulo sigue al radio: 300 m y 1 km', () => {
    expect(render({ radioM: 300 })).toMatch(/<legend[^>]*>Reportes validados a menos de 300 m</);
    expect(render({ radioM: 1000 })).toMatch(/<legend[^>]*>Reportes validados a menos de 1 km</);
  });

  it('cada reporte es un radio nativo del mismo grupo, en el orden recibido', () => {
    const radios = [...html.matchAll(/<input[^>]*type="radio"[^>]*>/g)].map((m) => m[0]);
    expect(radios).toHaveLength(3);
    for (const r of radios) expect(r).toContain('name="canonico"');
    expect(radios.map((r) => /value="([^"]+)"/.exec(r)?.[1])).toEqual(CANDIDATOS.map((c) => c.id));
    expect(opciones(html)).toHaveLength(3);
  });

  it('cada opción dice ID corto, UV, distancia en texto y el comienzo de la descripción', () => {
    const textos = opciones(html).map(visible);
    expect(textos[0]).toBe('aaaaaaaa · UV 105 · a 35 m Agua acumulada frente a la escuela');
    expect(textos[1]).toBe('bbbbbbbb · Sin UV · a 80 m Calle anegada desde ayer');
    // Sin descripción no queda una línea vacía con puntos suspensivos.
    expect(textos[2]).toBe('cccccccc · UV 106 · a 99 m');
  });

  it('ninguno viene elegido, y el elegido es el único marcado', () => {
    expect(html).not.toContain('checked');
    const conElegido = render({ elegido: CANDIDATOS[1]?.id });
    const marcados = [...conElegido.matchAll(/<input[^>]*checked[^>]*>/g)].map((m) => m[0]);
    expect(marcados).toHaveLength(1);
    expect(marcados[0]).toContain(`value="${CANDIDATOS[1]?.id}"`);
  });

  it('no hay campo para pegar un ID ni lista desplegable: solo se elige de la lista', () => {
    expect(html).not.toContain('canonico_id');
    expect(html).not.toContain('<select');
    expect(html).not.toContain('<textarea');
    expect(html).not.toMatch(/type="text"/);
    expect(html).not.toMatch(/<input(?![^>]*type="radio")/);
    expect(visible(html)).not.toMatch(/UUID|pegá/i);
  });

  it('con resultados no ofrece ampliar la búsqueda', () => {
    expect(html).not.toContain('fusion-ampliar');
    expect(html).not.toContain('fusion-sin-cercanos');
  });

  it('explica que el reporte canónico tiene que estar validado', () => {
    expect(visible(html)).toContain('validado');
  });

  it('es operable con teclado: radios y botones nativos, sin tabindex que los saque del orden', () => {
    expect(html).not.toMatch(/tabindex|role="listbox"|role="option"/);
  });

  it('elegir un reporte avisa con su id', () => {
    const onElegir = vi.fn();
    const arbol = CandidatosFusion(props({ onElegir }));
    const radios = elementosDelArbol(
      arbol,
      (e) =>
        e.type === 'input' && e.props.type === 'radio' && typeof e.props.onChange === 'function',
    );
    expect(radios).toHaveLength(3);
    disparar(radios[2], 'onChange');
    disparar(radios[0], 'onChange');
    expect(onElegir.mock.calls.map((c) => c[0])).toEqual([CANDIDATOS[2]?.id, CANDIDATOS[0]?.id]);
  });
});

describe('CandidatosFusion: sin ningún reporte cercano', () => {
  it('a 100 m lo dice y ofrece buscar hasta 300 m y hasta 1 km', () => {
    const html = render({ candidatos: [] });
    const mensaje = html.match(/<p[^>]*data-testid="fusion-sin-cercanos"[^>]*>.*?<\/p>/)?.[0] ?? '';
    expect(visible(mensaje)).toBe('No hay reportes validados a menos de 100 m.');
    const b300 = html.match(/<button[^>]*data-testid="fusion-ampliar-300"[^>]*>.*?<\/button>/)?.[0];
    const b1000 = html.match(
      /<button[^>]*data-testid="fusion-ampliar-1000"[^>]*>.*?<\/button>/,
    )?.[0];
    expect(visible(b300 ?? '')).toBe('Buscar hasta 300 m');
    expect(visible(b1000 ?? '')).toBe('Buscar hasta 1 km');
    expect(b300).toContain('type="button"');
    expect(b1000).toContain('type="button"');
    // Sin resultados no hay radios, y el rótulo sigue diciendo el radio.
    expect(html).not.toContain('type="radio"');
    expect(html).toMatch(/<legend[^>]*>Reportes validados a menos de 100 m</);
  });

  it('a 300 m el mensaje dice 300 m y solo queda ampliar a 1 km', () => {
    const html = render({ candidatos: [], radioM: 300 });
    expect(visible(html)).toContain('No hay reportes validados a menos de 300 m');
    expect(html).not.toContain('"fusion-ampliar-300"');
    expect(html).not.toContain('"fusion-ampliar-100"');
    expect(visible(html)).toContain('Buscar hasta 1 km');
  });

  it('a 1 km el mensaje dice 1 km y ya no se ofrece ampliar', () => {
    const html = render({ candidatos: [], radioM: 1000 });
    expect(visible(html)).toContain('No hay reportes validados a menos de 1 km');
    expect(html).not.toContain('fusion-ampliar');
    expect(html).not.toContain('<button');
  });

  it('cada botón amplía al radio que dice', () => {
    const onAmpliar = vi.fn();
    const arbol = CandidatosFusion(props({ candidatos: [], onAmpliar }));
    const botones = elementosDelArbol(
      arbol,
      (e) =>
        e.type === 'button' &&
        String(e.props['data-testid'] ?? '').startsWith('fusion-ampliar-') &&
        typeof e.props.onClick === 'function',
    );
    expect(botones.map((b) => b.props['data-testid'])).toEqual([
      'fusion-ampliar-300',
      'fusion-ampliar-1000',
    ]);
    for (const b of botones) disparar(b, 'onClick');
    expect(onAmpliar.mock.calls.map((c) => c[0])).toEqual([300, 1000]);
  });
});

describe('CandidatosFusion: el estado se anuncia al lector de pantalla', () => {
  it('hay siempre una región viva montada, para que se anuncien los cambios (WCAG 4.1.3)', () => {
    const estados: Array<Partial<Props>> = [
      { estado: 'cargando', candidatos: [] },
      { estado: 'listo', candidatos: [] },
      { estado: 'listo' },
      { estado: 'error', candidatos: [] },
    ];
    for (const parcial of estados) {
      expect(render(parcial), JSON.stringify(parcial.estado)).toMatch(REGION_VIVA);
    }
  });

  it('con resultados dice cuántos hay y en qué orden están', () => {
    const region = REGION_VIVA.exec(render())?.[1] ?? '';
    expect(visible(region)).toBe(
      'Hay 3 reportes validados a menos de 100 m, del más cercano al más lejano.',
    );
  });

  it('con uno solo lo dice en singular, y el radio sigue al vigente', () => {
    const uno = CANDIDATOS.slice(0, 1);
    expect(visible(REGION_VIVA.exec(render({ candidatos: uno }))?.[1] ?? '')).toBe(
      'Hay 1 reporte validado a menos de 100 m.',
    );
    expect(visible(REGION_VIVA.exec(render({ candidatos: uno, radioM: 1000 }))?.[1] ?? '')).toBe(
      'Hay 1 reporte validado a menos de 1 km.',
    );
  });

  it('sin ninguno, la región dice que no hay; con error queda vacía (el error es una alerta)', () => {
    expect(visible(REGION_VIVA.exec(render({ candidatos: [] }))?.[1] ?? '')).toBe(
      'No hay reportes validados a menos de 100 m.',
    );
    expect(REGION_VIVA.exec(render({ estado: 'error', candidatos: [] }))?.[1]).toBe('');
    expect(render({ estado: 'error', candidatos: [] })).toMatch(/role="alert"/);
  });

  it('el mensaje no se repite fuera de la región (no se lee dos veces)', () => {
    const html = render({ candidatos: [] });
    expect(html.match(/No hay reportes validados a menos de/g)).toHaveLength(1);
    const conLista = render();
    expect(conLista.match(/Hay 3 reportes validados/g)).toHaveLength(1);
  });
});

describe('CandidatosFusion: respuesta recortada, cargando y con error', () => {
  it('avisa cuando la API recortó la respuesta, junto a la lista', () => {
    const aviso = 'Se muestran los 100 más recientes de 137; puede haber más cerca.';
    const html = render({ aviso });
    const nota = html.match(/<[^>]*data-testid="fusion-recorte"[^>]*>.*?<\/(?:p|div|output)>/)?.[0];
    expect(visible(nota ?? '')).toBe(aviso);
    expect(opciones(html)).toHaveLength(3);
  });

  it('también avisa si no hay ninguno dentro del radio pero la respuesta venía recortada', () => {
    const aviso = 'Se muestran los 100 más recientes de 137; puede haber más cerca.';
    expect(visible(render({ candidatos: [], aviso }))).toContain(aviso);
  });

  it('sin recorte no hay aviso', () => {
    expect(render()).not.toContain('fusion-recorte');
  });

  it('cargando dice que está buscando, sin radios ni «no hay»', () => {
    const html = render({ estado: 'cargando', candidatos: [] });
    expect(REGION_VIVA.exec(html)?.[1]).toContain('data-testid="fusion-cargando"');
    expect(visible(html)).toContain('Buscando reportes validados cerca');
    expect(html).not.toContain('type="radio"');
    expect(html).not.toContain('No hay reportes');
    expect(html).toMatch(/<legend[^>]*>Reportes validados a menos de 100 m</);
  });

  it('con error lo dice y deja reintentar', () => {
    const html = render({ estado: 'error', candidatos: [] });
    expect(visible(html)).toContain('No pudimos buscar reportes cercanos');
    expect(html).not.toContain('No hay reportes validados');
    const reintentar = html.match(
      /<button[^>]*data-testid="fusion-reintentar"[^>]*>.*?<\/button>/,
    )?.[0];
    expect(visible(reintentar ?? '')).toBe('Reintentar');
    const onReintentar = vi.fn();
    const arbol = CandidatosFusion(props({ estado: 'error', candidatos: [], onReintentar }));
    const [boton] = elementosDelArbol(
      arbol,
      (e) => e.type === 'button' && e.props['data-testid'] === 'fusion-reintentar',
    );
    disparar(boton, 'onClick');
    expect(onReintentar).toHaveBeenCalledTimes(1);
  });
});
