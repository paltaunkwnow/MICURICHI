import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DIRECTORIO_MIGRACIONES, listarMigraciones } from '../migrar.js';

const nombre = (process.argv[2] ?? 'cambio').toLowerCase().replace(/[^a-z0-9]+/g, '_');
const n = String(listarMigraciones().length + 1).padStart(4, '0');
const archivo = join(DIRECTORIO_MIGRACIONES, `${n}_${nombre}.sql`);
writeFileSync(
  archivo,
  `-- Migración ${n} — ${nombre} (Parte 4). Escribir SQL idempotente dentro de una transacción.\n`,
);
console.log(`[db] creada ${archivo}`);
