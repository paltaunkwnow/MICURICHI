import { CONFIG_DOMINIO } from 'contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANTIGUEDAD_MAX_S,
  antiguedadSegundos,
  ControladorUbicacion,
  DispositivoCongelado,
  decidirEnvio,
  dispositivoDe,
  type EntornoUbicacion,
  ESPERA_PRECISION_MS,
  type LecturaDispositivo,
  lecturaDe,
  PRECISION_MAX_M,
  TIEMPO_RELECTURA_MS,
  ubicacionSiHayPermiso,
} from './ubicacion-dispositivo';

const ANCLA = { lat: -17.7833, lon: -63.1821 };
const M_POR_GRADO = (6_371_008.8 * Math.PI) / 180;
const alNorte = (metros: number, desde = ANCLA) => ({
  lat: desde.lat + metros / M_POR_GRADO,
  lon: desde.lon,
});

const T0 = Date.parse('2026-09-26T15:00:00Z');

function posicion(
  p: { lat: number; lon: number },
  accuracy: number,
  timestamp = Date.now(),
): GeolocationPosition {
  return {
    coords: { latitude: p.lat, longitude: p.lon, accuracy } as GeolocationCoordinates,
    timestamp,
  } as GeolocationPosition;
}

function errorGeo(code: 1 | 2 | 3): GeolocationPositionError {
  return {
    code,
    message: 'simulado',
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  } as GeolocationPositionError;
}

/** `navigator.geolocation` falso: guarda los callbacks para emitir lecturas y errores a mano. */
function geoFalsa() {
  let ok: PositionCallback = () => {};
  let fallo: PositionErrorCallback = () => {};
  let siguiente = 0;
  const watchPosition = vi.fn(
    (a: PositionCallback, b?: PositionErrorCallback | null, _opciones?: PositionOptions) => {
      ok = a;
      fallo = b ?? (() => {});
      siguiente += 1;
      return siguiente;
    },
  );
  const clearWatch = vi.fn();
  const getCurrentPosition = vi.fn();
  return {
    geo: { watchPosition, clearWatch, getCurrentPosition },
    emitir: (p: GeolocationPosition) => ok(p),
    fallar: (code: 1 | 2 | 3) => fallo(errorGeo(code)),
  };
}

class PermisoFalso extends EventTarget {
  constructor(public state: PermissionState) {
    super();
  }
  cambiar(s: PermissionState) {
    this.state = s;
    this.dispatchEvent(new Event('change'));
  }
}

function entornoCon(
  geo: EntornoUbicacion['geolocalizacion'],
  permiso?: PermisoFalso,
  seguro = true,
): () => EntornoUbicacion {
  return () => ({
    seguro,
    geolocalizacion: geo,
    permisos: permiso
      ? { query: vi.fn(async () => permiso as unknown as PermissionStatus) }
      : undefined,
  });
}

const lectura = (
  p: { lat: number; lon: number },
  precisionM: number,
  tomadaEn = Date.now(),
): LecturaDispositivo => ({ lat: p.lat, lon: p.lon, precisionM, tomadaEn });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('los topes son los del contrato', () => {
  it('precisión de 50 m, antigüedad de 600 s y 30 s para llegar a la precisión', () => {
    expect(PRECISION_MAX_M).toBe(CONFIG_DOMINIO.PRECISION_DISPOSITIVO_MAX_M);
    expect(ANTIGUEDAD_MAX_S).toBe(CONFIG_DOMINIO.POSICION_ANTIGUEDAD_MAX_S);
    expect(ESPERA_PRECISION_MS).toBe(30_000);
  });
});

