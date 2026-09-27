import { ESTADOS_PUBLICOS, type EstadoPublico, type EstadoReporte, ETIQUETAS } from 'contracts';

/**
 * Cómo ve el público un reporte, para el detalle técnico. Desde contracts 0.11.0 no hay
 * moderación previa: un `nuevo` ya se ve en el mapa como «NO SE HA VERIFICADO» y lo que lo saca
 * es rechazarlo o fusionarlo. El técnico solo ve reportes con `publicar_en` vencido (api-core le
 * da 404 mientras esperan), así que un estado público acá siempre es visible.
 */
export function visibilidadPublica(estado: EstadoReporte): { publico: boolean; texto: string } {
  if ((ESTADOS_PUBLICOS as readonly string[]).includes(estado)) {
    const etiqueta = ETIQUETAS.estado_publico[estado as EstadoPublico];
    return { publico: true, texto: `Visible en el mapa público como ${etiqueta}` };
  }
  return {
    publico: false,
    texto:
      estado === 'duplicado'
        ? 'No se ve en el mapa público: se sumó a otro reporte como duplicado'
        : 'No se ve en el mapa público: está rechazado',
  };
}

/** Aviso fijo de la bandeja: lo que queda sin revisar ya lo está viendo el público. */
export const AVISO_BANDEJA_PUBLICOS = `Los reportes nuevos ya se ven en el mapa público como «${ETIQUETAS.estado_publico.nuevo}». Validar uno lo muestra como «${ETIQUETAS.estado_publico.validado}»; rechazarlo o fusionarlo lo retira del mapa.`;
