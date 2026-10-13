import { describe, expect, it } from 'vitest';
import {
  crearRegistroCategorias,
  DEFINICION_INUNDACION,
  type DefinicionCategoriaCualquiera,
  DetalleInundacionSchema,
  normalizarSlugCategoria,
  REGISTRO_CATEGORIAS,
  resolverCategoriaInicial,
  SLUGS_CATEGORIA,
  slugParaUrl,
} from '../src/categorias/index.js';
import { CONFIG_DOMINIO, NOTA_METODOLOGICA } from '../src/dominio/config.js';
import { SEVERIDAD_VERSION } from '../src/dominio/severidad.js';
import { ReporteCrearSchema, ReporteFiltrosSchema } from '../src/esquemas/reporte.js';

/** Claves del esquema de detalle de inundación (los 6 campos de dominio). */
const CLAVES_DETALLE = Object.keys(DetalleInundacionSchema.shape);

describe('0.19.0 · CA2 · slugs y URL', () => {
  it('SLUGS_CATEGORIA son los 4 canónicos, en orden de presentación', () => {
    expect([...SLUGS_CATEGORIA]).toEqual(['inundacion', 'bache', 'area_verde', 'basura']);
  });

  it('todos los slugs son snake_case y únicos', () => {
    expect(new Set(SLUGS_CATEGORIA).size).toBe(SLUGS_CATEGORIA.length);
    for (const slug of SLUGS_CATEGORIA) expect(slug).toMatch(/^[a-z]+(_[a-z]+)*$/);
  });

  it('normalizarSlugCategoria acepta alias (plural, guion/guion bajo, mayúsculas, tildes)', () => {
    const casos: Array<[unknown, string | null]> = [
      ['inundacion', 'inundacion'],
      ['inundaciones', 'inundacion'],
      ['Inundación', 'inundacion'],
      ['bache', 'bache'],
      ['baches', 'bache'],
      ['BACHE', 'bache'],
      ['area_verde', 'area_verde'],
      ['area-verde', 'area_verde'],
      ['areas-verdes', 'area_verde'],
      ['Área-Verde', 'area_verde'],
      ['Áreas Verdes', 'area_verde'],
      ['basura', 'basura'],
      ['basuras', 'basura'],
      ['  Basura  ', 'basura'],
      ['otra_cosa', null],
      ['', null],
      ['   ', null],
      [null, null],
      [undefined, null],
      [42, null],
      [{ slug: 'bache' }, null],
    ];
    for (const [entrada, esperado] of casos)
      expect(normalizarSlugCategoria(entrada)).toBe(esperado);
  });

  it('slugParaUrl usa la forma pública (area_verde → area-verde)', () => {
    expect(slugParaUrl('inundacion')).toBe('inundacion');
    expect(slugParaUrl('bache')).toBe('bache');
    expect(slugParaUrl('area_verde')).toBe('area-verde');
    expect(slugParaUrl('basura')).toBe('basura');
  });

  it('normalizar ∘ slugParaUrl es la identidad sobre los canónicos', () => {
    for (const slug of SLUGS_CATEGORIA)
      expect(normalizarSlugCategoria(slugParaUrl(slug))).toBe(slug);
  });
});

describe('0.19.0 · CA3 · resolverCategoriaInicial', () => {
  const activas = ['inundacion', 'bache', 'area_verde', 'basura'];

  it('la URL válida y activa gana (y acepta alias)', () => {
    const r = resolverCategoriaInicial({ url: 'baches', guardada: 'inundacion', activas });
    expect(r).toEqual({ slug: 'bache', origen: 'url', urlInvalida: false, urlInactiva: false });
  });

  it('la URL conocida pero inactiva se ignora y cae a la guardada', () => {
    const r = resolverCategoriaInicial({
      url: 'bache',
      guardada: 'area_verde',
      activas: ['inundacion', 'area_verde'],
    });
    expect(r.slug).toBe('area_verde');
    expect(r.origen).toBe('guardada');
    expect(r.urlInactiva).toBe(true);
    expect(r.urlInvalida).toBe(false);
  });

  it('la URL inválida marca urlInvalida y usa la guardada ({v, slug})', () => {
    const r = resolverCategoriaInicial({
      url: 'xxxx',
      guardada: { v: 1, slug: 'basura' },
      activas,
    });
    expect(r.slug).toBe('basura');
    expect(r.origen).toBe('guardada');
    expect(r.urlInvalida).toBe(true);
  });

  it('sin URL, la guardada válida y activa gana', () => {
    const r = resolverCategoriaInicial({ guardada: { v: 1, slug: 'bache' }, activas });
    expect(r.slug).toBe('bache');
    expect(r.origen).toBe('guardada');
  });

  it('la guardada inactiva cae a inundacion por defecto', () => {
    const r = resolverCategoriaInicial({ guardada: 'bache', activas: ['inundacion', 'basura'] });
    expect(r).toEqual({
      slug: 'inundacion',
      origen: 'defecto',
      urlInvalida: false,
      urlInactiva: false,
    });
  });

  it('sin URL ni guardada usa inundacion si está activa', () => {
    const r = resolverCategoriaInicial({ activas });
    expect(r.slug).toBe('inundacion');
    expect(r.origen).toBe('defecto');
  });

  it('si inundacion no está activa, usa la primera activa en orden canónico', () => {
    const r = resolverCategoriaInicial({ activas: ['basura', 'bache'] });
    expect(r.slug).toBe('bache');
    expect(r.origen).toBe('primera_activa');
  });

  it('con activas vacía devuelve un resultado explícito (nunca una inactiva)', () => {
    const r = resolverCategoriaInicial({ url: 'bache', guardada: 'inundacion', activas: [] });
    expect(r.slug).toBeNull();
    expect(r.origen).toBe('ninguna');
    expect(r.urlInactiva).toBe(true);
  });

  it('nunca devuelve una categoría que no esté en activas', () => {
    for (const activas of [['inundacion'], ['bache'], ['area_verde', 'basura'], []]) {
      const r = resolverCategoriaInicial({ url: 'inundaciones', guardada: 'bache', activas });
      if (r.slug !== null) expect(activas).toContain(r.slug);
    }
  });
});

