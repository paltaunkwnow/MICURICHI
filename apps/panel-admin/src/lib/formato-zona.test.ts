import { CONFIG_DOMINIO } from 'contracts';
import { describe, expect, it } from 'vitest';
import * as formato from './formato';
import { crearFormato } from './formato';

/**
 * Fechas y números salen con la zona horaria y el locale de la ciudad del despliegue
 * (`GET /api/v1/configuracion`), no con constantes: la misma imagen sirve a cualquier ciudad.
 */
describe('formato de la ciudad del despliegue', () => {
  it('fechaHora y fechaCorta siguen la zona horaria de la ciudad', () => {
    const bogota = crearFormato({ locale: 'es-CO', zona_horaria: 'America/Bogota' });
    // 03:30 UTC del 2 de marzo = 22:30 del 1 de marzo en Bogotá (en La Paz serían las 23:30).
    expect(bogota.fechaHora('2026-03-02T03:30:00Z')).toMatch(/22:30/);
    expect(bogota.fechaCorta('2026-03-02T03:30:00Z')).toMatch(/01 de mar\.? de 2026/);
  });

  it('los números llevan el separador de miles del locale de la ciudad', () => {
    expect(crearFormato({ locale: 'es-BO', zona_horaria: 'America/La_Paz' }).numero(61_234)).toBe(
      '61.234',
    );
    expect(
      crearFormato({ locale: 'es-MX', zona_horaria: 'America/Mexico_City' }).numero(61_234),
    ).toBe('61,234');
  });

  it('con la ciudad por defecto se ve igual que antes (Santa Cruz, America/La_Paz, es-BO)', () => {
    const f = crearFormato(CONFIG_DOMINIO.CIUDAD_POR_DEFECTO);
    expect(f.fechaHora('2026-03-02T03:30:00Z')).toMatch(/01 mar\.? 2026.*23:30/);
    expect(f.numero(1234)).toBe('1.234');
  });

  it('ya no hay una zona horaria ni un formateador fijo exportado que se pueda usar sin ciudad', () => {
    const exportados = Object.keys(formato);
    for (const nombre of ['ZONA_HORARIA', 'fechaCorta', 'fechaHora', 'numero']) {
      expect(exportados).not.toContain(nombre);
    }
  });
});
