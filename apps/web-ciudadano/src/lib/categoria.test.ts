import type {
  DefinicionCategoriaCualquiera,
  FiltroDef,
  RegistroCategorias,
  SlugCategoria,
} from 'contracts';
import { REGISTRO_CATEGORIAS } from 'contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  activasDelRegistro,
  CLAVE_PREFERENCIA_CATEGORIA,
  type EstadoMapaCategoria,
  guardarPreferenciaCategoria,
  leerPreferenciaCategoria,
  reiniciarAlCambiarCategoria,
  resolverCategoriaDeUrl,
} from './categoria';

/**
 * CA3 del plan M4: la preferencia del dispositivo, la resolución de la categoría desde la URL (D1) y el
 * reinicio por alcance (ADR 0016). Todo con funciones puras; cada prueba puede fallar sola.
 */

/** Almacén en memoria para la preferencia; las variantes que lanzan prueban los caminos de error. */
function almacenFalso() {
  const datos = new Map<string, string>();
  return {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => {
      datos.set(k, v);
    },
    _datos: datos,
  };
}

/** Registro inyectable para las pruebas con dos categorías; solo necesita slug, nombre y filtros. */
function registroFalso(
  defs: { slug: string; nombre: string; filtros?: readonly FiltroDef[] }[],
): RegistroCategorias {
  const porSlug = new Map<string, DefinicionCategoriaCualquiera>(
    // Fixtures de prueba: solo se leen `slug`, `nombre` y `filtros`; el resto de la definición no
    // interviene en estas funciones.
    defs.map((d) => [d.slug, d as unknown as DefinicionCategoriaCualquiera]),
  );
  return {
    definiciones: [...porSlug.values()],
    slugs: defs.map((d) => d.slug),
    obtener: (s) => porSlug.get(s),
    tiene: (s) => porSlug.has(s),
  };
}

const filtroSeveridad = (alcance: FiltroDef['alcance']): FiltroDef => ({
  id: 'severidad',
  etiqueta: 'Severidad',
  campo: 'severidad',
  alcance,
});

describe('preferencia de categoría del dispositivo (ADR 0014)', () => {
  it('guarda y vuelve a leer el slug con la versión vigente', () => {
    const a = almacenFalso();
    guardarPreferenciaCategoria('inundacion', a);
    expect(a._datos.get(CLAVE_PREFERENCIA_CATEGORIA)).toBe('{"v":1,"slug":"inundacion"}');
    expect(leerPreferenciaCategoria(a)).toEqual({ v: 1, slug: 'inundacion' });
  });

  it('sin almacén (servidor) no lee ni rompe al guardar', () => {
    expect(leerPreferenciaCategoria(null)).toBeNull();
    expect(() => guardarPreferenciaCategoria('inundacion', null)).not.toThrow();
  });

  it('con un almacén que lanza, leer da null y guardar no rompe', () => {
    const roto = {
      getItem() {
        throw new Error('bloqueado');
      },
      setItem() {
        throw new Error('bloqueado');
      },
    };
    expect(leerPreferenciaCategoria(roto)).toBeNull();
    expect(() => guardarPreferenciaCategoria('inundacion', roto)).not.toThrow();
  });

  it('con la cuota llena (setItem lanza) no rompe y no deja basura', () => {
    const lleno = {
      getItem: () => null,
      setItem() {
        throw new DOMException('cuota', 'QuotaExceededError');
      },
    };
    expect(() => guardarPreferenciaCategoria('bache', lleno)).not.toThrow();
  });

  it('un JSON corrupto se descarta como si no hubiera preferencia', () => {
    const a = almacenFalso();
    a._datos.set(CLAVE_PREFERENCIA_CATEGORIA, 'no es json {');
    expect(leerPreferenciaCategoria(a)).toBeNull();
  });

  it('una preferencia de otra versión (v:2) se descarta', () => {
    const a = almacenFalso();
    a._datos.set(CLAVE_PREFERENCIA_CATEGORIA, '{"v":2,"slug":"inundacion"}');
    expect(leerPreferenciaCategoria(a)).toBeNull();
  });

  it('un valor sin slug de texto se descarta', () => {
    const a = almacenFalso();
    a._datos.set(CLAVE_PREFERENCIA_CATEGORIA, '{"v":1,"slug":123}');
    expect(leerPreferenciaCategoria(a)).toBeNull();
  });

  it('un slug inactivo guardado se lee tal cual; la resolución lo ignora', () => {
    const a = almacenFalso();
    a._datos.set(CLAVE_PREFERENCIA_CATEGORIA, '{"v":1,"slug":"bache"}');
    // La lectura no valida actividad: devuelve lo guardado.
    expect(leerPreferenciaCategoria(a)).toEqual({ v: 1, slug: 'bache' });
    // Pero con solo Inundaciones activa, la resolución cae al defecto, no a la guardada inactiva.
    const r = resolverCategoriaDeUrl({
      href: 'https://ejemplo.test/',
      activas: ['inundacion'],
      guardada: leerPreferenciaCategoria(a),
      registro: REGISTRO_CATEGORIAS,
    });
    expect(r.efectiva).toBe('inundacion');
  });
});

