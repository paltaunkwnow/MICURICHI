import { CONFIG_DOMINIO, dentroDelRadio, distanciaMetros } from 'contracts';
import { describe, expect, it } from 'vitest';
import {
  coordenadasEscritas,
  desplazar,
  encuadreDelPaso1,
  limitesDelCirculo,
  moverDentroDelRadio,
  PASO_BOTON_M,
  poligonoDelCirculo,
  puntoInicial,
  puntoYaElegido,
  RADIO_M,
  recortarAlCirculo,
} from './radio';

/** Posición del teléfono, en Santa Cruz. */
const ANCLA = { lat: -17.7833, lon: -63.1821 };
/** Metros por grado de latitud con el radio de `distanciaMetros`. */
const M_POR_GRADO = (6_371_008.8 * Math.PI) / 180;

function alNorte(metros: number, desde = ANCLA) {
  return { lat: desde.lat + metros / M_POR_GRADO, lon: desde.lon };
}
function alNoreste(metros: number) {
  const lado = metros / Math.SQRT2;
  return {
    lat: ANCLA.lat + lado / M_POR_GRADO,
    lon: ANCLA.lon + lado / (M_POR_GRADO * Math.cos((ANCLA.lat * Math.PI) / 180)),
  };
}
const rumbo = (p: { lat: number; lon: number }) =>
  (Math.atan2((p.lon - ANCLA.lon) * Math.cos((ANCLA.lat * Math.PI) / 180), p.lat - ANCLA.lat) *
    180) /
  Math.PI;

describe('el radio del reporte', () => {
  it('es el del contrato: 60 m', () => {
    expect(RADIO_M).toBe(CONFIG_DOMINIO.REPORTE_RADIO_DISPOSITIVO_M);
    expect(RADIO_M).toBe(60);
  });
});

describe('recortar el punto al círculo', () => {
  it('un punto a 100 m al norte queda en el borde del círculo, en la misma dirección', () => {
    const recortado = recortarAlCirculo(alNorte(100), ANCLA);
    const d = distanciaMetros(recortado, ANCLA);
    expect(d).toBeLessThanOrEqual(60);
    expect(d).toBeGreaterThan(59.9);
    expect(recortado.lon).toBeCloseTo(ANCLA.lon, 9);
    expect(recortado.lat).toBeGreaterThan(ANCLA.lat);
    // El servidor mide con la misma cuenta: el borde no puede volver rechazado.
    expect(dentroDelRadio(recortado, ANCLA)).toBe(true);
  });

  it('en diagonal conserva el rumbo', () => {
    const lejos = alNoreste(250);
    const recortado = recortarAlCirculo(lejos, ANCLA);
    expect(dentroDelRadio(recortado, ANCLA)).toBe(true);
    expect(distanciaMetros(recortado, ANCLA)).toBeGreaterThan(59.9);
    expect(rumbo(recortado)).toBeCloseTo(rumbo(lejos), 3);
  });

  it('un punto de adentro no se toca', () => {
    const cerca = alNorte(30);
    expect(recortarAlCirculo(cerca, ANCLA)).toEqual(cerca);
    const borde = alNorte(60);
    expect(recortarAlCirculo(borde, ANCLA)).toEqual(borde);
  });

  it('a kilómetros también cae adentro', () => {
    const recortado = recortarAlCirculo({ lat: -17.9, lon: -63.3 }, ANCLA);
    expect(dentroDelRadio(recortado, ANCLA)).toBe(true);
  });
});

