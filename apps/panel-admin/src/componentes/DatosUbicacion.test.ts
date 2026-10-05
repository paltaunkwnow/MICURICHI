import type { ReporteTecnico, ReporteTecnicoFeature } from 'contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DatosUbicacion } from './DatosUbicacion';

/** Solo los campos que lee el bloque de ubicación; el resto del reporte no interviene. */
function reporte(extra: Partial<ReporteTecnico> = {}): ReporteTecnicoFeature {
  const parcial = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-63.18, -17.78] },
    properties: {
      distrito: { id: 'distrito_municipal:07', codigo: '07', nombre: 'Distrito 07' },
      unidad_vecinal: { id: 'unidad_vecinal:123', codigo: '123', nombre: 'Unidad Vecinal 123' },
      ubicacion_metodo: 'manual',
      precision_gps_m: 8.4,
      distancia_dispositivo_m: 12,
      ubicacion_tipo: 'via_publica',
      version_capa: 'DM_UV_MZ_2025',
      estado: 'validado',
      ...extra,
    },
  };
  return parcial as unknown as ReporteTecnicoFeature;
}

/** Pares «etiqueta → valor» de la lista, con el texto visible de cada uno. */
function datos(html: string): Record<string, string> {
  const texto = (s: string) =>
    s
      .replace(/<!--.*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  return Object.fromEntries(
    [...html.matchAll(/<dt[^>]*>(.*?)<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/g)].map((m) => [
      texto(m[1] ?? ''),
      texto(m[2] ?? ''),
    ]),
  );
}

function render(r: ReporteTecnicoFeature) {
  return datos(renderToStaticMarkup(createElement(DatosUbicacion, { reporte: r })));
}

describe('DatosUbicacion (detalle técnico)', () => {
  it('muestra el método, la precisión y la distancia al dispositivo', () => {
    const d = render(reporte());
    expect(d['Método de ubicación']).toBe('Movido a mano por la persona');
    expect(d['Precisión del GPS']).toBe('± 8 m');
    expect(d['Distancia al dispositivo']).toBe('a 12 m del teléfono');
  });

  it('un punto en la posición del teléfono lo dice así', () => {
    const d = render(reporte({ ubicacion_metodo: 'gps', distancia_dispositivo_m: 1 }));
    expect(d['Método de ubicación']).toBe(
      'En la posición del teléfono (dentro de su margen de error)',
    );
    expect(d['Distancia al dispositivo']).toBe('a 1 m del teléfono');
  });

  it('un reporte anterior a la ubicación obligatoria no promete el radio', () => {
    const d = render(
      reporte({ ubicacion_metodo: 'manual', precision_gps_m: null, distancia_dispositivo_m: null }),
    );
    expect(d['Método de ubicación']).toBe(
      'Selección manual en el mapa, sin control de distancia al teléfono',
    );
    expect(d['Precisión del GPS']).toBe('Sin dato');
    expect(d['Distancia al dispositivo']).toBe(
      'Sin dato: el reporte es anterior a la ubicación obligatoria',
    );
  });

  it('tolera un api-core anterior que todavía no manda la distancia', () => {
    const r = reporte();
    delete (r.properties as Partial<ReporteTecnico>).distancia_dispositivo_m;
    expect(render(r)['Distancia al dispositivo']).toBe(
      'Sin dato: el reporte es anterior a la ubicación obligatoria',
    );
  });

  it('conserva los demás datos de ubicación', () => {
    const d = render(reporte({ ubicacion_tipo: 'vivienda_o_predio' }));
    expect(d.Distrito).toBe('07 · Distrito 07');
    expect(d['Unidad vecinal']).toBe('123 · Unidad Vecinal 123');
    expect(d['Coordenadas (lat, lon)']).toBe('-17.780000, -63.180000');
    expect(d['Versión de capa']).toBe('DM_UV_MZ_2025');
    expect(d['En el mapa público se ve']).toBe('Desplazado hasta 30 m para no señalar la vivienda');
  });

  it('un reporte rechazado o duplicado no se ve en el mapa público, y lo dice', () => {
    for (const estado of ['rechazado', 'duplicado'] as const) {
      for (const ubicacion_tipo of ['via_publica', 'vivienda_o_predio'] as const) {
        const d = render(reporte({ estado, ubicacion_tipo }));
        expect(d['En el mapa público se ve'], `${estado} ${ubicacion_tipo}`).toBe(
          'No se ve (retirado del mapa)',
        );
      }
    }
  });

  it('nuevo, validado y resuelto sí se ven: en su sitio o desplazados', () => {
    for (const estado of ['nuevo', 'validado', 'resuelto'] as const) {
      expect(render(reporte({ estado }))['En el mapa público se ve'], estado).toBe(
        'En su sitio, redondeado a 5 decimales',
      );
    }
  });
});

/**
 * Ubicación aproximada (contracts 0.18.0, ADR 0007): llegó de un dispositivo sin GPS preciso, con el
 * punto puesto a mano, la precisión declarada de más de 50 m y la distancia en `null`. El técnico
 * tiene que ver que no se comprobó con el dispositivo, y no «movido a mano cerca del teléfono».
 */
describe('DatosUbicacion con ubicación aproximada (ADR 0007)', () => {
  const ETIQUETA = 'Ubicación aproximada — sin comprobar con el dispositivo';
  const ACLARACION = 'El punto lo puso la persona a mano; su dispositivo no tenía GPS preciso.';

  const aproximada = (extra: Partial<ReporteTecnico> = {}) =>
    reporte({
      ubicacion_metodo: 'aproximada',
      precision_gps_m: 178,
      distancia_dispositivo_m: null,
      ...extra,
    });

  it('marca el método como «Ubicación aproximada — sin comprobar con el dispositivo»', () => {
    const metodo = render(aproximada())['Método de ubicación'];
    expect(metodo).toContain(ETIQUETA);
    // El texto de «manual» sería falso: no se ajustó cerca del teléfono.
    expect(metodo).not.toMatch(/Movido a mano|Selección manual/);
  });

  it('explica por qué: el punto lo puso la persona y el dispositivo no tenía GPS preciso', () => {
    expect(render(aproximada())['Método de ubicación']).toBe(`${ETIQUETA} ${ACLARACION}`);
  });

  it('la etiqueta y la aclaración son texto dentro del mismo dato, no solo color', () => {
    const html = renderToStaticMarkup(createElement(DatosUbicacion, { reporte: aproximada() }));
    const dd = /<dt[^>]*>Método de ubicación<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/s.exec(html)?.[1] ?? '';
    expect(dd.startsWith(ETIQUETA)).toBe(true);
    expect(dd).toContain(ACLARACION);
  });

  it('sigue mostrando la precisión que declaró el dispositivo', () => {
    expect(render(aproximada())['Precisión del GPS']).toBe('± 178 m');
  });

  it('la distancia al dispositivo dice que no aplica', () => {
    const d = render(aproximada())['Distancia al dispositivo'];
    expect(d).toBe('No aplica: el punto no se comprobó contra el dispositivo');
    // Ni el texto de los reportes anteriores a la ubicación obligatoria (no lo son) ni un metraje.
    expect(d).not.toMatch(/anterior a la ubicación obligatoria|del teléfono|\d/);
  });

  it('aunque llegara una distancia (un 0, por ejemplo), no dice «a 0 m del teléfono»', () => {
    for (const distancia_dispositivo_m of [0, 4]) {
      expect(render(aproximada({ distancia_dispositivo_m }))['Distancia al dispositivo']).toBe(
        'No aplica: el punto no se comprobó contra el dispositivo',
      );
    }
  });

  it('conserva los demás datos de ubicación', () => {
    const d = render(aproximada({ ubicacion_tipo: 'vivienda_o_predio' }));
    expect(d.Distrito).toBe('07 · Distrito 07');
    expect(d['Unidad vecinal']).toBe('123 · Unidad Vecinal 123');
    expect(d['Coordenadas (lat, lon)']).toBe('-17.780000, -63.180000');
    expect(d['Versión de capa']).toBe('DM_UV_MZ_2025');
    expect(d['En el mapa público se ve']).toBe('Desplazado hasta 30 m para no señalar la vivienda');
  });

  it('«gps» y «manual» no llevan la marca ni la aclaración', () => {
    for (const ubicacion_metodo of ['gps', 'manual'] as const) {
      const html = renderToStaticMarkup(
        createElement(DatosUbicacion, { reporte: reporte({ ubicacion_metodo }) }),
      );
      expect(html, ubicacion_metodo).not.toMatch(/aproximad/i);
      expect(html, ubicacion_metodo).not.toContain(ACLARACION);
      expect(html, ubicacion_metodo).not.toContain('No aplica');
    }
  });
});
