import { z } from 'zod';
import { LatSchema, LonSchema } from './comunes.js';

/**
 * Configuración pública del despliegue: `GET /api/v1/configuracion` (pública, cacheable).
 *
 * Mi Curichi se despliega una vez por ciudad con la misma imagen. Lo que cambia de una ciudad a
 * otra llega a los clientes en tiempo de ejecución por aquí, en vez de quedar fijado en su
 * JavaScript al compilar. Los valores de la instalación actual (Santa Cruz) están en
 * `CONFIG_DOMINIO.CIUDAD_POR_DEFECTO`.
 *
 * Los formatos se validan porque un valor malo no falla al configurarlo sino después, en el
 * navegador: `Intl` lanza RangeError con `es_BO` o con una zona inexistente, y la pantalla que
 * formatea una fecha se cae.
 */

/** Mismo criterio que api-core aplica a `ZONA_HORARIA`: nombre IANA, nunca un desfase como -04:00. */
const PATRON_ZONA_IANA = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/;

function zonaReconocida(zona: string): boolean {
  try {
    new Intl.DateTimeFormat('es', { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

export const CiudadSchema = z.object({
  nombre: z.string().trim().min(1).max(100).meta({ description: 'Nombre visible de la ciudad' }),
  pais: z
    .string()
    .regex(/^[A-Z]{2}$/, 'Código de país ISO 3166-1 alfa-2 en mayúsculas, p. ej. BO.')
    .meta({ description: 'ISO 3166-1 alfa-2, p. ej. BO' }),
  zona_horaria: z
    .string()
    // `abort`: si no tiene forma de nombre IANA, no se consulta a Intl y el error sale una vez.
    .regex(PATRON_ZONA_IANA, {
      message: 'Zona horaria como nombre IANA, p. ej. America/La_Paz (no un desfase como -04:00).',
      abort: true,
    })
    .refine(zonaReconocida, 'Zona horaria IANA desconocida, p. ej. America/La_Paz.')
    .meta({ description: 'Nombre IANA, p. ej. America/La_Paz' }),
  locale: z
    .string()
    .regex(
      /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-(?:[A-Z]{2}|\d{3}))?$/,
      'Etiqueta BCP 47 en forma canónica, p. ej. es-BO o es-419 (no es_BO ni es-bo).',
    )
    .meta({ description: 'Etiqueta BCP 47 para Intl, p. ej. es-BO' }),
  centro: z
    .object({ lon: LonSchema, lat: LatSchema })
    .meta({ description: 'Dónde abre el mapa antes de conocer las capas (EPSG:4326)' }),
  zoom_inicial: z
    .number()
    .min(0)
    .max(22)
    .meta({ description: 'Zoom inicial del mapa (MapLibre, 0 a 22)' }),
});
export type Ciudad = z.infer<typeof CiudadSchema>;

export const ConfiguracionPublicaSchema = z.object({ ciudad: CiudadSchema });
export type ConfiguracionPublica = z.infer<typeof ConfiguracionPublicaSchema>;
