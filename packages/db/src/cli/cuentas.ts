/**
 * Alta y baja de cuentas técnicas, ejecutivas y de administrador en producción (revisión de
 * producción, 2026-09-26): el defecto que cierra es que una instalación nueva no tenía forma de
 * crear su primer admin (los seeds se niegan con NODE_ENV=production, y el alta pública solo crea
 * `ciudadano`).
 *
 *   node dist/cli/cuentas.js crear --email <e> --nombre <n> --rol admin|tecnico|ejecutivo
 *   node dist/cli/cuentas.js desactivar --email <e>
 *   node dist/cli/cuentas.js --help                          compilado, sin tsx (igual que migrar.js)
 *   pnpm --filter db cuentas:prod -- crear ...                lo mismo, desde el workspace
 *   pnpm --filter db cuentas -- crear ...                     desarrollo, con tsx
 *
 * La contraseña se lee de CUENTA_PASSWORD o de stdin, nunca por argumento (queda en el historial
 * de la shell y en `ps`). Lee DATABASE_URL, que tiene que ser el rol DUEÑO de la base: el rol de
 * aplicación (curichi_api) no tiene permiso para escribir `usuario.rol` a propósito desde la
 * migración 0009. Escribe una línea JSON por evento (forma de pino) y termina con código 0 solo si
 * la operación se completó. La lógica vive en `cuentas-comando.ts`.
 */
import { ejecutarComandoCuentas } from './cuentas-comando.js';

process.exitCode = await ejecutarComandoCuentas(process.argv.slice(2), process.env);
