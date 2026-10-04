import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONFIG_DOMINIO } from '../src/dominio/config.js';
import { SesionActualSchema } from '../src/esquemas/auth.js';
import {
  ReporteFeatureSchema,
  ReportePublicoSchema,
  ReporteTecnicoSchema,
} from '../src/esquemas/reporte.js';
import { construirOpenApi } from '../src/openapi.js';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function rutasDeError(r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return r.error?.issues.map((i) => i.path.map(String).join('.')) ?? [];
}

function archivosTs(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivosTs(ruta);
    return ruta.endsWith('.ts') ? [ruta] : [];
  });
}

type EsquemaJson = { required?: string[]; properties?: Record<string, unknown> };
type DocOpenApi = { components: { schemas: Record<string, EsquemaJson> } };

const vecina = {
  id: '0b6f9a57-3c1e-4d8a-9b2f-5e7c1a2d3f40',
  email: 'vecina@example.com',
  nombre: 'Vecina',
  rol: 'ciudadano',
  puede_reportar_desde: null,
  reportes_restantes_hoy: 3,
  demora_proximo_s: 60,
};

const publico = {
  id: '6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60',
  creado_en: '2026-09-26T12:00:00.000Z',
  evento_en: null,
  distrito: { id: 'distrito_municipal:07', codigo: '07', nombre: 'Distrito 7' },
  unidad_vecinal: { id: 'unidad_vecinal:123', codigo: '123', nombre: 'Los Lotes' },
  descripcion: 'Se junta agua hasta la rodilla cada vez que llueve fuerte.',
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

const tecnico = {
  ...publico,
  ubicacion_metodo: 'gps',
  precision_gps_m: 8,
  distancia_dispositivo_m: 3,
  ubicacion_tipo: 'via_publica',
  sumidero_cercano: null,
  sumidero_estado: null,
  agua_brota_sumidero: null,
  severidad_manual: null,
  severidad_motivo: null,
  severidad_puntaje: 5,
  estado_motivo: null,
  fusionado_en_id: null,
  validado_por: null,
  validado_en: null,
  actualizado_en: '2026-09-26T12:00:00.000Z',
  version_capa: 'DM_UV_MZ_2025',
  resolucion_flags: {},
  autor_id: null,
};

function sin<T extends Record<string, unknown>>(objeto: T, campo: keyof T) {
  const { [campo]: _quitado, ...resto } = objeto;
  return resto;
}

describe('0.14.0: se quita lo deprecado', () => {
  it('ya no existen la espera de 60 min ni las fotos por hora', () => {
    expect(CONFIG_DOMINIO).not.toHaveProperty('MINUTOS_ENTRE_REPORTES_POR_CUENTA');
    expect(CONFIG_DOMINIO).not.toHaveProperty('FOTOS_POR_HORA_POR_CUENTA');
    // Lo que las reemplaza sigue.
    expect(CONFIG_DOMINIO.REPORTES_POR_DIA_POR_CUENTA).toBe(3);
    expect(CONFIG_DOMINIO.FOTOS_POR_DIA_POR_CUENTA).toBe(12);
  });

  it('no queda nada marcado @deprecated ni «hasta 0.14.0» en el código', () => {
    for (const archivo of archivosTs(resolve(raiz, 'src'))) {
      const fuente = readFileSync(archivo, 'utf8');
      expect(fuente, archivo).not.toMatch(/@deprecated/);
      expect(fuente, archivo).not.toMatch(/hasta 0\.14/);
    }
  });
});

describe('0.15.0: los campos transitorios pasan a obligatorios', () => {
  it('SesionActual exige reportes_restantes_hoy y demora_proximo_s', () => {
    expect(SesionActualSchema.safeParse(vecina).success).toBe(true);
    expect(
      rutasDeError(SesionActualSchema.safeParse(sin(vecina, 'reportes_restantes_hoy'))),
    ).toEqual(['reportes_restantes_hoy']);
    expect(rutasDeError(SesionActualSchema.safeParse(sin(vecina, 'demora_proximo_s')))).toEqual([
      'demora_proximo_s',
    ]);
  });

  it('ReportePublico, ReporteTecnico y la Feature pública exigen verificado', () => {
    expect(ReportePublicoSchema.safeParse(publico).success).toBe(true);
    expect(ReporteTecnicoSchema.safeParse(tecnico).success).toBe(true);
    expect(rutasDeError(ReportePublicoSchema.safeParse(sin(publico, 'verificado')))).toEqual([
      'verificado',
    ]);
    expect(rutasDeError(ReporteTecnicoSchema.safeParse(sin(tecnico, 'verificado')))).toEqual([
      'verificado',
    ]);
    const feature = {
      type: 'Feature',
      id: publico.id,
      geometry: { type: 'Point', coordinates: [-63.18, -17.78] },
      properties: sin(publico, 'verificado'),
    };
    expect(rutasDeError(ReporteFeatureSchema.safeParse(feature))).toEqual([
      'properties.verificado',
    ]);
  });
});

describe('0.14.0 y 0.15.0: OpenAPI', () => {
  const doc = construirOpenApi() as DocOpenApi;

  it('los componentes declaran obligatorios los tres campos', () => {
    const { SesionActual, ReporteTecnico, ReporteFeature } = doc.components.schemas;
    // ReportePublico no es un componente: va dentro de ReporteFeature.
    const ReportePublico = ReporteFeature?.properties?.properties as EsquemaJson | undefined;
    expect(SesionActual?.required).toEqual(
      expect.arrayContaining(['reportes_restantes_hoy', 'demora_proximo_s']),
    );
    expect(ReportePublico?.required).toContain('verificado');
    expect(ReporteTecnico?.required).toContain('verificado');
  });

  it('ni el documento generado ni openapi.yaml dicen «Opcional hasta 0.14.0»', () => {
    expect(JSON.stringify(doc)).not.toMatch(/hasta 0\.14/);
    // openapi.yaml se versiona: esto comprueba que se regeneró con el build.
    expect(readFileSync(resolve(raiz, 'openapi/openapi.yaml'), 'utf8')).not.toMatch(/hasta 0\.14/);
  });
});

describe('0.14.0: GET /fotos/{key} para la moderación', () => {
  type OperacionFoto = {
    summary?: string;
    responses: Record<string, { headers?: Record<string, { description?: string }> }>;
  };
  const doc = construirOpenApi() as unknown as {
    paths: Record<string, { get?: OperacionFoto }>;
  };
  const op = doc.paths['/api/v1/fotos/{key}']?.get;
  const resumen = op?.summary ?? '';
  const cacheControl = op?.responses['200']?.headers?.['Cache-Control']?.description ?? '';

  it('técnico y admin ven en privado las fotos de un reporte publicado que después se rechazó o se fusionó', () => {
    expect(resumen).toMatch(
      /[Tt]écnico y admin ven, con private, no-store, las fotos de un reporte ya publicado que después se rechazó o se fusionó \(rechazado o duplicado\), para moderarlo/,
    );
  });

  it('las de un reporte en espera no las ve nadie más que el autor', () => {
    expect(resumen).toMatch(/nadie más que el autor/);
    expect(resumen).toMatch(/todavía espera su publicar_en/);
  });

  it('Cache-Control nombra los tres casos privados: el autor, técnico y admin con un retirado y el dueño de una foto sin reporte', () => {
    expect(cacheControl).toMatch(/private, no-store/);
    expect(cacheControl).toMatch(/autor/);
    expect(cacheControl).toMatch(/técnico y admin.*rechazado o duplicado/);
    expect(cacheControl).toMatch(/dueño de una foto sin reporte/);
  });
});
