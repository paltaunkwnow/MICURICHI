import {
  BboxSchema,
  distanciaMetros,
  PaginacionSchema,
  type PuntoLatLon,
  RADIO_TIERRA_M,
  ReporteFiltrosSchema,
  type ReporteTecnicoFeature,
} from 'contracts';
import { describe, expect, it } from 'vitest';
import {
  avisoRecorte,
  cajaDeBusqueda,
  candidatosCercanos,
  descripcionCorta,
  etiquetaDistancia,
  etiquetaRadio,
  LIMITE_CANDIDATOS_FUSION,
  parametrosCandidatosFusion,
  puedeConfirmarFusion,
  RADIO_FUSION_INICIAL_M,
  RADIOS_FUSION_M,
  radiosMayores,
} from './fusion-cercana';

/**
 * Fusionar solo con reportes cercanos (T8): la caja que se manda a api-core, el filtro por la
 * distancia exacta, el orden y la exclusión del propio reporte. Todo puro, sin React ni red.
 */

/** Santa Cruz de la Sierra: el mismo punto que usan las demás pruebas del panel. */
const CENTRO: PuntoLatLon = { lat: -17.78, lon: -63.18 };
const PROPIO = '0b8f7c1e-3d2a-4b5c-8d9e-1f2a3b4c5d6e';

/**
 * Punto a `metros` del centro en el rumbo `grados` (0 = norte, 90 = este), sobre la misma esfera
 * que usa `distanciaMetros`: la distancia que da esa función entre los dos es `metros`.
 */
function aDistancia(centro: PuntoLatLon, metros: number, grados: number): PuntoLatLon {
  const d = metros / RADIO_TIERRA_M;
  const rumbo = (grados * Math.PI) / 180;
  const lat1 = (centro.lat * Math.PI) / 180;
  const lon1 = (centro.lon * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(rumbo),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(rumbo) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI };
}

/** Solo lo que lee `candidatosCercanos`; el resto del reporte no interviene. */
function reporte(
  id: string,
  punto: PuntoLatLon,
  extra: Partial<{
    estado: string;
    uv: string | null;
    descripcion: string;
  }> = {},
): ReporteTecnicoFeature {
  const uv = extra.uv === undefined ? '105' : extra.uv;
  return {
    type: 'Feature',
    id,
    geometry: { type: 'Point', coordinates: [punto.lon, punto.lat] },
    properties: {
      id,
      estado: extra.estado ?? 'validado',
      unidad_vecinal: uv === null ? null : { id: `unidad_vecinal:${uv}`, codigo: uv, nombre: uv },
      descripcion: extra.descripcion ?? 'Agua acumulada frente a la escuela',
    },
  } as unknown as ReporteTecnicoFeature;
}

const ID_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const ID_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const ID_C = 'cccccccc-0000-4000-8000-000000000003';
const ID_D = 'dddddddd-0000-4000-8000-000000000004';
const ID_E = 'eeeeeeee-0000-4000-8000-000000000005';

describe('radios de búsqueda', () => {
  it('son 100 m, 300 m y 1 km, y se empieza por 100 m', () => {
    expect(RADIOS_FUSION_M).toEqual([100, 300, 1000]);
    expect(RADIO_FUSION_INICIAL_M).toBe(100);
  });

  it('etiquetaRadio: metros hasta 300 y «1 km» para 1000', () => {
    expect(etiquetaRadio(100)).toBe('100 m');
    expect(etiquetaRadio(300)).toBe('300 m');
    expect(etiquetaRadio(1000)).toBe('1 km');
  });

  it('radiosMayores ofrece solo los radios mayores al vigente', () => {
    expect(radiosMayores(100)).toEqual([300, 1000]);
    expect(radiosMayores(300)).toEqual([1000]);
    expect(radiosMayores(1000)).toEqual([]);
  });
});