describe('0.19.0 · CA4 · definición de Inundaciones', () => {
  const def = DEFINICION_INUNDACION;

  it('slug, icono, geometría y colores (ADR 0022)', () => {
    expect(def.slug).toBe('inundacion');
    expect(def.icono).toBe('Waves');
    expect(def.geometria).toBe('punto');
    expect(def.colores).toEqual({ c1: '#E3EEF5', c5: '#0D6189', c7: '#0A4A69' });
  });

  it('el texto del paso 1 es el de la interfaz actual', () => {
    expect(def.preguntaUbicacion).toBe('¿Dónde se junta el agua?');
  });

  it('la severidad reexporta la v2 y coincide con calcularSeveridad', () => {
    expect(SEVERIDAD_VERSION).toBe(2);
    expect(def.severidad.version).toBe(SEVERIDAD_VERSION);
    const detalle = (profundidad_estimada: string, frecuencia: string) =>
      DetalleInundacionSchema.parse({ profundidad_estimada, frecuencia });
    expect(def.severidad.calcular(detalle('tobillo', 'primera_vez'))).toEqual({
      puntaje: 3,
      banda: 'baja',
      reglas: [],
    });
    // E1: profundidad > 70 cm sube a crítica aunque el puntaje base sea «alta».
    expect(def.severidad.calcular(detalle('mas_70', 'primera_vez'))).toEqual({
      puntaje: 9,
      banda: 'critica',
      reglas: ['E1'],
    });
    // Sin escalamiento: p = 3 no dispara E1 y la guarda E3 no actúa porque la banda ya es crítica.
    expect(def.severidad.calcular(detalle('muslo', 'agua_estancada'))).toEqual({
      puntaje: 11,
      banda: 'critica',
      reglas: [],
    });
  });

  it('radio de recurrencia y cupo salen de CONFIG_DOMINIO (sin literales)', () => {
    expect(def.recurrenciaRadioM).toBe(CONFIG_DOMINIO.RECURRENCIA_RADIO_M);
    expect(def.cupo.ambito).toBe('cuenta+categoria');
    expect(def.cupo.ventana).toBe('dia_local');
    expect(def.cupo.limite).toBe(CONFIG_DOMINIO.REPORTES_POR_DIA_POR_CUENTA);
  });

  it('la nota metodológica es la existente', () => {
    expect(def.notaMetodologica).toBe(NOTA_METODOLOGICA);
  });
});

