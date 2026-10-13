import { describe, expect, it } from 'vitest';
import {
  CODIGO_CATEGORIA_NO_DISPONIBLE,
  DEFINICION_INUNDACION,
  DetalleInundacionSchema,
  type SeveridadCategoria,
} from '../src/categorias/index.js';
import { CONFIG_DOMINIO } from '../src/dominio/config.js';
import { ExportarQuerySchema, IndicadoresFiltrosSchema } from '../src/esquemas/admin.js';
import { SesionActualSchema } from '../src/esquemas/auth.js';
import { CATEGORIA_TODAS } from '../src/esquemas/comunes.js';
import { ConfiguracionPublicaSchema } from '../src/esquemas/configuracion.js';
import { ResumenEjecutivoQuerySchema } from '../src/esquemas/ejecutivo.js';
import {
  CODIGO_FUSION_ENTRE_CATEGORIAS,
  esReporteCrearPorCategoria,
  ID_REPORTE_CORTO_O_UUID,
  normalizarReporteCrear,
  ReporteCambiarEstadoSchema,
  ReporteCrearCategoriaSchema,
  ReporteCrearSchema,
  ReporteFiltrosSchema,
  ReporteFusionarSchema,
  ReportePublicoSchema,
  reportePlanoACategoria,
} from '../src/esquemas/reporte.js';
import { construirOpenApi } from '../src/openapi.js';

/** Núcleo común de un cuerpo de POST, sin los campos de dominio. */
const NUCLEO = {
  lat: -17.78,
  lon: -63.18,
  ubicacion_tipo: 'via_publica',
  descripcion: 'Se junta agua hasta la rodilla cada vez que llueve fuerte.',
  dispositivo: { lat: -17.78, lon: -63.18, precision_m: 178, antiguedad_s: 2 },
};

describe('0.20.0 · CA1 · filtro categoria', () => {
  it('sin parámetro = inundacion en todos los filtros de lectura', () => {
    expect(ReporteFiltrosSchema.parse({}).categoria).toBe('inundacion');
    expect(IndicadoresFiltrosSchema.parse({}).categoria).toBe('inundacion');
    expect(ResumenEjecutivoQuerySchema.parse({}).categoria).toBe('inundacion');
    // ExportarQuery hereda el filtro de ReporteFiltros.
    expect(ExportarQuerySchema.parse({}).categoria).toBe('inundacion');
    expect(ReporteFiltrosSchema.parse({ categoria: '' }).categoria).toBe('inundacion');
  });

  it('acepta alias (plural, guion, mayúsculas, tildes) y los normaliza', () => {
    const casos: Array<[string, string]> = [
      ['inundaciones', 'inundacion'],
      ['Inundación', 'inundacion'],
      ['baches', 'bache'],
      ['BACHE', 'bache'],
      ['area-verde', 'area_verde'],
      ['Áreas Verdes', 'area_verde'],
      ['basuras', 'basura'],
    ];
    for (const [entrada, esperado] of casos)
      expect(ReporteFiltrosSchema.parse({ categoria: entrada }).categoria).toBe(esperado);
  });

  it('reconoce `todas` (el servidor decide si la ruta lo admite)', () => {
    expect(ReporteFiltrosSchema.parse({ categoria: 'todas' }).categoria).toBe(CATEGORIA_TODAS);
    expect(ReporteFiltrosSchema.parse({ categoria: 'TODAS' }).categoria).toBe(CATEGORIA_TODAS);
    expect(IndicadoresFiltrosSchema.parse({ categoria: 'todas' }).categoria).toBe(CATEGORIA_TODAS);
    expect(ResumenEjecutivoQuerySchema.parse({ categoria: 'todas' }).categoria).toBe(
      CATEGORIA_TODAS,
    );
  });

  it('un valor desconocido queda en null (el contrato no decide actividad; lo hace el servidor)', () => {
    expect(ReporteFiltrosSchema.parse({ categoria: 'xxx' }).categoria).toBeNull();
    // Un slug conocido pero no activo NO lo distingue el contrato: devuelve el slug canónico y el
    // servidor lo rechaza con CATEGORIA_NO_DISPONIBLE si no está activo.
    expect(ReporteFiltrosSchema.parse({ categoria: 'bache' }).categoria).toBe('bache');
  });
});

