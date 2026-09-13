import { crearPool, esperarBaseDeDatos } from 'db';
import { AlmacenDisco } from './almacen.js';
import { crearApp } from './app.js';
import { leerConfig } from './config.js';
import { ResolverHttp } from './resolver.js';

const cfg = leerConfig();
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
const app = await crearApp({
  pool,
  cfg,
  resolver: new ResolverHttp(cfg.geoServiceUrl),
  almacen: new AlmacenDisco(cfg.dirAlmacen),
  logger,
});
try {
  app.log.info('esperando base de datos…');
  await esperarBaseDeDatos(pool);
  await app.listen({ port: cfg.puerto, host: cfg.host });
  app.log.info(
    `api-core escuchando en http://${cfg.host}:${cfg.puerto} · docs en /docs · fotos en ${cfg.dirAlmacen}`,
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
