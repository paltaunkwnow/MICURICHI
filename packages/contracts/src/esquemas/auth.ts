import { z } from 'zod';
import { CONFIG_DOMINIO } from '../dominio/config.js';
import { ROLES } from '../dominio/enums.js';

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

export const LoginSchema = z.object({
  email: EmailSchema,
  /** Mínimo 8, no 10: las cuentas anteriores a la regla actual tienen que poder entrar. */
  password: z.string().min(8).max(CONFIG_DOMINIO.PASSWORD_MAX_LONGITUD),
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
 * Lo que devuelve `GET /api/v1/auth/yo`: el usuario y, además, cuándo vuelve a tener turno para
 * reportar (null = ahora mismo).
 *
 * Existe para que la interfaz pueda avisar ANTES de que alguien rellene cinco pantallas y se
 * encuentre un 429 al final. No es el control: el control es el UPDATE atómico del servidor al
 * crear, y este campo no lo sustituye ni lo relaja.
 */
export const SesionActualSchema = UsuarioSchema.extend({
  puede_reportar_desde: z.iso.datetime({ offset: true }).nullable(),
});
export type SesionActual = z.infer<typeof SesionActualSchema>;
