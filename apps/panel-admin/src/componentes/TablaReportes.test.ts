import {
  CONFIG_DOMINIO,
  type ReporteTecnico,
  type ReporteTecnicoFeature,
  type UbicacionMetodo,
} from 'contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProveedorCiudad } from '@/lib/ciudad-contexto';
import { TablaReportes } from './TablaReportes';

// La fila navega al detalle con el router de Next. Acá se renderiza suelta con renderToStaticMarkup,
// sin ese router, así que se simula con uno inerte (vitest sube este `vi.mock` por encima de los
// imports, y alcanza a la tabla antes de montarla).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
}));

const ID_APROXIMADA = 'a1b2c3d4-0000-4000-8000-000000000001';
const ID_GPS = 'b2c3d4e5-0000-4000-8000-000000000002';
const ID_MANUAL = 'c3d4e5f6-0000-4000-8000-000000000003';

const ETIQUETA = 'Ubicación aproximada — sin comprobar con el dispositivo';

/** Un reporte SINTÉTICO con todos los campos del contrato; cada prueba pisa solo lo suyo. */
function feature(id: string, extra: Partial<ReporteTecnico> = {}): ReporteTecnicoFeature {
  return {
    type: 'Feature',
    id,
    geometry: { type: 'Point', coordinates: [-63.181234, -17.785678] },
    properties: {
      id,
      creado_en: '2026-09-27T14:30:00.000Z',
      evento_en: '2026-09-27T12:00:00.000Z',
      distrito: { id: 'distrito_municipal:07', codigo: '07', nombre: 'Distrito 7' },
      unidad_vecinal: { id: 'unidad_vecinal:123', codigo: '123', nombre: 'Los Lotes' },
      descripcion: 'Agua acumulada frente al colegio tras la lluvia torrencial.',
      fotos: [],
      profundidad_estimada: 'rodilla',
      frecuencia: 'ocasional',
      causa_presunta: 'sumidero_tapado',
      severidad: 'media',
      severidad_calculada: 'media',
      severidad_puntaje: 6,
      severidad_manual: null,
      severidad_motivo: null,
      estado: 'nuevo',
      estado_motivo: null,
      verificado: false,
      punto_critico_id: null,
      n_reportes_punto: null,
      precision_degradada: false,
      ubicacion_metodo: 'gps',
      precision_gps_m: 6.5,
      distancia_dispositivo_m: 2,
      ubicacion_tipo: 'via_publica',
      sumidero_cercano: null,
      sumidero_estado: null,
      agua_brota_sumidero: null,
      fusionado_en_id: null,
      validado_por: null,
      validado_en: null,
      actualizado_en: '2026-09-27T14:30:00.000Z',
      version_capa: 'DM_UV_MZ_2025',
      resolucion_flags: {},
      autor_id: null,
      ...extra,
    },
  };
}

function reporteCon(id: string, ubicacion_metodo: UbicacionMetodo): ReporteTecnicoFeature {
  return feature(
    id,
    ubicacion_metodo === 'aproximada'
      ? { ubicacion_metodo, precision_gps_m: 178, distancia_dispositivo_m: null }
      : { ubicacion_metodo },
  );
}

function render(reportes: ReporteTecnicoFeature[]): string {
  return renderToStaticMarkup(
    createElement(
      ProveedorCiudad,
      { ciudad: CONFIG_DOMINIO.CIUDAD_POR_DEFECTO },
      createElement(TablaReportes, { reportes }),
    ),
  );
}

/** Cada fila del cuerpo de la tabla, por el `data-id` del reporte. */
function filas(html: string): Map<string, string> {
  const porId = new Map<string, string>();
  for (const m of html.matchAll(/<tr\b([^>]*)>(.*?)<\/tr>/gs)) {
    const id = /data-id="([^"]+)"/.exec(m[1] ?? '')?.[1];
    if (id) porId.set(id, m[2] ?? '');
  }
  return porId;
}

