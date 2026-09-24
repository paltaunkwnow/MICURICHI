import { describe, expect, it } from 'vitest';
import {
  avisosResolucion,
  coordenadas,
  etiquetaCapa,
  etiquetaDistrito,
  etiquetaEstado,
  etiquetaMetodo,
  etiquetaSeveridad,
  etiquetaSiNo,
  etiquetaTirante,
  etiquetaUnidadVecinal,
  fechaCorta,
  fechaHora,
  idCorto,
  porcentaje,
  precisionGps,
} from './formato';

describe('etiquetas del dominio', () => {
  it('traduce severidad y estado con los textos de contracts', () => {
    expect(etiquetaSeveridad('critica')).toBe('Crítica');
    expect(etiquetaEstado('validado')).toBe('Validado');
    expect(etiquetaEstado('nuevo')).toBe('Nuevo');
  });

  it('compone el tirante con referencia corporal y rango', () => {
    expect(etiquetaTirante('rodilla')).toBe('A la rodilla · 10–40 cm');
    expect(etiquetaTirante('mas_70')).toContain('>70 cm');
  });

  it('describe el método de ubicación y los booleanos nulos', () => {
    expect(etiquetaMetodo('gps')).toBe('GPS del dispositivo');
    expect(etiquetaMetodo('manual')).toBe('Selección manual en el mapa');
    expect(etiquetaSiNo(null)).toBe('Sin dato');
    expect(etiquetaSiNo(true)).toBe('Sí');
  });

  it('nombra las capas conocidas y deja pasar las desconocidas', () => {
    expect(etiquetaCapa('unidad_vecinal')).toBe('Unidad vecinal');
    expect(etiquetaCapa('otra_capa')).toBe('otra_capa');
  });
});

describe('fechas y números', () => {
  it('formatea fechas en la zona horaria de Santa Cruz', () => {
    // 03:30 UTC del 2 de marzo es 23:30 del 1 de marzo en America/La_Paz (UTC-4).
    expect(fechaCorta('2026-03-02T03:30:00Z')).toMatch(/01 mar\.? 2026/);
    expect(fechaHora('2026-03-02T03:30:00Z')).toMatch(/23:30/);
    expect(fechaCorta(null)).toBe('—');
  });

  it('calcula porcentajes enteros y evita dividir por cero', () => {
    expect(porcentaje(1, 3)).toBe(33);
    expect(porcentaje(2, 3)).toBe(67);
    expect(porcentaje(5, 0)).toBe(0);
  });

  it('muestra coordenadas como lat, lon con 6 decimales', () => {
    expect(coordenadas(-63.18, -17.78)).toBe('-17.780000, -63.180000');
  });

  it('redondea la precisión GPS y acorta identificadores', () => {
    expect(precisionGps(12.6)).toBe('± 13 m');
    expect(precisionGps(null)).toBe('Sin dato');
    expect(idCorto('0a1b2c3d-4e5f-6789-abcd-ef0123456789')).toBe('0a1b2c3d');
  });
});

describe('avisosResolucion', () => {
  it('no avisa nada cuando la resolución fue normal', () => {
    expect(avisosResolucion({})).toEqual([]);
    expect(avisosResolucion(null)).toEqual([]);
    expect(
      avisosResolucion({
        en_limite: false,
        asignado_por_proximidad: false,
        distancia_m: null,
        distrito_discrepante: false,
      }),
    ).toEqual([]);
  });

  it('traduce cada bandera a un aviso en español', () => {
    expect(
      avisosResolucion({
        en_limite: true,
        asignado_por_proximidad: true,
        distancia_m: 12.4,
        distrito_discrepante: true,
      }),
    ).toEqual([
      'Punto en el borde de dos UV',
      'Asignado por proximidad (12 m)',
      'Distrito discrepante',
    ]);
  });

  it('omite la distancia si no viene como número', () => {
    expect(avisosResolucion({ asignado_por_proximidad: true })).toEqual([
      'Asignado por proximidad',
    ]);
  });
});

describe('etiquetas de unidad administrativa', () => {
  it('no repite el prefijo cuando el código ya lo trae', () => {
    // Los códigos que entrega el municipio pueden venir con prefijo o sin él: con la capa
    // sintética son «UV-106» y con otra podrían ser «106».
    expect(etiquetaUnidadVecinal('UV-106')).toBe('UV-106');
    expect(etiquetaUnidadVecinal('106')).toBe('UV 106');
    expect(etiquetaUnidadVecinal(null)).toBe('—');
  });

  it('normaliza el código de distrito', () => {
    expect(etiquetaDistrito('D02')).toBe('Distrito 02');
    expect(etiquetaDistrito('DM-11')).toBe('Distrito 11');
    expect(etiquetaDistrito('7')).toBe('Distrito 7');
    expect(etiquetaDistrito(undefined)).toBe('—');
  });
});