describe('0.19.0 · CA6 · invariantes', () => {
  const def = DEFINICION_INUNDACION;

  it('camposPublicos ⊆ claves del esquema de detalle', () => {
    for (const campo of def.camposPublicos) expect(CLAVES_DETALLE).toContain(campo);
  });

  it('los campos de exportación ⊆ claves del detalle y son los mismos que hoy', () => {
    const claves = def.camposExportacion.map((c) => c.clave);
    for (const c of claves) expect(CLAVES_DETALLE).toContain(c);
    // Las columnas de dominio del CSV de api-core (admin.ts), en el mismo orden.
    expect(claves).toEqual([
      'profundidad_estimada',
      'frecuencia',
      'causa_presunta',
      'sumidero_cercano',
      'sumidero_estado',
      'agua_brota_sumidero',
    ]);
    // El encabezado de exportación es el nombre de columna, como en el CSV actual.
    for (const c of def.camposExportacion) expect(c.encabezado).toBe(c.clave);
  });

  it('cada pregunta apunta a una clave real del detalle', () => {
    for (const p of def.preguntas) expect(CLAVES_DETALLE).toContain(p.id);
  });

  it('cada filtro de categoría apunta a un campo real (núcleo o detalle) y declara su alcance', () => {
    const reales = new Set<string>([...Object.keys(ReporteFiltrosSchema.shape), ...CLAVES_DETALLE]);
    for (const f of def.filtros) {
      expect(['global', 'categoria']).toContain(f.alcance);
      expect(reales.has(f.campo)).toBe(true);
    }
    // El filtro de severidad existe y es de categoría (se reinicia al cambiar, ADR 0016).
    expect(def.filtros.some((f) => f.campo === 'severidad' && f.alcance === 'categoria')).toBe(
      true,
    );
  });

  it('contraste WCAG de c7: ≥ 4,5 sobre blanco y ≥ 3 sobre el fondo del mapa #EEF2EF', () => {
    const canal = (c: number): number => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const luminancia = (hex: string): number => {
      const n = hex.replace('#', '');
      const r = Number.parseInt(n.slice(0, 2), 16);
      const g = Number.parseInt(n.slice(2, 4), 16);
      const b = Number.parseInt(n.slice(4, 6), 16);
      return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
    };
    const contraste = (a: string, b: string): number => {
      const la = luminancia(a);
      const lb = luminancia(b);
      const [hi, lo] = la > lb ? [la, lb] : [lb, la];
      return (hi + 0.05) / (lo + 0.05);
    };
    const { c7 } = def.colores;
    expect(contraste(c7, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contraste(c7, '#EEF2EF')).toBeGreaterThanOrEqual(3);
  });

  it('el esquema de detalle acepta y rechaza lo mismo que ReporteCrearSchema en esos campos', () => {
    const base = {
      lat: -17.78,
      lon: -63.18,
      ubicacion_tipo: 'via_publica',
      descripcion: 'Se junta agua hasta la rodilla cada vez que llueve fuerte.',
      dispositivo: { lat: -17.78, lon: -63.18, precision_m: 178, antiguedad_s: 2 },
    };
    const detalles: unknown[] = [
      // Válidos.
      { profundidad_estimada: 'rodilla', frecuencia: 'cada_lluvia_fuerte' },
      {
        profundidad_estimada: 'tobillo',
        frecuencia: 'primera_vez',
        causa_presunta: 'sumidero_tapado',
        sumidero_cercano: 'si',
        sumidero_estado: 'tapado',
      },
      { profundidad_estimada: 'rodilla', frecuencia: 'cada_lluvia_fuerte', sumidero_cercano: 'no' },
      // Inválidos por la regla del sumidero.
      {
        profundidad_estimada: 'muslo',
        frecuencia: 'permanente',
        sumidero_cercano: 'no',
        sumidero_estado: 'tapado',
      },
      {
        profundidad_estimada: 'muslo',
        frecuencia: 'permanente',
        sumidero_cercano: 'no',
        agua_brota_sumidero: true,
      },
      // Inválidos por enum o por campo requerido ausente.
      { profundidad_estimada: 'xxx', frecuencia: 'permanente' },
      { frecuencia: 'permanente' },
      { profundidad_estimada: 'rodilla' },
      {
        profundidad_estimada: 'rodilla',
        frecuencia: 'cada_lluvia_fuerte',
        causa_presunta: 'inexistente',
      },
    ];
    for (const d of detalles) {
      const soloDetalle = DetalleInundacionSchema.safeParse(d).success;
      const completo = ReporteCrearSchema.safeParse({ ...base, ...(d as object) }).success;
      expect(soloDetalle, `detalle: ${JSON.stringify(d)}`).toBe(completo);
    }
  });
});

describe('0.19.0 · CA5 · registro y fábrica', () => {
  const def = DEFINICION_INUNDACION;

  it('REGISTRO_CATEGORIAS tiene solo inundación y la encuentra por slug', () => {
    expect([...REGISTRO_CATEGORIAS.slugs]).toEqual(['inundacion']);
    expect(REGISTRO_CATEGORIAS.obtener('inundacion')).toBe(def);
    expect(REGISTRO_CATEGORIAS.tiene('inundacion')).toBe(true);
    expect(REGISTRO_CATEGORIAS.tiene('bache')).toBe(false);
    expect(REGISTRO_CATEGORIAS.obtener('bache')).toBeUndefined();
  });

  it('la fábrica rechaza slugs duplicados', () => {
    expect(() => crearRegistroCategorias([def, def])).toThrow(/duplicad/i);
  });

  it('una categoría sintética se registra con la fábrica sin tocar el núcleo', () => {
    // El slug sintético no es un SlugCategoria: el registro admite cualquier string (ADR 0009).
    const sintetica: DefinicionCategoriaCualquiera = { ...def, slug: 'prueba_sintetica' };
    const reg = crearRegistroCategorias([def, sintetica]);
    expect([...reg.slugs]).toEqual(['inundacion', 'prueba_sintetica']);
    expect(reg.tiene('prueba_sintetica')).toBe(true);
    expect(reg.obtener('prueba_sintetica')).toBe(sintetica);
    // El registro del núcleo no se tocó.
    expect(REGISTRO_CATEGORIAS.tiene('prueba_sintetica')).toBe(false);
  });
});
