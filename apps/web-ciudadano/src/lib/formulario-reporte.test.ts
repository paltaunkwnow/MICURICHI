import { CONFIG_DOMINIO, type ReporteCrearEntrada, ReporteCrearSchema } from 'contracts';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  armarEnvio,
  campoFechaDesdeIso,
  camposSinLugar,
  centroDelPaso1,
  type EstadoParaAvanzar,
  isoDesdeCampoFecha,
  limitesFechaEvento,
  mosaicoDeFotos,
  pasoDelError,
  problemaFechaEvento,
  puedeAvanzar,
  respuestasSumidero,
  type Ubicacion,
  ubicacionDelEnlace,
  ubicacionDesdeGps,
  valoresIniciales,
} from './formulario-reporte';

/** Centro de la ciudad configurada (otra instalación, no Santa Cruz). */
const CENTRO_CIUDAD: [number, number] = [-66.157, -17.3895];

/**
 * Las fechas del evento se piensan en la hora de quien reporta. Se fija la de Santa Cruz para que
 * el resultado no dependa de la máquina que corre las pruebas (en CI suele ser UTC).
 */
const TZ_ORIGINAL = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'America/La_Paz';
});
afterAll(() => {
  process.env.TZ = TZ_ORIGINAL;
});

const PUNTO: Ubicacion = { lat: -17.78, lon: -63.18, metodo: 'manual', precisionM: null };

function estado(parcial: Partial<EstadoParaAvanzar> = {}): EstadoParaAvanzar {
  return {
    ubicacion: PUNTO,
    resuelto: { dentro_cobertura: true },
    resolviendo: false,
    profundidad_estimada: 'rodilla',
    frecuencia: 'ocasional',
    evento_en: null,
    descripcion: 'Se junta el agua en la esquina',
    subiendoFoto: false,
    enviando: false,
    ahora: new Date(2026, 8, 26, 10, 0),
    ...parcial,
  };
}

describe('paso 1: el punto elegido', () => {
  it('al volver al paso 1 (o al retomar un borrador) el mapa abre en el punto elegido', () => {
    const elegido: Ubicacion = { lat: -17.7, lon: -63.1, metodo: 'gps', precisionM: 8 };
    expect(centroDelPaso1(elegido, null, CENTRO_CIUDAD)).toEqual([-63.1, -17.7]);
    // El enlace «Me pasa a mí» no puede pisar lo que la persona ya eligió.
    expect(centroDelPaso1(elegido, { lat: -17.9, lon: -63.3 }, CENTRO_CIUDAD)).toEqual([
      -63.1, -17.7,
    ]);
  });

  it('sin punto elegido abre donde pide el enlace, y si no hay enlace en el centro de la ciudad', () => {
    expect(centroDelPaso1(null, { lat: -17.9, lon: -63.3 }, CENTRO_CIUDAD)).toEqual([-63.3, -17.9]);
    // El de la ciudad configurada, no un centro escrito en el código (antes, siempre Santa Cruz).
    expect(centroDelPaso1(null, null, CENTRO_CIUDAD)).toEqual(CENTRO_CIUDAD);
  });

  it('el enlace «Me pasa a mí» solo cuenta con coordenadas válidas', () => {
    expect(ubicacionDelEnlace('-17.78', '-63.18')).toEqual({ lat: -17.78, lon: -63.18 });
    expect(ubicacionDelEnlace(null, null)).toBeNull();
    expect(ubicacionDelEnlace('', '')).toBeNull();
    expect(ubicacionDelEnlace('0', '0')).toBeNull();
    expect(ubicacionDelEnlace('abc', '-63')).toBeNull();
    expect(ubicacionDelEnlace('-95', '-63')).toBeNull();
  });

  it('con el GPS, la ubicación llega como GPS y con su precisión', () => {
    const r = ubicacionDesdeGps({ latitude: -17.78, longitude: -63.18, accuracy: 12 });
    expect(r.aproximada).toBe(false);
    expect(r.ubicacion).toEqual({ lat: -17.78, lon: -63.18, metodo: 'gps', precisionM: 12 });
    // El borde que admite el contrato (`precision_gps_m` ≤ 10 000) sigue siendo GPS.
    expect(
      ubicacionDesdeGps({ latitude: 1, longitude: 2, accuracy: 10_000 }).ubicacion.metodo,
    ).toBe('gps');
  });

  it('una ubicación de más de 10 km de precisión (por IP) no se hace pasar por GPS', () => {
    const r = ubicacionDesdeGps({ latitude: -17.78, longitude: -63.18, accuracy: 25_000 });
    expect(r.aproximada).toBe(true);
    expect(r.ubicacion.metodo).toBe('manual');
    expect(r.ubicacion.precisionM).toBeNull();
  });

  it('una precisión que no es un número no viaja', () => {
    const r = ubicacionDesdeGps({ latitude: -17.78, longitude: -63.18, accuracy: Number.NaN });
    expect(r.ubicacion).toEqual({ lat: -17.78, lon: -63.18, metodo: 'gps', precisionM: null });
  });

  it('«Continuar» espera a que se resuelva la unidad vecinal del punto actual', () => {
    expect(puedeAvanzar(1, estado())).toBe(true);
    // Mientras se pregunta por el punto nuevo, la respuesta que haya es de otro punto.
    expect(puedeAvanzar(1, estado({ resolviendo: true }))).toBe(false);
    expect(puedeAvanzar(1, estado({ resuelto: null }))).toBe(false);
    expect(puedeAvanzar(1, estado({ ubicacion: null }))).toBe(false);
    expect(puedeAvanzar(1, estado({ resuelto: { dentro_cobertura: false } }))).toBe(false);
  });
});

