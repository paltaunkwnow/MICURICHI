import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  claveStorageResueltos,
  marcarResueltoVisto,
  marcarTodosResueltosVistos,
  obtenerResueltosVistos,
} from './AvisoPuntoResuelto';

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

describe('AvisoPuntoResuelto almacenamiento de vistos', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('claveStorageResueltos incluye el id del usuario', () => {
    expect(claveStorageResueltos('usr-123')).toBe('curichi.resueltos_vistos.usr-123');
  });

  it('obtenerResueltosVistos devuelve un conjunto vacío si no hay datos guardados', () => {
    const a = almacenFalso();
    vi.stubGlobal('window', { localStorage: a });
    const vistos = obtenerResueltosVistos('usr-1');
    expect(vistos.size).toBe(0);
  });

  it('marcarResueltoVisto guarda el id del reporte resuelto en localStorage', () => {
    const a = almacenFalso();
    vi.stubGlobal('window', { localStorage: a });

    marcarResueltoVisto('usr-1', 'rep-resuelto-1');
    const vistos = obtenerResueltosVistos('usr-1');

    expect(vistos.has('rep-resuelto-1')).toBe(true);
    expect(vistos.size).toBe(1);

    // Segundo reporte marcado
    marcarResueltoVisto('usr-1', 'rep-resuelto-2');
    const vistos2 = obtenerResueltosVistos('usr-1');
    expect(vistos2.has('rep-resuelto-1')).toBe(true);
    expect(vistos2.has('rep-resuelto-2')).toBe(true);
    expect(vistos2.size).toBe(2);
  });

  it('marcarTodosResueltosVistos guarda múltiples reportes a la vez', () => {
    const a = almacenFalso();
    vi.stubGlobal('window', { localStorage: a });

    marcarTodosResueltosVistos('usr-1', ['rep-1', 'rep-2', 'rep-3']);
    const vistos = obtenerResueltosVistos('usr-1');

    expect(vistos.has('rep-1')).toBe(true);
    expect(vistos.has('rep-2')).toBe(true);
    expect(vistos.has('rep-3')).toBe(true);
    expect(vistos.size).toBe(3);
  });

  it('no lanza error si localStorage está bloqueado o falla', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem() {
          throw new Error('Almacenamiento bloqueado');
        },
        setItem() {
          throw new Error('Cuota excedida');
        },
      },
    });

    expect(() => obtenerResueltosVistos('usr-1')).not.toThrow();
    expect(obtenerResueltosVistos('usr-1').size).toBe(0);
    expect(() => marcarResueltoVisto('usr-1', 'rep-1')).not.toThrow();
  });
});
