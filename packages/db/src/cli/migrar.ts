/**
 * Aplica las migraciones pendientes (Parte 4). Es la forma de cambiar el esquema en producción:
 *
 *   node dist/cli/migrar.js [--hasta NNNN]   compilado, sin tsx (job de despliegue)
 *   pnpm --filter db migrate:prod            lo mismo, desde el workspace
 *   pnpm db:migrate [--hasta NNNN]           desarrollo, con tsx
 *
 * Lee DATABASE_URL y MIGRAR_LOCK_TIMEOUT_MS, escribe una línea JSON por evento y termina con
 * código 0 solo si todo quedó aplicado. La lógica vive en `migrar-comando.ts`.
 */
import { ejecutarComandoMigrar } from './migrar-comando.js';

process.exitCode = await ejecutarComandoMigrar(process.argv.slice(2), process.env);