describe('paso 2: la fecha del evento (contracts 0.6.0 rechaza futuras y de más de 365 días)', () => {
  it('el tope del calendario es el día de hoy en la hora local, no en UTC', () => {
    // 22:00 en Santa Cruz ya es el día siguiente en UTC.
    const ahora = new Date(2026, 8, 26, 22, 0);
    expect(limitesFechaEvento(ahora)).toEqual({ min: '2025-09-27', max: '2026-09-26' });
  });

  it('elegir «hoy» de madrugada manda la hora actual, no una fecha futura', () => {
    // 07:00 en Santa Cruz: el `T12:00:00Z` de antes eran las 08:00, una hora en el futuro.
    const ahora = new Date(2026, 8, 26, 7, 0);
    const iso = isoDesdeCampoFecha('2026-09-26', ahora);
    expect(iso).toBe(ahora.toISOString());
    expect(campoFechaDesdeIso(iso)).toBe('2026-09-26');
    expect(problemaFechaEvento(iso, ahora)).toBeNull();
    // Y también de noche, cuando en UTC ya es mañana.
    const noche = new Date(2026, 8, 26, 22, 30);
    expect(isoDesdeCampoFecha('2026-09-26', noche)).toBe(noche.toISOString());
  });

  it('un día pasado se guarda a mediodía local y se vuelve a leer como el mismo día', () => {
    const ahora = new Date(2026, 8, 26, 22, 0);
    const iso = isoDesdeCampoFecha('2026-09-20', ahora);
    expect(iso).toBe(new Date(2026, 8, 20, 12, 0).toISOString());
    expect(campoFechaDesdeIso(iso)).toBe('2026-09-20');
  });

  it('una fecha futura o de hace más de un año no deja continuar y lo dice', () => {
    const ahora = new Date(2026, 8, 26, 10, 0);
    const futura = isoDesdeCampoFecha('2026-09-27', ahora);
    const vieja = isoDesdeCampoFecha('2025-09-20', ahora);
    expect(problemaFechaEvento(futura, ahora)).toMatch(/posterior a hoy/);
    expect(problemaFechaEvento(vieja, ahora)).toMatch(/último año/);
    expect(puedeAvanzar(2, estado({ ahora, evento_en: futura }))).toBe(false);
    expect(puedeAvanzar(2, estado({ ahora, evento_en: vieja }))).toBe(false);
    expect(puedeAvanzar(2, estado({ ahora, evento_en: null }))).toBe(true);
  });

  describe('contra el contrato, con el reloj simulado', () => {
    afterEach(() => {
      vi.useRealTimers();
    });
    const aceptaElContrato = (iso: string | null) =>
      ReporteCrearSchema.shape.evento_en.safeParse(iso).success;

    it('el día más viejo del calendario lo acepta el contrato aunque se envíe a última hora', () => {
      vi.useFakeTimers();
      const ahora = new Date(2026, 8, 26, 23, 59);
      vi.setSystemTime(ahora);
      const { min } = limitesFechaEvento(ahora);
      expect(aceptaElContrato(isoDesdeCampoFecha(min, ahora))).toBe(true);
      // El día anterior ya queda fuera de EVENTO_MAX_DIAS_ATRAS: por eso el calendario no lo ofrece.
      const anterior = limitesFechaEvento(new Date(ahora.getTime() - 86_400_000)).min;
      const iso = isoDesdeCampoFecha(anterior, ahora);
      expect(aceptaElContrato(iso)).toBe(false);
      expect(problemaFechaEvento(iso, ahora)).toMatch(/último año/);
    });

    it('«hoy» lo acepta el contrato a cualquier hora del día', () => {
      vi.useFakeTimers();
      for (const hora of [0, 7, 12, 23]) {
        const ahora = new Date(2026, 8, 26, hora, 30);
        vi.setSystemTime(ahora);
        expect(aceptaElContrato(isoDesdeCampoFecha('2026-09-26', ahora)), `${hora}:30`).toBe(true);
      }
    });

    it('hacia el futuro tolera lo mismo que el contrato (deriva del reloj del teléfono)', () => {
      const ahora = new Date(2026, 8, 26, 10, 0);
      const en = (min: number) => new Date(ahora.getTime() + min * 60_000).toISOString();
      const tolerancia = CONFIG_DOMINIO.EVENTO_TOLERANCIA_FUTURO_MIN;
      expect(problemaFechaEvento(en(tolerancia - 1), ahora)).toBeNull();
      expect(problemaFechaEvento(en(tolerancia + 1), ahora)).toMatch(/posterior a hoy/);
    });
  });

  it('lo que no es una fecha completa no produce nada', () => {
    const ahora = new Date(2026, 8, 26, 10, 0);
    expect(isoDesdeCampoFecha('', ahora)).toBeNull();
    expect(isoDesdeCampoFecha('2026-02-31', ahora)).toBeNull();
    expect(campoFechaDesdeIso(null)).toBe('');
    expect(campoFechaDesdeIso('no es fecha')).toBe('');
  });

  it('un error lleva al paso de su campo, no a la revisión (TRASPASO §3.8)', () => {
    expect(pasoDelError(['evento_en'])).toBe(2);
    expect(pasoDelError(['descripcion', 'evento_en'])).toBe(2);
    expect(pasoDelError(['agua_brota_sumidero'])).toBe(3);
    expect(pasoDelError(['sumidero_estado'])).toBe(3);
    expect(pasoDelError(['lat'])).toBe(1);
    expect(pasoDelError(['fotos.0'])).toBe(3);
    expect(pasoDelError(['campo_desconocido'])).toBe(4);
  });

  it('lo que no tiene un control donde mostrarse se dice en la revisión', () => {
    expect(camposSinLugar(['evento_en', 'sitio_web', 'root', 'fotos.1'])).toEqual([
      'sitio_web',
      'root',
    ]);
    expect(camposSinLugar(['descripcion'])).toEqual([]);
  });
});

