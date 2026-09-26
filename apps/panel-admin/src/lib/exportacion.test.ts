import { CONFIG_DOMINIO } from 'contracts';
import { describe, expect, it } from 'vitest';
import { ErrorApi, ErrorExportacionInvalida } from './api';
import { avisoExportacion, mensajeErrorExportacion } from './exportacion';
import { crearFormato } from './formato';

const F = crearFormato(CONFIG_DOMINIO.CIUDAD_POR_DEFECTO);

describe('aviso de exportación recortada', () => {
  it('si vino truncada dice cuántos de cuántos y qué hacer', () => {
    expect(avisoExportacion({ total: 61_234, exportados: 50_000, truncado: true }, F)).toBe(
      'Se exportaron 50.000 de 61.234 reportes; afiná los filtros.',
    );
  });

  it('las cifras van con el separador de miles de la ciudad del despliegue', () => {
    const mx = crearFormato({ locale: 'es-MX', zona_horaria: 'America/Mexico_City' });
    expect(avisoExportacion({ total: 61_234, exportados: 50_000, truncado: true }, mx)).toBe(
      'Se exportaron 50,000 de 61,234 reportes; afiná los filtros.',
    );
  });

  it('si vino completa no avisa nada', () => {
    expect(avisoExportacion({ total: 12, exportados: 12, truncado: false }, F)).toBeNull();
  });
});

describe('errores de exportación en palabras del técnico', () => {
  it('distingue formato inesperado, falta de permiso, error del servicio y red', () => {
    expect(mensajeErrorExportacion(new ErrorExportacionInvalida())).toContain('formato inesperado');
    expect(mensajeErrorExportacion(new ErrorApi('SIN_PERMISO', 'No', 403))).toBe(
      'Tu cuenta no puede exportar (403).',
    );
    expect(mensajeErrorExportacion(new ErrorApi('FILTROS_INVALIDOS', 'Fecha inválida', 400))).toBe(
      'No se pudo exportar: Fecha inválida',
    );
    expect(mensajeErrorExportacion(new TypeError('Failed to fetch'))).toBe(
      'No pudimos conectar con el servidor para exportar.',
    );
  });
});