describe('cajaDeBusqueda', () => {
  it.each(RADIOS_FUSION_M)(
    '%i m: es un bbox válido para api-core (minLon,minLat,maxLon,maxLat)',
    (r) => {
      const caja = cajaDeBusqueda(CENTRO, r);
      // BboxSchema es el de contracts que usa api-core: formato, sin notación científica y min < max.
      const v = BboxSchema.safeParse(caja);
      expect(v.success, caja).toBe(true);
      expect(caja.split(',')).toHaveLength(4);
    },
  );

  it.each(RADIOS_FUSION_M)(
    '%i m: contiene todo el círculo, en todos los rumbos y a varias latitudes',
    (r) => {
      // Santa Cruz, el ecuador y latitudes medias y altas: el grado de longitud se achica con el coseno.
      for (const lat of [-17.78, 0, 35, -52]) {
        const centro = { lat, lon: -63.18 };
        const [minLon, minLat, maxLon, maxLat] = BboxSchema.parse(cajaDeBusqueda(centro, r));
        for (let rumbo = 0; rumbo < 360; rumbo += 5) {
          const p = aDistancia(centro, r, rumbo);
          // El generador es honesto: el punto está a r metros según la cuenta del radio de 60 m.
          expect(distanciaMetros(p, centro)).toBeCloseTo(r, 3);
          const dentro = p.lon >= minLon && p.lon <= maxLon && p.lat >= minLat && p.lat <= maxLat;
          expect(dentro, `lat ${lat}, rumbo ${rumbo}°`).toBe(true);
        }
      }
    },
  );

  it.each(RADIOS_FUSION_M)('%i m: no es mucho más grande que el círculo', (r) => {
    // Con un punto fuera de la cuadrícula, para que la alineación también se note.
    const centro = { lat: -17.783457, lon: -63.181235 };
    const [minLon, minLat, maxLon, maxLat] = BboxSchema.parse(cajaDeBusqueda(centro, r));
    const mPorGrado = (RADIO_TIERRA_M * Math.PI) / 180;
    const alto = ((maxLat - minLat) / 2) * mPorGrado;
    const ancho = ((maxLon - minLon) / 2) * mPorGrado * Math.cos((centro.lat * Math.PI) / 180);
    // Radio + 5 % de margen + una celda de la cuadrícula (~56 m) como mucho, no el doble.
    const celdaM = 0.0005 * mPorGrado;
    for (const mitad of [alto, ancho]) {
      expect(mitad).toBeGreaterThanOrEqual(r);
      expect(mitad).toBeLessThanOrEqual(r * 1.06 + celdaM);
    }
  });

  it('crece con el radio', () => {
    const [a0, b0, a1, b1] = BboxSchema.parse(cajaDeBusqueda(CENTRO, 100));
    const [c0, d0, c1, d1] = BboxSchema.parse(cajaDeBusqueda(CENTRO, 300));
    expect(c1 - c0).toBeGreaterThan(a1 - a0);
    expect(d1 - d0).toBeGreaterThan(b1 - b0);
  });

  it.each(RADIOS_FUSION_M)(
    '%i m: no lleva la coordenada exacta, que api-core registraría en su log',
    (r) => {
      // api-core registra la URL con su cadena de consulta (`registro.ts`), y supone que el bbox son
      // filtros del mapa. Una caja centrada en el punto exacto dejaría en el log la coordenada de una
      // vivienda: las aristas se alinean a una cuadrícula de 0,0005° (~56 m), tan poco precisa como
      // la vista pública (que desplaza hasta 30 m).
      for (const punto of [
        { lat: -17.783457, lon: -63.181235 },
        { lat: -17.790001, lon: -63.17999 },
        { lat: -17.7712, lon: -63.2105 },
      ]) {
        const caja = cajaDeBusqueda(punto, r);
        for (const arista of caja.split(',')) {
          expect(arista, `${caja} (${r} m)`).toMatch(/^-?\d+\.\d{3}[05]00$/);
          // Ni la latitud ni la longitud exactas aparecen en la caja.
          expect(arista).not.toBe(punto.lat.toFixed(6));
          expect(arista).not.toBe(punto.lon.toFixed(6));
        }
        const [minLon, minLat, maxLon, maxLat] = BboxSchema.parse(caja);
        // El centro de la caja no es el punto: de ahí no se lee dónde estaba.
        const delCentro = Math.max(
          Math.abs((minLon + maxLon) / 2 - punto.lon),
          Math.abs((minLat + maxLat) / 2 - punto.lat),
        );
        expect(delCentro).toBeGreaterThan(1e-5);
      }
    },
  );

  it('escribe seis decimales, sin notación científica ni exponentes', () => {
    for (const r of RADIOS_FUSION_M) {
      for (const n of cajaDeBusqueda(CENTRO, r).split(',')) {
        expect(n).toMatch(/^-?\d+\.\d{6}$/);
      }
    }
  });

  it('el mismo punto da siempre la misma caja', () => {
    expect(cajaDeBusqueda(CENTRO, 100)).toBe(cajaDeBusqueda({ ...CENTRO }, 100));
  });
});

