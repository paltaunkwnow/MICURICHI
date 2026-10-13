import { CONFIG_DOMINIO, type SesionActual } from 'contracts';
import { describe, expect, it } from 'vitest';
import { restantesDeCategoria } from './cupo';
import { demoraDeCategoria } from './publicacion';

/**
 * Cupo por categoría (M3b, ADR 0012, 0017): `cupos[categoria]` de `/auth/yo`, con respaldo en los
 * campos sueltos (que valen para inundación o un api-core anterior a 0.20.0). Con inundación y una
 * sola categoría activa, los números son los mismos que con los campos sueltos.
 */
const BASE = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'vecina@ejemplo.test',
  nombre: 'Vecina',
  rol: 'ciudadano',
  puede_reportar_desde: null,
  reportes_restantes_hoy: CONFIG_DOMINIO.REPORTES_POR_DIA_POR_CUENTA,
  demora_proximo_s: CONFIG_DOMINIO.DEMORA_PUBLICACION_PRIMERO_S,
} as SesionActual;

describe('cupo por categoría, con respaldo', () => {
  it('usa cupos[categoria] cuando viene', () => {
    const s: SesionActual = {
      ...BASE,
      cupos: {
        inundacion: { restantes: 1, demora_proximo_s: 240, puede_reportar_desde: null },
        bache: {
          restantes: 0,
          demora_proximo_s: 60,
          puede_reportar_desde: '2026-10-11T00:00:00-04:00',
        },
      },
    };
    expect(restantesDeCategoria(s, 'inundacion')).toBe(1);
    expect(restantesDeCategoria(s, 'bache')).toBe(0);
    expect(demoraDeCategoria(s, 'inundacion')).toBe(240);
    // Con el cupo de esa categoría agotado no hay «próximo» hoy.
    expect(demoraDeCategoria(s, 'bache')).toBeNull();
  });

  it('sin cupos, respalda en los campos sueltos (inundación o api-core anterior a 0.20.0)', () => {
    expect(restantesDeCategoria(BASE, 'inundacion')).toBe(
      CONFIG_DOMINIO.REPORTES_POR_DIA_POR_CUENTA,
    );
    expect(demoraDeCategoria(BASE, 'inundacion')).toBe(CONFIG_DOMINIO.DEMORA_PUBLICACION_PRIMERO_S);
    // Una categoría sin entrada propia también cae al respaldo.
    expect(restantesDeCategoria(BASE, 'bache')).toBe(CONFIG_DOMINIO.REPORTES_POR_DIA_POR_CUENTA);
  });

  it('con el cupo agotado por los campos sueltos, no promete una demora', () => {
    const s: SesionActual = { ...BASE, reportes_restantes_hoy: 0 };
    expect(restantesDeCategoria(s, 'inundacion')).toBe(0);
    expect(demoraDeCategoria(s, 'inundacion')).toBeNull();
  });

  it('sin usuario no se sabe', () => {
    expect(restantesDeCategoria(null, 'inundacion')).toBeNull();
    expect(demoraDeCategoria(null, 'inundacion')).toBeNull();
    // Sin categoría (todavía no resuelta), cae al respaldo de los campos sueltos.
    expect(restantesDeCategoria(BASE, null)).toBe(CONFIG_DOMINIO.REPORTES_POR_DIA_POR_CUENTA);
  });
});