describe('0.20.0 · CA1 · POST /reportes: forma plana, forma nueva y conversión', () => {
  const planaValida = {
    ...NUCLEO,
    profundidad_estimada: 'rodilla',
    frecuencia: 'cada_lluvia_fuerte',
  };
  const nuevaValida = {
    ...NUCLEO,
    categoria: 'inundacion',
    detalle: { profundidad_estimada: 'rodilla', frecuencia: 'cada_lluvia_fuerte' },
  };

  it('distingue las dos formas por la presencia de categoria/detalle', () => {
    expect(esReporteCrearPorCategoria(planaValida)).toBe(false);
    expect(esReporteCrearPorCategoria(nuevaValida)).toBe(true);
    expect(esReporteCrearPorCategoria({ ...NUCLEO, categoria: 'bache' })).toBe(true);
    expect(esReporteCrearPorCategoria({ ...NUCLEO, detalle: {} })).toBe(true);
    expect(esReporteCrearPorCategoria(null)).toBe(false);
    expect(esReporteCrearPorCategoria('x')).toBe(false);
  });

  it('la forma plana sigue validando con ReporteCrearSchema (sin cambios)', () => {
    expect(ReporteCrearSchema.safeParse(planaValida).success).toBe(true);
  });

  it('la forma nueva valida con ReporteCrearCategoriaSchema y normaliza la categoría', () => {
    const r = ReporteCrearCategoriaSchema.safeParse({ ...nuevaValida, categoria: 'Inundaciones' });
    expect(r.success).toBe(true);
    expect(r.data?.categoria).toBe('inundacion');
    // Una categoría desconocida parsea con null (el servidor responde 422, no el contrato).
    expect(ReporteCrearCategoriaSchema.parse({ ...nuevaValida, categoria: 'xxx' }).categoria).toBe(
      null,
    );
  });

  it('la forma nueva exige detalle (objeto)', () => {
    const { detalle: _omitido, ...sinDetalle } = nuevaValida;
    expect(ReporteCrearCategoriaSchema.safeParse(sinDetalle).success).toBe(false);
  });

  it('reportePlanoACategoria convierte la plana en categoria=inundacion y el detalle pasa el Zod estricto', () => {
    const plana = ReporteCrearSchema.parse(planaValida);
    const convertido = reportePlanoACategoria(plana);
    expect(convertido.categoria).toBe('inundacion');
    expect(convertido.descripcion).toBe(planaValida.descripcion);
    expect(DetalleInundacionSchema.safeParse(convertido.detalle).success).toBe(true);
    expect(convertido.detalle).toMatchObject({
      profundidad_estimada: 'rodilla',
      frecuencia: 'cada_lluvia_fuerte',
      causa_presunta: 'desconocida',
    });
  });

  it('normalizarReporteCrear deja ambas formas como la forma por categoría', () => {
    const plana = normalizarReporteCrear(planaValida);
    expect(plana.forma).toBe('plana');
    expect(plana.resultado.exito).toBe(true);
    if (plana.resultado.exito) {
      expect(plana.resultado.datos.categoria).toBe('inundacion');
      expect(DetalleInundacionSchema.safeParse(plana.resultado.datos.detalle).success).toBe(true);
    }

    const nueva = normalizarReporteCrear(nuevaValida);
    expect(nueva.forma).toBe('categoria');
    expect(nueva.resultado.exito).toBe(true);

    // Un cuerpo plano inválido (sin frecuencia) devuelve el ZodError sin lanzar.
    const mala = normalizarReporteCrear({ ...NUCLEO, profundidad_estimada: 'rodilla' });
    expect(mala.forma).toBe('plana');
    expect(mala.resultado.exito).toBe(false);
  });
});

describe('0.20.0 · CA1 · detalle estricto (inundación)', () => {
  it('rechaza claves de más', () => {
    expect(
      DetalleInundacionSchema.safeParse({
        profundidad_estimada: 'rodilla',
        frecuencia: 'cada_lluvia_fuerte',
        de_mas: true,
      }).success,
    ).toBe(false);
  });

  it('acepta el detalle con solo los campos conocidos', () => {
    expect(
      DetalleInundacionSchema.safeParse({
        profundidad_estimada: 'rodilla',
        frecuencia: 'cada_lluvia_fuerte',
      }).success,
    ).toBe(true);
  });
});

