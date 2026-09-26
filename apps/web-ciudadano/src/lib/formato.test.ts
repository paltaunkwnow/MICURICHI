import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ReporteFeature } from './api';
import type { Regional } from './ciudad';
import * as formato from './formato';
import {
  contadorDescripcion,
  distanciaDesde,
  etiquetaDistrito,
  etiquetaProfundidad,
  etiquetaUnidadVecinal,
  fechaCorta,
  horaCorta,
  numeroConMiles,
  subtituloReporte,
  textoCapaOficial,
  tituloPuntos,
  tituloReporte,
  urlFotoRelativa,
} from './formato';

const LA_PAZ: Regional = { locale: 'es-BO', zona_horaria: 'America/La_Paz' };
const MADRID: Regional = { locale: 'es-ES', zona_horaria: 'Europe/Madrid' };

describe('fechas y cifras con el formato de la ciudad configurada', () => {
  // Un servidor en UTC (lo normal en un contenedor) no puede mover el día que se muestra.
  const TZ_ORIGINAL = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'UTC';
  });
  afterAll(() => {
    if (TZ_ORIGINAL === undefined) delete process.env.TZ;
    else process.env.TZ = TZ_ORIGINAL;
  });

  it('la fecha es la del día en la ciudad, no la del reloj del servidor ni del teléfono', () => {
    // Las 02:00 UTC del 25 son todavía las 22:00 del 24 en La Paz (UTC−4) y ya el 25 en Madrid.
    expect(fechaCorta('2026-09-25T02:00:00Z', LA_PAZ)).toBe('24 sept 2026');
    expect(fechaCorta('2026-09-25T02:00:00Z', MADRID)).toBe('25 sept 2026');
  });

  it('la hora también sale en la zona de la ciudad, en 24 h', () => {
    expect(horaCorta(new Date('2026-09-25T18:30:00Z'), LA_PAZ)).toBe('14:30');
    expect(horaCorta(new Date('2026-09-25T18:30:00Z'), MADRID)).toBe('20:30');
  });

  it('los miles se separan como en el locale de la ciudad', () => {
    expect(numeroConMiles(3488, 'es-BO')).toBe('3.488');
    expect(numeroConMiles(3488, 'es-MX')).toBe('3,488');
    expect(numeroConMiles(Number.NaN, 'es-BO')).toBe('');
  });
});

const props = {
  id: '00000000-0000-0000-0000-000000000001',
  distrito: { id: 'distrito_municipal:7', codigo: '7', nombre: 'Distrito 7' },
  unidad_vecinal: { id: 'unidad_vecinal:123', codigo: '123', nombre: 'Unidad Vecinal 123' },
  profundidad_estimada: 'rodilla',
} as unknown as ReporteFeature['properties'];

const reporte = {
  type: 'Feature',
  id: props.id,
  geometry: { type: 'Point', coordinates: [-63.18, -17.78] },
  properties: props,
} as ReporteFeature;

describe('formato', () => {
  it('CA-W5: el título es el nombre de la UV, o «Unidad vecinal sin datos» si no hay UV', () => {
    const losLotes = {
      ...props,
      unidad_vecinal: { id: 'unidad_vecinal:9', codigo: '9', nombre: 'Los Lotes' },
    } as ReporteFeature['properties'];
    const sinUv = { ...props, unidad_vecinal: null } as unknown as ReporteFeature['properties'];
    expect(tituloReporte(losLotes)).toBe('Los Lotes');
    expect(tituloReporte(sinUv)).toBe('Unidad vecinal sin datos');
  });

  it('CA-W5: el título no usa la dirección aproximada aunque llegue en un objeto viejo', () => {
    // Una respuesta guardada en la caché de la PWA antes del cambio todavía puede traer
    // `direccion_aprox`. El campo ya no existe en el contrato: el título no puede depender de él.
    const viejo = {
      ...props,
      unidad_vecinal: { id: 'unidad_vecinal:9', codigo: '9', nombre: 'Los Lotes' },
      direccion_aprox: 'Av. Piraí esq. Los Tajibos',
    } as unknown as ReporteFeature['properties'];
    expect(tituloReporte(viejo)).toBe('Los Lotes');
  });

  it('CA-W5: formato.ts no exporta etiquetaDuracion ni etiquetaAfectacion', () => {
    expect(Object.keys(formato)).not.toContain('etiquetaDuracion');
    expect(Object.keys(formato)).not.toContain('etiquetaAfectacion');
  });

  it('arma el subtítulo con UV, distrito y distancia', () => {
    expect(subtituloReporte(props)).toBe('UV 123 · Distrito 7');
    expect(subtituloReporte(props, 320)).toBe('UV 123 · Distrito 7 · a 320 m de vos');
    expect(subtituloReporte(props, 2400)).toBe('UV 123 · Distrito 7 · a 2.4 km de vos');
  });

  it('pluraliza el título del panel', () => {
    expect(tituloPuntos(undefined)).toContain('Buscando');
    expect(tituloPuntos(1)).toBe('1 punto cerca de vos');
    expect(tituloPuntos(9)).toBe('9 puntos cerca de vos');
  });

  it('describe la profundidad con su rango en centímetros', () => {
    expect(etiquetaProfundidad('rodilla')).toBe('A la rodilla · 10–40 cm');
  });

  it('calcula la distancia solo si hay ubicación del vecino', () => {
    expect(distanciaDesde(null, reporte)).toBeNull();
    const d = distanciaDesde({ lat: -17.781, lon: -63.18 }, reporte);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(130);
  });

  it('arma el chip de capa oficial', () => {
    expect(textoCapaOficial(props.distrito, props.unidad_vecinal)).toBe(
      'Distrito 7 · UV 123 · capa oficial vigente',
    );
    expect(textoCapaOficial(null, null)).toBe('Fuera de la cobertura municipal');
  });

  it('no repite el prefijo cuando el código ya lo trae', () => {
    // Los códigos que entrega el municipio pueden venir con prefijo o sin él; con la capa
    // sintética son «UV-106» y con otra podrían ser «106». Las dos formas tienen que leerse bien.
    expect(etiquetaUnidadVecinal('UV-106')).toBe('UV-106');
    expect(etiquetaUnidadVecinal('uv-106')).toBe('UV-106');
    expect(etiquetaUnidadVecinal('106')).toBe('UV 106');
    expect(etiquetaUnidadVecinal(null)).toBe('Sin unidad vecinal');
  });

  it('normaliza el código de distrito', () => {
    expect(etiquetaDistrito('D02')).toBe('Distrito 02');
    expect(etiquetaDistrito('DM-11')).toBe('Distrito 11');
    expect(etiquetaDistrito('7')).toBe('Distrito 7');
    expect(etiquetaDistrito(undefined)).toBe('Sin distrito');
  });

  it('cuenta los caracteres de la descripción', () => {
    expect(contadorDescripcion(0)).toBe('Mínimo 10 caracteres · 0/1000');
  });

  it('pasa las URLs de fotos a relativas para el rewrite de Next', () => {
    expect(urlFotoRelativa('http://127.0.0.1:3001/api/v1/fotos/abc.jpg')).toBe(
      '/api/v1/fotos/abc.jpg',
    );
    expect(urlFotoRelativa('/api/v1/fotos/abc.jpg')).toBe('/api/v1/fotos/abc.jpg');
  });
});