/** El contenido de cada celda de una fila, en orden. */
function celdasDe(fila: string): string[] {
  return [...fila.matchAll(/<td\b[^>]*>(.*?)<\/td>/gs)].map((m) => m[1] ?? '');
}

/** El texto que ve la persona: sin etiquetas ni los `<!-- -->` que React pone entre textos. */
function visible(html: string): string {
  return html
    .replace(/<!--.*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('TablaReportes: ubicación aproximada (ADR 0007)', () => {
  const html = render([
    reporteCon(ID_APROXIMADA, 'aproximada'),
    reporteCon(ID_GPS, 'gps'),
    reporteCon(ID_MANUAL, 'manual'),
  ]);
  const porId = filas(html);
  const filaAproximada = porId.get(ID_APROXIMADA) ?? '';

  it('las tres filas se dibujan', () => {
    expect([...porId.keys()]).toEqual([ID_APROXIMADA, ID_GPS, ID_MANUAL]);
  });

  it('la fila de un reporte aproximado lleva la insignia, y solo esa', () => {
    expect(filaAproximada).toContain('data-testid="insignia-ubicacion-aproximada"');
    expect(porId.get(ID_GPS)).not.toContain('insignia-ubicacion-aproximada');
    expect(porId.get(ID_MANUAL)).not.toContain('insignia-ubicacion-aproximada');
    expect(html.match(/insignia-ubicacion-aproximada/g)).toHaveLength(1);
  });

  it('la insignia dice «Aproximada»: texto, no solo color', () => {
    const insignia = /<span[^>]*data-testid="insignia-ubicacion-aproximada"[^>]*>(.*?)<\/span>/s;
    const contenido = insignia.exec(filaAproximada)?.[1] ?? '';
    expect(visible(contenido)).toBe('Aproximada');
    // El icono acompaña al texto pero no lo reemplaza: es decorativo para los lectores de pantalla.
    expect(contenido).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it('quien no ve la insignia (lector de pantalla, puntero) recibe el significado completo', () => {
    // Tooltip con la etiqueta de siempre, la misma del detalle y la ficha.
    expect(filaAproximada).toContain(`title="${ETIQUETA}"`);
    // Y lo leído en voz alta: «Ubicación: Aproximada, sin comprobar con el dispositivo».
    expect(visible(filaAproximada)).toMatch(
      /Ubicación:\s*Aproximada\s*,\s*sin comprobar con el dispositivo/,
    );
  });

  it('la insignia queda en la celda de la unidad vecinal, junto a su nombre', () => {
    const celdaUv = celdasDe(filaAproximada)[1] ?? '';
    expect(visible(celdaUv)).toContain('UV 123');
    expect(celdaUv).toContain('insignia-ubicacion-aproximada');
    // En ninguna otra celda.
    const conInsignia = celdasDe(filaAproximada).filter((c) =>
      c.includes('insignia-ubicacion-aproximada'),
    );
    expect(conInsignia).toHaveLength(1);
  });

  it('el resto de la fila no cambia: nueve celdas y los mismos enlaces de siempre', () => {
    for (const [id, fila] of porId) {
      expect(celdasDe(fila), id).toHaveLength(9);
      expect(fila, id).toContain('data-testid="abrir-reporte"');
      expect(fila, id).toContain('data-testid="boton-ver-detalle"');
      expect(fila, id).toContain(`href="/reportes/${id}"`);
    }
    expect(html.match(/data-testid="fila-reporte"/g)).toHaveLength(3);
  });

  it('en «gps» y «manual» la celda de la unidad vecinal es la de siempre: solo su nombre', () => {
    for (const id of [ID_GPS, ID_MANUAL]) {
      const fila = porId.get(id) ?? '';
      expect(celdasDe(fila)[1], id).toBe('UV 123');
      expect(visible(fila), id).not.toMatch(/aproximad|sin comprobar/i);
    }
  });
});
