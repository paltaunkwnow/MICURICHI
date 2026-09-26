import { describe, expect, it } from 'vitest';
import { cuerpoCambioEstado } from './moderacion';

describe('cuerpo del cambio de estado (mismo esquema que aplica api-core)', () => {
  it('reabrir un rechazado exige motivo', () => {
    for (const motivo of ['', '   ', 'ok']) {
      const r = cuerpoCambioEstado('reabrir', motivo);
      expect(r.ok, JSON.stringify(motivo)).toBe(false);
      if (!r.ok) expect(r.error).toContain('reabrir');
    }
  });

  it('con motivo, reabrir vuelve a «nuevo» y manda el motivo sin espacios de más', () => {
    expect(cuerpoCambioEstado('reabrir', '  Llegaron fotos nuevas del vecino  ')).toEqual({
      ok: true,
      cuerpo: { estado: 'nuevo', estado_motivo: 'Llegaron fotos nuevas del vecino' },
    });
  });

  it('rechazar y resolver siguen exigiendo motivo', () => {
    expect(cuerpoCambioEstado('rechazar', 'no').ok).toBe(false);
    expect(cuerpoCambioEstado('resolver', '')).toEqual({
      ok: false,
      error: 'Escribí un motivo de al menos 3 caracteres.',
    });
    expect(cuerpoCambioEstado('resolver', 'Se destapó el sumidero')).toEqual({
      ok: true,
      cuerpo: { estado: 'resuelto', estado_motivo: 'Se destapó el sumidero' },
    });
  });
});
