import { SUBTIPOS_AREA_VERDE } from 'contracts';

export const AVISO_PERSONA =
  'Esto no es una denuncia. Se deriva a Desarrollo Social para ofrecer ayuda, no a seguridad. No subas fotos donde se vea la cara de la persona.';
export const AVISO_QUEMA = 'Reportar quema de basura no sustituye la atención de emergencias.';
export const SIN_DERIVACION_AUTOMATICA = 'No hay derivación municipal automática.';

/** Textos locales de presentación; no envían el reporte a ninguna dependencia municipal. */
export function avisosCategoria(categoria: string, subtipo: string | null | undefined) {
  if (categoria === 'area_verde' && SUBTIPOS_AREA_VERDE.some((valor) => valor === subtipo)) {
    return {
      aviso: subtipo === 'persona_situacion_calle' ? AVISO_PERSONA : null,
      destinoPrevisto:
        subtipo === 'persona_situacion_calle' ? 'Desarrollo Social' : 'Parques y jardines',
    };
  }
  return {
    aviso: categoria === 'basura' && subtipo === 'quema_basura' ? AVISO_QUEMA : null,
    destinoPrevisto: null,
  };
}
