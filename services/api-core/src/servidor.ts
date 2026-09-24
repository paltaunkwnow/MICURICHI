import { cerrarWorkersDePassword, crearPool, esperarBaseDeDatos, verificarPrivilegios } from 'db';
import { AlmacenDisco } from './almacen.js';
import { AlmacenS3, leerConfigS3 } from './almacen-s3.js';
import { crearApp } from './app.js';
import { leerConfig } from './config.js';
import { programarMantenimiento } from './mantenimiento.js';
import { opcionesLogger } from './registro.js';
import { ResolverHttp } from './resolver.js';

const cfg = leerConfig();
const pool = crearPool(cfg.databaseUrl, { max: cfg.poolMax });
/**
 * Pool aparte y pequeño para el trabajo de fondo. Una pasada de mantenimiento puede retener una
 * conexión durante decenas de segundos; sacándola del pool de peticiones, deja al tráfico real
 * sin conexiones justo cuando la réplica acaba de arrancar. Dos conexiones bastan: el trabajo es
 * secuencial y solo una réplica lo hace (advisory lock).
 */
const poolMantenimiento = crearPool(cfg.databaseUrl, { max: 2 });
/**
 * Dónde van las fotos. Con `S3_ENDPOINT` definido, a un almacén compartido; sin él, al disco de
 * este proceso. El disco es válido con UNA réplica y deja de serlo con dos: la foto queda en el
 * disco de la que la recibió y la petición siguiente puede caer en la otra. Por eso la elección
 * es explícita y se anuncia en el log de arranque, para que quien opera sepa cuál está en uso.
 */
const configS3 = leerConfigS3();
const almacenS3 = configS3 ? new AlmacenS3(configS3) : null;
const almacen = almacenS3 ?? new AlmacenDisco(cfg.dirAlmacen);
const dondeVanLasFotos = configS3
  ? `S3 ${configS3.endpoint}/${configS3.bucket}`
  : `disco ${cfg.dirAlmacen} (una sola réplica)`;
// La IP del cliente NO va en claro al log: el serializador la sustituye por el hash con sal
// (ver registro.ts). El de por defecto de Fastify escribía `remoteAddress` en cada petición.
const logger = opcionesLogger({
  salIp: cfg.salIp,
  produccion: process.env.NODE_ENV === 'production',
});
const app = await crearApp({
  pool,
  cfg,
  resolver: new ResolverHttp(cfg.geoServiceUrl, cfg.geoTokenInterno),
  almacen,
  logger,
});
let mantenimiento: { detener(): void } | null = null;
try {
  app.log.info('esperando base de datos…');
  await esperarBaseDeDatos(pool);
  // Mínimo privilegio, comprobado en el arranque y no solo confiado a la configuración. En
  // producción, conectarse con un rol que sea superusuario o dueño del esquema es motivo para NO
  // servir: con ese rol, cualquier ejecución de SQL no prevista deja de ser una lectura de más y
  // pasa a ser control del servidor de base de datos.
  const privilegios = await verificarPrivilegios(pool, {
    servicio: 'api-core',
    produccion: process.env.NODE_ENV === 'production',
    rolEsperado: 'curichi_api',
    registrar: (m) => app.log.warn(m),
  });
  app.log.info(`base de datos como «${privilegios.usuario}» (sin privilegios de administración)`);
  // Se comprueba ANTES de escuchar: si las credenciales o el bucket están mal, es mejor no
  // arrancar que aceptar reportes y perder sus fotos una por una.
  if (almacenS3) await almacenS3.comprobar();
  await app.listen({ port: cfg.puerto, host: cfg.host });
  mantenimiento = programarMantenimiento(poolMantenimiento, almacen, cfg, app.log);
  app.log.info(
    `api-core escuchando en http://${cfg.host}:${cfg.puerto} · docs en /docs · fotos en ${dondeVanLasFotos} · pool máx ${cfg.poolMax}`,
  );
} catch (e) {
  app.log.error(e);
  process.exit(1);
}

/**
 * Cierre ordenado. Tres cosas que antes no estaban:
 *
 *  - se para el temporizador de mantenimiento, para que no arranque una pasada nueva mientras
 *    se está cerrando el pool que necesita;
 *  - se ignora una segunda señal, porque `docker stop` manda SIGTERM y, si tarda, SIGKILL: dos
 *    cierres solapados se pisan y el segundo falla sobre un pool ya cerrado;
 *  - hay un plazo. `app.close()` espera a que terminen las peticiones en vuelo, y una petición
 *    atascada dejaba el proceso colgado hasta que el orquestador lo mataba a lo bruto,
 *    cortando también las demás. 15 s deja margen a lo normal y corta lo patológico; el
 *    `stop_grace_period` del Compose es de 20 s, así que este plazo vence antes.
 */
const PLAZO_CIERRE_MS = Number(process.env.CIERRE_PLAZO_MS ?? 15_000);
let cerrando = false;
const cerrar = async (senal: string) => {
  if (cerrando) return;
  cerrando = true;
  app.log.info({ senal }, 'cerrando api-core…');
  mantenimiento?.detener();
  const plazo = setTimeout(() => {
    app.log.error({ plazoMs: PLAZO_CIERRE_MS }, 'el cierre ordenado no terminó a tiempo; se sale');
    process.exit(1);
  }, PLAZO_CIERRE_MS);
  plazo.unref();
  try {
    await app.close();
    await pool.end();
    await poolMantenimiento.end();
    // Los workers de hashing son hilos aparte: sin cerrarlos, el proceso no termina.
    await cerrarWorkersDePassword();
  } catch (e) {
    app.log.error({ err: e }, 'error durante el cierre');
  }
  clearTimeout(plazo);
  process.exit(0);
};
process.on('SIGINT', () => void cerrar('SIGINT'));
process.on('SIGTERM', () => void cerrar('SIGTERM'));
