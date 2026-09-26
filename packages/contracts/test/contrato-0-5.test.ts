import { describe, expect, it } from 'vitest';
import {
  ETIQUETAS,
  PROFUNDIDADES,
  ROLES,
  SUMIDERO_CERCANO,
  SUMIDERO_ESTADOS,
} from '../src/dominio/enums.js';
import { PESOS, PUNTOS, SEVERIDAD_VERSION } from '../src/dominio/severidad.js';
import { RegistroSchema, UsuarioSchema } from '../src/esquemas/auth.js';
import { ResumenEjecutivoQuerySchema, ResumenEjecutivoSchema } from '../src/esquemas/ejecutivo.js';
import {
  ReporteCrearSchema,
  ReportePublicoSchema,
  ReporteTecnicoSchema,
} from '../src/esquemas/reporte.js';
import * as contratos from '../src/index.js';
import { construirOpenApi } from '../src/openapi.js';

const crear = {
  lat: -17.78,
  lon: -63.18,
  ubicacion_metodo: 'manual',
  ubicacion_tipo: 'via_publica',
  descripcion: 'Se junta agua hasta la rodilla cada vez que llueve fuerte.',
  profundidad_estimada: 'rodilla',
  frecuencia: 'cada_lluvia_fuerte',
};

describe('0.5.0: tirante pasa a profundidad', () => {
  it('PROFUNDIDADES conserva los valores de TIRANTES y TIRANTES ya no se exporta', () => {
    expect([...PROFUNDIDADES]).toStrictEqual(['tobillo', 'rodilla', 'muslo', 'mas_70']);
    expect(Object.keys(contratos)).not.toContain('TIRANTES');
  });

  it('los esquemas del reporte declaran profundidad_estimada y no tirante_estimado', () => {
    for (const esquema of [ReporteCrearSchema, ReportePublicoSchema, ReporteTecnicoSchema]) {
      const claves = Object.keys(esquema.shape);
      expect(claves).toContain('profundidad_estimada');
      expect(claves).not.toContain('tirante_estimado');
    }
  });

  it('crear sin profundidad_estimada falla aunque venga tirante_estimado', () => {
    const { profundidad_estimada: _p, ...sinProfundidad } = crear;
    expect(
      ReporteCrearSchema.safeParse({ ...sinProfundidad, tirante_estimado: 'rodilla' }).success,
    ).toBe(false);
    expect(ReporteCrearSchema.safeParse(crear).success).toBe(true);
  });

  it('la severidad usa profundidad con los mismos números y sigue en la versión 2', () => {
    expect(PESOS).toStrictEqual({ profundidad: 2, frecuencia: 1 });
    expect(PUNTOS.profundidad).toStrictEqual({ tobillo: 1, rodilla: 2, muslo: 3, mas_70: 4 });
    expect(SEVERIDAD_VERSION).toBe(2);
  });

  it('las etiquetas dicen «Profundidad estimada» y «Profundidad»', () => {
    expect(ETIQUETAS.campos.profundidad_estimada).toBe('Profundidad estimada');
    expect(ETIQUETAS.campos.profundidad).toBe('Profundidad');
    expect(Object.keys(ETIQUETAS)).not.toContain('tirante');
    expect(Object.keys(ETIQUETAS.profundidad)).toStrictEqual([...PROFUNDIDADES]);
  });
});

describe('0.5.0: sumidero', () => {
  it('SUMIDERO_CERCANO es si/no y «no contestó» es null', () => {
    expect([...SUMIDERO_CERCANO]).toStrictEqual(['si', 'no']);
    expect(ReporteCrearSchema.safeParse({ ...crear, sumidero_cercano: 'no_sabe' }).success).toBe(
      false,
    );
    expect(ReporteCrearSchema.safeParse({ ...crear, sumidero_cercano: null }).success).toBe(true);
    expect(ReporteCrearSchema.safeParse({ ...crear, sumidero_cercano: 'si' }).success).toBe(true);
  });

  it('SUMIDERO_ESTADOS es tapado/no_tapado y los valores viejos se rechazan', () => {
    expect([...SUMIDERO_ESTADOS]).toStrictEqual(['tapado', 'no_tapado']);
    for (const viejo of ['libre', 'obstruido', 'danado', 'no_sabe'])
      expect(ReporteCrearSchema.safeParse({ ...crear, sumidero_estado: viejo }).success).toBe(
        false,
      );
    expect(ReporteCrearSchema.safeParse({ ...crear, sumidero_estado: 'no_tapado' }).success).toBe(
      true,
    );
  });

  it('etiquetas del sumidero', () => {
    expect(ETIQUETAS.campos.sumidero_cercano).toBe('¿Hay sumidero cercano?');
    expect(ETIQUETAS.campos.sumidero_estado).toBe('¿Está tapado?');
    expect(ETIQUETAS.sumidero_cercano).toStrictEqual({ si: 'Sí', no: 'No' });
    expect(ETIQUETAS.sumidero_estado).toStrictEqual({ tapado: 'Tapado', no_tapado: 'No tapado' });
  });
});

