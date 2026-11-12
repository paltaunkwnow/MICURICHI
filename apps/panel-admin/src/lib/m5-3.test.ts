import { QueryClient } from '@tanstack/react-query';
import { CONFIG_DOMINIO } from 'contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FactoresSeveridad } from '@/componentes/FactoresSeveridad';
import {
  generarJsonReporteUnitario,
  generarTextoReporteUnitario,
  ReporteUnitarioModal,
} from '@/componentes/ReporteUnitarioModal';
import { registroSintetico, reporteSintetico } from './categorias.fixture';
import { ProveedorCiudad } from './ciudad-contexto';
import { consultaCandidatosFusion } from './consultas';
import { candidatosCercanos, parametrosCandidatosFusion } from './fusion-cercana';
import { presentarReporte } from './presentacion-reporte';

afterEach(() => vi.unstubAllGlobals());
const formato = { fechaHora: (s: string | null | undefined) => s ?? '—', numero: String };
const ciudad = CONFIG_DOMINIO.CIUDAD_POR_DEFECTO;
describe('M5.3 categoría del reporte, detalle y ficha', () => {
  it('detalle explícito null no rescata los campos planos de inundación', () => {
    const f = reporteSintetico();
    f.properties = { ...f.properties, detalle: null } as unknown as typeof f.properties;
    const vista = presentarReporte(f.properties, registroSintetico);
    expect(vista.inundacion).toBe(false);
    expect(vista.campos).toEqual([]);
    expect(vista.aviso).toBeTruthy();
    const txt = generarTextoReporteUnitario(f, formato, ciudad, registroSintetico);
    expect(txt).not.toContain('Profundidad Estimada:');
    expect(txt).toContain('incompatible');
  });
  it('lee preguntas/opciones/booleanos/múltiples/subtipo y versiones disponibles sin calcular', () => {
    const vista = presentarReporte(reporteSintetico('bache').properties, registroSintetico);
    expect(vista.nombre).toBe('Baches de prueba');
    expect(vista.subtipo).toBe('Calzada de prueba');
    expect(vista.campos).toEqual([
      { etiqueta: 'Tipo de daño', valor: 'Hueco en la vía' },
      { etiqueta: 'Riesgo al pasar', valor: 'Sí' },
      { etiqueta: 'Efectos observados', valor: 'Dificulta el paso' },
    ]);
    expect(vista.versiones).toContain('definición disponible');
    expect(vista.versiones).toContain('9');
    expect(vista.versiones).toContain('no informa');
    expect(vista.nota).toContain('mantenimiento vial');
  });
  it.each(['bache', 'desconocida', 'inundacion'])(
    'detalle incompatible %s solo deja comunes y aviso',
    (categoria) => {
      const p = reporteSintetico(categoria).properties;
      p.detalle = { secreto: '<script>JSON arbitrario</script>' };
      const vista = presentarReporte(p, registroSintetico);
      expect(vista.campos).toEqual([]);
      expect(vista.inundacion).toBe(false);
      expect(vista.aviso).toBeTruthy();
      expect(JSON.stringify(vista)).not.toContain('JSON arbitrario');
    },
  );
  it('TXT de otra categoría conserva el núcleo, respuestas y nota sin rango ni agua', () => {
    const f = reporteSintetico('bache');
    const txt = generarTextoReporteUnitario(f, formato, ciudad, registroSintetico);
    expect(txt).toContain('Baches de prueba');
    expect(txt).toContain('Hueco en la vía');
    expect(txt).toContain('Calzada de prueba');
    expect(txt).toContain('mantenimiento vial');
    expect(txt).toContain('definición disponible');
    expect(txt).toContain('6 puntos');
    expect(txt).not.toMatch(/INUNDACIÓN|Profundidad|Sumidero|de 13|agua/i);
    expect(txt).toContain(f.properties.id);
  });
  it('GeoJSON preserva feature completo y añade nota/versiones de definición sin versión histórica inventada', () => {
    const f = reporteSintetico('bache');
    const json = JSON.parse(generarJsonReporteUnitario(f, registroSintetico));
    expect(json.properties).toEqual(f.properties);
    expect(json.geometry).toEqual(f.geometry);
    expect(json.nota_metodologica).toContain('mantenimiento vial');
    expect(json.definicion_disponible).toEqual({ detalle: 7, severidad: 9 });
    expect(json.properties).not.toHaveProperty('severidad_version');
  });
  it('ficha imprimible y factores de otra definición no presentan fórmula ni agua', () => {
    const f = reporteSintetico('bache');
    const html = renderToStaticMarkup(
      createElement(
        ProveedorCiudad,
        { ciudad },
        createElement(ReporteUnitarioModal, {
          reporte: f,
          registro: registroSintetico,
          onCerrar: vi.fn(),
        }),
      ),
    );
    expect(html).toContain('Hueco en la vía');
    expect(html).toContain('mantenimiento vial');
    expect(html).not.toMatch(/INUNDACIÓN|Profundidad|Sumidero|de 13/i);
    const factores = renderToStaticMarkup(
      createElement(FactoresSeveridad, { reporte: f.properties, registro: registroSintetico }),
    );
    expect(factores).toContain('definición disponible');
    expect(factores).not.toContain('profundidad');
  });
  it('inundación mantiene campos, ficha y desglose anteriores', () => {
    const f = reporteSintetico();
    const v = presentarReporte(f.properties, registroSintetico);
    expect(v.inundacion).toBe(true);
    expect(v.campos.some((c) => c.valor.includes('rodilla'))).toBe(true);
    expect(generarTextoReporteUnitario(f, formato, ciudad)).toContain(
      'REPORTE UNITARIO DE INUNDACIÓN',
    );
    expect(
      renderToStaticMarkup(createElement(FactoresSeveridad, { reporte: f.properties })),
    ).toContain('profundidad');
  });
});
describe('M5.3 fusión por categoría real', () => {
  const centro = { lon: -63.18, lat: -17.78 };
  it('parámetros incluyen categoría origen y conservan bbox alineado/cap 100', () => {
    expect(parametrosCandidatosFusion(centro, 300, 'bache')).toMatchObject({
      categoria: 'bache',
      estado: 'validado',
      limite: '100',
    });
  });
  it('filtro defensivo descarta ajenos aunque lleguen validados en el mismo punto', () => {
    const otros = ['bache', 'inundacion'].map((s, i) => {
      const f = reporteSintetico(s);
      f.properties.estado = 'validado';
      f.properties.id = `candidato-${i}`;
      return f;
    });
    expect(
      candidatosCercanos(otros, { id: 'origen', centro, categoria: 'bache' }, 100).map((c) => c.id),
    ).toEqual(['candidato-0']);
  });
  it('consulta acota parámetro y clave por categoría real sin Todas', async () => {
    const fetch = vi.fn(
      async (_entrada: string | URL | Request, _opciones?: RequestInit) =>
        new Response(
          JSON.stringify({
            type: 'FeatureCollection',
            features: [],
            total: 0,
            pagina: 1,
            limite: 100,
          }),
        ),
    );
    vi.stubGlobal('fetch', fetch);
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      const q = consultaCandidatosFusion(centro, 100, true, 'bache');
      await cliente.fetchQuery(q);
      expect(q.queryKey[1]).toMatchObject({ categoria: 'bache', radio_m: 100 });
      expect(String(fetch.mock.calls[0]?.[0])).toContain('categoria=bache');
    } finally {
      cliente.clear();
    }
  });
});
