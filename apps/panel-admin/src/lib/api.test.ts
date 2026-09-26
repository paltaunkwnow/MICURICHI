import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CABECERA_SONDEO,
  ErrorExportacionInvalida,
  exportarGeoJson,
  nombreDeArchivo,
  obtenerReportes,
  obtenerResumenEjecutivo,
} from './api';

/** Sustituye `fetch` por uno que siempre contesta `cuerpo` y guarda con qué se lo llamó. */
function fetchFalso(cuerpo: unknown, cabeceras: Record<string, string> = {}) {
  const f = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(cuerpo), {
        status: 200,
        headers: { 'content-type': 'application/json', ...cabeceras },
      }),
  );
  vi.stubGlobal('fetch', f);
  return f;
}

function cabecerasDe(f: ReturnType<typeof fetchFalso>): Headers {
  return new Headers(f.mock.calls[0]?.[1]?.headers);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sondeo del panel ejecutivo', () => {
  it('el refresco automático del resumen va marcado para que api-core no renueve la sesión', async () => {
    const f = fetchFalso({});
    await obtenerResumenEjecutivo('todo', undefined, { sondeo: true });
    expect(CABECERA_SONDEO).toBe('x-curichi-sondeo');
    expect(cabecerasDe(f).get('x-curichi-sondeo')).toBe('1');
  });

  it('lo que pide la persona no lleva la marca, ni en el resumen ni en el resto del panel', async () => {
    const f = fetchFalso({ type: 'FeatureCollection', features: [] });
    await obtenerResumenEjecutivo('7d');
    await obtenerReportes({ estado: 'nuevo' });
    for (const [, init] of f.mock.calls) {
      expect(new Headers(init?.headers).has('x-curichi-sondeo')).toBe(false);
    }
  });
});

describe('exportación GeoJSON', () => {
  const valida = {
    type: 'FeatureCollection',
    nota_metodologica: 'Mi Curichi es un inventario de reportes ciudadanos.',
    generado_en: '2026-09-26T14:00:00.000Z',
    total: 61_234,
    exportados: 50_000,
    truncado: true,
    features: [],
  };

  it('valida la respuesta con el contrato y devuelve el archivo tal como llegó', async () => {
    const f = fetchFalso(valida, {
      'content-disposition': 'attachment; filename="mi-curichi-reportes-2026-09-26.geojson"',
    });
    const r = await exportarGeoJson({ estado: 'validado' });
    expect(f.mock.calls[0]?.[0]).toBe('/api/v1/exportar?estado=validado&formato=geojson');
    expect(r.resumen).toEqual({ total: 61_234, exportados: 50_000, truncado: true });
    expect(r.nombreArchivo).toBe('mi-curichi-reportes-2026-09-26.geojson');
    expect(JSON.parse(r.texto)).toEqual(valida);
  });

  it('no entrega un archivo que no declara si vino recortado', async () => {
    // Forma anterior a contracts 0.6.0: sin `exportados` ni `truncado`.
    const { exportados: _e, truncado: _t, ...vieja } = valida;
    fetchFalso(vieja);
    await expect(exportarGeoJson({})).rejects.toBeInstanceOf(ErrorExportacionInvalida);
  });

  it('el nombre del archivo es el que manda api-core y, si no manda ninguno, el de respaldo', () => {
    expect(nombreDeArchivo('attachment; filename="mi-curichi-reportes.geojson"', 'x.geojson')).toBe(
      'mi-curichi-reportes.geojson',
    );
    expect(nombreDeArchivo(null, 'x.geojson')).toBe('x.geojson');
    expect(nombreDeArchivo('attachment', 'x.geojson')).toBe('x.geojson');
  });
});