describe('0.5.0: rol ejecutivo', () => {
  it('ROLES incluye ejecutivo con su etiqueta', () => {
    expect([...ROLES]).toStrictEqual(['ciudadano', 'tecnico', 'admin', 'ejecutivo']);
    expect(ETIQUETAS.rol.ejecutivo).toBe('Ejecutivo');
  });

  it('UsuarioSchema acepta el rol ejecutivo', () => {
    const u = {
      id: '6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60',
      email: 'ejecutiva@example.test',
      nombre: 'Ejecutiva',
      rol: 'ejecutivo',
    };
    expect(UsuarioSchema.parse(u).rol).toBe('ejecutivo');
  });

  it('RegistroSchema sigue sin campo de rol', () => {
    expect(Object.keys(RegistroSchema.shape)).not.toContain('rol');
    const r = RegistroSchema.parse({
      email: 'a@example.test',
      nombre: 'Ana',
      password: 'una-clave-larga',
      rol: 'ejecutivo',
    });
    expect('rol' in r).toBe(false);
  });
});

const conteoSeveridad = { critica: 1, alta: 2, media: 3, baja: 4 };
const conteoEstado = { nuevo: 5, validado: 4, resuelto: 1 };
const resumenValido = {
  generado_en: '2026-09-25T12:00:00.000Z',
  ventana: { desde: null, hasta: null },
  total: 10,
  por_severidad: conteoSeveridad,
  por_estado: conteoEstado,
  por_distrito: [
    {
      distrito_id: 'distrito_municipal:07',
      codigo: '07',
      nombre: 'Distrito 7',
      total: 10,
      por_severidad: conteoSeveridad,
      por_estado: conteoEstado,
      ultimo_reporte_en: '2026-09-24T20:15:00.000Z',
    },
  ],
  ultimo_reporte_en: '2026-09-24T20:15:00.000Z',
};

describe('0.5.0: ResumenEjecutivoSchema', () => {
  it('acepta un ejemplo válido, también con ventana acotada y sin reportes', () => {
    expect(ResumenEjecutivoSchema.safeParse(resumenValido).success).toBe(true);
    expect(
      ResumenEjecutivoSchema.safeParse({
        ...resumenValido,
        ventana: { desde: '2026-09-18T12:00:00.000Z', hasta: '2026-09-25T12:00:00.000Z' },
        total: 0,
        por_distrito: [],
        ultimo_reporte_en: null,
      }).success,
    ).toBe(true);
  });

  it('rechaza por_distrito mal formado', () => {
    const distrito = resumenValido.por_distrito[0];
    const malos = [
      { ...distrito, distrito_id: undefined },
      { ...distrito, total: -1 },
      { ...distrito, total: '10' },
      { ...distrito, por_severidad: { critica: 1, alta: 2, media: 3 } },
      { ...distrito, por_estado: { nuevo: 1, validado: 1 } },
      { ...distrito, ultimo_reporte_en: 'ayer' },
    ];
    for (const malo of malos)
      expect(
        ResumenEjecutivoSchema.safeParse({ ...resumenValido, por_distrito: [malo] }).success,
      ).toBe(false);
    expect(ResumenEjecutivoSchema.safeParse({ ...resumenValido, por_distrito: {} }).success).toBe(
      false,
    );
  });

  it('la query acepta 7d, 30d y todo, con todo por defecto', () => {
    expect(ResumenEjecutivoQuerySchema.parse({}).ventana).toBe('todo');
    expect(ResumenEjecutivoQuerySchema.parse({ ventana: '7d' }).ventana).toBe('7d');
    expect(ResumenEjecutivoQuerySchema.parse({ ventana: '30d' }).ventana).toBe('30d');
    expect(ResumenEjecutivoQuerySchema.safeParse({ ventana: '90d' }).success).toBe(false);
  });

  it('OpenAPI publica GET /api/v1/ejecutivo/resumen con el componente ResumenEjecutivo', () => {
    const doc = construirOpenApi() as {
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    };
    expect(doc.paths['/api/v1/ejecutivo/resumen']?.get).toBeDefined();
    expect(doc.components.schemas.ResumenEjecutivo).toBeDefined();
  });
});
