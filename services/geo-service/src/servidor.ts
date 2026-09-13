import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearPool, esperarBaseDeDatos } from 'db';
import { crearApp } from './app.js';
import { leerConfig } from './config.js';

const cfg = leerConfig();
if (!cfg.dirProcessed)
  cfg.dirProcessed = resolve(dirname(fileURLToPath(import.meta.url)), '../../../data/processed');
const pool = crearPool(cfg.databaseUrl, 4);
const logger =
  process.env.NODE_ENV === 'production'
    ? true
    : {
        transport: {
          target: 'pino-pretty',
          options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      };

const app = await crearApp({ pool, cfg, logger });
try {
  app.log.info('esperando base de datos…');
  await esperarBaseDeDatos(pool);
  await app.listen({ port: cfg.puerto, host: cfg.host });
  app.log.info(
    `geo-service escuchando en http://${cfg.host}:${cfg.puerto} (capas vigentes: ${JSON.stringify(await app.capas.versionesVigentes())})`,
  );
} catch (e) {
  app.log.error(e);
  process.exit(1);
}
const cerrar = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
