import { hashKey } from '@tanstack/react-query';
import { SEVERIDADES, type Severidad } from 'contracts';
import { describe, expect, it } from 'vitest';
import { aQuery } from './api';
import { consultaIndicadores } from './consultas';
import { alternarEnLista } from './filtros';
import {
  type ConteosPestanas,
  conteoDePestana,
  elegirPestanaSeveridad,
  PARAMS_CONTEOS_PESTANAS,
  PESTANAS_SEVERIDAD,
  pestanaPresionada,
} from './indicadores-pestanas';
import {
  type EstadoTorta,
  leerEstadoTorta,
  paramsIndicadores,
  serializarEstadoTorta,
} from './indicadores-torta';

/**
 * Las pestañas de «Por severidad» de /indicadores (T7). El estado vive en la URL, como el de la
 * fila «Filtrar por severidad» de arriba: estas funciones son la transición pura entre un estado y
 * el siguiente, sin React ni red.
 */

/** El estado que lee la pantalla de una URL, tal cual (`?severidad=…&distrito=…`). */
const desdeUrl = (consulta: string): EstadoTorta => leerEstadoTorta(new URLSearchParams(consulta));

describe('PESTANAS_SEVERIDAD', () => {
  it('«Todo» primero y después las cuatro severidades, en el orden de las tarjetas que reemplazan', () => {
    expect(PESTANAS_SEVERIDAD).toEqual(['todas', ...SEVERIDADES]);
    expect(PESTANAS_SEVERIDAD).toEqual(['todas', 'baja', 'media', 'alta', 'critica']);
  });
});

describe('elegirPestanaSeveridad', () => {
  it.each(SEVERIDADES)('sin filtro, tocar «%s» deja el filtro en solo esa', (s) => {
    const nuevo = elegirPestanaSeveridad(desdeUrl(''), s);
    expect(nuevo.severidades).toEqual([s]);
    expect(serializarEstadoTorta(nuevo).toString()).toBe(`severidad=${s}`);
  });

  it('con varias elegidas arriba, tocar una deja el filtro en solo esa', () => {
    const nuevo = elegirPestanaSeveridad(desdeUrl('severidad=critica,alta,baja'), 'alta');
    expect(nuevo.severidades).toEqual(['alta']);
    expect(serializarEstadoTorta(nuevo).get('severidad')).toBe('alta');
  });

  it('pasar de una severidad sola a otra cambia el filtro, no lo suma', () => {
    const nuevo = elegirPestanaSeveridad(desdeUrl('severidad=baja'), 'critica');
    expect(nuevo.severidades).toEqual(['critica']);
  });

  it('tocar la que ya está sola no cambia nada: devuelve el mismo estado, para que no se navegue', () => {
    const estado = desdeUrl('severidad=alta');
    expect(elegirPestanaSeveridad(estado, 'alta')).toBe(estado);
  });

  it('«Todo» quita el filtro, tenga una o varias severidades elegidas', () => {
    for (const q of ['severidad=media', 'severidad=critica,alta,media,baja']) {
      const nuevo = elegirPestanaSeveridad(desdeUrl(q), 'todas');
      expect(nuevo.severidades, q).toEqual([]);
      expect(serializarEstadoTorta(nuevo).has('severidad'), q).toBe(false);
    }
  });

  it('«Todo» sin filtro tampoco cambia nada: devuelve el mismo estado', () => {
    const estado = desdeUrl('');
    expect(elegirPestanaSeveridad(estado, 'todas')).toBe(estado);
  });

  it('el distrito elegido se conserva en cada cambio de pestaña', () => {
    const id = 'distrito_municipal:07';
    const parte = desdeUrl(`distrito=${encodeURIComponent(id)}`);
    for (const p of PESTANAS_SEVERIDAD) {
      expect(elegirPestanaSeveridad(parte, p).distrito, p).toBe(id);
    }
    const conFiltro = desdeUrl(`severidad=alta&distrito=${encodeURIComponent(id)}`);
    expect(elegirPestanaSeveridad(conFiltro, 'todas').distrito).toBe(id);
    expect(elegirPestanaSeveridad(conFiltro, 'baja').distrito).toBe(id);
    expect(serializarEstadoTorta(elegirPestanaSeveridad(conFiltro, 'baja')).get('distrito')).toBe(
      id,
    );
  });

  it('no modifica el estado que recibe', () => {
    const estado = Object.freeze({
      severidades: Object.freeze(['critica', 'alta']) as unknown as Severidad[],
      distrito: 'd:1',
    });
    expect(() => elegirPestanaSeveridad(estado, 'media')).not.toThrow();
    expect(() => elegirPestanaSeveridad(estado, 'todas')).not.toThrow();
    expect(estado.severidades).toEqual(['critica', 'alta']);
  });
});