describe('mover el punto con los botones y las flechas', () => {
  it('«mover 5 m» al este desplaza 5 m sin cambiar la latitud', () => {
    expect(PASO_BOTON_M).toBe(5);
    const movido = desplazar(ANCLA, 'este', PASO_BOTON_M);
    expect(movido.lat).toBe(ANCLA.lat);
    expect(distanciaMetros(movido, ANCLA)).toBeCloseTo(5, 2);
  });

  it('cada dirección va para su lado', () => {
    expect(desplazar(ANCLA, 'norte', 5).lat).toBeGreaterThan(ANCLA.lat);
    expect(desplazar(ANCLA, 'sur', 5).lat).toBeLessThan(ANCLA.lat);
    expect(desplazar(ANCLA, 'este', 5).lon).toBeGreaterThan(ANCLA.lon);
    expect(desplazar(ANCLA, 'oeste', 5).lon).toBeLessThan(ANCLA.lon);
  });

  it('en el borde, moverse hacia afuera no saca el punto del círculo', () => {
    const casiBorde = alNorte(58);
    const movido = moverDentroDelRadio(casiBorde, 'norte', 5, ANCLA);
    expect(dentroDelRadio(movido, ANCLA)).toBe(true);
    expect(distanciaMetros(movido, ANCLA)).toBeGreaterThan(59.9);
  });
});

describe('el círculo que se dibuja', () => {
  it('es un anillo cerrado con todos sus vértices a 60 m del ancla', () => {
    const anillo = poligonoDelCirculo(ANCLA, RADIO_M);
    expect(anillo.length).toBeGreaterThan(32);
    expect(anillo[0]).toEqual(anillo.at(-1));
    for (const [lon, lat] of anillo) {
      expect(distanciaMetros({ lat, lon }, ANCLA)).toBeCloseTo(60, 0);
    }
  });
});

describe('el encuadre del mapa', () => {
  it('abarca el círculo entero: cada borde a 60 m del ancla', () => {
    const [[oeste, sur], [este, norte]] = limitesDelCirculo(ANCLA);
    expect(distanciaMetros({ lat: norte, lon: ANCLA.lon }, ANCLA)).toBeCloseTo(60, 1);
    expect(distanciaMetros({ lat: sur, lon: ANCLA.lon }, ANCLA)).toBeCloseTo(60, 1);
    expect(distanciaMetros({ lat: ANCLA.lat, lon: este }, ANCLA)).toBeCloseTo(60, 1);
    expect(distanciaMetros({ lat: ANCLA.lat, lon: oeste }, ANCLA)).toBeCloseTo(60, 1);
  });

  it('si el punto quedó afuera del círculo, también lo muestra', () => {
    expect(encuadreDelPaso1(ANCLA, alNorte(30))).toEqual(limitesDelCirculo(ANCLA));
    const lejos = alNorte(150);
    const [[, sur], [, norte]] = encuadreDelPaso1(ANCLA, lejos);
    expect(norte).toBe(lejos.lat);
    expect(sur).toBe(limitesDelCirculo(ANCLA)[0][1]);
  });
});

describe('escribir las coordenadas', () => {
  const texto = (p: { lat: number; lon: number }) => [p.lat.toFixed(7), p.lon.toFixed(7)] as const;

  it('a 80 m se rechazan y se dice a cuánto está', () => {
    const r = coordenadasEscritas(...texto(alNorte(80)), ANCLA);
    expect(r.tipo).toBe('lejos');
    if (r.tipo !== 'lejos') return;
    expect(r.distanciaM).toBe(80);
    expect(r.mensaje).toContain('Ese punto está a 80 m de vos');
    expect(r.mensaje).toContain('60 m');
  });

  it('a 40 m se aceptan, con la distancia', () => {
    const r = coordenadasEscritas(...texto(alNorte(40)), ANCLA);
    expect(r.tipo).toBe('ok');
    if (r.tipo !== 'ok') return;
    expect(r.distanciaM).toBe(40);
    expect(dentroDelRadio(r.punto, ANCLA)).toBe(true);
  });

  it('aceptan la coma decimal', () => {
    const [lat, lon] = texto(alNorte(10));
    expect(coordenadasEscritas(lat.replace('.', ','), lon.replace('.', ','), ANCLA).tipo).toBe(
      'ok',
    );
  });

  it('lo que no son coordenadas lo dice sin medir nada', () => {
    const r = coordenadasEscritas('abc', '-63', ANCLA);
    expect(r.tipo).toBe('invalida');
    expect(coordenadasEscritas('-95', '-63', ANCLA).tipo).toBe('invalida');
  });
});

