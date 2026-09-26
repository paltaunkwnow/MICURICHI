import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SinAccesoPanel } from './SinAccesoPanel';

describe('SinAccesoPanel (render estático)', () => {
  it('una cuenta sin rol del panel puede cerrar sesión desde el aviso', () => {
    const html = renderToStaticMarkup(
      createElement(SinAccesoPanel, { onCerrarSesion: () => {}, cerrando: false }),
    );
    expect(html).toContain('Tu cuenta no tiene acceso al panel');
    const boton = html.match(
      /<button[^>]*data-testid="cerrar-sesion-sin-acceso"[^>]*>.*?<\/button>/,
    );
    expect(boton?.[0]).toContain('Cerrar sesión');
    expect(boton?.[0]).not.toContain('disabled');
  });

  it('mientras cierra, el botón queda deshabilitado', () => {
    const html = renderToStaticMarkup(
      createElement(SinAccesoPanel, { onCerrarSesion: () => {}, cerrando: true }),
    );
    expect(html).toMatch(/<button[^>]*data-testid="cerrar-sesion-sin-acceso"[^>]*disabled/);
  });
});
