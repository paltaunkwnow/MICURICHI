import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type Borrador,
  borradorTieneContenido,
  guardarBorrador,
  leerBorrador,
  olvidarBorrador,
  traducirValoresViejos,
  VALIDEZ_MS,
} from './borrador';

const CLAVE = 'curichi.borrador-reporte.v1';

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
  vi.stubGlobal('window', { sessionStorage: almacen });
}

const BASE: Omit<Borrador, 'guardado_en'> = {
  paso: 3,
  ubicacion: { lat: -17.78, lon: -63.18, metodo: 'manual', precisionM: null },
  resuelto: { dentro_cobertura: true },
  fotos: [{ objeto_key: 'a.jpg', url: '/api/v1/fotos/a.jpg' }],
  valores: { descripcion: 'Se junta el agua en la esquina', profundidad_estimada: 'rodilla' },
  clave: '11111111-1111-4111-8111-111111111111',
};

describe('borrador del formulario de reporte', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('guarda y devuelve lo que había a medias', () => {
    instalar(almacenFalso());
    guardarBorrador(BASE);
    const b = leerBorrador();
    expect(b?.paso).toBe(3);
    expect(b?.valores.descripcion).toBe('Se junta el agua en la esquina');
    expect(b?.ubicacion?.lat).toBeCloseTo(-17.78);
  });

  it('conserva la clave de idempotencia: reintentar tras recargar no puede duplicar el reporte', () => {
    instalar(almacenFalso());
    guardarBorrador(BASE);
    expect(leerBorrador()?.clave).toBe(BASE.clave);
  });

  it('olvida el borrador cuando se pide', () => {
    instalar(almacenFalso());
    guardarBorrador(BASE);
    olvidarBorrador();
    expect(leerBorrador()).toBeNull();
  });

  it('descarta un borrador caducado en vez de restaurar fotos que el servidor ya borró', () => {
    const almacen = almacenFalso();
    instalar(almacen);
    almacen.setItem(
      CLAVE,
      JSON.stringify({ ...BASE, guardado_en: Date.now() - VALIDEZ_MS - 1000 }),
    );
    expect(leerBorrador()).toBeNull();
    // Y además lo borra, para no volver a leerlo en cada carga.
    expect(almacen._datos.has(CLAVE)).toBe(false);
  });

  it('ignora basura o restos de una versión anterior', () => {
    const almacen = almacenFalso();
    instalar(almacen);
    almacen.setItem(CLAVE, 'no es json');
    expect(leerBorrador()).toBeNull();
    almacen.setItem(CLAVE, JSON.stringify({ paso: 2 })); // sin guardado_en ni clave
    expect(leerBorrador()).toBeNull();
  });

  it('acota el paso restaurado al rango del asistente', () => {
    const almacen = almacenFalso();
    instalar(almacen);
    almacen.setItem(CLAVE, JSON.stringify({ ...BASE, paso: 99, guardado_en: Date.now() }));
    expect(leerBorrador()?.paso).toBe(1);
  });

  it('con el almacenamiento bloqueado no rompe nada', () => {
    vi.stubGlobal('window', {
      get sessionStorage(): Storage {
        throw new Error('almacenamiento bloqueado');
      },
    });
    expect(() => guardarBorrador(BASE)).not.toThrow();
    expect(leerBorrador()).toBeNull();
    expect(() => olvidarBorrador()).not.toThrow();
  });

  it('en el servidor no toca nada', () => {
    vi.stubGlobal('window', undefined);
    expect(leerBorrador()).toBeNull();
    expect(() => guardarBorrador(BASE)).not.toThrow();
  });

  it('CA-W4: un borrador guardado antes del cambio se restaura sin duración ni afectación', () => {
    const almacen = almacenFalso();
    instalar(almacen);
    // Así quedaba el borrador con el formulario anterior, que preguntaba las dos cosas.
    almacen.setItem(
      CLAVE,
      JSON.stringify({
        ...BASE,
        paso: 3,
        valores: {
          descripcion: 'Se junta el agua en la esquina',
          tirante_estimado: 'rodilla',
          duracion_estimada: '2h_12h',
          frecuencia: 'cada_lluvia_fuerte',
          afectacion: 'vehicular',
        },
        guardado_en: Date.now(),
      }),
    );
    let b: Borrador | null = null;
    expect(() => {
      b = leerBorrador();
    }).not.toThrow();
    const restaurado = b as Borrador | null;
    expect(restaurado).not.toBeNull();
    // El paso 3 del asistente viejo (profundidad y duración) equivale al 2 del nuevo (profundidad y
    // frecuencia juntos): PASO_VIEJO_A_NUEVO[3] = 2.
    expect(restaurado?.paso).toBe(2);
    expect(Object.keys(restaurado?.valores ?? {})).not.toContain('duracion_estimada');
    expect(Object.keys(restaurado?.valores ?? {})).not.toContain('afectacion');
    // Lo que sigue existiendo se conserva: el vecino no pierde lo que ya contestó.
    // Y el tirante de entonces llega con su nombre de ahora (contracts 0.5.0).
    expect(restaurado?.valores.profundidad_estimada).toBe('rodilla');
    expect(restaurado?.valores.frecuencia).toBe('cada_lluvia_fuerte');
    expect(restaurado?.valores.descripcion).toBe('Se junta el agua en la esquina');
  });

  it('traduce un borrador con tirante_estimado a profundidad_estimada', () => {
    const almacen = almacenFalso();
    instalar(almacen);
    almacen.setItem(
      CLAVE,
      JSON.stringify({
        ...BASE,
        formato: 2,
        valores: {
          descripcion: 'Se junta el agua',
          tirante_estimado: 'muslo',
          frecuencia: 'ocasional',
        },
        guardado_en: Date.now(),
      }),
    );
    const b = leerBorrador();
    expect(b?.valores.profundidad_estimada).toBe('muslo');
    expect(Object.keys(b?.valores ?? {})).not.toContain('tirante_estimado');
    expect(b?.valores.frecuencia).toBe('ocasional');
    expect(b?.paso).toBe(3);
  });

  it('si el borrador ya trae profundidad, el tirante viejo no la pisa', () => {
    expect(
      traducirValoresViejos({ tirante_estimado: 'tobillo', profundidad_estimada: 'rodilla' }),
    ).toEqual({ profundidad_estimada: 'rodilla' });
  });

  it('traduce las respuestas viejas del sumidero: sin «No sé», tapado o no tapado', () => {
    expect(traducirValoresViejos({ sumidero_cercano: 'no_sabe' }).sumidero_cercano).toBeNull();
    expect(traducirValoresViejos({ sumidero_cercano: '' }).sumidero_cercano).toBeNull();
    expect(traducirValoresViejos({ sumidero_cercano: 'si' }).sumidero_cercano).toBe('si');
    expect(traducirValoresViejos({ sumidero_cercano: 'no' }).sumidero_cercano).toBe('no');
    expect(traducirValoresViejos({ sumidero_estado: 'libre' }).sumidero_estado).toBe('no_tapado');
    expect(traducirValoresViejos({ sumidero_estado: 'obstruido' }).sumidero_estado).toBe('tapado');
    expect(traducirValoresViejos({ sumidero_estado: 'danado' }).sumidero_estado).toBe('tapado');
    expect(traducirValoresViejos({ sumidero_estado: 'no_sabe' }).sumidero_estado).toBeNull();
    expect(traducirValoresViejos({ sumidero_estado: 'tapado' }).sumidero_estado).toBe('tapado');
    expect(traducirValoresViejos({ sumidero_estado: 'no_tapado' }).sumidero_estado).toBe(
      'no_tapado',
    );
    // Lo que no vino, no aparece: el formulario distingue «no tocado» de «contestado vacío».
    expect(traducirValoresViejos({ descripcion: 'x' })).toEqual({ descripcion: 'x' });
  });

  it('un borrador recién abierto no cuenta como algo que retomar', () => {
    const vacio: Borrador = {
      guardado_en: Date.now(),
      paso: 1,
      ubicacion: null,
      resuelto: null,
      fotos: [],
      // Estos son los valores por defecto del formulario, no algo que el vecino escribiera.
      valores: { ubicacion_tipo: 'via_publica', causa_presunta: 'desconocida', descripcion: '' },
      clave: BASE.clave,
    };
    expect(borradorTieneContenido(vacio)).toBe(false);
    expect(borradorTieneContenido({ ...vacio, paso: 2 })).toBe(true);
    expect(borradorTieneContenido({ ...vacio, valores: { descripcion: 'algo' } })).toBe(true);
  });
});