describe('resolución de la categoría desde la URL (D1, una sola activa)', () => {
  const activas: readonly SlugCategoria[] = ['inundacion'];

  it('con una sola activa, un ?categoria válido se quita sin anuncio', () => {
    const r = resolverCategoriaDeUrl({
      href: 'https://ejemplo.test/?categoria=inundacion',
      activas,
      registro: REGISTRO_CATEGORIAS,
    });
    expect(r.efectiva).toBe('inundacion');
    expect(r.anuncio).toBeNull();
    expect(r.urlNueva).not.toBeNull();
    expect(new URL(r.urlNueva as string).searchParams.has('categoria')).toBe(false);
  });

  it('conserva el resto de la query y el hash al quitar el parámetro', () => {
    const r = resolverCategoriaDeUrl({
      href: 'https://ejemplo.test/mapa?zoom=5&categoria=Inundaciones#seccion',
      activas,
      registro: REGISTRO_CATEGORIAS,
    });
    const url = new URL(r.urlNueva as string);
    expect(url.pathname).toBe('/mapa');
    expect(url.searchParams.get('zoom')).toBe('5');
    expect(url.searchParams.has('categoria')).toBe(false);
    expect(url.hash).toBe('#seccion');
  });

  it('una categoría inactiva en la URL se ignora, se corrige y se anuncia', () => {
    const r = resolverCategoriaDeUrl({
      href: 'https://ejemplo.test/?categoria=bache',
      activas,
      registro: REGISTRO_CATEGORIAS,
    });
    expect(r.efectiva).toBe('inundacion');
    expect(r.anuncio).toBe('Esa categoría no está disponible: mostrando Inundaciones');
    expect(new URL(r.urlNueva as string).searchParams.has('categoria')).toBe(false);
  });

  it('una categoría inválida en la URL se ignora, se corrige y se anuncia', () => {
    const r = resolverCategoriaDeUrl({
      href: 'https://ejemplo.test/?categoria=xyz',
      activas,
      registro: REGISTRO_CATEGORIAS,
    });
    expect(r.efectiva).toBe('inundacion');
    expect(r.anuncio).toBe('Esa categoría no está disponible: mostrando Inundaciones');
  });

  it('sin parámetro y una sola activa no toca la URL ni anuncia', () => {
    const r = resolverCategoriaDeUrl({
      href: 'https://ejemplo.test/',
      activas,
      registro: REGISTRO_CATEGORIAS,
    });
    expect(r.efectiva).toBe('inundacion');
    expect(r.urlNueva).toBeNull();
    expect(r.anuncio).toBeNull();
  });
});

describe('resolución de la categoría desde la URL (D1, dos o más activas)', () => {
  const registroDos = registroFalso([
    { slug: 'inundacion', nombre: 'Inundaciones' },
    { slug: 'bache', nombre: 'Baches' },
    { slug: 'area_verde', nombre: 'Áreas verdes' },
  ]);

  it('normaliza un alias de la URL a la forma pública del slug', () => {
    const r = resolverCategoriaDeUrl({
      href: 'https://ejemplo.test/?categoria=Inundaciones',
      activas: ['inundacion', 'bache'],
      registro: registroDos,
    });
    expect(r.efectiva).toBe('inundacion');
    expect(r.anuncio).toBeNull();
    expect(new URL(r.urlNueva as string).searchParams.get('categoria')).toBe('inundacion');
  });

  it('escribe la forma pública con guion (area_verde → area-verde)', () => {
    const r = resolverCategoriaDeUrl({
      href: 'https://ejemplo.test/?categoria=areas-verdes',
      activas: ['inundacion', 'area_verde'],
      registro: registroDos,
    });
    expect(r.efectiva).toBe('area_verde');
    expect(new URL(r.urlNueva as string).searchParams.get('categoria')).toBe('area-verde');
  });

  it('agrega la efectiva (de la guardada) cuando falta el parámetro', () => {
    const r = resolverCategoriaDeUrl({
      href: 'https://ejemplo.test/',
      activas: ['inundacion', 'bache'],
      guardada: { v: 1, slug: 'bache' },
      registro: registroDos,
    });
    expect(r.efectiva).toBe('bache');
    expect(new URL(r.urlNueva as string).searchParams.get('categoria')).toBe('bache');
  });

  it('no toca la URL cuando el parámetro ya es la forma pública de la efectiva', () => {
    const r = resolverCategoriaDeUrl({
      href: 'https://ejemplo.test/?categoria=bache',
      activas: ['inundacion', 'bache'],
      registro: registroDos,
    });
    expect(r.efectiva).toBe('bache');
    expect(r.urlNueva).toBeNull();
    expect(r.anuncio).toBeNull();
  });

  it('una inactiva en la URL cae al defecto y se anuncia con su nombre del registro', () => {
    const r = resolverCategoriaDeUrl({
      href: 'https://ejemplo.test/?categoria=basura',
      activas: ['inundacion', 'bache'],
      registro: registroDos,
    });
    expect(r.efectiva).toBe('inundacion');
    expect(r.anuncio).toBe('Esa categoría no está disponible: mostrando Inundaciones');
    expect(new URL(r.urlNueva as string).searchParams.get('categoria')).toBe('inundacion');
  });
});