describe('paso 3: sumidero y fotos', () => {
  it('«el agua brota» empieza sin contestar, no en «no»', () => {
    const v = valoresIniciales();
    expect(v.agua_brota_sumidero).toBeNull();
    expect(v.sumidero_cercano).toBeNull();
    expect(v.sumidero_estado).toBeNull();
    // Cada llamada da un objeto nuevo: «Empezar de nuevo» no puede heredar lo del anterior.
    expect(valoresIniciales()).not.toBe(v);
    expect(valoresIniciales().fotos).not.toBe(v.fotos);
  });

  it('sin sumidero cerca no queda ni estado ni «brota» (contracts 0.6.0)', () => {
    expect(
      respuestasSumidero('no', { sumidero_estado: 'tapado', agua_brota_sumidero: true }),
    ).toEqual({ sumidero_cercano: 'no', sumidero_estado: null, agua_brota_sumidero: null });
  });

  it('con sumidero se conservan las respuestas; sin contestar se borra el estado', () => {
    expect(
      respuestasSumidero('si', { sumidero_estado: 'tapado', agua_brota_sumidero: true }),
    ).toEqual({ sumidero_cercano: 'si', sumidero_estado: 'tapado', agua_brota_sumidero: true });
    expect(
      respuestasSumidero(null, { sumidero_estado: 'tapado', agua_brota_sumidero: true }),
    ).toEqual({ sumidero_cercano: null, sumidero_estado: null, agua_brota_sumidero: true });
  });

  it('las fotos subidas y la que se está subiendo ocupan lugar; la cámara abierta no', () => {
    expect(mosaicoDeFotos({ subidas: 0, subiendo: false })).toEqual({
      completas: false,
      libres: 3,
    });
    expect(mosaicoDeFotos({ subidas: 2, subiendo: false })).toEqual({
      completas: false,
      libres: 1,
    });
    expect(mosaicoDeFotos({ subidas: 2, subiendo: true })).toEqual({ completas: true, libres: 0 });
    expect(
      mosaicoDeFotos({ subidas: CONFIG_DOMINIO.FOTOS_MAX_POR_REPORTE, subiendo: false }),
    ).toEqual({ completas: true, libres: 0 });
  });

  it('la foto es opcional: sin ninguna se puede continuar y enviar', () => {
    expect(mosaicoDeFotos({ subidas: 0, subiendo: false }).completas).toBe(false);
    expect(puedeAvanzar(3, estado())).toBe(true);
    expect(puedeAvanzar(4, estado())).toBe(true);
    const cuerpo = armarEnvio(
      {
        ...valoresIniciales(),
        lat: 0,
        lon: 0,
        ubicacion_metodo: 'gps',
        descripcion: 'Se junta el agua en la esquina',
        profundidad_estimada: 'rodilla',
        frecuencia: 'ocasional',
        ubicacion_tipo: 'via_publica',
      },
      PUNTO,
      [],
    );
    expect(cuerpo.fotos).toEqual([]);
    expect(ReporteCrearSchema.safeParse(cuerpo).success).toBe(true);
  });

  it('mientras sube una foto no se puede continuar ni enviar', () => {
    expect(puedeAvanzar(3, estado())).toBe(true);
    expect(puedeAvanzar(3, estado({ subiendoFoto: true }))).toBe(false);
    expect(puedeAvanzar(3, estado({ descripcion: 'corto' }))).toBe(false);
    expect(puedeAvanzar(4, estado())).toBe(true);
    expect(puedeAvanzar(4, estado({ subiendoFoto: true }))).toBe(false);
    expect(puedeAvanzar(4, estado({ enviando: true }))).toBe(false);
  });
});

