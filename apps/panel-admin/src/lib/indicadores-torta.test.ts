import { describe, expect, it } from 'vitest';
import {
  agruparConOtros,
  COLOR_OTROS,
  calcularPorciones,
  caminoDona,
  ID_OTROS,
  type ItemConteo,
  leerEstadoTorta,
  ordenarDesc,
  ordenarSeveridades,
  PALETA_TORTA,
  paramsIndicadores,
  porcentajesEnteros,
  serializarEstadoTorta,
  urlBandejaUv,
} from './indicadores-torta';

function items(...pares: Array<[string, number]>): ItemConteo[] {
  return pares.map(([id, n]) => ({ id, nombre: id, n }));
}

describe('ordenarDesc', () => {
  it('de mayor a menor y deja fuera los de 0 reportes', () => {
    const r = ordenarDesc(items(['a', 2], ['b', 0], ['c', 5], ['d', 2]));
    expect(r.map((x) => x.id)).toEqual(['c', 'a', 'd']);
  });
});

describe('agruparConOtros (top N + Otros)', () => {
  it('con N o menos categorías no aparece «Otros»', () => {
    const r = agruparConOtros(items(['a', 3], ['b', 1]), 8, 'Otros');
    expect(r).toHaveLength(2);
    expect(r.some((x) => x.esOtros)).toBe(false);
  });

  it('con más de N, la cola se junta en una sola porción «Otros»', () => {
    const diez = items(
      ['a', 10],
      ['b', 9],
      ['c', 8],
      ['d', 7],
      ['e', 6],
      ['f', 5],
      ['g', 4],
      ['h', 3],
      ['i', 2],
      ['j', 1],
    );
    const r = agruparConOtros(diez, 8, 'Otros');
    expect(r).toHaveLength(9);
    const otros = r[8];
    expect(otros?.esOtros).toBe(true);
    expect(otros?.id).toBe(ID_OTROS);
    expect(otros?.n).toBe(3); // i(2) + j(1)
    expect(r.slice(0, 8).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  });
});

describe('porcentajesEnteros', () => {
  it('suman exactamente 100 repartiendo el resto a las mayores fracciones', () => {
    expect(porcentajesEnteros([1, 1, 1])).toEqual([34, 33, 33]);
    expect(porcentajesEnteros([2, 1, 1])).toEqual([50, 25, 25]);
    const p = porcentajesEnteros([7, 11, 5, 1]);
    expect(p.reduce((s, v) => s + v, 0)).toBe(100);
  });

  it('con total 0 son todos 0', () => {
    expect(porcentajesEnteros([0, 0])).toEqual([0, 0]);
  });
});

describe('calcularPorciones', () => {
  it('ordena, colorea por posición y pone «Otros» en gris al final', () => {
    const p = calcularPorciones(items(['x', 1], ['y', 3]), { etiquetaOtros: 'Otros', max: 8 });
    expect(p.map((s) => s.id)).toEqual(['y', 'x']);
    expect(p[0]?.color).toBe(PALETA_TORTA[0]);
    expect(p[1]?.color).toBe(PALETA_TORTA[1]);
  });

  it('los porcentajes suman 100 y los ángulos van de 0 a 360 sin huecos', () => {
    const p = calcularPorciones(items(['a', 3], ['b', 1]), { etiquetaOtros: 'Otros' });
    expect(p.reduce((s, x) => s + x.porcentaje, 0)).toBe(100);
    expect(p[0]?.gradoInicio).toBe(0);
    expect(p[0]?.gradoFin).toBeCloseTo(270); // 3/4 del círculo
    expect(p[1]?.gradoInicio).toBeCloseTo(270);
    expect(p[1]?.gradoFin).toBeCloseTo(360);
  });

  it('un único distrito ocupa el círculo completo', () => {
    const p = calcularPorciones(items(['solo', 5]), { etiquetaOtros: 'Otros' });
    expect(p).toHaveLength(1);
    expect(p[0]?.gradoFin).toBeCloseTo(360);
    expect(p[0]?.porcentaje).toBe(100);
  });

  it('«Otros» va en gris y nunca toma una ranura de color', () => {
    const muchos = items(
      ...Array.from({ length: 10 }, (_, i): [string, number] => [`d${i}`, 10 - i]),
    );
    const p = calcularPorciones(muchos, { etiquetaOtros: 'Otros', max: 8 });
    const otros = p.at(-1);
    expect(otros?.esOtros).toBe(true);
    expect(otros?.color).toBe(COLOR_OTROS);
  });
});

describe('caminoDona', () => {
  it('un sector normal empieza en M, trae un arco y cierra', () => {
    const d = caminoDona(100, 100, 90, 55, 0, 90);
    expect(d.startsWith('M ')).toBe(true);
    expect(d).toContain('A 90 90');
    expect(d.trim().endsWith('Z')).toBe(true);
  });

  it('el círculo completo se dibuja como anillo (dos arcos por radio)', () => {
    const d = caminoDona(100, 100, 90, 55, 0, 360);
    expect((d.match(/A 90 90/g) ?? []).length).toBe(2);
    expect((d.match(/A 55 55/g) ?? []).length).toBe(2);
  });
});

describe('paramsIndicadores', () => {
  it('sin severidades ni distrito no manda parámetros', () => {
    expect(paramsIndicadores([])).toEqual({ severidad: undefined, distrito_id: undefined });
  });

  it('ordena la severidad y pasa el distrito', () => {
    expect(paramsIndicadores(['baja', 'critica'], 'distrito_municipal:07')).toEqual({
      severidad: 'critica,baja',
      distrito_id: 'distrito_municipal:07',
    });
  });
});

describe('urlBandejaUv', () => {
  it('arma la URL de la bandeja con la UV y las severidades, en los nombres de filtros.ts', () => {
    // La coma sale como %2C; la bandeja la decodifica al leer `severidad`.
    expect(urlBandejaUv('unidad_vecinal:123', ['alta', 'critica'])).toBe(
      '/reportes?severidad=critica%2Calta&unidad_vecinal_id=unidad_vecinal%3A123',
    );
  });

  it('sin severidades solo lleva la UV', () => {
    expect(urlBandejaUv('unidad_vecinal:9', [])).toBe(
      '/reportes?unidad_vecinal_id=unidad_vecinal%3A9',
    );
  });
});

describe('estado en la URL', () => {
  it('lee severidad y distrito y descarta valores inválidos', () => {
    const e = leerEstadoTorta(
      new URLSearchParams('severidad=critica,chau,baja&distrito=distrito_municipal:07'),
    );
    expect(e.severidades).toEqual(['critica', 'baja']);
    expect(e.distrito).toBe('distrito_municipal:07');
  });

  it('serializar y volver a leer da el mismo estado (ida y vuelta)', () => {
    const estado = { severidades: ordenarSeveridades(['media', 'critica']), distrito: 'd:1' };
    const sp = serializarEstadoTorta(estado);
    expect(sp.get('severidad')).toBe('critica,media');
    expect(leerEstadoTorta(sp)).toEqual(estado);
  });

  it('estado vacío no escribe parámetros', () => {
    expect(serializarEstadoTorta({ severidades: [], distrito: '' }).toString()).toBe('');
  });
});