describe('pedir la ubicación: solo al tocar «Compartir mi ubicación»', () => {
  it('crear el controlador (lo que pasa al montar) no toca el navegador', () => {
    const entorno = vi.fn(entornoCon(geoFalsa().geo));
    const c = new ControladorUbicacion({ entorno });
    expect(c.leer()).toEqual({ fase: 'inactiva' });
    expect(entorno).not.toHaveBeenCalled();
  });

  it('al compartir vigila la posición con alta precisión y sin posiciones guardadas', () => {
    const g = geoFalsa();
    const c = new ControladorUbicacion({ entorno: entornoCon(g.geo) });
    c.compartir();
    expect(g.geo.watchPosition).toHaveBeenCalledTimes(1);
    expect(g.geo.watchPosition.mock.calls[0]?.[2]).toEqual({
      enableHighAccuracy: true,
      maximumAge: 0,
    });
    expect(c.leer()).toEqual({ fase: 'buscando', ultima: null });
  });

  it('muestra la precisión actual mientras no llega a 50 m, y se ancla al llegar', () => {
    const g = geoFalsa();
    const c = new ControladorUbicacion({ entorno: entornoCon(g.geo) });
    c.compartir();
    g.emitir(posicion(ANCLA, 120));
    expect(c.leer()).toMatchObject({ fase: 'buscando', ultima: { precisionM: 120 } });
    g.emitir(posicion(ANCLA, 50));
    const e = c.leer();
    expect(e.fase).toBe('lista');
    if (e.fase !== 'lista') return;
    expect(e.ancla).toMatchObject({ lat: ANCLA.lat, lon: ANCLA.lon, precisionM: 50 });
    // Con el ancla puesta se deja de vigilar: el GPS encendido gasta batería.
    expect(g.geo.clearWatch).toHaveBeenCalledWith(1);
  });

  it('si en 30 s no llega a la precisión, se detiene y lo dice con la última lectura', () => {
    const g = geoFalsa();
    const c = new ControladorUbicacion({ entorno: entornoCon(g.geo) });
    c.compartir();
    g.emitir(posicion(ANCLA, 200));
    vi.advanceTimersByTime(ESPERA_PRECISION_MS - 1);
    expect(c.leer().fase).toBe('buscando');
    vi.advanceTimersByTime(1);
    expect(c.leer()).toMatchObject({ fase: 'imprecisa', ultima: { precisionM: 200 } });
    expect(g.geo.clearWatch).toHaveBeenCalled();
    // Una lectura tardía de la vigilancia vieja no cambia nada.
    g.emitir(posicion(ANCLA, 10));
    expect(c.leer().fase).toBe('imprecisa');
  });

  it('«Reintentar» vuelve a vigilar', () => {
    const g = geoFalsa();
    const c = new ControladorUbicacion({ entorno: entornoCon(g.geo) });
    c.compartir();
    vi.advanceTimersByTime(ESPERA_PRECISION_MS);
    expect(c.leer()).toEqual({ fase: 'imprecisa', ultima: null });
    c.compartir();
    expect(g.geo.watchPosition).toHaveBeenCalledTimes(2);
    g.emitir(posicion(ANCLA, 8));
    expect(c.leer().fase).toBe('lista');
  });

  it('sin señal (POSITION_UNAVAILABLE) sigue esperando hasta el plazo', () => {
    const g = geoFalsa();
    const c = new ControladorUbicacion({ entorno: entornoCon(g.geo) });
    c.compartir();
    g.fallar(2);
    expect(c.leer().fase).toBe('buscando');
    vi.advanceTimersByTime(ESPERA_PRECISION_MS);
    expect(c.leer()).toEqual({ fase: 'imprecisa', ultima: null });
  });

  it('con el permiso negado (NotAllowed) queda bloqueado y vigila el permiso', async () => {
    const g = geoFalsa();
    const permiso = new PermisoFalso('denied');
    const entorno = entornoCon(g.geo, permiso);
    const c = new ControladorUbicacion({ entorno });
    c.compartir();
    g.fallar(1);
    expect(c.leer()).toEqual({ fase: 'denegada' });
    expect(g.geo.clearWatch).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    // Al habilitarlo en los ajustes del sitio, sigue solo: sin volver a tocar nada.
    permiso.cambiar('granted');
    expect(g.geo.watchPosition).toHaveBeenCalledTimes(2);
    expect(c.leer().fase).toBe('buscando');
  });

  it('si el permiso vuelve a «preguntar», ofrece de nuevo el botón', async () => {
    const g = geoFalsa();
    const permiso = new PermisoFalso('denied');
    const c = new ControladorUbicacion({ entorno: entornoCon(g.geo, permiso) });
    c.compartir();
    g.fallar(1);
    await vi.advanceTimersByTimeAsync(0);
    permiso.cambiar('prompt');
    expect(c.leer()).toEqual({ fase: 'inactiva' });
    expect(g.geo.watchPosition).toHaveBeenCalledTimes(1);
  });

  it('sin https no pide nada y lo dice', () => {
    const g = geoFalsa();
    const c = new ControladorUbicacion({ entorno: entornoCon(g.geo, undefined, false) });
    c.compartir();
    expect(c.leer()).toEqual({ fase: 'error', problema: 'inseguro' });
    expect(g.geo.watchPosition).not.toHaveBeenCalled();
  });

  it('un navegador sin geolocalización va a su propia rama', () => {
    const c = new ControladorUbicacion({ entorno: entornoCon(undefined) });
    c.compartir();
    expect(c.leer()).toEqual({ fase: 'error', problema: 'sin-soporte' });
  });

  it('detener apaga la vigilancia, el plazo y la escucha del permiso', async () => {
    const g = geoFalsa();
    const permiso = new PermisoFalso('denied');
    const c = new ControladorUbicacion({ entorno: entornoCon(g.geo, permiso) });
    c.compartir();
    g.fallar(1);
    await vi.advanceTimersByTimeAsync(0);
    c.detener();
    permiso.cambiar('granted');
    expect(g.geo.watchPosition).toHaveBeenCalledTimes(1);

    const g2 = geoFalsa();
    const c2 = new ControladorUbicacion({ entorno: entornoCon(g2.geo) });
    c2.compartir();
    c2.detener();
    expect(g2.geo.clearWatch).toHaveBeenCalledWith(1);
    g2.emitir(posicion(ANCLA, 5));
    vi.advanceTimersByTime(ESPERA_PRECISION_MS);
    expect(c2.leer().fase).not.toBe('lista');
    expect(c2.leer().fase).not.toBe('imprecisa');
  });
});