describe('dónde arranca el punto cuando llega la ubicación', () => {
  it('sin nada guardado, en la posición del teléfono', () => {
    const r = puntoInicial({ ancla: ANCLA, guardado: null, enlace: null });
    expect(r.punto).toEqual({ lat: ANCLA.lat, lon: ANCLA.lon, precargada: true });
    expect(r.aviso).toBeNull();
  });

  it('el punto ya elegido se conserva si sigue a 60 m o menos', () => {
    const guardado = { ...alNorte(45), precargada: false };
    const r = puntoInicial({ ancla: ANCLA, guardado, enlace: null });
    // La misma referencia: así no se vuelve a preguntar la unidad vecinal.
    expect(r.punto).toBe(guardado);
    expect(r.aviso).toBeNull();
  });

  it('el punto ya elegido que quedó lejos vuelve a la posición del teléfono y lo dice', () => {
    const r = puntoInicial({ ancla: ANCLA, guardado: alNorte(150), enlace: null });
    expect(r.punto.lat).toBe(ANCLA.lat);
    expect(r.aviso).toContain('150 m');
  });

  it('«Me pasa a mí» usa el punto del enlace solo si está a 60 m o menos', () => {
    const cerca = alNorte(50);
    const r = puntoInicial({ ancla: ANCLA, guardado: null, enlace: cerca });
    expect(r.punto).toEqual({ ...cerca, precargada: true });
    expect(r.aviso).toBeNull();

    const lejos = puntoInicial({ ancla: ANCLA, guardado: null, enlace: alNorte(80) });
    expect(lejos.punto).toEqual({ lat: ANCLA.lat, lon: ANCLA.lon, precargada: true });
    expect(lejos.aviso).toContain('El punto del enlace queda a 80 m de vos');
  });

  it('lo que la persona ya eligió manda sobre el enlace', () => {
    const guardado = alNorte(20);
    expect(puntoInicial({ ancla: ANCLA, guardado, enlace: alNorte(-20) }).punto).toBe(guardado);
  });
});

describe('qué cuenta como elegido al volver a compartir la ubicación', () => {
  /** El punto que puso la app en la posición del teléfono del paso 1. */
  const puesto = { lat: ANCLA.lat, lon: ANCLA.lon, precargada: true };
  /** El teléfono, al volver a compartir la ubicación desde 40 m al norte. */
  const telefonoNuevo = alNorte(40);

  it('el punto que puso la app y nadie aceptó todavía se recalcula', () => {
    expect(puntoYaElegido(puesto, { aceptado: false })).toBeNull();
    expect(puntoYaElegido(null, { aceptado: true })).toBeNull();
  });

  it('el que la persona movió cuenta siempre', () => {
    const movido = alNorte(10);
    expect(puntoYaElegido(movido, { aceptado: false })).toBe(movido);
  });

  it('el que aceptó con «Continuar» no se muda a la posición nueva del teléfono', () => {
    // Un 422 de la posición, un borrador retomado o una posición vencida vuelven a pedir la
    // ubicación con el resto ya contestado: el punto aceptado es el lugar del agua.
    const r = puntoInicial({
      ancla: telefonoNuevo,
      guardado: puntoYaElegido(puesto, { aceptado: true }),
      enlace: null,
    });
    expect(r.punto).toBe(puesto);
    expect(r.aviso).toBeNull();
  });

  it('si el punto aceptado quedó fuera del círculo nuevo, se mueve y se dice', () => {
    const r = puntoInicial({
      ancla: alNorte(90),
      guardado: puntoYaElegido(puesto, { aceptado: true }),
      enlace: null,
    });
    expect(r.punto.lat).toBe(alNorte(90).lat);
    expect(r.aviso).toContain('El punto que habías elegido queda a 90 m');
  });
});
