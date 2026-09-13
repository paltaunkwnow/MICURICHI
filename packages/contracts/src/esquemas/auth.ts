import { z } from 'zod';
import { ROLES } from '../dominio/enums.js';

export const LoginSchema = z.object({
  email: z.email().max(200),
  password: z.string().min(8).max(200),
});
export type Login = z.infer<typeof LoginSchema>;

export const UsuarioSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  nombre: z.string(),
  rol: z.enum(ROLES),
});
export type Usuario = z.infer<typeof UsuarioSchema>;