describe('parametrosCandidatosFusion', () => {
  const params = parametrosCandidatosFusion(CENTRO, 100);

  it('pide validados, dentro de la caja, con el límite de la búsqueda', () => {
    expect(params).toEqual({
      estado: 'validado',
      bbox: cajaDeBusqueda(CENTRO, 100),
      limite: String(LIMITE_CANDIDATOS_FUSION),
    });
  });

  it('api-core acepta estos parámetros: pasan el esquema de filtros de contracts', () => {
    const v = ReporteFiltrosSchema.safeParse(params);
    expect(v.success, JSON.stringify(v.error?.issues)).toBe(true);
    expect(v.data?.estado).toEqual(['validado']);
  });

  it('el límite cabe en el máximo de contracts', () => {
    expect(PaginacionSchema.shape.limite.safeParse(String(LIMITE_CANDIDATOS_FUSION)).success).toBe(
      true,
    );
    expect(PaginacionSchema.shape.limite.safeParse('501').success).toBe(false);
  });
});

describe('candidatosCercanos', () => {
  const propio = { id: PROPIO, centro: CENTRO };

  it('deja solo los validados a 100 m o menos, del más cercano al más lejano', () => {
    const features = [
      reporte(ID_C, aDistancia(CENTRO, 99, 180)),
      reporte(ID_A, aDistancia(CENTRO, 35, 0)),
      // Dentro de la caja pero afuera del círculo: la esquina de la caja no cuenta.
      reporte(ID_D, aDistancia(CENTRO, 101.5, 270)),
      reporte(ID_B, aDistancia(CENTRO, 80, 90)),
      // Bien afuera: la API no lo devolvería con esta caja, y si lo hiciera no entra.
      reporte(ID_E, aDistancia(CENTRO, 250, 45)),
    ];
    const r = candidatosCercanos(features, propio, 100);
    expect(r.map((c) => c.id)).toEqual([ID_A, ID_B, ID_C]);
    expect(r.map((c) => Math.round(c.distanciaM))).toEqual([35, 80, 99]);
    // Del más cercano al más lejano.
    for (let i = 1; i < r.length; i++) {
      expect(r[i]?.distanciaM).toBeGreaterThan(r[i - 1]?.distanciaM ?? 0);
    }
  });

  it('el borde cuenta como adentro: a 100 m exactos entra; unos centímetros más allá, no', () => {
    const exacto = reporte(ID_A, aDistancia(CENTRO, 100, 0));
    const pasado = reporte(ID_B, aDistancia(CENTRO, 100.05, 0));
    expect(candidatosCercanos([exacto, pasado], propio, 100).map((c) => c.id)).toEqual([ID_A]);
  });

  it('un radio mayor suma los que están más lejos, sin perder los cercanos', () => {
    const features = [
      reporte(ID_A, aDistancia(CENTRO, 35, 0)),
      reporte(ID_D, aDistancia(CENTRO, 250, 270)),
      reporte(ID_E, aDistancia(CENTRO, 900, 45)),
    ];
    expect(candidatosCercanos(features, propio, 100).map((c) => c.id)).toEqual([ID_A]);
    expect(candidatosCercanos(features, propio, 300).map((c) => c.id)).toEqual([ID_A, ID_D]);
    expect(candidatosCercanos(features, propio, 1000).map((c) => c.id)).toEqual([ID_A, ID_D, ID_E]);
  });

  it('no incluye el propio reporte, tampoco con el id en mayúsculas', () => {
    const features = [
      reporte(PROPIO, CENTRO),
      reporte(PROPIO.toUpperCase(), CENTRO),
      reporte(ID_A, aDistancia(CENTRO, 10, 0)),
    ];
    expect(candidatosCercanos(features, propio, 100).map((c) => c.id)).toEqual([ID_A]);
    expect(candidatosCercanos(features, { ...propio, id: PROPIO.toUpperCase() }, 100)).toHaveLength(
      1,
    );
  });

  it('no incluye lo que no está validado, aunque la API lo mande', () => {
    const cerca = aDistancia(CENTRO, 10, 0);
    const features = ['nuevo', 'resuelto', 'duplicado', 'rechazado'].map((estado, i) =>
      reporte(`ffffffff-0000-4000-8000-00000000000${i}`, cerca, { estado }),
    );
    expect(candidatosCercanos(features, propio, 100)).toEqual([]);
  });

  it('cada candidato trae ID corto, UV, distancia y el comienzo de la descripción', () => {
    const [c] = candidatosCercanos(
      [
        reporte(ID_A, aDistancia(CENTRO, 35, 0), {
          uv: '105',
          descripcion: 'Agua   acumulada\nfrente a la escuela',
        }),
      ],
      propio,
      100,
    );
    expect(c).toMatchObject({
      id: ID_A,
      idCorto: 'aaaaaaaa',
      unidadVecinal: 'UV 105',
      descripcion: 'Agua acumulada frente a la escuela',
    });
    expect(c?.distanciaM).toBeCloseTo(35, 3);
  });

  it('un reporte sin UV se llama «Sin UV»', () => {
    const [c] = candidatosCercanos([reporte(ID_A, CENTRO, { uv: null })], propio, 100);
    expect(c?.unidadVecinal).toBe('Sin UV');
  });

  it('el mismo punto exacto entra con distancia 0', () => {
    const [c] = candidatosCercanos([reporte(ID_A, CENTRO)], propio, 100);
    expect(c?.distanciaM).toBe(0);
  });

  it('con la misma distancia ordena por id, siempre igual', () => {
    const p = aDistancia(CENTRO, 50, 0);
    const a = candidatosCercanos([reporte(ID_B, p), reporte(ID_A, p)], propio, 100);
    const b = candidatosCercanos([reporte(ID_A, p), reporte(ID_B, p)], propio, 100);
    expect(a.map((c) => c.id)).toEqual([ID_A, ID_B]);
    expect(b.map((c) => c.id)).toEqual([ID_A, ID_B]);
  });

  it('sin reportes devuelve una lista vacía y no modifica lo que recibe', () => {
    expect(candidatosCercanos([], propio, 100)).toEqual([]);
    const entrada = [
      reporte(ID_B, aDistancia(CENTRO, 90, 0)),
      reporte(ID_A, aDistancia(CENTRO, 10, 0)),
    ];
    const copia = [...entrada];
    candidatosCercanos(entrada, propio, 100);
    expect(entrada).toEqual(copia);
  });
});

