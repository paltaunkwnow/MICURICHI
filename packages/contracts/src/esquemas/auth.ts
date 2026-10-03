import { z } from 'zod';
import { CONFIG_DOMINIO } from '../dominio/config.js';
import { ROLES, ROLES_DEL_PANEL, type Rol } from '../dominio/enums.js';

/**
 * Normalización del correo. Se hace en el contrato y no en cada ruta para que el mismo valor
 * llegue al registro, al login y al índice único de la base.
 *
 * Solo recorta espacios y baja a minúsculas. NO se tocan los puntos ni los sufijos `+algo`:
 * eso es política de Gmail, no del correo electrónico, y aplicarla convertiría dos direcciones
 * distintas de otro proveedor en la misma. Que alguien pueda registrar `a+1@` y `a+2@` como dos
 * cuentas es un hecho conocido; lo que impide el abuso es el límite por cuenta y por IP, no
 * pretender que cada persona solo tiene una dirección.
 */
const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Escribí un correo electrónico válido.').max(200));

const IdentificadorLoginSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(200)
  .transform((val) => (val.includes('@') ? val : `${val}@curichi.local`))
  .pipe(z.email('Escribí un correo electrónico o usuario válido.'));

export const LoginSchema = z.object({
  email: IdentificadorLoginSchema,
  password: z.string().min(1, 'Escribí tu contraseña.').max(CONFIG_DOMINIO.PASSWORD_MAX_LONGITUD),
});
export type Login = z.infer<typeof LoginSchema>;

/**
 * Alta de cuenta ciudadana.
 *
 * NO lleva `rol`. No es un olvido: el rol lo pone el servidor y siempre es `ciudadano`. Un campo
 * de rol en el payload, aunque estuviera validado contra la lista de roles, sería una escalada de
 * privilegios a un POST de distancia. Los roles técnicos se asignan fuera de esta ruta.
 */
export const RegistroSchema = z.object({
  email: EmailSchema,
  nombre: z
    .string()
    .trim()
    .min(2, 'Escribí tu nombre o cómo querés que te llamemos.')
    .max(80, 'Máximo 80 caracteres.'),
  password: z
    .string()
    .min(
      CONFIG_DOMINIO.PASSWORD_MIN_LONGITUD,
      `La contraseña necesita al menos ${CONFIG_DOMINIO.PASSWORD_MIN_LONGITUD} caracteres.`,
    )
    .max(CONFIG_DOMINIO.PASSWORD_MAX_LONGITUD, 'Máximo 200 caracteres.'),
});
export type Registro = z.infer<typeof RegistroSchema>;

export const UsuarioSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  nombre: z.string(),
  rol: z.enum(ROLES),
});
export type Usuario = z.infer<typeof UsuarioSchema>;

/**
 * Lo que devuelve `GET /api/v1/auth/yo`: el usuario y, además, cuántos reportes le quedan hoy y
 * cuándo vuelve a tener turno para reportar (null = ahora mismo).
 *
 * Existe para que la interfaz pueda avisar ANTES de que alguien rellene cinco pantallas y se
 * encuentre un 429 al final. No es el control: el control es el contador atómico del servidor al
 * crear, y estos campos no lo sustituyen ni lo relajan.
 *
 * `reportes_restantes_hoy` (desde 0.10.0) y `demora_proximo_s` (desde 0.11.0) son obligatorios
 * desde 0.15.0.
 *
 * `panel_url` (desde 0.7.0) es la dirección del panel, y solo existe para `ROLES_DEL_PANEL`.
 * Antes viajaba fijada en el JavaScript público de la app ciudadana, a la vista de cualquiera.
 * Esconderla no protege el panel (lo protegen el propio panel y los 403 de api-core), pero no hay
 * por qué publicarla. Por eso el esquema rechaza una sesión de ciudadano que la traiga, aunque
 * sea null.
 */
export const SesionActualSchema = UsuarioSchema.extend({
  puede_reportar_desde: z.iso.datetime({ offset: true }).nullable().meta({
    description:
      'null si la cuenta puede reportar ahora; si ya usó los reportes de hoy, la próxima medianoche en la zona horaria de la ciudad (ISO 8601 con desfase)',
  }),
  reportes_restantes_hoy: z
    .number()
    .int()
    .min(0)
    .meta({
      description: `Reportes que le quedan hoy a la cuenta, de ${CONFIG_DOMINIO.REPORTES_POR_DIA_POR_CUENTA} por día calendario en la zona horaria de la ciudad`,
    }),
  demora_proximo_s: z
    .number()
    .int()
    .min(0)
    // El tope es el de las variables de api-core (0 a 3600): las pruebas corren con 0, y el CHECK
    // de la base no deja que publicar_en pase de creado_en + 1 h.
    .max(3600)
    .meta({
      description: `Segundos que tardaría en publicarse el próximo reporte si se enviara ahora: ${CONFIG_DOMINIO.DEMORA_PUBLICACION_PRIMERO_S} si la cuenta todavía no envió ninguno hoy, ${CONFIG_DOMINIO.DEMORA_PUBLICACION_SIGUIENTES_S} si ya envió alguno. Con el cupo agotado no se usa: puede_reportar_desde dice cuándo vuelve a poder`,
    }),
  panel_url: z
    // `abort`: con una URL que no se puede leer, la comprobación de credenciales no llega a correr.
    .url({ protocol: /^https?$/, abort: true, message: 'URL absoluta http o https.' })
    .refine((url) => {
      const { username, password } = new URL(url);
      return !username && !password;
    }, 'Sin usuario ni contraseña en la URL.')
    .nullable()
    .optional()
    .meta({
      description:
        'URL base del panel (http/https). Solo para tecnico, admin y ejecutivo; null si el despliegue no la configuró. Ausente para ciudadano.',
    }),
}).refine((s) => s.panel_url === undefined || esRolDelPanel(s.rol), {
  path: ['panel_url'],
  message: 'panel_url solo se manda a los roles del panel.',
});
export type SesionActual = z.infer<typeof SesionActualSchema>;

function esRolDelPanel(rol: Rol): boolean {
  return (ROLES_DEL_PANEL as readonly Rol[]).includes(rol);
}
