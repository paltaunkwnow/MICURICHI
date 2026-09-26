/**
 * Configuración pública del despliegue (contracts 0.7.0, `CLAUDE.md` decisión: una instalación
 * por ciudad; la ciudad llega a los clientes por configuración, no por código).
 *
 * Antes el centro del mapa, el locale y el nombre de la ciudad estaban fijados en el JavaScript
 * de cada frontend al compilar. Ahora los leen de acá en tiempo de ejecución.
 */
import { ConfiguracionPublicaSchema } from 'contracts';
import type { FastifyInstance } from 'fastify';
import type { Dependencias } from '../app.js';

/**
 * Cinco minutos: la respuesta es la misma para cualquiera que pregunte y solo cambia si alguien
 * reconfigura el despliegue (no hay ninguna acción en el sistema que la modifique en caliente),
 * así que una caché compartida (CDN, proxy del municipio) puede quedarse con ella un rato largo
 * sin arriesgarse a servir un dato viejo de forma perceptible.
 */
const CACHE_CONFIGURACION = 'public, max-age=300';

export async function rutasConfiguracion(app: FastifyInstance, dep: Dependencias) {
  app.get(
    '/api/v1/configuracion',
    // Pública y sin sesión: mismo presupuesto que las demás lecturas públicas (mapa, listado).
    { config: { rateLimit: { max: dep.cfg.rateLimitLecturasPorMinuto, timeWindow: 60_000 } } },
    async (_req, res) => {
      res.header('Cache-Control', CACHE_CONFIGURACION);
      // Se valida contra el contrato antes de mandarla: una ciudad mal armada tiene que fallar
      // al arrancar (config.ts) y no llegar nunca a esta ruta, pero si llegara, mejor un 500 con
      // el motivo en el log que un `Intl` roto en el navegador de cada visitante.
      return ConfiguracionPublicaSchema.parse({ ciudad: dep.cfg.ciudad });
    },
  );
}
