import { describe, expect, it } from 'vitest';
import { enlacesPara, puedeEntrarAlPanel, puedeVerRuta, rutaInicial } from './roles';

describe('rol y navegación del panel', () => {
  it('tras el login el ejecutivo va a /ejecutivo y los demás a /reportes', () => {
    expect(rutaInicial('ejecutivo')).toBe('/ejecutivo');
    expect(rutaInicial('tecnico')).toBe('/reportes');
    expect(rutaInicial('admin')).toBe('/reportes');
  });

  it('ejecutivo, técnico y administrador entran al panel; el ciudadano no', () => {
    expect(puedeEntrarAlPanel('ejecutivo')).toBe(true);
    expect(puedeEntrarAlPanel('tecnico')).toBe(true);
    expect(puedeEntrarAlPanel('admin')).toBe(true);
    expect(puedeEntrarAlPanel('ciudadano')).toBe(false);
  });

  it('el ejecutivo no ve moderación, exportación, indicadores ni administración', () => {
    for (const ruta of ['/reportes', '/reportes/abc', '/indicadores', '/capas', '/plano']) {
      expect(puedeVerRuta('ejecutivo', ruta)).toBe(false);
    }
    expect(puedeVerRuta('ejecutivo', '/ejecutivo')).toBe(true);
    expect(puedeVerRuta('tecnico', '/ejecutivo')).toBe(true);
    expect(puedeVerRuta('admin', '/capas')).toBe(true);
  });

  it('«Ejecutivo» aparece en la navegación de los tres roles; el ejecutivo solo ve ese enlace', () => {
    expect(enlacesPara('ejecutivo').map((e) => e.texto)).toEqual(['Ejecutivo']);
    for (const rol of ['tecnico', 'admin'] as const) {
      const textos = enlacesPara(rol).map((e) => e.texto);
      expect(textos).toContain('Ejecutivo');
      expect(textos).toContain('Reportes');
    }
  });
});
