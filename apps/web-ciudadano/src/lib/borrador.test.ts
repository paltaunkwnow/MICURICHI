import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type Borrador,
  type BorradorNuevo,
  borradorTieneContenido,
  guardarBorrador,
  leerBorrador,
  olvidarBorrador,
  traducirValoresViejos,
  VALIDEZ_FOTO_MS,
  VALIDEZ_MS,
} from './borrador';
import { valoresIniciales } from './formulario-reporte';

const CLAVE = 'curichi.borrador-reporte.v1';
const HORA = 60 * 60 * 1000;

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

const BASE: BorradorNuevo = {
  paso: 3,
  ubicacion: { lat: -17.78, lon: -63.18, metodo: 'manual', precisionM: null },
  resuelto: { dentro_cobertura: true },
  fotos: [{ objeto_key: 'a.jpg', url: '/api/v1/fotos/a.jpg', subida_en: Date.now() }],
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
    // El estado solo tiene sentido con un sumidero cerca («Sí»): así se traducen sus valores.
    const conSumidero = (estado: string) =>
      traducirValoresViejos({ sumidero_cercano: 'si', sumidero_estado: estado }).sumidero_estado;
    expect(conSumidero('libre')).toBe('no_tapado');
    expect(conSumidero('obstruido')).toBe('tapado');
    expect(conSumidero('danado')).toBe('tapado');
    expect(conSumidero('no_sabe')).toBeNull();
    expect(conSumidero('tapado')).toBe('tapado');
    expect(conSumidero('no_tapado')).toBe('no_tapado');
    // Lo que no vino, no aparece: el formulario distingue «no tocado» de «contestado vacío».
    expect(traducirValoresViejos({ descripcion: 'x' })).toEqual({ descripcion: 'x' });
  });

  it('sin «Sí» en el sumidero cercano no se restaura un estado (contracts 0.6.0)', () => {
    expect(
      traducirValoresViejos({ sumidero_cercano: 'no', sumidero_estado: 'tapado' }).sumidero_estado,
    ).toBeNull();
    expect(
      traducirValoresViejos({ sumidero_cercano: null, sumidero_estado: 'tapado' }).sumidero_estado,
    ).toBeNull();
    expect(traducirValoresViejos({ sumidero_estado: 'libre' }).sumidero_estado).toBeNull();
    // Y el agua no puede brotar de un sumidero que no hay.
    expect(
      traducirValoresViejos({ sumidero_cercano: 'no', agua_brota_sumidero: true })
        .agua_brota_sumidero,
    ).toBeNull();
    expect(
      traducirValoresViejos({ sumidero_cercano: 'si', agua_brota_sumidero: true })
        .agua_brota_sumidero,
    ).toBe(true);
  });

  it('un «no brota» que escribió el formulario al montar vuelve a «sin contestar»', () => {
    // Antes de esta versión la casilla empezaba en `false` sin que nadie la tocara.
    expect(traducirValoresViejos({ agua_brota_sumidero: false }).agua_brota_sumidero).toBeNull();
    expect(traducirValoresViejos({ agua_brota_sumidero: true }).agua_brota_sumidero).toBe(true);
  });

  it('abrir el formulario, o llegar desde «Me pasa a mí», no deja nada que retomar', () => {
    const recienAbierto: Borrador = {
      guardado_en: Date.now(),
      creado_en: Date.now(),
      paso: 1,
      ubicacion: { lat: -17.78, lon: -63.18, metodo: 'manual', precisionM: null, precargada: true },
      resuelto: { dentro_cobertura: true },
      fotos: [],
      // Como lo guarda el formulario de verdad: `fijarUbicacion` copia el punto del enlace a los
      // valores. Sin estos cuatro la prueba pasaba y la página mostraba «Retomamos lo que habías
      // empezado» a quien solo había abierto el enlace.
      valores: {
        ...valoresIniciales(),
        lat: -17.78,
        lon: -63.18,
        ubicacion_metodo: 'manual',
        precision_gps_m: null,
      },
      clave: BASE.clave,
    };
    expect(borradorTieneContenido(recienAbierto)).toBe(false);
    // En cuanto la persona elige el punto, sí hay algo que retomar.
    expect(
      borradorTieneContenido({
        ...recienAbierto,
        ubicacion: { lat: -17.7, lon: -63.1, metodo: 'manual', precisionM: null },
        valores: { ...recienAbierto.valores, lat: -17.7, lon: -63.1 },
      }),
    ).toBe(true);
  });

  it('la caducidad no se desliza: seguir guardando no renueva el plazo', () => {
    vi.useFakeTimers();
    const t0 = Date.parse('2026-09-26T12:00:00Z');
    vi.setSystemTime(t0);
    instalar(almacenFalso());
    guardarBorrador(BASE);
    // Casi al final del plazo el formulario sigue abierto y guardando en cada cambio.
    vi.setSystemTime(t0 + VALIDEZ_MS - 60_000);
    guardarBorrador({ ...BASE, paso: 4 });
    expect(leerBorrador()?.paso).toBe(4);
    // Restaurar tampoco lo renueva: la misma clave conserva la fecha de creación.
    guardarBorrador({ ...BASE, paso: 4 });
    vi.setSystemTime(t0 + VALIDEZ_MS + 60_000);
    expect(leerBorrador()).toBeNull();
  });

  it('un formulario nuevo (otra clave) empieza su propio plazo', () => {
    vi.useFakeTimers();
    const t0 = Date.parse('2026-09-26T12:00:00Z');
    vi.setSystemTime(t0);
    instalar(almacenFalso());
    guardarBorrador(BASE);
    vi.setSystemTime(t0 + VALIDEZ_MS - 60_000);
    guardarBorrador({ ...BASE, clave: '22222222-2222-4222-8222-222222222222' });
    vi.setSystemTime(t0 + VALIDEZ_MS + 60_000);
    expect(leerBorrador()?.clave).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('al restaurar descarta las fotos cuyo vale de 24 h ya venció o no se sabe cuándo se subieron', () => {
    vi.useFakeTimers();
    const ahora = Date.parse('2026-09-26T12:00:00Z');
    vi.setSystemTime(ahora);
    const almacen = almacenFalso();
    instalar(almacen);
    almacen.setItem(
      CLAVE,
      JSON.stringify({
        ...BASE,
        formato: 2,
        guardado_en: ahora,
        creado_en: ahora,
        fotos: [
          { objeto_key: 'vieja.jpg', url: '/v', subida_en: ahora - 24 * HORA },
          { objeto_key: 'justa.jpg', url: '/j', subida_en: ahora - VALIDEZ_FOTO_MS - 1000 },
          { objeto_key: 'nueva.jpg', url: '/n', subida_en: ahora - HORA },
          { objeto_key: 'sin-fecha.jpg', url: '/s' },
        ],
      }),
    );
    expect(leerBorrador()?.fotos.map((f) => f.objeto_key)).toEqual(['nueva.jpg']);
    expect(VALIDEZ_FOTO_MS).toBe(23 * HORA);
  });

  describe('fecha del evento restaurada', () => {
    const tz = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = 'America/La_Paz';
    });
    afterAll(() => {
      process.env.TZ = tz;
    });

    it('una fecha de hoy guardada como mediodía UTC no se restaura en el futuro', () => {
      vi.useFakeTimers();
      // 07:00 en Santa Cruz (11:00 UTC): el mediodía UTC de hoy todavía no llegó.
      const ahora = new Date(2026, 8, 26, 7, 0).getTime();
      vi.setSystemTime(ahora);
      const almacen = almacenFalso();
      instalar(almacen);
      almacen.setItem(
        CLAVE,
        JSON.stringify({
          ...BASE,
          formato: 2,
          guardado_en: ahora,
          valores: { ...BASE.valores, evento_en: '2026-09-26T12:00:00.000Z' },
        }),
      );
      const evento = leerBorrador()?.valores.evento_en;
      expect(typeof evento).toBe('string');
      expect(Date.parse(evento as string)).toBeLessThanOrEqual(ahora);
      expect(new Date(evento as string).getDate()).toBe(26);
    });
  });

  it('un borrador recién abierto no cuenta como algo que retomar', () => {
    const vacio: Borrador = {
      guardado_en: Date.now(),
      creado_en: Date.now(),
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