describe('pestanaPresionada: una sola fuente de estado, la URL', () => {
  const presionadas = (estado: EstadoTorta) =>
    PESTANAS_SEVERIDAD.filter((p) => pestanaPresionada(estado.severidades, p));

  it('sin severidades elegidas solo «Todo» está presionada', () => {
    expect(presionadas(desdeUrl(''))).toEqual(['todas']);
    expect(presionadas(desdeUrl('distrito=d%3A1'))).toEqual(['todas']);
  });

  it('con una severidad, solo esa', () => {
    expect(presionadas(desdeUrl('severidad=media'))).toEqual(['media']);
  });

  it('con dos elegidas arriba, las dos pestañas quedan presionadas y «Todo» no', () => {
    const estado = desdeUrl('severidad=critica,alta');
    expect(presionadas(estado)).toEqual(['alta', 'critica']);
    expect(pestanaPresionada(estado.severidades, 'todas')).toBe(false);
  });

  it('lo que se alterna en la fila de arriba se refleja en las pestañas', () => {
    // La fila usa `alternarEnLista` sobre el mismo estado que leen las pestañas.
    let estado = desdeUrl('');
    estado = { ...estado, severidades: alternarEnLista([...estado.severidades], 'baja') };
    expect(presionadas(estado)).toEqual(['baja']);
    estado = { ...estado, severidades: alternarEnLista([...estado.severidades], 'alta') };
    expect(presionadas(estado)).toEqual(['baja', 'alta']);
    estado = { ...estado, severidades: alternarEnLista([...estado.severidades], 'baja') };
    estado = { ...estado, severidades: alternarEnLista([...estado.severidades], 'alta') };
    expect(presionadas(estado)).toEqual(['todas']);
  });

  it('lo que se elige en una pestaña sale a la URL y se lee igual al volver (ida y vuelta)', () => {
    const q = serializarEstadoTorta(elegirPestanaSeveridad(desdeUrl('distrito=d%3A1'), 'media'));
    const vuelta = leerEstadoTorta(q);
    expect(vuelta).toEqual({ severidades: ['media'], distrito: 'd:1' });
    expect(presionadas(vuelta)).toEqual(['media']);
  });
});

describe('conteoDePestana: los números salen de los indicadores sin filtro', () => {
  const conteos: ConteosPestanas = {
    total: 120,
    por_severidad: { baja: 40, media: 50, alta: 20, critica: 10 },
  };

  it('«Todo» muestra el total y cada severidad su conteo', () => {
    expect(conteoDePestana(conteos, 'todas')).toBe(120);
    expect(conteoDePestana(conteos, 'baja')).toBe(40);
    expect(conteoDePestana(conteos, 'media')).toBe(50);
    expect(conteoDePestana(conteos, 'alta')).toBe(20);
    expect(conteoDePestana(conteos, 'critica')).toBe(10);
  });

  it('una severidad que api-core no trae cuenta 0, no falta', () => {
    const sinCriticas = { total: 3, por_severidad: { baja: 3 } } as unknown as ConteosPestanas;
    expect(conteoDePestana(sinCriticas, 'critica')).toBe(0);
  });

  it('mientras no hay datos no hay número (la pantalla no inventa un 0)', () => {
    for (const p of PESTANAS_SEVERIDAD) {
      expect(conteoDePestana(null, p), p).toBeNull();
      expect(conteoDePestana(undefined, p), p).toBeNull();
    }
  });
});

describe('consulta de los conteos de las pestañas', () => {
  const claveConteos = hashKey(consultaIndicadores(PARAMS_CONTEOS_PESTANAS).queryKey);
  /** La clave de la consulta base de la pantalla para una URL: solo entra la severidad. */
  const claveBase = (consulta: string) =>
    hashKey(consultaIndicadores(paramsIndicadores(desdeUrl(consulta).severidades)).queryKey);

  it('pide los indicadores sin ningún filtro', () => {
    expect(PARAMS_CONTEOS_PESTANAS).toEqual(paramsIndicadores([]));
    expect(aQuery(PARAMS_CONTEOS_PESTANAS)).toBe('');
  });

  it('sin filtro de severidad tiene la misma clave que la base: no sale ninguna petición extra', () => {
    expect(claveBase('')).toBe(claveConteos);
    // El distrito elegido no entra en la consulta base, así que tampoco cambia esta comparación.
    expect(claveBase('distrito=distrito_municipal%3A07')).toBe(claveConteos);
  });

  it('con una o más severidades elegidas la clave es otra: sale la consulta extra, sin filtro', () => {
    for (const q of [
      'severidad=critica',
      'severidad=critica,alta',
      'severidad=baja&distrito=d%3A1',
    ]) {
      expect(claveBase(q), q).not.toBe(claveConteos);
    }
  });
});
