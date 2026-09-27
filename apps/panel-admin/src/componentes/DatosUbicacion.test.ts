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
    expect(d['Método de ubicación']).toBe('Ajustado a mano, a ≤ 60 m del GPS');
    expect(d['Precisión del GPS']).toBe('± 8 m');
    expect(d['Distancia al dispositivo']).toBe('a 12 m del GPS');
  });

  it('un punto en la posición del GPS lo dice así', () => {
    const d = render(reporte({ ubicacion_metodo: 'gps', distancia_dispositivo_m: 1 }));
    expect(d['Método de ubicación']).toBe('En la posición del GPS');
    expect(d['Distancia al dispositivo']).toBe('a 1 m del GPS');
  });

  it('un reporte anterior a la ubicación obligatoria no promete el radio', () => {
    const d = render(
      reporte({ ubicacion_metodo: 'manual', precision_gps_m: null, distancia_dispositivo_m: null }),
    );
    expect(d['Método de ubicación']).toBe(
      'Selección manual en el mapa, sin control de distancia al GPS',
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
});
