import { SUBTIPOS_AREA_VERDE, SUBTIPOS_BASURA } from 'contracts';
import { describe, expect, it } from 'vitest';
import { AVISO_PERSONA, AVISO_QUEMA, avisosCategoria } from './avisos-categoria';

describe('avisos locales de las categorías reales', () => {
  it('conserva literalmente el aviso aprobado de Persona y su destino previsto', () => {
    expect(AVISO_PERSONA).toBe(
      'Esto no es una denuncia. Se deriva a Desarrollo Social para ofrecer ayuda, no a seguridad. No subas fotos donde se vea la cara de la persona.',
    );
    expect(avisosCategoria('area_verde', 'persona_situacion_calle')).toEqual({
      aviso: AVISO_PERSONA,
      destinoPrevisto: 'Desarrollo Social',
    });
  });

  it.each(SUBTIPOS_AREA_VERDE.filter((subtipo) => subtipo !== 'persona_situacion_calle'))(
    '%s tiene previsto Parques y jardines, sin arrastrar el aviso de Persona',
    (subtipo) => {
      expect(avisosCategoria('area_verde', subtipo)).toEqual({
        aviso: null,
        destinoPrevisto: 'Parques y jardines',
      });
    },
  );

  it('Quema informa sobre emergencias sin teléfono ni destino municipal automático', () => {
    expect(AVISO_QUEMA).toBe('Reportar quema de basura no sustituye la atención de emergencias.');
    expect(avisosCategoria('basura', 'quema_basura')).toEqual({
      aviso: AVISO_QUEMA,
      destinoPrevisto: null,
    });
    expect(AVISO_QUEMA).not.toMatch(/\d/);
  });

  it.each(SUBTIPOS_BASURA.filter((subtipo) => subtipo !== 'quema_basura'))(
    '%s no hereda el aviso de Quema',
    (subtipo) => {
      expect(avisosCategoria('basura', subtipo)).toEqual({ aviso: null, destinoPrevisto: null });
    },
  );

  it.each([
    ['inundacion', 'persona_situacion_calle'],
    ['bache', 'quema_basura'],
    ['basura', 'persona_situacion_calle'],
    ['area_verde', 'quema_basura'],
    ['area_verde', 'subtipo_historico'],
    ['categoria_historica', 'persona_situacion_calle'],
    ['area_verde', null],
    ['area_verde', undefined],
    ['basura', null],
    ['basura', undefined],
  ] as const)('no atribuye aviso ni destino a %s/%s', (categoria, subtipo) => {
    expect(avisosCategoria(categoria, subtipo)).toEqual({
      aviso: null,
      destinoPrevisto: null,
    });
  });

  it('el cambio Persona → parque → Quema → microbasural no deja avisos residuales', () => {
    const persona = avisosCategoria('area_verde', 'persona_situacion_calle');
    expect(avisosCategoria('area_verde', 'parque_plaza_descuidada').aviso).toBeNull();
    expect(avisosCategoria('basura', 'quema_basura').aviso).toBe(AVISO_QUEMA);
    expect(avisosCategoria('basura', 'microbasural')).toEqual({
      aviso: null,
      destinoPrevisto: null,
    });
    expect(persona).toEqual({ aviso: AVISO_PERSONA, destinoPrevisto: 'Desarrollo Social' });
  });
});
