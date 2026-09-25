/**
 * Tarea periódica de retención (CLAUDE.md §13): sesiones caducadas, `ip_hash` vencido y
 * fotos huérfanas (base + objeto en el almacén). Vive en el servidor, no en `crearApp`,
 * para que los tests no queden con un temporizador abierto.
 */
import {
  ejecutarMantenimiento,
  ejecutorPg,
  recalcularPuntosCriticos,
  rellenarGeometriaPublica,
} from 'db';
import type { FastifyBaseLogger } from 'fastify';
import type pg from 'pg';
import type { Almacen } from './almacen.js';
import type { ConfigApi } from './config.js';

const INTERVALO_MS = 6 * 60 * 60 * 1000; // cada 6 h

/**
 * Espera antes de la PRIMERA pasada. Sin ella, el trabajo pesado del mantenimiento arranca a la
 * vez que el servicio empieza a aceptar tráfico y compite con él por las conexiones: el relleno
 * de `geom_publico` va por lotes y el recálculo completo de puntos críticos tardó 41,9 s con
 * 750 000 reportes publicables. Medio minuto le basta a la réplica para calentar y empezar a
 * responder antes de ponerse a trabajar de fondo.
 */
const ESPERA_PRIMERA_PASADA_MS = Number(process.env.MANTENIMIENTO_ESPERA_MS ?? 30_000);

/**
 * Clave del advisory lock del mantenimiento. Arbitraria y estable; distinta de la de los puntos
 * críticos (4021) y la de las migraciones (4022).
 */
const CLAVE_LOCK_MANTENIMIENTO = 4023;

/**
 * @param pool Pool PROPIO del mantenimiento, separado del que atiende peticiones. Es importante:
 *   una pasada puede retener una conexión durante decenas de segundos (el recálculo completo de
 *   puntos críticos), y si sale del mismo pool que las peticiones, se las come. Con un pool
 *   aparte y pequeño, el trabajo de fondo no puede dejar sin conexiones al tráfico real.
 */
export function programarMantenimiento(
  pool: pg.Pool,
  almacen: Almacen,
  cfg: ConfigApi,
  log: FastifyBaseLogger,
): { detener(): void } {
  const pasada = async () => {
    // Con varias réplicas, este temporizador corre en TODAS. Antes las tres hacían a la vez el
    // relleno de geom_publico, el recálculo de puntos críticos y el borrado de fotos huérfanas:
    // trabajo triplicado sobre las mismas filas, con la carrera correspondiente entre el borrado
    // del objeto del disco y el de su fila. `pg_try_advisory_lock` es la forma barata de decir
    // "que lo haga una sola": el que no consigue el lock no espera, simplemente se salta la
    // pasada y lo reintenta dentro de seis horas.
    const cliente = await pool.connect().catch((e) => {
      log.error({ err: e }, 'mantenimiento: sin conexión para la pasada');
      return null;
    });
    if (!cliente) return;
    try {
      const lock = await cliente.query<{ tomado: boolean }>(
        'SELECT pg_try_advisory_lock($1) AS tomado',
        [CLAVE_LOCK_MANTENIMIENTO],
      );
      if (!lock.rows[0]?.tomado) {
        log.debug('mantenimiento: otra réplica lo está haciendo; se salta esta pasada');
        return;
      }
      try {
        await pasadaConLock();
      } finally {
        // Lock de SESIÓN, no de transacción: hay que soltarlo a mano. Si el proceso muere antes,
        // PostgreSQL lo libera al cerrarse la conexión.
        await cliente
          .query('SELECT pg_advisory_unlock($1)', [CLAVE_LOCK_MANTENIMIENTO])
          .catch((e) => log.warn({ err: e }, 'mantenimiento: no se pudo soltar el lock'));
      }
    } finally {
      cliente.release();
    }
  };

  const pasadaConLock = async () => {
    try {
      // Antes de nada: completar los puntos publicables que falten (migración 0005). Mientras
      // falten, esos reportes no salen en el mapa público, así que conviene que sea lo primero.
      const rellenados = await rellenarGeometriaPublica(ejecutorPg(pool), cfg.salJitter);
      if (rellenados) {
        log.info({ rellenados }, 'mantenimiento: geom_publico completado');
        // Los puntos críticos derivan su centroide publicable del de sus miembros: mientras
        // faltaba alguno quedaron en NULL y no se publicaban. Ahora ya se pueden construir.
        await recalcularPuntosCriticos(ejecutorPg(pool)).catch((e) =>
          log.error({ err: e }, 'mantenimiento: no se pudieron recalcular los puntos críticos'),
        );
      }
      // Recálculo pendiente. Un reporte publicable sin punto crítico solo puede venir de dos
      // sitios: de un desborde de componente en la moderación (ver puntos-criticos-entorno.ts) o
      // de un relleno de geom_publico recién hecho. En los dos casos hay que rehacer la tabla, y
      // este es el sitio: en segundo plano, bajo el lock de mantenimiento, no dentro de un PATCH.
      if (!rellenados) {
        const pendientes = await pool.query<{ hay: boolean }>(
          `SELECT EXISTS (
              SELECT 1 FROM reporte_inundacion
               WHERE estado IN ('validado','resuelto') AND punto_critico_id IS NULL
             ) AS hay`,
        );
        if (pendientes.rows[0]?.hay) {
          log.info('mantenimiento: hay reportes sin punto crítico; recalculando');
          await recalcularPuntosCriticos(ejecutorPg(pool)).catch((e) =>
            log.error({ err: e }, 'mantenimiento: falló el recálculo de puntos críticos'),
          );
        }
      }
      const r = await ejecutarMantenimiento(ejecutorPg(pool), {
        retencionIpHashDias: cfg.retencionIpHashDias,
      });
      for (const key of r.fotosHuerfanas) {
        // Si el borrado del objeto falla, la fila ya se fue: se registra y se sigue.
        await almacen.borrar(key).catch((e) => log.warn({ err: e, key }, 'no se pudo borrar foto'));
      }
      if (r.sesionesCaducadas || r.ipHashBorrados || r.fotosHuerfanas.length)
        log.info(
          { ...r, fotosHuerfanas: r.fotosHuerfanas.length },
          'mantenimiento: retención aplicada',
        );
    } catch (e) {
      log.error({ err: e }, 'mantenimiento: la pasada falló; se reintenta en el próximo ciclo');
    }
  };
  const primera = setTimeout(() => void pasada(), ESPERA_PRIMERA_PASADA_MS);
  primera.unref();
  const t = setInterval(pasada, INTERVALO_MS);
  t.unref(); // no debe impedir que el proceso termine
  return {
    detener: () => {
      clearTimeout(primera);
      clearInterval(t);
    },
  };
}
