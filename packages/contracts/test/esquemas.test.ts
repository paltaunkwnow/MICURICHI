import { describe, expect, it } from 'vitest';
import { ETIQUETAS, TIPOS_CAPA } from '../src/dominio/enums.js';
import { BboxSchema } from '../src/esquemas/comunes.js';
import { ResolverRespuestaSchema } from '../src/esquemas/geo.js';
import {
  ReporteCambiarEstadoSchema,
  ReporteCrearSchema,
  ReporteFiltrosSchema,
  ReportePublicoSchema,
  ReporteTecnicoSchema,
  transicionPermitida,
} from '../src/esquemas/reporte.js';
import * as contratos from '../src/index.js';

/** «Los cuatro campos» que la spec 2026-09-25-quitar-campos-del-reporte quita del reporte. */
const CUATRO_CAMPOS = ['manzana_id', 'direccion_aprox', 'duracion_estimada', 'afectacion'] as const;

const valido = {
  lat: -17.78,
  lon: -63.18,
  ubicacion_tipo: 'via_publica',
  descripcion: 'Se junta agua hasta la rodilla cada vez que llueve fuerte.',
  profundidad_estimada: 'rodilla',
  frecuencia: 'cada_lluvia_fuerte',
  dispositivo: { lat: -17.78, lon: -63.18, precision_m: 10, antiguedad_s: 2 },
};

/** Payload de un cliente viejo (PWA en caché): el nuevo más los cuatro campos quitados. */
const viejo = {
  ...valido,
  duracion_estimada: '2h_12h',
  afectacion: 'vehicular',
  direccion_aprox: 'x',
  manzana_id: 'manzana:1',
};

/** Vista técnica válida según la spec: sin ninguno de los cuatro campos. */
const tecnicoValido = {
  id: '6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60',
  creado_en: '2026-09-25T12:00:00.000Z',
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
  estado: 'validado',
  verificado: true,
  punto_critico_id: null,
  n_reportes_punto: null,
  precision_degradada: false,
  ubicacion_metodo: 'manual',
  precision_gps_m: null,
  distancia_dispositivo_m: null,
  ubicacion_tipo: 'via_publica',
  sumidero_cercano: null,
  sumidero_estado: null,
  agua_brota_sumidero: null,
  severidad_manual: null,
  severidad_motivo: null,
  severidad_puntaje: 7,
  estado_motivo: null,
  fusionado_en_id: null,
  validado_por: null,
  validado_en: null,
  actualizado_en: '2026-09-25T12:00:00.000Z',
  version_capa: '2025',
  resolucion_flags: {},
  autor_id: null,
};

describe('quitar manzana, dirección, duración y afectación del reporte', () => {
  it('CA-C1: el payload sin duración ni afectación es válido y el esquema no declara los cuatro campos', () => {
    expect(ReporteCrearSchema.safeParse(valido).success).toBe(true);
    const claves = Object.keys(ReporteCrearSchema.shape);
    for (const campo of CUATRO_CAMPOS) expect(claves).not.toContain(campo);
  });

  it('CA-C2: un payload viejo se acepta y las claves quitadas se descartan', () => {
    const r = ReporteCrearSchema.parse(viejo);
    for (const campo of CUATRO_CAMPOS) expect(campo in r).toBe(false);
  });

  it('CA-C3: ReportePublicoSchema y ReporteTecnicoSchema no declaran los cuatro campos', () => {
    const publico = Object.keys(ReportePublicoSchema.shape);
    const tecnico = Object.keys(ReporteTecnicoSchema.shape);
    for (const campo of CUATRO_CAMPOS) {
      expect(publico).not.toContain(campo);
      expect(tecnico).not.toContain(campo);
    }
  });

  it('CA-C3: una vista técnica válida con manzana_id añadido pasa parse y sale sin esa clave', () => {
    const r = ReporteTecnicoSchema.parse({ ...tecnicoValido, manzana_id: 'manzana:A-1' });
    expect('manzana_id' in r).toBe(false);
  });

  it('CA-C4: no se exportan DURACIONES ni AFECTACIONES y ETIQUETAS no tiene duracion ni afectacion', () => {
    const exportados = Object.keys(contratos);
    expect(exportados).not.toContain('DURACIONES');
    expect(exportados).not.toContain('AFECTACIONES');
    const etiquetas = Object.keys(ETIQUETAS);
    expect(etiquetas).not.toContain('duracion');
    expect(etiquetas).not.toContain('afectacion');
  });

  it('CA-C4: la capa manzana se conserva en TIPOS_CAPA y en la respuesta de /resolver', () => {
    expect([...TIPOS_CAPA]).toStrictEqual(['distrito_municipal', 'unidad_vecinal', 'manzana']);
    expect(Object.keys(ResolverRespuestaSchema.shape)).toContain('manzana');
    expect(Object.keys(ETIQUETAS.tipo_capa)).toContain('manzana');
  });
});

