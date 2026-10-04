/**
 * El correo con el que se acaba de crear la cuenta viaja a «Iniciar sesión» por `sessionStorage` y
 * no por la URL (plan 2026-10-04-arreglos-chicos, M-6.2): una URL con el correo queda en el
 * historial, en los registros del servidor y en el `Referer`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLAVE_CORREO_PARA_ENTRAR,
  guardarCorreoParaEntrar,
  tomarCorreoParaEntrar,
} from './correo-para-entrar';

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

/** Almacenamiento bloqueado o lleno (Safari en privado, datos del sitio bloqueados): todo lanza. */
const almacenQueLanza = {
  getItem: (): string | null => {
    throw new Error('almacenamiento bloqueado');
  },
  setItem: (): void => {
    throw new Error('cuota llena');
  },
  removeItem: (): void => {
    throw new Error('almacenamiento bloqueado');
  },
};

const CORREO = 'vecina.nueva@example.org';

describe('guardar y tomar el correo para «Iniciar sesión»', () => {
  it('lo guarda con una clave propia, y solo eso', () => {
    const almacen = almacenFalso();
    guardarCorreoParaEntrar(CORREO, almacen);
    expect(CLAVE_CORREO_PARA_ENTRAR).toBe('curichi:correo-para-entrar');
    expect(almacen._datos.get(CLAVE_CORREO_PARA_ENTRAR)).toBe(CORREO);
    expect([...almacen._datos.keys()]).toEqual([CLAVE_CORREO_PARA_ENTRAR]);
  });

  it('se lee una sola vez: tomarlo lo devuelve y lo borra', () => {
    const almacen = almacenFalso();
    guardarCorreoParaEntrar(CORREO, almacen);
    expect(tomarCorreoParaEntrar(almacen)).toBe(CORREO);
    expect(almacen._datos.has(CLAVE_CORREO_PARA_ENTRAR)).toBe(false);
    // Recargar o volver a /ingresar no lo trae de nuevo.
    expect(tomarCorreoParaEntrar(almacen)).toBe('');
  });

  it('con el almacenamiento vacío devuelve vacío y no escribe nada', () => {
    const almacen = almacenFalso();
    expect(tomarCorreoParaEntrar(almacen)).toBe('');
    expect(almacen._datos.size).toBe(0);
  });

  it('no guarda un correo vacío', () => {
    const almacen = almacenFalso();
    guardarCorreoParaEntrar('', almacen);
    expect(almacen._datos.size).toBe(0);
  });

  it('un correo guardado después reemplaza al anterior', () => {
    const almacen = almacenFalso();
    guardarCorreoParaEntrar('primera@example.org', almacen);
    guardarCorreoParaEntrar(CORREO, almacen);
    expect(tomarCorreoParaEntrar(almacen)).toBe(CORREO);
  });
});

describe('sin almacenamiento el campo queda vacío y nada se rompe', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('con un almacenamiento que lanza, ni guardar ni tomar propagan el error', () => {
    expect(() => guardarCorreoParaEntrar(CORREO, almacenQueLanza)).not.toThrow();
    expect(tomarCorreoParaEntrar(almacenQueLanza)).toBe('');
  });

  it('sin almacenamiento (null) tampoco', () => {
    expect(() => guardarCorreoParaEntrar(CORREO, null)).not.toThrow();
    expect(tomarCorreoParaEntrar(null)).toBe('');
  });

  it('si el navegador lanza al pedir sessionStorage, lo mismo', () => {
    vi.stubGlobal('window', {
      get sessionStorage(): Storage {
        throw new Error('datos del sitio bloqueados');
      },
    });
    expect(() => guardarCorreoParaEntrar(CORREO)).not.toThrow();
    expect(tomarCorreoParaEntrar()).toBe('');
  });

  it('en el servidor (sin window) no toca nada', () => {
    vi.stubGlobal('window', undefined);
    expect(() => guardarCorreoParaEntrar(CORREO)).not.toThrow();
    expect(tomarCorreoParaEntrar()).toBe('');
  });
});

describe('con el sessionStorage de la pestaña', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('guardar y tomar usan sessionStorage, nunca localStorage', () => {
    const sesion = almacenFalso();
    const local = almacenFalso();
    vi.stubGlobal('window', { sessionStorage: sesion, localStorage: local });
    guardarCorreoParaEntrar(CORREO);
    expect(local._datos.size).toBe(0);
    expect(sesion._datos.get(CLAVE_CORREO_PARA_ENTRAR)).toBe(CORREO);
    expect(tomarCorreoParaEntrar()).toBe(CORREO);
    expect(sesion._datos.size).toBe(0);
  });
});
