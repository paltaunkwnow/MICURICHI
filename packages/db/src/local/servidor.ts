/**
 * PostGIS local SIN Docker (ADR 0002): PGlite + extensión postgis, expuesto por protocolo PostgreSQL
 * en 127.0.0.1:5433 con multiplexado de conexiones. Aplica migraciones pendientes al arrancar.
 *
 *   pnpm db:local            # datos persistentes en infra/.pglite
 *   PGLITE_MEMORIA=1 ...     # base efímera en memoria (tests, demos)
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ejecutorPglite } from '../ejecutor.js';
import { aplicarMigraciones } from '../migrar.js';

const raizRepo = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const puerto = Number(
  process.env.PGLITE_PUERTO ??
    new URL(process.env.DATABASE_URL ?? 'postgresql://x@127.0.0.1:5433/x').port ??
    5433,
);
const enMemoria = process.env.PGLITE_MEMORIA === '1';
const dataDir = process.env.PGLITE_DATA_DIR ?? resolve(raizRepo, 'infra/.pglite');

async function main() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { postgis } = await import('@electric-sql/pglite-postgis');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');

  if (!enMemoria && !existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  const db = await PGlite.create({
    dataDir: enMemoria ? 'memory://' : dataDir,
    extensions: { postgis },
  });
  const version = await db.query<{ v: string }>('SELECT version() AS v');
  console.log(`[db:local] ${version.rows[0]?.v}`);
  console.log(`[db:local] datos: ${enMemoria ? 'memoria (efímeros)' : dataDir}`);

  const r = await aplicarMigraciones(ejecutorPglite(db));
  if (r.aplicadas.length)
    console.log(`[db:local] migraciones aplicadas: ${r.aplicadas.join(', ')}`);
  else console.log(`[db:local] migraciones al día (${r.omitidas.length})`);
  const pgv = await db.query<{ v: string }>('SELECT postgis_version() AS v');
  console.log(`[db:local] PostGIS ${pgv.rows[0]?.v}`);

  const server = new PGLiteSocketServer({
    db,
    port: puerto,
    host: '127.0.0.1',
    maxConnections: 12,
  });
  await server.start();
  console.log(
    `[db:local] escuchando en postgresql://curichi:curichi@127.0.0.1:${puerto}/curichi  (sin SSL)`,
  );

  const cerrar = async () => {
    console.log('[db:local] cerrando…');
    await server.stop();
    await db.close();
    process.exit(0);
  };
  process.on('SIGINT', cerrar);
  process.on('SIGTERM', cerrar);
}

main().catch((e) => {
  console.error('[db:local] error fatal:', e);
  process.exit(1);
});