describe('releer la posición al enviar', () => {
  function anclado(g: ReturnType<typeof geoFalsa>) {
    const c = new ControladorUbicacion({ entorno: entornoCon(g.geo) });
    c.compartir();
    g.emitir(posicion(ANCLA, 10));
    return c;
  }

  it('pide una posición nueva, precisa y sin caché, y mueve el ancla', async () => {
    const g = geoFalsa();
    const c = anclado(g);
    g.geo.getCurrentPosition.mockImplementation((ok: PositionCallback) =>
      ok(posicion(alNorte(20), 12)),
    );
    const l = await c.releer();
    expect(g.geo.getCurrentPosition.mock.calls[0]?.[2]).toEqual({
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: TIEMPO_RELECTURA_MS,
    });
    expect(l).toMatchObject({ precisionM: 12 });
    const e = c.leer();
    expect(e.fase === 'lista' && e.ancla.lat).toBeCloseTo(alNorte(20).lat, 9);
  });

  it('una relectura imprecisa, fallida o que no contesta no sirve', async () => {
    const g = geoFalsa();
    const c = anclado(g);
    g.geo.getCurrentPosition.mockImplementationOnce((ok: PositionCallback) =>
      ok(posicion(ANCLA, 80)),
    );
    await expect(c.releer()).resolves.toBeNull();
    g.geo.getCurrentPosition.mockImplementationOnce(
      (_ok: PositionCallback, mal: PositionErrorCallback) => mal(errorGeo(3)),
    );
    await expect(c.releer()).resolves.toBeNull();
    g.geo.getCurrentPosition.mockImplementationOnce(() => {});
    const colgada = c.releer();
    await vi.advanceTimersByTimeAsync(TIEMPO_RELECTURA_MS + 3_000);
    await expect(colgada).resolves.toBeNull();
    // El ancla de antes sigue en pie.
    expect(c.leer()).toMatchObject({ fase: 'lista', ancla: { precisionM: 10 } });
  });
});

describe('la antigüedad de la posición', () => {
  it('son los segundos desde la lectura', () => {
    expect(antiguedadSegundos(T0 - 3_400, T0)).toBe(3);
    expect(antiguedadSegundos(T0 - 601_000, T0)).toBe(601);
  });

  it('un timestamp del futuro da 0, y uno que no es número también', () => {
    expect(antiguedadSegundos(T0 + 5_000, T0)).toBe(0);
    expect(antiguedadSegundos(Number.NaN, T0)).toBe(0);
    expect(dispositivoDe(lectura(ANCLA, 10, T0 + 90_000), T0).antiguedad_s).toBe(0);
  });

  it('una lectura sin hora usa la de llegada, y una sin precisión no sirve', () => {
    const sinHora = lecturaDe(posicion(ANCLA, 10, Number.NaN), T0);
    expect(sinHora?.tomadaEn).toBe(T0);
    expect(lecturaDe(posicion(ANCLA, Number.NaN), T0)).toBeNull();
    expect(lecturaDe(posicion({ lat: Number.NaN, lon: 1 }, 5), T0)).toBeNull();
  });

  it('un timestamp viejo de la caché del SO o en segundos usa la hora de recepción', () => {
    const vieja = lecturaDe(posicion(ANCLA, 10, T0 - 700_000), T0);
    expect(vieja?.tomadaEn).toBe(T0);
    const enSegundos = lecturaDe(posicion(ANCLA, 10, Math.floor((T0 - 5_000) / 1000)), T0);
    expect(enSegundos?.tomadaEn).toBe(T0 - 5_000);
    const futura = lecturaDe(posicion(ANCLA, 10, T0 + 10_000), T0);
    expect(futura?.tomadaEn).toBe(T0);
  });

  it('lo que viaja es posición, precisión y antigüedad', () => {
    expect(dispositivoDe(lectura(ANCLA, 12.5, T0 - 4_000), T0)).toEqual({
      lat: ANCLA.lat,
      lon: ANCLA.lon,
      precision_m: 12.5,
      antiguedad_s: 4,
    });
  });
});

