import { describe, expect, it } from 'vitest';
import { CONFIG_DOMINIO } from '../src/dominio/config.js';
import { ROLES, ROLES_DEL_PANEL } from '../src/dominio/enums.js';
import { SesionActualSchema } from '../src/esquemas/auth.js';
import {
  type Ciudad,
  CiudadSchema,
  type ConfiguracionPublica,
  ConfiguracionPublicaSchema,
} from '../src/esquemas/configuracion.js';
import * as contratos from '../src/index.js';
import { construirOpenApi } from '../src/openapi.js';

/** Rutas (`a.b.c`) de los errores de un safeParse fallido; vacío si pasó. */
function rutasDeError(r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return r.error?.issues.map((i) => i.path.map(String).join('.')) ?? [];
}

type DocOpenApi = {
  paths: Record<string, Record<string, Record<string, unknown>>>;
  components: { schemas: Record<string, Record<string, unknown>> };
};

type Respuestas = Record<
  string,
  {
    content?: Record<string, { schema?: { $ref?: string } }>;
    headers?: Record<string, unknown>;
  }
>;

/** Lo que usa hoy el mapa público (`apps/web-ciudadano/src/componentes/Mapa.tsx`). */
const SANTA_CRUZ = {
  nombre: 'Santa Cruz de la Sierra',
  pais: 'BO',
  zona_horaria: 'America/La_Paz',
  locale: 'es-BO',
  centro: { lon: -63.18, lat: -17.78 },
  zoom_inicial: 13,
};

/** La configuración por defecto con `cambios` aplicados sobre la ciudad. */
const conCiudad = (cambios: Record<string, unknown>) =>
  ConfiguracionPublicaSchema.safeParse({ ciudad: { ...SANTA_CRUZ, ...cambios } });

describe('0.7.0: la ciudad por defecto es la instalación actual', () => {
  it('CIUDAD_POR_DEFECTO es Santa Cruz, con el centro y el zoom con que abre hoy el mapa', () => {
    expect(CONFIG_DOMINIO.CIUDAD_POR_DEFECTO).toStrictEqual(SANTA_CRUZ);
    expect(CONFIG_DOMINIO.CIUDAD_POR_DEFECTO.zona_horaria).toBe(
      CONFIG_DOMINIO.ZONA_HORARIA_POR_DEFECTO,
    );
  });

  it('el esquema acepta la configuración por defecto y la devuelve igual', () => {
    // Si CIUDAD_POR_DEFECTO y el esquema divergen, esto ya no compila.
    const ciudad: Ciudad = CONFIG_DOMINIO.CIUDAD_POR_DEFECTO;
    const configuracion: ConfiguracionPublica = { ciudad };
    const r = ConfiguracionPublicaSchema.safeParse(configuracion);
    expect(r.success).toBe(true);
    expect(r.data).toStrictEqual({ ciudad: SANTA_CRUZ });
  });

  it('el locale y la zona por defecto sirven tal cual a Intl', () => {
    const { locale, zona_horaria } = CONFIG_DOMINIO.CIUDAD_POR_DEFECTO;
    expect(Intl.getCanonicalLocales(locale)).toEqual([locale]);
    const formato = new Intl.DateTimeFormat(locale, { timeZone: zona_horaria });
    expect(formato.resolvedOptions().timeZone).toBe(zona_horaria);
  });

  it('el índice del paquete exporta el esquema, el de la ciudad y los roles del panel', () => {
    expect(contratos.ConfiguracionPublicaSchema).toBe(ConfiguracionPublicaSchema);
    expect(contratos.CiudadSchema).toBe(CiudadSchema);
    expect(contratos.ROLES_DEL_PANEL).toBe(ROLES_DEL_PANEL);
  });
});