describe('categorías activas contra el registro (CA2)', () => {
  const registroDos = registroFalso([
    { slug: 'inundacion', nombre: 'Inundaciones' },
    { slug: 'bache', nombre: 'Baches' },
  ]);

  it('deja solo las definidas, en el orden del registro (canónico)', () => {
    expect(activasDelRegistro(['bache', 'inundacion'], registroDos)).toEqual([
      'inundacion',
      'bache',
    ]);
  });

  it('descarta una activa sin definición (falla cerrado)', () => {
    expect(activasDelRegistro(['inundacion', 'area_verde'], registroDos)).toEqual(['inundacion']);
  });

  it('con el registro real de la instalación solo queda Inundaciones', () => {
    expect(activasDelRegistro(['inundacion', 'bache'], REGISTRO_CATEGORIAS)).toEqual([
      'inundacion',
    ]);
  });
});

describe('reinicio de filtros al cambiar de categoría (ADR 0016)', () => {
  const estadoLleno: EstadoMapaCategoria = {
    bbox: '-63.2,-17.8,-63.1,-17.7',
    distrito: { id: 'distrito:1', codigo: '1', nombre: 'Distrito 1' },
    unidadVecinal: { id: 'uv:10', codigo: '10' },
    capaVisible: 'distritos',
    severidad: 'alta',
    puntoCritico: 'pc-1',
    seleccionado: 'rep-1',
    hojaAbierta: true,
    texto: 'Equipetrol',
    busqueda: 'Equipetrol',
    panelFiltrosAbierto: true,
  };

  const defFiltro = (slug: string, filtros: readonly FiltroDef[]): DefinicionCategoriaCualquiera =>
    // Solo se lee `filtros`; el resto de la definición no interviene en el reinicio.
    ({ slug, filtros }) as unknown as DefinicionCategoriaCualquiera;

  it('conserva bbox, distrito, UV y capa de fondo (alcance global)', () => {
    const r = reiniciarAlCambiarCategoria(
      estadoLleno,
      defFiltro('bache', [filtroSeveridad('categoria')]),
    );
    expect(r.bbox).toBe(estadoLleno.bbox);
    expect(r.distrito).toEqual(estadoLleno.distrito);
    expect(r.unidadVecinal).toEqual(estadoLleno.unidadVecinal);
    expect(r.capaVisible).toBe('distritos');
  });

  it('reinicia severidad cuando su FiltroDef es de alcance categoría', () => {
    const r = reiniciarAlCambiarCategoria(
      estadoLleno,
      defFiltro('bache', [filtroSeveridad('categoria')]),
    );
    expect(r.severidad).toBeNull();
  });

  it('conserva severidad cuando su FiltroDef es de alcance global', () => {
    const r = reiniciarAlCambiarCategoria(
      estadoLleno,
      defFiltro('bache', [filtroSeveridad('global')]),
    );
    expect(r.severidad).toBe('alta');
  });

  it('reinicia severidad cuando la definición nueva no la declara como filtro', () => {
    const r = reiniciarAlCambiarCategoria(estadoLleno, defFiltro('basura', []));
    expect(r.severidad).toBeNull();
  });

  it('reinicia siempre el punto crítico y limpia selección, hoja, búsqueda y panel', () => {
    const r = reiniciarAlCambiarCategoria(
      estadoLleno,
      defFiltro('bache', [filtroSeveridad('global')]),
    );
    expect(r.puntoCritico).toBeNull();
    expect(r.seleccionado).toBeNull();
    expect(r.hojaAbierta).toBe(false);
    expect(r.texto).toBe('');
    expect(r.busqueda).toBe('');
    expect(r.panelFiltrosAbierto).toBe(false);
  });

  it('no muta el estado de entrada', () => {
    const copia = structuredClone(estadoLleno);
    reiniciarAlCambiarCategoria(estadoLleno, defFiltro('bache', [filtroSeveridad('categoria')]));
    expect(estadoLleno).toEqual(copia);
  });
});

describe('guardar y leer con el localStorage real del entorno', () => {
  it('no rompe si window.localStorage lanza al tocarlo', () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new Error('bloqueado');
      },
    });
    expect(leerPreferenciaCategoria()).toBeNull();
    expect(() => guardarPreferenciaCategoria('inundacion')).not.toThrow();
    vi.unstubAllGlobals();
  });
});
