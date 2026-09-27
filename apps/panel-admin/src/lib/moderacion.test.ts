import { describe, expect, it } from 'vitest';
import { accionesModeracion, cuerpoCambioEstado, TEXTOS_ACCION } from './moderacion';

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

describe('retirar del mapa un reporte verificado (solo admin, contracts 0.11.0)', () => {
  it('retirar pasa a «rechazado» y exige motivo', () => {
    expect(cuerpoCambioEstado('retirar', '  Foto con datos personales  ')).toEqual({
      ok: true,
      cuerpo: { estado: 'rechazado', estado_motivo: 'Foto con datos personales' },
    });
    for (const motivo of ['', '   ', 'no']) {
      const r = cuerpoCambioEstado('retirar', motivo);
      expect(r.ok, JSON.stringify(motivo)).toBe(false);
      if (!r.ok) expect(r.error).toContain('retirar');
    }
  });

  it('en un validado, el admin ve «Retirar del mapa» y no «Rechazar»', () => {
    const a = accionesModeracion('validado', 'admin');
    expect(a.retirar).toBe(true);
    expect(a.rechazar).toBe(false);
    expect(a.resolver).toBe(true);
    expect(a.fusionar).toBe(true);
  });

  it('el técnico no puede retirar un verificado', () => {
    const a = accionesModeracion('validado', 'tecnico');
    expect(a.retirar).toBe(false);
    expect(a.rechazar).toBe(false);
    expect(a.resolver).toBe(true);
  });

  it('en un nuevo, rechazar sigue siendo rechazar, para técnico y admin', () => {
    for (const rol of ['tecnico', 'admin'] as const) {
      const a = accionesModeracion('nuevo', rol);
      expect(a.rechazar, rol).toBe(true);
      expect(a.retirar, rol).toBe(false);
      expect(a.validar, rol).toBe(true);
    }
  });

  it('el ejecutivo y el ciudadano no tienen acciones', () => {
    for (const rol of ['ejecutivo', 'ciudadano'] as const) {
      expect(Object.values(accionesModeracion('validado', rol)).some(Boolean), rol).toBe(false);
      expect(Object.values(accionesModeracion('nuevo', rol)).some(Boolean), rol).toBe(false);
    }
  });

  it('los textos dicen que rechazar, retirar y fusionar sacan el reporte del mapa público', () => {
    expect(TEXTOS_ACCION.rechazar.ayuda).toContain('Lo retira del mapa público');
    expect(TEXTOS_ACCION.fusionar.ayuda).toContain('Lo retira del mapa público');
    expect(TEXTOS_ACCION.retirar.titulo).toBe('Retirar del mapa público');
    expect(TEXTOS_ACCION.retirar.ayuda).toContain('solo administradores');
    expect(TEXTOS_ACCION.retirar.ayuda).toContain('motivo es obligatorio');
    expect(TEXTOS_ACCION.retirar.confirmar).toBe('Confirmar retiro');
  });
});
