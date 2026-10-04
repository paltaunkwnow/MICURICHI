import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  type EstadoReporte,
  RADIO_TIERRA_M,
  type ReporteTecnicoFeature,
  type Rol,
} from 'contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { consultaCandidatosFusion } from '@/lib/consultas';
import { PanelAcciones } from './PanelAcciones';

/** Solo los campos que lee el panel de moderación. */
function reporte(estado: EstadoReporte): ReporteTecnicoFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-63.18, -17.78] },
    properties: {
      id: '0b8f7c1e-3d2a-4b5c-8d9e-1f2a3b4c5d6e',
      estado,
      severidad: 'media',
      severidad_calculada: 'media',
      severidad_manual: null,
      severidad_puntaje: 6,
    },
  } as unknown as ReporteTecnicoFeature;
}

function render(estado: EstadoReporte, rol: Rol): string {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(PanelAcciones, { reporte: reporte(estado), rol }),
    ),
  );
}

/** Texto visible del botón con ese data-testid, o null si no está. */
function boton(html: string, testId: string): string | null {
  const m = html.match(new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>(.*?)</button>`));
  return m ? (m[1] ?? '').replace(/<[^>]+>/g, '').trim() : null;
}

describe('PanelAcciones: retirar del mapa un verificado', () => {
  it('el admin, en un validado, ve «Retirar del mapa» y no «Rechazar»', () => {
    const html = render('validado', 'admin');
    expect(boton(html, 'boton-retirar')).toBe('Retirar del mapa');
    expect(boton(html, 'boton-rechazar')).toBeNull();
  });

  it('el técnico, en un validado, no ve ninguna de las dos', () => {
    const html = render('validado', 'tecnico');
    expect(boton(html, 'boton-retirar')).toBeNull();
    expect(boton(html, 'boton-rechazar')).toBeNull();
    expect(boton(html, 'boton-resolver')).toBe('Resolver');
  });

  it('en un nuevo, técnico y admin ven «Rechazar» y no «Retirar del mapa»', () => {
    for (const rol of ['tecnico', 'admin'] as const) {
      const html = render('nuevo', rol);
      expect(boton(html, 'boton-rechazar'), rol).toBe('Rechazar');
      expect(boton(html, 'boton-retirar'), rol).toBeNull();
    }
  });
});

/**
 * Fusionar solo con reportes cercanos (T8). La prueba abre el formulario con `accionInicial` porque
 * sin DOM no hay clic, y le da la respuesta de la lista técnica ya en la caché de TanStack, que es
 * lo que lee `useQuery` al renderizar sin red.
 */
describe('PanelAcciones: fusionar solo con reportes cercanos', () => {
  const CENTRO = { lon: -63.18, lat: -17.78 };

  /** Punto a `metros` al norte del reporte (la fixture lo pone en `CENTRO`). */
  function alNorte(metros: number): [number, number] {
    return [CENTRO.lon, CENTRO.lat + (metros / RADIO_TIERRA_M) * (180 / Math.PI)];
  }

  /** Solo los campos que lee la lista; el resto del reporte no interviene. */
  function vecino(
    id: string,
    metros: number,
    extra: Record<string, unknown> = {},
  ): ReporteTecnicoFeature {
    return {
      type: 'Feature',
      id,
      geometry: { type: 'Point', coordinates: alNorte(metros) },
      properties: {
        id,
        estado: 'validado',
        unidad_vecinal: { id: 'unidad_vecinal:105', codigo: '105', nombre: 'UV 105' },
        descripcion: 'Agua acumulada frente a la escuela',
        ...extra,
      },
    } as unknown as ReporteTecnicoFeature;
  }

  /** Renderiza el formulario de fusión abierto; `respuesta` null = la búsqueda todavía no volvió. */
  function formularioDeFusion(
    respuesta: { features: ReporteTecnicoFeature[]; total?: number } | null,
    radioM = 100,
  ): string {
    const cliente = new QueryClient();
    if (respuesta) {
      cliente.setQueryData(consultaCandidatosFusion(CENTRO, radioM, true).queryKey, {
        type: 'FeatureCollection',
        features: respuesta.features,
        total: respuesta.total ?? respuesta.features.length,
        pagina: 1,
        limite: 100,
      });
    }
    return renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: cliente },
        createElement(PanelAcciones, {
          reporte: reporte('validado'),
          rol: 'tecnico',
          accionInicial: 'fusionar',
        }),
      ),
    );
  }

  const visible = (html: string) =>
    html
      .replace(/<!--.*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const confirmar = (html: string) =>
    html.match(/<button[^>]*data-testid="confirmar-accion"[^>]*>/)?.[0] ?? '';

  const ID_A = 'aaaaaaaa-0000-4000-8000-000000000001';
  const ID_B = 'bbbbbbbb-0000-4000-8000-000000000002';
  const ID_C = 'cccccccc-0000-4000-8000-000000000003';

  it('el formulario ya no tiene el campo para pegar un ID, ni la lista desplegable', () => {
    for (const respuesta of [null, { features: [] }, { features: [vecino(ID_A, 35)] }]) {
      const html = formularioDeFusion(respuesta);
      expect(html).not.toContain('canonico_id');
      expect(html).not.toContain('selector-canonico');
      expect(html).not.toMatch(/placeholder="Ej/);
      expect(visible(html)).not.toMatch(/UUID|ID corto de 8/);
      // Lo único desplegable es la severidad manual de «Reclasificar»; lo único con <input> son los radios.
      const selects = html.match(/<select[^>]*>/g) ?? [];
      expect(selects).toHaveLength(1);
      expect(selects[0]).toContain('id="severidad_manual"');
      expect(html).not.toMatch(/<input(?![^>]*type="radio")/);
      expect(html).not.toMatch(/type="text"/);
    }
  });

  it('conserva el motivo y el resto del formulario', () => {
    const html = formularioDeFusion({ features: [vecino(ID_A, 35)] });
    expect(html).toContain('id="motivo"');
    expect(visible(html)).toContain('Fusionar como duplicado');
    expect(html).toContain('data-testid="confirmar-accion"');
    expect(visible(html)).toContain('Cancelar');
  });

  it('muestra solo validados cercanos, del más cercano al más lejano, sin el propio reporte', () => {
    const html = formularioDeFusion({
      features: [
        vecino(ID_C, 90),
        vecino(ID_A, 35),
        vecino('0b8f7c1e-3d2a-4b5c-8d9e-1f2a3b4c5d6e', 0), // el propio reporte
        vecino(ID_B, 60, { estado: 'nuevo' }), // no validado
        vecino('dddddddd-0000-4000-8000-000000000004', 180), // fuera de 100 m
      ],
    });
    expect(html).toMatch(/<legend[^>]*>Reportes validados a menos de 100 m</);
    const radios = (html.match(/<input[^>]*type="radio"[^>]*>/g) ?? []).map(
      (r) => /value="([^"]+)"/.exec(r)?.[1],
    );
    expect(radios).toEqual([ID_A, ID_C]);
    expect(visible(html)).toContain(
      'aaaaaaaa · UV 105 · a 35 m Agua acumulada frente a la escuela',
    );
    expect(visible(html)).toContain('cccccccc · UV 105 · a 90 m');
  });

  it('«Confirmar fusión» está deshabilitado mientras no haya un reporte elegido de la lista', () => {
    // Cargando, con resultados y sin resultados: en ninguno hay un reporte elegido.
    for (const respuesta of [null, { features: [vecino(ID_A, 35)] }, { features: [] }]) {
      expect(confirmar(formularioDeFusion(respuesta))).toMatch(/\bdisabled\b/);
    }
  });

  it('sin ninguno cercano lo dice y ofrece buscar hasta 300 m y hasta 1 km', () => {
    const html = formularioDeFusion({ features: [vecino(ID_A, 180)] });
    expect(visible(html)).toContain('No hay reportes validados a menos de 100 m');
    expect(visible(html)).toContain('Buscar hasta 300 m');
    expect(visible(html)).toContain('Buscar hasta 1 km');
    expect(html).not.toContain('type="radio"');
  });

  it('mientras busca lo dice, con el rótulo del radio', () => {
    const html = formularioDeFusion(null);
    expect(visible(html)).toContain('Buscando reportes validados cerca');
    expect(html).toMatch(/<legend[^>]*>Reportes validados a menos de 100 m</);
  });

  it('si la API recortó la respuesta avisa cuántos se ven de cuántos', () => {
    // El límite de la búsqueda llenó la página: hay 137 validados en la caja y llegaron 100.
    const recibidos = Array.from({ length: 100 }, (_, i) =>
      vecino(`00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, 20 + i * 0.5),
    );
    const html = formularioDeFusion({ features: recibidos, total: 137 });
    expect(visible(html)).toContain(
      'Se muestran los 100 más recientes de 137; puede haber más cerca.',
    );
  });

  it('sin recorte (llegó todo lo que hay en la caja) no avisa nada', () => {
    const html = formularioDeFusion({ features: [vecino(ID_A, 35)], total: 1 });
    expect(html).not.toContain('fusion-recorte');
  });

  it('con el formulario cerrado no hay lista de cercanos', () => {
    const html = render('validado', 'tecnico');
    expect(html).not.toContain('fusion-cercanos');
    expect(html).not.toContain('type="radio"');
    expect(html).not.toContain('data-testid="confirmar-accion"');
  });
});
