import { describe, expect, it } from 'vitest';
import { destinoDelPanel, normalizarUrlDelPanel } from './panel';

const PANEL = 'http://localhost:3100/';

describe('destinoDelPanel', () => {
  it('técnico y administrador ven el botón', () => {
    expect(destinoDelPanel('tecnico', PANEL)).toBe(PANEL);
    expect(destinoDelPanel('admin', PANEL)).toBe(PANEL);
  });

  it('un ciudadano no lo ve, y sin sesión tampoco', () => {
    expect(destinoDelPanel('ciudadano', PANEL)).toBeNull();
    expect(destinoDelPanel(undefined, PANEL)).toBeNull();
  });

  it('sin URL válida no hay botón para nadie', () => {
    expect(destinoDelPanel('admin', null)).toBeNull();
  });
});

describe('normalizarUrlDelPanel', () => {
  it('acepta http y https', () => {
    expect(normalizarUrlDelPanel('http://localhost:3100')).toBe(PANEL);
    expect(normalizarUrlDelPanel('https://panel.ejemplo.bo/')).toBe('https://panel.ejemplo.bo/');
  });

  it('descarta lo vacío, lo que no es URL y los esquemas que no son web', () => {
    expect(normalizarUrlDelPanel(undefined)).toBeNull();
    expect(normalizarUrlDelPanel('')).toBeNull();
    expect(normalizarUrlDelPanel('panel técnico')).toBeNull();
    // Sin esquema, `new URL` lee `localhost:` como si fuera el protocolo.
    expect(normalizarUrlDelPanel('localhost:3100')).toBeNull();
    expect(normalizarUrlDelPanel('javascript:alert(1)')).toBeNull();
    expect(normalizarUrlDelPanel('ftp://panel.ejemplo.bo')).toBeNull();
  });

  it('descarta una URL con usuario o contraseña dentro', () => {
    expect(normalizarUrlDelPanel('http://admin:clave@localhost:3100')).toBeNull();
  });
});
