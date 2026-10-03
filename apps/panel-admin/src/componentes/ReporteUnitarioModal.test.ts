import type { ReporteTecnico, ReporteTecnicoFeature } from 'contracts';
import { describe, expect, it } from 'vitest';
import { generarTextoReporteUnitario } from './ReporteUnitarioModal';

function reportePrueba(extra: Partial<ReporteTecnico> = {}): ReporteTecnicoFeature {
  return {
    type: 'Feature',
    id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    geometry: {
      type: 'Point',
      coordinates: [-63.181234, -17.785678],
    },
    properties: {
      id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      creado_en: '2026-09-27T14:30:00.000Z',
      evento_en: '2026-09-27T12:00:00.000Z',
      distrito: { id: 'distrito_municipal:07', codigo: '07', nombre: 'Distrito 7' },
      unidad_vecinal: { id: 'unidad_vecinal:123', codigo: '123', nombre: 'Los Lotes' },
      descripcion: 'Agua acumulada frente al colegio tras la lluvia torrencial.',
      fotos: ['https://ejemplo.com/foto1.webp'],
      profundidad_estimada: 'rodilla',
      frecuencia: 'agua_estancada',
      causa_presunta: 'sumidero_tapado',
      severidad: 'media',
      severidad_calculada: 'media',
      severidad_puntaje: 6,
      severidad_manual: null,
      severidad_motivo: null,
      estado: 'resuelto',
      estado_motivo: 'Cuadrilla municipal desobstruyó el colector principal.',
      verificado: true,
      punto_critico_id: 'c1d2e3f4-a5b6-7c8d-9e0f-1a2b3c4d5e6f',
      n_reportes_punto: 3,
      precision_degradada: false,
      ubicacion_metodo: 'gps',
      precision_gps_m: 6.5,
      distancia_dispositivo_m: 2,
      ubicacion_tipo: 'via_publica',
      sumidero_cercano: 'si',
      sumidero_estado: 'tapado',
      agua_brota_sumidero: true,
      fusionado_en_id: null,
      validado_por: 'tecnico@curichi.local',
      validado_en: '2026-09-27T15:00:00.000Z',
      actualizado_en: '2026-09-27T16:00:00.000Z',
      version_capa: '2026_09',
      resolucion_flags: {},
      autor_id: 'usr-ciudadano-99',
      ...extra,
    },
  };
}

describe('ReporteUnitarioModal: generación de ficha técnica unitaria', () => {
  const formatoPrueba = {
    fechaHora: (f: string | null | undefined) => (f ? `FMT(${f})` : '—'),
    numero: (n: number) => String(n),
  };

  it('genera el texto estructurado del reporte unitario con todas las secciones oficiales', () => {
    const f = reportePrueba();
    const texto = generarTextoReporteUnitario(f, formatoPrueba);

    // Encabezado institucional
    expect(texto).toContain('GOBIERNO AUTÓNOMO MUNICIPAL');
    expect(texto).toContain('FICHA TÉCNICA - REPORTE UNITARIO DE INUNDACIÓN');

    // Identificación
    expect(texto).toContain('ID Reporte (UUID):  a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');
    expect(texto).toContain('Código de Rastreo:  a1b2c3d4');
    expect(texto).toContain('Estado Actual:      RESUELTO');
    expect(texto).toContain('Condición:          TÉCNICAMENTE VERIFICADO');

    // Localización
    expect(texto).toContain('Distrito 7');
    expect(texto).toContain('Los Lotes');
    expect(texto).toContain('Latitud: -17.785678, Longitud: -63.181234');
    expect(texto).toContain('Vía pública');

    // Evaluación hidráulica y severidad
    expect(texto).toContain('A la rodilla');
    expect(texto).toContain('Agua estancada');
    expect(texto).toContain('Sumidero tapado');
    expect(texto).toContain('Puntaje de Severidad: 6 de 13 puntos');
    expect(texto).toContain('Severidad Efectiva:   MEDIA');

    // Descripción del ciudadano
    expect(texto).toContain('Agua acumulada frente al colegio tras la lluvia torrencial.');

    // Moderación y cierre técnico
    expect(texto).toContain('Validado Por:       tecnico@curichi.local');
    expect(texto).toContain('Cuadrilla municipal desobstruyó el colector principal.');

    // Firmas
    expect(texto).toContain('FIRMA TÉCNICO EVALUADOR');
    expect(texto).toContain('FIRMA SUPERVISOR DE DRENAJE');
  });

  it('maneja reportes sin fotos, sin evento_en y sin validación previa', () => {
    const f = reportePrueba({
      fotos: [],
      evento_en: null,
      validado_por: null,
      validado_en: null,
      estado_motivo: null,
      estado: 'nuevo',
      verificado: false,
    });
    const texto = generarTextoReporteUnitario(f, formatoPrueba);

    expect(texto).toContain('Sin fotografías adjuntas.');
    expect(texto).toContain('NO SE HA VERIFICADO');
    expect(texto).toContain('Pendiente de asignación');
  });
});