describe('0.20.0 · severidad de la categoría devuelve `reglas` (opcional)', () => {
  it('inundación con P = 4 (mas_70) devuelve la regla de escalamiento E1 (§9.1)', () => {
    const r = DEFINICION_INUNDACION.severidad.calcular({
      profundidad_estimada: 'mas_70',
      frecuencia: 'ocasional',
      causa_presunta: 'desconocida',
    });
    expect(r.banda).toBe('critica');
    expect(r.reglas).toContain('E1');
  });

  it('una profundidad baja no agrega reglas de escalamiento', () => {
    const r = DEFINICION_INUNDACION.severidad.calcular({
      profundidad_estimada: 'tobillo',
      frecuencia: 'primera_vez',
      causa_presunta: 'desconocida',
    });
    expect(r.reglas ?? []).toEqual([]);
  });

  it('una categoría que no escala puede omitir `reglas`', () => {
    const sinReglas: SeveridadCategoria<{ x: number }> = {
      version: 1,
      calcular: () => ({ puntaje: 3, banda: 'baja' }),
    };
    expect(sinReglas.calcular({ x: 1 }).reglas).toBeUndefined();
  });
});

describe('0.20.0 · CA1 · fusionado_en_id acepta UUID o ID corto', () => {
  const uuid = '11111111-2222-4333-8444-555555555555';
  const corto = '1234abcd';

  it('la expresión es la misma para fusionar y para cambiar de estado', () => {
    expect(ID_REPORTE_CORTO_O_UUID.test(uuid)).toBe(true);
    expect(ID_REPORTE_CORTO_O_UUID.test(corto)).toBe(true);
    expect(ID_REPORTE_CORTO_O_UUID.test('nope')).toBe(false);
  });

  it('PATCH /estado con destino duplicado acepta UUID y ID corto', () => {
    const base = { estado: 'duplicado', estado_motivo: 'Mismo charco' };
    expect(ReporteCambiarEstadoSchema.safeParse({ ...base, fusionado_en_id: uuid }).success).toBe(
      true,
    );
    expect(ReporteCambiarEstadoSchema.safeParse({ ...base, fusionado_en_id: corto }).success).toBe(
      true,
    );
    expect(
      ReporteCambiarEstadoSchema.safeParse({ ...base, fusionado_en_id: '12345' }).success,
    ).toBe(false);
  });

  it('POST /fusionar acepta UUID y ID corto', () => {
    expect(ReporteFusionarSchema.safeParse({ canonico_id: uuid }).success).toBe(true);
    expect(ReporteFusionarSchema.safeParse({ canonico_id: corto }).success).toBe(true);
    expect(ReporteFusionarSchema.safeParse({ canonico_id: 'XYZ' }).success).toBe(false);
  });
});

describe('0.20.0 · CA1 · SesionActual.cupos y ConfiguracionPublica.categorias_activas', () => {
  const sesionBase = {
    id: '11111111-2222-4333-8444-555555555555',
    email: 'vecina@curichi.local',
    nombre: 'Vecina',
    rol: 'ciudadano',
    puede_reportar_desde: null,
    reportes_restantes_hoy: 3,
    demora_proximo_s: 60,
  };

  it('acepta cupos por categoría y fotos_restantes_hoy', () => {
    const r = SesionActualSchema.safeParse({
      ...sesionBase,
      cupos: {
        inundacion: { restantes: 3, demora_proximo_s: 60, puede_reportar_desde: null },
      },
      fotos_restantes_hoy: 12,
    });
    expect(r.success).toBe(true);
    expect(r.data?.cupos?.inundacion?.restantes).toBe(3);
    expect(r.data?.fotos_restantes_hoy).toBe(12);
  });

  it('categorias_activas es una lista de slugs en orden canónico', () => {
    const r = ConfiguracionPublicaSchema.safeParse({
      ciudad: CONFIG_DOMINIO.CIUDAD_POR_DEFECTO,
      categorias_activas: ['inundacion'],
    });
    expect(r.success).toBe(true);
    expect(r.data?.categorias_activas).toEqual(['inundacion']);
  });
});