describe('0.7.0: ConfiguracionPublicaSchema valida la ciudad', () => {
  it('exige cada campo, señalándolo', () => {
    for (const campo of Object.keys(SANTA_CRUZ)) {
      const { [campo as keyof typeof SANTA_CRUZ]: _quitado, ...incompleta } = SANTA_CRUZ;
      expect(rutasDeError(ConfiguracionPublicaSchema.safeParse({ ciudad: incompleta }))).toEqual([
        `ciudad.${campo}`,
      ]);
    }
    expect(rutasDeError(ConfiguracionPublicaSchema.safeParse({}))).toEqual(['ciudad']);
  });

  it('nombre no puede quedar vacío ni ser solo espacios', () => {
    for (const nombre of ['', '   ', 'x'.repeat(101)])
      expect(rutasDeError(conCiudad({ nombre }))).toEqual(['ciudad.nombre']);
    expect(conCiudad({ nombre: 'Cochabamba' }).success).toBe(true);
  });

  it('rechaza un centro fuera de rango o que no es número, señalando la coordenada', () => {
    const casos: [Record<string, unknown>, string][] = [
      [{ lon: 180.5, lat: -17.78 }, 'ciudad.centro.lon'],
      [{ lon: -181, lat: -17.78 }, 'ciudad.centro.lon'],
      [{ lon: -63.18, lat: 90.1 }, 'ciudad.centro.lat'],
      [{ lon: -63.18, lat: -91 }, 'ciudad.centro.lat'],
      [{ lon: '-63.18', lat: -17.78 }, 'ciudad.centro.lon'],
      [{ lon: Number.NaN, lat: -17.78 }, 'ciudad.centro.lon'],
      [{ lon: -63.18, lat: Number.POSITIVE_INFINITY }, 'ciudad.centro.lat'],
      [{ lat: -17.78 }, 'ciudad.centro.lon'],
    ];
    for (const [centro, ruta] of casos) expect(rutasDeError(conCiudad({ centro }))).toEqual([ruta]);
  });

  it('los extremos del rango de coordenadas son válidos', () => {
    for (const centro of [
      { lon: 180, lat: 90 },
      { lon: -180, lat: -90 },
      { lon: 0, lat: 0 },
    ])
      expect(conCiudad({ centro }).success).toBe(true);
  });

  it('zoom_inicial va de 0 a 22 y admite fracciones, como MapLibre', () => {
    for (const zoom_inicial of [0, 12.5, 22])
      expect(conCiudad({ zoom_inicial }).success).toBe(true);
    for (const zoom_inicial of [-1, 22.01, 23, '13', Number.NaN])
      expect(rutasDeError(conCiudad({ zoom_inicial }))).toEqual(['ciudad.zoom_inicial']);
  });

  it('pais es un código ISO 3166-1 alfa-2 en mayúsculas', () => {
    for (const pais of ['BO', 'AR', 'PY']) expect(conCiudad({ pais }).success).toBe(true);
    for (const pais of ['bo', 'Bo', 'BOL', 'B0', 'B', '', 'Bolivia', ' BO'])
      expect(rutasDeError(conCiudad({ pais }))).toEqual(['ciudad.pais']);
  });

  it('locale es una etiqueta BCP 47 (idioma, escritura y región) en su forma canónica', () => {
    const validos = ['es-BO', 'es', 'es-419', 'pt-BR', 'zh-Hant-TW'];
    for (const locale of validos) {
      expect(conCiudad({ locale }).success).toBe(true);
      expect(Intl.getCanonicalLocales(locale)).toEqual([locale]);
    }
    for (const locale of ['es_BO', 'es-bo', 'ES-BO', 'español', '', 'es-BOL', 'es-BO-', 'es BO'])
      expect(rutasDeError(conCiudad({ locale }))).toEqual(['ciudad.locale']);
  });

  it('es_BO no es un detalle de forma: Intl lanza RangeError y el cliente se rompería', () => {
    expect(() => Intl.getCanonicalLocales('es_BO')).toThrow(RangeError);
  });

  it('zona_horaria es un nombre IANA que Intl reconoce, y cada error sale una sola vez', () => {
    for (const zona_horaria of ['America/La_Paz', 'America/Argentina/Buenos_Aires', 'UTC'])
      expect(conCiudad({ zona_horaria }).success).toBe(true);
    for (const zona_horaria of ['America/LaPaz', '-04:00', 'Marte/Olympus_Mons', ''])
      expect(rutasDeError(conCiudad({ zona_horaria }))).toEqual(['ciudad.zona_horaria']);
  });
});

const usuario = {
  id: '0b6f9a57-3c1e-4d8a-9b2f-5e7c1a2d3f40',
  email: 'tecnica@example.com',
  nombre: 'Técnica',
  puede_reportar_desde: null,
};
const PANEL = 'https://panel.micurichi.example/';
const sesion = (rol: string, extra: Record<string, unknown> = {}) =>
  SesionActualSchema.safeParse({ ...usuario, rol, ...extra });

