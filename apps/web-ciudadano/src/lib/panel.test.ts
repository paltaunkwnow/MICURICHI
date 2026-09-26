import type { SesionActual } from 'contracts';
import { describe, expect, it } from 'vitest';
import * as moduloPanel from './panel';
import {
  destinoDelPanel,
  destinoDelPanelDeSesion,
  normalizarUrlDelPanel,
  textoDelPanel,
} from './panel';

const PANEL = 'http://localhost:3100/';

/** Solo lo que mira el botón: el rol y la URL que manda api-core en `/auth/yo`. */
const sesion = (
  rol: SesionActual['rol'],
  panel_url?: string | null,
): Pick<SesionActual, 'rol' | 'panel_url'> =>
  panel_url === undefined ? { rol } : { rol, panel_url };

describe('destinoDelPanelDeSesion (contracts 0.7.0: la URL llega por /auth/yo)', () => {
  it('toma la URL del panel de la sesión, no del JavaScript público', () => {
    expect(destinoDelPanelDeSesion(sesion('tecnico', 'https://panel.ejemplo.bo'))).toBe(
      'https://panel.ejemplo.bo/',
    );
    expect(destinoDelPanelDeSesion(sesion('admin', 'http://localhost:3100'))).toBe(PANEL);
    expect(destinoDelPanelDeSesion(sesion('ejecutivo', 'https://panel.ejemplo.bo/admin/'))).toBe(
      'https://panel.ejemplo.bo/admin/ejecutivo',
    );
  });

  it('sin URL no hay botón: despliegue sin panel (null) o api-core anterior a 0.7.0 (sin campo)', () => {
    expect(destinoDelPanelDeSesion(sesion('tecnico', null))).toBeNull();
    expect(destinoDelPanelDeSesion(sesion('admin'))).toBeNull();
    expect(destinoDelPanelDeSesion(null)).toBeNull();
    expect(destinoDelPanelDeSesion(undefined)).toBeNull();
  });

  it('a un ciudadano no se le ofrece aunque la respuesta trajera una URL', () => {
    expect(destinoDelPanelDeSesion(sesion('ciudadano', 'https://panel.ejemplo.bo'))).toBeNull();
  });

  it('una URL que no es http(s) o que trae credenciales no se enlaza', () => {
    expect(destinoDelPanelDeSesion(sesion('tecnico', 'javascript:alert(1)'))).toBeNull();
    expect(destinoDelPanelDeSesion(sesion('tecnico', 'http://a:b@panel.ejemplo.bo'))).toBeNull();
  });

  it('la URL fijada al compilar desde PANEL_ADMIN_URL ya no existe', () => {
    expect(Object.keys(moduloPanel)).not.toContain('URL_DEL_PANEL');
  });
});

describe('destinoDelPanel', () => {
  it('técnico y administrador ven el botón', () => {
    expect(destinoDelPanel('tecnico', PANEL)).toBe(PANEL);
    expect(destinoDelPanel('admin', PANEL)).toBe(PANEL);
  });

  it('el ejecutivo lo ve y va directo a su resumen', () => {
    expect(destinoDelPanel('ejecutivo', PANEL)).toBe('http://localhost:3100/ejecutivo');
    expect(destinoDelPanel('ejecutivo', 'https://panel.ejemplo.bo/admin/')).toBe(
      'https://panel.ejemplo.bo/admin/ejecutivo',
    );
    expect(destinoDelPanel('ejecutivo', null)).toBeNull();
    // Un panel servido bajo una subruta sin barra final: `new URL('ejecutivo', base)` se comía el
    // último tramo y mandaba a https://panel.ejemplo.bo/ejecutivo.
    expect(destinoDelPanel('ejecutivo', 'https://panel.ejemplo.bo/admin')).toBe(
      'https://panel.ejemplo.bo/admin/ejecutivo',
    );
    expect(textoDelPanel('ejecutivo')).toBe('Panel ejecutivo');
    expect(textoDelPanel('tecnico')).toBe('Panel técnico');
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
