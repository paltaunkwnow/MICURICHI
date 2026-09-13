import { describe, expect, it } from 'vitest';
import {
  alternarEnLista,
  FILTROS_VACIOS,
  hayFiltros,
  LIMITE_PAGINA,
  leerFiltros,
  parametrosConsulta,
  parametrosExportacion,
  serializarFiltros,
} from './filtros';

describe('leerFiltros', () => {
  it('lee listas separadas por coma y descarta valores desconocidos', () => {
    const f = leerFiltros(new URLSearchParams('estado=nuevo,validado,inventado&severidad=alta'));
    expect(f.estado).toEqual(['nuevo', 'validado']);
    expect(f.severidad).toEqual(['alta']);
  });

  it('valida fechas y página', () => {
    const f = leerFiltros(new URLSearchParams('desde=2026-01-01&hasta=ayer&pagina=3'));
    expect(f.desde).toBe('2026-01-01');
    expect(f.hasta).toBe('');
    expect(f.pagina).toBe(3);
    expect(leerFiltros(new URLSearchParams('pagina=-2')).pagina).toBe(1);
    expect(leerFiltros(new URLSearchParams('pagina=abc')).pagina).toBe(1);
  });

  it('devuelve los filtros vacíos sin parámetros', () => {
    expect(leerFiltros(new URLSearchParams())).toEqual(FILTROS_VACIOS);
  });
});

describe('serializarFiltros', () => {
  it('omite lo vacío y la página 1, y es simétrico con leerFiltros', () => {
    const f = {
      ...FILTROS_VACIOS,
      estado: ['nuevo' as const],
      distrito_id: 'distrito_municipal:07',
      pagina: 1,
    };
    const sp = serializarFiltros(f);
    expect(sp.toString()).toBe('estado=nuevo&distrito_id=distrito_municipal%3A07');
    expect(leerFiltros(sp)).toEqual(f);
  });

  it('incluye la página cuando es mayor a 1', () => {
    expect(serializarFiltros({ ...FILTROS_VACIOS, pagina: 2 }).get('pagina')).toBe('2');
  });
});

describe('parámetros para la API', () => {
  it('agrega paginación fija a la consulta y no a la exportación', () => {
    const f = { ...FILTROS_VACIOS, severidad: ['alta' as const, 'critica' as const], pagina: 2 };
    expect(parametrosConsulta(f)).toEqual({
      estado: undefined,
      severidad: 'alta,critica',
      distrito_id: undefined,
      unidad_vecinal_id: undefined,
      desde: undefined,
      hasta: undefined,
      pagina: '2',
      limite: String(LIMITE_PAGINA),
    });
    expect(parametrosExportacion(f)).not.toHaveProperty('pagina');
  });
});

describe('ayudas', () => {
  it('detecta si hay filtros activos', () => {
    expect(hayFiltros(FILTROS_VACIOS)).toBe(false);
    expect(hayFiltros({ ...FILTROS_VACIOS, hasta: '2026-02-01' })).toBe(true);
  });

  it('alterna un valor en una lista sin mutarla', () => {
    const lista = ['a', 'b'];
    expect(alternarEnLista(lista, 'b')).toEqual(['a']);
    expect(alternarEnLista(lista, 'c')).toEqual(['a', 'b', 'c']);
    expect(lista).toEqual(['a', 'b']);
  });
});