describe('etiquetas de la lista', () => {
  it('etiquetaDistancia: «a 35 m», redondeada, y «en el mismo punto» si es menos de medio metro', () => {
    expect(etiquetaDistancia(35.4)).toBe('a 35 m');
    expect(etiquetaDistancia(34.6)).toBe('a 35 m');
    expect(etiquetaDistancia(99.9)).toBe('a 100 m');
    expect(etiquetaDistancia(1)).toBe('a 1 m');
    expect(etiquetaDistancia(0.4)).toBe('en el mismo punto');
    expect(etiquetaDistancia(0)).toBe('en el mismo punto');
  });

  it('descripcionCorta: una línea, sin espacios de más, con «…» si se corta', () => {
    expect(descripcionCorta('  Agua   en la\ncalle  ')).toBe('Agua en la calle');
    expect(descripcionCorta('')).toBe('');
    const larga = 'a'.repeat(100);
    const corta = descripcionCorta(larga);
    expect(corta).toBe(`${'a'.repeat(60)}…`);
    expect(descripcionCorta('a'.repeat(60))).toBe('a'.repeat(60));
  });
});

describe('avisoRecorte', () => {
  it('sin recorte (la API devolvió todo lo que cuenta) no hay aviso', () => {
    expect(avisoRecorte(12, 12)).toBeNull();
    expect(avisoRecorte(0, 0)).toBeNull();
  });

  it('si el total es mayor que lo recibido, avisa cuántos se ven de cuántos', () => {
    expect(avisoRecorte(100, 137)).toBe(
      'Se muestran los 100 más recientes de 137; puede haber más cerca.',
    );
  });
});

describe('puedeConfirmarFusion', () => {
  const candidato = {
    id: ID_A,
    idCorto: 'aaaaaaaa',
    unidadVecinal: 'UV 105',
    distanciaM: 35,
    descripcion: 'x',
  };

  it('«Confirmar fusión» solo se habilita con un reporte elegido de la lista', () => {
    expect(puedeConfirmarFusion(null, false)).toBe(false);
    expect(puedeConfirmarFusion(candidato, false)).toBe(true);
  });

  it('y no mientras hay otra petición en curso', () => {
    expect(puedeConfirmarFusion(candidato, true)).toBe(false);
    expect(puedeConfirmarFusion(null, true)).toBe(false);
  });
});