describe('antes de enviar', () => {
  const punto = { lat: ANCLA.lat, lon: ANCLA.lon };

  it('con una relectura buena y el punto adentro, se envía con ella', () => {
    const nueva = lectura(alNorte(10), 8, T0);
    const d = decidirEnvio({ punto, relectura: nueva, anterior: lectura(ANCLA, 10), ahora: T0 });
    expect(d).toEqual({ tipo: 'enviar', lectura: nueva });
  });

  it('moverse 70 m antes de enviar vuelve al paso 1 y dice cuánto', () => {
    const d = decidirEnvio({
      punto,
      relectura: lectura(alNorte(70), 8, T0),
      anterior: lectura(ANCLA, 10, T0 - 60_000),
      ahora: T0,
    });
    expect(d.tipo).toBe('movido');
    expect(d.tipo === 'movido' && d.movidoM).toBe(70);
  });

  it('si falla la relectura se usa la última vigente', () => {
    const anterior = lectura(ANCLA, 10, T0 - 100_000);
    expect(decidirEnvio({ punto, relectura: null, anterior, ahora: T0 })).toEqual({
      tipo: 'enviar',
      lectura: anterior,
    });
  });

  it('sin relectura y con la anterior vencida, hay que volver a compartir', () => {
    const anterior = lectura(ANCLA, 10, T0 - (ANTIGUEDAD_MAX_S + 1) * 1000);
    expect(decidirEnvio({ punto, relectura: null, anterior, ahora: T0 })).toEqual({
      tipo: 'vencida',
    });
    expect(decidirEnvio({ punto, relectura: null, anterior: null, ahora: T0 })).toEqual({
      tipo: 'vencida',
    });
  });

  it('una relectura imprecisa no cuenta', () => {
    const anterior = lectura(ANCLA, 10, T0 - 5_000);
    expect(
      decidirEnvio({ punto, relectura: lectura(alNorte(300), 90, T0), anterior, ahora: T0 }),
    ).toEqual({ tipo: 'enviar', lectura: anterior });
  });
});

describe('la antigüedad queda congelada para los reintentos', () => {
  it('el segundo envío lleva el mismo dispositivo que el primero', () => {
    const congelado = new DispositivoCongelado();
    expect(congelado.actual()).toBeNull();
    const primero = congelado.tomar(lectura(ANCLA, 10, T0 - 3_000), T0);
    expect(primero.antiguedad_s).toBe(3);
    // Un minuto después, con otra lectura: el reintento no cambia nada.
    const segundo = congelado.tomar(lectura(alNorte(5), 7, T0 + 50_000), T0 + 60_000);
    expect(segundo).toBe(primero);
    expect(congelado.actual()).toBe(primero);
    congelado.soltar();
    expect(congelado.actual()).toBeNull();
    expect(congelado.tomar(lectura(ANCLA, 10, T0 + 58_000), T0 + 60_000).antiguedad_s).toBe(2);
  });
});