describe('ReporteCrearSchema', () => {
  it('acepta un reporte válido y aplica valores por defecto', () => {
    const r = ReporteCrearSchema.parse(valido);
    expect(r.causa_presunta).toBe('desconocida');
    expect(r.fotos).toEqual([]);
  });
  it('rechaza descripciones cortas', () => {
    expect(ReporteCrearSchema.safeParse({ ...valido, descripcion: 'agua' }).success).toBe(false);
  });
  it('rechaza el honeypot con contenido', () => {
    expect(ReporteCrearSchema.safeParse({ ...valido, sitio_web: 'http://spam' }).success).toBe(
      false,
    );
    expect(ReporteCrearSchema.safeParse({ ...valido, sitio_web: '' }).success).toBe(true);
  });
  it('rechaza más de 3 fotos y coordenadas fuera de rango', () => {
    expect(ReporteCrearSchema.safeParse({ ...valido, fotos: ['a', 'b', 'c', 'd'] }).success).toBe(
      false,
    );
    expect(ReporteCrearSchema.safeParse({ ...valido, lat: 91 }).success).toBe(false);
  });
});

describe('máquina de estados', () => {
  it('exige motivo en rechazado, duplicado y resuelto', () => {
    expect(ReporteCambiarEstadoSchema.safeParse({ estado: 'rechazado' }).success).toBe(false);
    expect(
      ReporteCambiarEstadoSchema.safeParse({
        estado: 'rechazado',
        estado_motivo: 'Fuera del municipio',
      }).success,
    ).toBe(true);
    expect(
      ReporteCambiarEstadoSchema.safeParse({ estado: 'duplicado', estado_motivo: 'x y z' }).success,
    ).toBe(false);
    expect(ReporteCambiarEstadoSchema.safeParse({ estado: 'validado' }).success).toBe(true);
  });
  it('respeta las transiciones y roles de §7.3', () => {
    expect(transicionPermitida('nuevo', 'validado', 'tecnico')).toBe(true);
    expect(transicionPermitida('nuevo', 'resuelto', 'tecnico')).toBe(false);
    expect(transicionPermitida('validado', 'resuelto', 'tecnico')).toBe(true);
    expect(transicionPermitida('rechazado', 'nuevo', 'tecnico')).toBe(false);
    expect(transicionPermitida('rechazado', 'nuevo', 'admin')).toBe(true);
    expect(transicionPermitida('resuelto', 'nuevo', 'admin')).toBe(false);
  });
});

describe('filtros y bbox', () => {
  it('parsea listas desde query string', () => {
    const f = ReporteFiltrosSchema.parse({ estado: 'validado,resuelto', severidad: ['alta'] });
    expect(f.estado).toEqual(['validado', 'resuelto']);
    expect(f.severidad).toEqual(['alta']);
    expect(f.pagina).toBe(1);
  });
  it('valida bbox', () => {
    expect(BboxSchema.parse('-63.3,-17.9,-63.1,-17.7')).toEqual([-63.3, -17.9, -63.1, -17.7]);
    expect(BboxSchema.safeParse('-63.1,-17.9,-63.3,-17.7').success).toBe(false);
  });
});
