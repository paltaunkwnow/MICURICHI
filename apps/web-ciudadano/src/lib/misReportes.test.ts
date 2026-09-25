import { beforeEach, describe, expect, it, vi } from 'vitest';
import { leerMisReportes, olvidarReportes, recordarReporte } from './misReportes';

const CLAVE = 'curichi.mis-reportes.v1';

function almacenFalso() {
  const datos = new Map<string, string>();
  return {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => {
      datos.set(k, v);
    },
    removeItem: (k: string) => {
      datos.delete(k);
    },
    _datos: datos,
  };
}

function instalar(almacen: unknown) {
  vi.stubGlobal('window', { localStorage: almacen });
}

const BASE = {
  enviado_en: '2026-09-16T12:00:00.000Z',
  titulo: 'Av. Piraí esq. Los Tajibos',
  unidad_vecinal: 'UV-57',
  distrito: 'D01',
  severidad: 'alta',
  tiene_foto: false,
};

describe('seguimiento local de reportes', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('guarda y recupera lo que se envió desde este dispositivo', () => {
    instalar(almacenFalso());
    recordarReporte({ ...BASE, id: 'a' });
    recordarReporte({ ...BASE, id: 'b' });
    expect(leerMisReportes().map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('no duplica un reporte reenviado con la misma clave de idempotencia', () => {
    instalar(almacenFalso());
    recordarReporte({ ...BASE, id: 'a' });
    recordarReporte({ ...BASE, id: 'a', titulo: 'Otra calle' });
    const lista = leerMisReportes();
    expect(lista).toHaveLength(1);
    expect(lista[0]?.titulo).toBe('Otra calle');
  });

  it('corta la lista para que no crezca sin fin', () => {
    instalar(almacenFalso());
    for (let i = 0; i < 60; i++) recordarReporte({ ...BASE, id: `r${i}` });
    expect(leerMisReportes()).toHaveLength(50);
    expect(leerMisReportes()[0]?.id).toBe('r59');
  });

  it('olvida la lista cuando el vecino lo pide', () => {
    instalar(almacenFalso());
    recordarReporte({ ...BASE, id: 'a' });
    olvidarReportes();
    expect(leerMisReportes()).toEqual([]);
  });

  /**
   * En navegación privada o con el almacenamiento bloqueado, `localStorage` lanza al leerlo. El
   * reporte ya se envió y lo importante es que la pantalla siga funcionando, aunque sin lista.
   */
  it('no rompe si el navegador bloquea el almacenamiento', () => {
    instalar({
      getItem() {
        throw new Error('bloqueado');
      },
      setItem() {
        throw new Error('bloqueado');
      },
      removeItem() {
        throw new Error('bloqueado');
      },
    });
    expect(leerMisReportes()).toEqual([]);
    expect(() => recordarReporte({ ...BASE, id: 'a' })).not.toThrow();
    expect(() => olvidarReportes()).not.toThrow();
  });

  it('descarta basura guardada por una versión anterior', () => {
    const a = almacenFalso();
    a._datos.set(CLAVE, '{"no":"es un array"}');
    instalar(a);
    expect(leerMisReportes()).toEqual([]);
    a._datos.set(CLAVE, '[{"sinId":true},{"id":"a","enviado_en":"2026-01-01T00:00:00.000Z"}]');
    expect(leerMisReportes().map((r) => r.id)).toEqual(['a']);
  });

  it('no hace nada cuando no hay navegador (render en servidor)', () => {
    vi.stubGlobal('window', undefined);
    expect(leerMisReportes()).toEqual([]);
    expect(() => recordarReporte({ ...BASE, id: 'a' })).not.toThrow();
  });
});