describe('0.20.0 · CA1 · compatibilidad: los ejemplos de hoy siguen siendo válidos', () => {
  const reportePublicoHoy = {
    id: '11111111-2222-4333-8444-555555555555',
    creado_en: '2026-10-09T12:00:00-04:00',
    evento_en: null,
    distrito: { id: 'distrito_municipal:07', codigo: '07', nombre: 'Distrito 7' },
    unidad_vecinal: { id: 'unidad_vecinal:123', codigo: '123', nombre: 'Los Lotes' },
    descripcion: 'Agua hasta la rodilla.',
    fotos: [],
    profundidad_estimada: 'rodilla',
    frecuencia: 'cada_lluvia_fuerte',
    causa_presunta: 'desconocida',
    severidad: 'media',
    severidad_calculada: 'media',
    estado: 'nuevo',
    verificado: false,
    punto_critico_id: null,
    n_reportes_punto: null,
    precision_degradada: false,
  };

  it('un reporte público SIN categoria/subtipo/detalle sigue validando (campos opcionales, regla 5)', () => {
    expect(ReportePublicoSchema.safeParse(reportePublicoHoy).success).toBe(true);
  });

  it('el mismo reporte CON los campos nuevos también valida', () => {
    expect(
      ReportePublicoSchema.safeParse({
        ...reportePublicoHoy,
        categoria: 'inundacion',
        subtipo: null,
        detalle: { profundidad_estimada: 'rodilla', frecuencia: 'cada_lluvia_fuerte' },
      }).success,
    ).toBe(true);
  });

  it('una sesión y una configuración SIN los campos nuevos siguen validando', () => {
    expect(
      SesionActualSchema.safeParse({
        id: '11111111-2222-4333-8444-555555555555',
        email: 'vecina@curichi.local',
        nombre: 'Vecina',
        rol: 'ciudadano',
        puede_reportar_desde: null,
        reportes_restantes_hoy: 3,
        demora_proximo_s: 60,
      }).success,
    ).toBe(true);
    expect(
      ConfiguracionPublicaSchema.safeParse({ ciudad: CONFIG_DOMINIO.CIUDAD_POR_DEFECTO }).success,
    ).toBe(true);
  });
});

describe('0.20.0 · CA1 · códigos de error y OpenAPI', () => {
  const doc = construirOpenApi() as {
    components: { schemas: Record<string, unknown> };
    paths: Record<
      string,
      Record<
        string,
        {
          parameters?: Array<{ name: string; in: string }>;
          requestBody?: { content: Record<string, { schema: unknown }> };
          responses: Record<string, unknown>;
        }
      >
    >;
  };

  it('expone los códigos de error nuevos', () => {
    expect(CODIGO_CATEGORIA_NO_DISPONIBLE).toBe('CATEGORIA_NO_DISPONIBLE');
    expect(CODIGO_FUSION_ENTRE_CATEGORIAS).toBe('FUSION_ENTRE_CATEGORIAS');
  });

  it('el componente ReporteCrearCategoria existe y POST /reportes acepta las dos formas', () => {
    expect(doc.components.schemas.ReporteCrearCategoria).toBeDefined();
    const reqBody = doc.paths['/api/v1/reportes']?.post?.requestBody;
    const schema = reqBody?.content['application/json']?.schema as { oneOf?: unknown[] };
    expect(Array.isArray(schema?.oneOf)).toBe(true);
    expect(schema?.oneOf).toHaveLength(2);
  });

  it('GET /reportes declara el filtro categoria y el 400', () => {
    const get = doc.paths['/api/v1/reportes']?.get;
    const nombres = (get?.parameters ?? []).filter((p) => p.in === 'query').map((p) => p.name);
    expect(nombres).toContain('categoria');
    expect(get?.responses['400']).toBeDefined();
  });

  it('las rutas públicas de geo-service declaran el parámetro categoria', () => {
    for (const ruta of ['/geo/v1/agregados/unidades-vecinales', '/geo/v1/puntos-criticos']) {
      const get = doc.paths[ruta]?.get;
      const nombres = (get?.parameters ?? []).filter((p) => p.in === 'query').map((p) => p.name);
      expect(nombres, ruta).toContain('categoria');
      expect(get?.responses['400'], ruta).toBeDefined();
    }
  });
});
