import { createHash, randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearPool, esperarBaseDeDatos, puedeEscribir, verificarPrivilegios } from 'db';
import { crearApp } from './app.js';
import { leerConfig } from './config.js';

const cfg = leerConfig();
if (!cfg.dirProcessed)
  cfg.dirProcessed = resolve(dirname(fileURLToPath(import.meta.url)), '../../../data/processed');
const pool = crearPool(cfg.databaseUrl, { max: cfg.poolMax });
/**
 * Igual que api-core: el serializador por defecto de Fastify escribe `remoteAddress` —la IP del
 * cliente en claro— en cada petición, y aquí pasa el tráfico del mapa público entero. geo-service
 * no tiene sal propia (no hace antispam), así que usa `IP_HASH_SAL` si está y, si no, una sal
 * aleatoria por arranque: sirve igual para agrupar peticiones de un mismo origen dentro de una
 * misma vida del proceso, y no deja nada correlacionable entre reinicios.
 */
const salRegistro = process.env.IP_HASH_SAL || randomBytes(16).toString('hex');
const logger = {
  serializers: {
    req: (req: { method: string; url: string; ip: string }) => ({
      method: req.method,
      url: req.url,
      ipHash: createHash('sha256').update(`${req.ip}|${salRegistro}`).digest('hex').slice(0, 16),
    }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },
  ...(process.env.NODE_ENV === 'production'
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
};

const app = await crearApp({ pool, cfg, logger });
try {
  app.log.info('esperando base de datos…');
  await esperarBaseDeDatos(pool);
  const produccion = process.env.NODE_ENV === 'production';
  const privilegios = await verificarPrivilegios(pool, {
    servicio: 'geo-service',
    produccion,
    rolEsperado: 'curichi_geo',
    registrar: (m) => app.log.warn(m),
  });
  /**
   * geo-service es de SOLO LECTURA por contrato (CLAUDE.md §4.6). Que no tenga privilegios de
   * administración no basta: con permiso de escritura sobre `reporte_inundacion` seguiría pudiendo
   * borrar reportes. Se comprueba contra la tabla que más importa y en producción no se arranca:
   * si alguien concede escritura por error, tiene que verse el día que se despliega, no después.
   */
  if (await puedeEscribir(pool, 'reporte_inundacion')) {
    const aviso = `geo-service: el rol «${privilegios.usuario}» puede ESCRIBIR en reporte_inundacion; este servicio solo debe leer (§4.6).`;
    if (produccion) throw new Error(aviso);
    app.log.warn(aviso);
  }
  app.log.info(`base de datos como «${privilegios.usuario}» (solo lectura)`);
  await app.listen({ port: cfg.puerto, host: cfg.host });
  app.log.info(
    `geo-service escuchando en http://${cfg.host}:${cfg.puerto} (capas vigentes: ${JSON.stringify(await app.capas.versionesVigentes())})`,
  );
} catch (e) {
  app.log.error(e);
  process.exit(1);
}
/** Mismo cierre ordenado que api-core: sin plazo, una petición atascada cuelga el contenedor. */
const PLAZO_CIERRE_MS = Number(process.env.CIERRE_PLAZO_MS ?? 15_000);
let cerrando = false;
const cerrar = async (senal: string) => {
  if (cerrando) return;
  cerrando = true;
  app.log.info({ senal }, 'cerrando geo-service…');
  const plazo = setTimeout(() => {
    app.log.error({ plazoMs: PLAZO_CIERRE_MS }, 'el cierre ordenado no terminó a tiempo; se sale');
    process.exit(1);
  }, PLAZO_CIERRE_MS);
  plazo.unref();
  try {
    await app.close();
    await pool.end();
  } catch (e) {
    app.log.error({ err: e }, 'error durante el cierre');
  }
  clearTimeout(plazo);
  process.exit(0);
};
process.on('SIGINT', () => void cerrar('SIGINT'));
process.on('SIGTERM', () => void cerrar('SIGTERM'));
