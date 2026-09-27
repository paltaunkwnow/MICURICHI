/**
 * «Mis reportes» ahora lo sirve el servidor (`GET /api/v1/mis-reportes`, vista del autor): el
 * vecino ve sus reportes en cualquier estado, también mientras esperan su publicación y si los
 * retiraron. La lista que antes guardaba el navegador se borra, y los datos de la cuenta salen de
 * la caché al perder la sesión.
 */
import { QueryClient } from '@tanstack/react-query';
import type { MiReporte } from 'contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenerMisReportes } from './api';
import { archivosDeLaApp, leerFuente } from './fuente-para-pruebas';
import {
  borrarListaVieja,
  CLAVE_LISTA_VIEJA,
  CLAVE_MIS_REPORTES,
  claveMisReportes,
  olvidarDatosDeLaCuenta,
  resumenDeMisReportes,
  situacionDelAutor,
} from './misReportes';

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

describe('la lista vieja del navegador', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('es la clave curichi.mis-reportes.v1 y se borra', () => {
    expect(CLAVE_LISTA_VIEJA).toBe('curichi.mis-reportes.v1');
    const a = almacenFalso();
    a._datos.set(CLAVE_LISTA_VIEJA, '[{"id":"a","enviado_en":"2026-01-01T00:00:00.000Z"}]');
    a._datos.set('otra-cosa', 'x');
    vi.stubGlobal('window', { localStorage: a });
    borrarListaVieja();
    expect(a._datos.has(CLAVE_LISTA_VIEJA)).toBe(false);
    expect(a._datos.get('otra-cosa')).toBe('x');
  });

  it('no rompe con el almacenamiento bloqueado ni sin navegador', () => {
    vi.stubGlobal('window', {
      localStorage: {
        removeItem() {
          throw new Error('bloqueado');
        },
      },
    });
    expect(() => borrarListaVieja()).not.toThrow();
    vi.stubGlobal('window', undefined);
    expect(() => borrarListaVieja()).not.toThrow();
  });

  it('ya nadie escribe en ella: la lista es la del servidor', () => {
    const culpables = archivosDeLaApp()
      .filter(({ texto }) => /recordarReporte|leerMisReportes|localStorage\.setItem/.test(texto))
      .map(({ ruta }) => ruta);
    expect(culpables).toEqual([]);
  });

  it('la sesión la borra al montarse, así desaparece en cualquier pantalla', () => {
    expect(leerFuente('lib/sesion.tsx')).toMatch(/borrarListaVieja\(\)/);
  });
});

describe('los datos de la cuenta al perder la sesión', () => {
  it('la clave lleva la cuenta: otra persona en el mismo navegador no ve la lista de la anterior', () => {
    expect(claveMisReportes('u1')).toEqual([...CLAVE_MIS_REPORTES, 'u1']);
    expect(claveMisReportes('u1')).not.toEqual(claveMisReportes('u2'));
    expect(CLAVE_MIS_REPORTES).toEqual(['mis-reportes']);
  });

  it('removeQueries([mis-reportes]) saca de la caché la lista de cualquier cuenta', () => {
    const cliente = new QueryClient();
    cliente.setQueryData(claveMisReportes('u1'), { type: 'FeatureCollection', features: [] });
    cliente.setQueryData(claveMisReportes('u2'), { type: 'FeatureCollection', features: [] });
    cliente.setQueryData(['reportes', {}], { type: 'FeatureCollection', features: [] });
    olvidarDatosDeLaCuenta(cliente);
    expect(cliente.getQueryData(claveMisReportes('u1'))).toBeUndefined();
    expect(cliente.getQueryData(claveMisReportes('u2'))).toBeUndefined();
    // Lo público no es de la cuenta: se queda.
    expect(cliente.getQueryData(['reportes', {}])).toBeDefined();
  });

  it('se hace al cerrar sesión y cuando /auth/yo dice que no hay sesión', () => {
    const fuente = leerFuente('lib/sesion.tsx');
    expect(fuente.match(/olvidarDatosDeLaCuenta\(cliente\)/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('GET /api/v1/mis-reportes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('va con la cookie de sesión (es de una cuenta) y a la ruta del autor', async () => {
    const llamadas: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      llamadas.push({ url, init });
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ type: 'FeatureCollection', features: [] }),
      } as Response);
    });
    await obtenerMisReportes();
    expect(llamadas[0]?.url).toBe('/api/v1/mis-reportes');
    expect(llamadas[0]?.init.credentials).toBe('same-origin');
  });

  it('las pantallas de Mis reportes la usan, y no el detalle público', () => {
    for (const ruta of ['componentes/MisReportes.tsx', 'componentes/SeguimientoReporte.tsx']) {
      const fuente = leerFuente(ruta);
      expect(fuente, ruta).toMatch(/useMisReportes\(/);
      expect(fuente, ruta).not.toMatch(/obtenerReporte\(/);
    }
    expect(leerFuente('componentes/MisReportes.tsx')).toMatch(/obtenerMisReportes/);
  });
});

describe('en qué está cada reporte, visto por su autor', () => {
  const base = {
    estado: 'nuevo',
    verificado: false,
    retirado: false,
    segundos_para_publicar: 0,
  } as Pick<MiReporte, 'estado' | 'verificado' | 'retirado' | 'segundos_para_publicar'>;

  it('mientras espera su publicar_en, está en espera', () => {
    expect(situacionDelAutor({ ...base, segundos_para_publicar: 200 })).toBe('en-espera');
    // La cuenta regresiva de la pantalla manda sobre la respuesta, que envejece.
    expect(situacionDelAutor({ ...base, segundos_para_publicar: 200 }, 0)).toBe('sin-verificar');
  });

  it('publicado y sin revisar: sin verificar', () => {
    expect(situacionDelAutor(base)).toBe('sin-verificar');
  });

  it('verificado, resuelto, retirado o sumado a otro punto', () => {
    expect(situacionDelAutor({ ...base, estado: 'validado', verificado: true })).toBe('verificado');
    expect(situacionDelAutor({ ...base, estado: 'resuelto', verificado: true })).toBe('resuelto');
    expect(situacionDelAutor({ ...base, estado: 'rechazado', retirado: true })).toBe('retirado');
    expect(situacionDelAutor({ ...base, estado: 'duplicado', retirado: true })).toBe('sumado');
    // Un retirado no está «en espera» aunque le falten segundos.
    expect(
      situacionDelAutor({
        ...base,
        estado: 'rechazado',
        retirado: true,
        segundos_para_publicar: 90,
      }),
    ).toBe('retirado');
  });

  it('el resumen cuenta cada grupo', () => {
    const r = resumenDeMisReportes([
      { ...base, segundos_para_publicar: 30 },
      base,
      { ...base, estado: 'validado', verificado: true },
      { ...base, estado: 'resuelto', verificado: true },
      { ...base, estado: 'rechazado', retirado: true },
      { ...base, estado: 'duplicado', retirado: true },
    ]);
    expect(r).toEqual({ todos: 6, enEspera: 1, sinVerificar: 1, verificados: 2, retirados: 2 });
  });
});
