import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Compara archivos reales: argv puede ser relativo, un enlace o tener otra capitalización en
 * Windows. Importar este módulo desde una prueba u otro punto de entrada no arranca el servidor.
 */
export function esEntradaPrincipal(
  urlModulo: string,
  entrada: string | undefined,
  opciones: {
    plataforma?: NodeJS.Platform;
    resolverRuta?: (ruta: string) => string;
  } = {},
): boolean {
  if (!entrada) return false;
  const resolverRuta = opciones.resolverRuta ?? realpathSync;
  try {
    const modulo = resolverRuta(fileURLToPath(urlModulo));
    const invocado = resolverRuta(resolve(entrada));
    return (opciones.plataforma ?? process.platform) === 'win32'
      ? modulo.toLowerCase() === invocado.toLowerCase()
      : modulo === invocado;
  } catch {
    return false;
  }
}

/** Solo la interfaz controlada de DB: el rol API no puede leer el historial de migraciones. */
export async function verificarEsquemaCompatible(base: { query(sql: string): Promise<unknown> }) {
  const mensaje = 'api-core requiere el esquema 0022 íntegro; comprobá el release y la base.';
  let resultado: unknown;
  try {
    resultado = await base.query('SELECT version, integro FROM public.estado_esquema_m10()');
  } catch {
    // El error de conexión/SQL puede contener datos sensibles; no se incorpora al mensaje ni cause.
    throw new Error(mensaje);
  }
  if (!resultado || typeof resultado !== 'object' || !('rows' in resultado))
    throw new Error(mensaje);
  const { rows } = resultado;
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error(mensaje);
  const fila: unknown = rows[0];
  if (
    !fila ||
    typeof fila !== 'object' ||
    !('version' in fila) ||
    fila.version !== 22 ||
    !('integro' in fila) ||
    fila.integro !== true
  )
    throw new Error(mensaje);
}

export async function habilitarServidor(etapas: {
  esperarBase(): Promise<unknown>;
  verificarEsquema(): Promise<unknown>;
  verificarPrivilegios(): Promise<unknown>;
  verificarCupos(): Promise<unknown>;
  comprobarAlmacen(): Promise<unknown>;
  escuchar(): Promise<unknown>;
  programarMantenimiento(): { detener(): void };
}) {
  await etapas.esperarBase();
  await etapas.verificarEsquema();
  await etapas.verificarPrivilegios();
  await etapas.verificarCupos();
  await etapas.comprobarAlmacen();
  await etapas.escuchar();
  return etapas.programarMantenimiento();
}

async function iniciarServidor() {
  // También se difieren los imports de runtime: sus módulos pueden leer configuración o env.
  const { cerrarWorkersDePassword, crearPool, esperarBaseDeDatos, verificarPrivilegios } =
    await import('db');
  const { AlmacenDisco } = await import('./almacen.js');
  const { AlmacenS3, leerConfigS3 } = await import('./almacen-s3.js');
  const { crearApp } = await import('./app.js');
  const { verificarReglasDeCupoActivas } = await import('./categorias.js');
  const { avisosDeConfiguracion, leerConfig } = await import('./config.js');
  const { programarMantenimiento } = await import('./mantenimiento.js');
  const { opcionesLogger } = await import('./registro.js');
  const { ResolverHttp } = await import('./resolver.js');

  const cfg = leerConfig();
  const pool = crearPool(cfg.databaseUrl, { max: cfg.poolMax });
  // Pool aparte: el mantenimiento secuencial no retiene conexiones de las peticiones.
  const poolMantenimiento = crearPool(cfg.databaseUrl, { max: 2 });
  const configS3 = leerConfigS3();
  const almacenS3 = configS3 ? new AlmacenS3(configS3) : null;
  const almacen = almacenS3 ?? new AlmacenDisco(cfg.dirAlmacen);
  const dondeVanLasFotos = configS3
    ? `S3 ${configS3.endpoint}/${configS3.bucket}`
    : `disco ${cfg.dirAlmacen} (una sola réplica; guarda de ${cfg.fotosMinLibreBytes} bytes libres)`;
  // El serializador sustituye la IP por su hash con sal, también en el log de peticiones.
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
  for (const aviso of avisosDeConfiguracion()) app.log.warn(aviso);
  let mantenimiento: { detener(): void } | null = null;
  try {
    app.log.info('esperando base de datos…');
    mantenimiento = await habilitarServidor({
      esperarBase: () => esperarBaseDeDatos(pool),
      verificarEsquema: () => verificarEsquemaCompatible(pool),
      verificarPrivilegios: async () => {
        // Rechaza roles de administración en producción; no amplía permisos para leer el esquema.
        const privilegios = await verificarPrivilegios(pool, {
          servicio: 'api-core',
          produccion: process.env.NODE_ENV === 'production',
          rolEsperado: 'curichi_api',
          registrar: (m) => app.log.warn(m),
        });
        app.log.info(
          `base de datos como «${privilegios.usuario}» (sin privilegios de administración)`,
        );
      },
      // Un ámbito/ventana desconocido de cupo activo sigue impidiendo servir (ADR 0017).
      verificarCupos: () => verificarReglasDeCupoActivas(pool),
      comprobarAlmacen: async () => {
        if (almacenS3) await almacenS3.comprobar();
      },
      escuchar: () => app.listen({ port: cfg.puerto, host: cfg.host }),
      programarMantenimiento: () =>
        programarMantenimiento(poolMantenimiento, almacen, cfg, app.log),
    });
    app.log.info(
      `api-core escuchando en http://${cfg.host}:${cfg.puerto} · docs en /docs · fotos en ${dondeVanLasFotos} · pool máx ${cfg.poolMax}`,
    );
  } catch (e) {
    app.log.error(e);
    process.exit(1);
  }

  // Cierre único con plazo, deteniendo mantenimiento antes de cerrar los dos pools y los workers.
  const PLAZO_CIERRE_MS = Number(process.env.CIERRE_PLAZO_MS ?? 15_000);
  let cerrando = false;
  const cerrar = async (senal: string) => {
    if (cerrando) return;
    cerrando = true;
    app.log.info({ senal }, 'cerrando api-core…');
    mantenimiento?.detener();
    const plazo = setTimeout(() => {
      app.log.error(
        { plazoMs: PLAZO_CIERRE_MS },
        'el cierre ordenado no terminó a tiempo; se sale',
      );
      process.exit(1);
    }, PLAZO_CIERRE_MS);
    plazo.unref();
    try {
      await app.close();
      await pool.end();
      await poolMantenimiento.end();
      await cerrarWorkersDePassword();
    } catch (e) {
      app.log.error({ err: e }, 'error durante el cierre');
    }
    clearTimeout(plazo);
    process.exit(0);
  };
  process.on('SIGINT', () => void cerrar('SIGINT'));
  process.on('SIGTERM', () => void cerrar('SIGTERM'));
}

if (esEntradaPrincipal(import.meta.url, process.argv[1])) await iniciarServidor();