describe('el envío', () => {
  // Los campos ocultos del formulario traen otra ubicación: la que vale es la del estado.
  const datos: ReporteCrearEntrada = {
    ...valoresIniciales(),
    lat: 0,
    lon: 0,
    ubicacion_metodo: 'gps',
    descripcion: 'Se junta el agua en la esquina',
    profundidad_estimada: 'rodilla',
    frecuencia: 'ocasional',
    ubicacion_tipo: 'via_publica',
  };

  it('la ubicación viaja desde el estado, sin la marca de precargada', () => {
    const cuerpo = armarEnvio(
      datos,
      { lat: -17.7, lon: -63.1, metodo: 'manual', precisionM: null, precargada: true },
      [{ objeto_key: 'a.jpg' }],
    );
    expect(cuerpo.lat).toBe(-17.7);
    expect(cuerpo.lon).toBe(-63.1);
    expect(cuerpo.ubicacion_metodo).toBe('manual');
    expect(cuerpo.precision_gps_m).toBeNull();
    expect(cuerpo.fotos).toEqual(['a.jpg']);
    expect(Object.keys(cuerpo)).not.toContain('precargada');
  });

  it('el sumidero sale coherente aunque algo incoherente haya quedado en el formulario', () => {
    const cuerpo = armarEnvio(
      { ...datos, sumidero_cercano: 'no', sumidero_estado: 'tapado', agua_brota_sumidero: true },
      PUNTO,
      [],
    );
    expect(cuerpo.sumidero_estado).toBeNull();
    expect(cuerpo.agua_brota_sumidero).toBeNull();
  });
});
