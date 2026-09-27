import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { EstadoReporte, ReporteTecnicoFeature, Rol } from 'contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
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