describe('0.7.0: panel_url en la sesión (/auth/yo)', () => {
  it('es opcional: sin panel_url la sesión sigue siendo válida para todos los roles', () => {
    for (const rol of ROLES) {
      const r = sesion(rol);
      expect(r.success).toBe(true);
      expect(r.data && 'panel_url' in r.data).toBe(false);
    }
  });

  it('los roles del panel son tecnico, admin y ejecutivo', () => {
    expect([...ROLES_DEL_PANEL]).toStrictEqual(['tecnico', 'admin', 'ejecutivo']);
  });

  it('tecnico, admin y ejecutivo la reciben como URL o null (despliegue sin panel)', () => {
    for (const rol of ROLES_DEL_PANEL) {
      const r = sesion(rol, { panel_url: PANEL });
      expect(r.success).toBe(true);
      expect(r.data?.panel_url).toBe(PANEL);
      expect(sesion(rol, { panel_url: 'http://localhost:3100' }).success).toBe(true);
      expect(sesion(rol, { panel_url: null }).data?.panel_url).toBeNull();
    }
  });

  it('al ciudadano nunca: con panel_url, aunque sea null, la sesión no pasa', () => {
    for (const panel_url of [PANEL, null])
      expect(rutasDeError(sesion('ciudadano', { panel_url }))).toEqual(['panel_url']);
  });

  it('solo URL absolutas http(s) y sin usuario ni contraseña', () => {
    for (const panel_url of [
      'javascript:alert(1)',
      'ftp://panel.micurichi.example/',
      '/panel',
      'panel',
      '',
      'https://usuario:clave@panel.micurichi.example/',
    ])
      expect(rutasDeError(sesion('tecnico', { panel_url }))).toEqual(['panel_url']);
  });
});

describe('0.7.0: OpenAPI', () => {
  const doc = construirOpenApi() as DocOpenApi;

  it('GET /api/v1/configuracion es pública y responde ConfiguracionPublica', () => {
    const get = doc.paths['/api/v1/configuracion']?.get;
    expect(get).toBeDefined();
    expect(get?.security).toBeUndefined();
    const respuestas = get?.responses as Respuestas;
    expect(respuestas['200']?.content?.['application/json']?.schema?.$ref).toBe(
      '#/components/schemas/ConfiguracionPublica',
    );
  });

  it('documenta que es cacheable (Cache-Control)', () => {
    const respuestas = doc.paths['/api/v1/configuracion']?.get?.responses as Respuestas;
    expect(respuestas['200']?.headers?.['Cache-Control']).toBeDefined();
  });

  it('el componente ConfiguracionPublica publica la ciudad con sus rangos y formatos', () => {
    const esquema = doc.components.schemas.ConfiguracionPublica as {
      required: string[];
      properties: {
        ciudad: {
          required: string[];
          properties: Record<string, Record<string, unknown>>;
        };
      };
    };
    expect(esquema.required).toEqual(['ciudad']);
    const ciudad = esquema.properties.ciudad;
    expect(ciudad.required).toEqual(
      expect.arrayContaining(Object.keys(SANTA_CRUZ) as (keyof typeof SANTA_CRUZ)[]),
    );
    expect(ciudad.properties.zoom_inicial).toMatchObject({ minimum: 0, maximum: 22 });
    expect(ciudad.properties.pais?.pattern).toBeTypeOf('string');
    expect(ciudad.properties.locale?.pattern).toBeTypeOf('string');
    expect(ciudad.properties.zona_horaria?.pattern).toBeTypeOf('string');
  });

  it('SesionActual publica panel_url opcional y /auth/yo lo explica', () => {
    const esquema = doc.components.schemas.SesionActual as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(Object.keys(esquema.properties)).toContain('panel_url');
    expect(esquema.required).not.toContain('panel_url');
    const yo = doc.paths['/api/v1/auth/yo']?.get;
    const respuestas = yo?.responses as Respuestas;
    expect(respuestas['200']?.content?.['application/json']?.schema?.$ref).toBe(
      '#/components/schemas/SesionActual',
    );
    expect(String(yo?.summary)).toContain('panel_url');
  });
});
