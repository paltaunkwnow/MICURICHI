import { describe, expect, it } from 'vitest';
import { BboxSchema } from '../src/esquemas/comunes.js';
import {
  ReporteCambiarEstadoSchema,
  ReporteCrearSchema,
  ReporteFiltrosSchema,
  transicionPermitida,
} from '../src/esquemas/reporte.js';

const valido = {
  lat: -17.78,
  lon: -63.18,
  ubicacion_metodo: 'manual',
  ubicacion_tipo: 'via_publica',
  descripcion: 'Se junta agua hasta la rodilla cada vez que llueve fuerte.',
  tirante_estimado: 'rodilla',
  duracion_estimada: '2h_12h',
  frecuencia: 'cada_lluvia_fuerte',
  afectacion: 'vehicular',
};

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