describe('«Ir a mi ubicación» del mapa: nunca dispara el aviso del navegador', () => {
  function geoQueResponde() {
    const g = geoFalsa();
    g.geo.getCurrentPosition.mockImplementation((ok: PositionCallback) => ok(posicion(ANCLA, 25)));
    return g;
  }

  it.each(['prompt', 'denied'] as const)(
    'con el permiso en «%s» no llama a la geolocalización',
    async (estado) => {
      const g = geoQueResponde();
      const r = await ubicacionSiHayPermiso(entornoCon(g.geo, new PermisoFalso(estado))());
      expect(r).toEqual({ tipo: 'sin-permiso' });
      expect(g.geo.getCurrentPosition).not.toHaveBeenCalled();
      expect(g.geo.watchPosition).not.toHaveBeenCalled();
    },
  );

  it('sin la API de permisos (no se puede saber) tampoco', async () => {
    const g = geoQueResponde();
    expect(await ubicacionSiHayPermiso(entornoCon(g.geo)())).toEqual({ tipo: 'sin-permiso' });
    expect(g.geo.getCurrentPosition).not.toHaveBeenCalled();
  });

  it('si la consulta del permiso falla, tampoco', async () => {
    const g = geoQueResponde();
    const r = await ubicacionSiHayPermiso({
      seguro: true,
      geolocalizacion: g.geo,
      permisos: { query: vi.fn(async () => Promise.reject(new TypeError('no'))) },
    });
    expect(r).toEqual({ tipo: 'sin-permiso' });
    expect(g.geo.getCurrentPosition).not.toHaveBeenCalled();
  });

  it('con el permiso ya concedido, lee la posición', async () => {
    const g = geoQueResponde();
    const r = await ubicacionSiHayPermiso(entornoCon(g.geo, new PermisoFalso('granted'))());
    expect(g.geo.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ tipo: 'lista', lectura: { lat: ANCLA.lat, precisionM: 25 } });
  });

  it('con permiso pero sin señal, lo dice como error', async () => {
    const g = geoFalsa();
    g.geo.getCurrentPosition.mockImplementation(
      (_ok: PositionCallback, mal: PositionErrorCallback) => mal(errorGeo(2)),
    );
    const r = await ubicacionSiHayPermiso(entornoCon(g.geo, new PermisoFalso('granted'))());
    expect(r).toEqual({ tipo: 'error' });
  });
});

describe('ubicación aproximada (ADR 0007)', () => {
  it('«Reportar con ubicación aproximada» se ancla a la última lectura aunque sea imprecisa', () => {
    const g = geoFalsa();
    const c = new ControladorUbicacion({ entorno: entornoCon(g.geo) });
    c.compartir();
    g.emitir(posicion(ANCLA, 178));
    expect(c.leer()).toMatchObject({ fase: 'buscando', ultima: { precisionM: 178 } });
    c.aproximar();
    const e = c.leer();
    expect(e.fase).toBe('lista');
    if (e.fase !== 'lista') return;
    expect(e.aproximada).toBe(true);
    expect(e.ancla).toMatchObject({ lat: ANCLA.lat, lon: ANCLA.lon, precisionM: 178 });
    // Deja de vigilar: ya tiene su ancla y el GPS encendido gasta batería.
    expect(g.geo.clearWatch).toHaveBeenCalled();
  });

  it('sin ninguna lectura todavía, «aproximar» no hace nada', () => {
    const g = geoFalsa();
    const c = new ControladorUbicacion({ entorno: entornoCon(g.geo) });
    c.compartir();
    c.aproximar();
    expect(c.leer().fase).toBe('buscando');
  });

  it('la relectura al enviar acepta cualquier precisión en modo aproximado', async () => {
    const g = geoFalsa();
    const c = new ControladorUbicacion({ entorno: entornoCon(g.geo) });
    c.compartir();
    g.emitir(posicion(ANCLA, 200));
    c.aproximar();
    g.geo.getCurrentPosition.mockImplementation((ok: PositionCallback) =>
      ok(posicion(alNorte(5), 220)),
    );
    await expect(c.releer(true)).resolves.toMatchObject({ precisionM: 220 });
    // Sin el modo aproximado, esa misma lectura imprecisa no sirve.
    g.geo.getCurrentPosition.mockImplementation((ok: PositionCallback) => ok(posicion(ANCLA, 220)));
    await expect(c.releer()).resolves.toBeNull();
  });

  it('decidirEnvio en modo aproximado solo mira la antigüedad, nunca el radio', () => {
    const punto = { lat: ANCLA.lat, lon: ANCLA.lon };
    // Relectura imprecisa y vigente: se envía con ella aunque no haya ancla anterior.
    const impre = lectura(alNorte(400), 300, T0);
    expect(
      decidirEnvio({ punto, relectura: impre, anterior: null, ahora: T0, aproximado: true }),
    ).toEqual({ tipo: 'enviar', lectura: impre });
    // Lejísimos del teléfono: nunca «movido», no hay radio en el camino aproximado.
    const lejos = decidirEnvio({
      punto,
      relectura: lectura(alNorte(5000), 300, T0),
      anterior: lectura(ANCLA, 300, T0),
      ahora: T0,
      aproximado: true,
    });
    expect(lejos.tipo).toBe('enviar');
    // Con la posición vencida y sin relectura, igual hay que volver a compartir.
    const vieja = lectura(ANCLA, 300, T0 - (ANTIGUEDAD_MAX_S + 1) * 1000);
    expect(
      decidirEnvio({ punto, relectura: null, anterior: vieja, ahora: T0, aproximado: true }),
    ).toEqual({ tipo: 'vencida' });
  });
});
