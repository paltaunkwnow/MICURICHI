import {
  type ConteoPorEstadoResumen,
  type ConteoPorSeveridad,
  type ResumenDistrito,
  type ResumenEjecutivo,
  ResumenEjecutivoQuerySchema,
  ResumenEjecutivoSchema,
  type VentanaResumen,
} from 'contracts';
import type { FastifyInstance } from 'fastify';
import type { Dependencias } from '../app.js';
import { requerirRol } from '../auth.js';
import { CACHE_PRIVADA } from '../cache.js';

/** El panel ejecutivo se mira, no se opera: 30 s de desfase no cambian ninguna decisión. */
const TTL_RESUMEN_MS = 30_000;

const DIAS_VENTANA: Record<VentanaResumen, number | null> = { '7d': 7, '30d': 30, todo: null };

interface FilaDistrito {
  distrito_id: string | null;
  codigo: string | null;
  nombre: string | null;
  total: number;
  critica: number;
  alta: number;
  media: number;
  baja: number;
  nuevo: number;
  validado: number;
  resuelto: number;
  ultimo: Date | null;
}

/**
 * Una sola pasada sobre `reporte_inundacion`, agrupada por distrito y cruzada con la capa
 * vigente para tener código y nombre, incluidos los distritos sin reportes.
 *
 * FULL JOIN y no LEFT JOIN desde la capa: un reporte resuelto con una versión de capa anterior
 * puede apuntar a un distrito que ya no está en la vigente. Con LEFT JOIN desaparecería de
 * `por_distrito` pero seguiría contando en el total, y las cifras del panel no cuadrarían. Para
 * esos casos el nombre sale de la versión de capa más reciente que lo tenga.
 *
 * La ventana se mide sobre `creado_en` (siempre presente), no sobre `evento_en`.
 */
const SQL_RESUMEN = `
WITH r AS (
  SELECT distrito_id, estado::text AS estado,
         COALESCE(severidad_manual, severidad_calculada)::text AS severidad, creado_en
  FROM reporte_inundacion
  WHERE estado IN ('nuevo', 'validado', 'resuelto')
    AND ($1::timestamptz IS NULL OR creado_en >= $1::timestamptz)
),
agg AS (
  SELECT distrito_id,
         count(*)::int AS total,
         count(*) FILTER (WHERE severidad = 'critica')::int AS critica,
         count(*) FILTER (WHERE severidad = 'alta')::int AS alta,
         count(*) FILTER (WHERE severidad = 'media')::int AS media,
         count(*) FILTER (WHERE severidad = 'baja')::int AS baja,
         count(*) FILTER (WHERE estado = 'nuevo')::int AS nuevo,
         count(*) FILTER (WHERE estado = 'validado')::int AS validado,
         count(*) FILTER (WHERE estado = 'resuelto')::int AS resuelto,
         max(creado_en) AS ultimo
  FROM r GROUP BY distrito_id
)
SELECT COALESCE(d.id, a.distrito_id) AS distrito_id,
       COALESCE(d.codigo, h.codigo) AS codigo,
       COALESCE(d.nombre, h.nombre) AS nombre,
       COALESCE(a.total, 0) AS total,
       COALESCE(a.critica, 0) AS critica, COALESCE(a.alta, 0) AS alta,
       COALESCE(a.media, 0) AS media, COALESCE(a.baja, 0) AS baja,
       COALESCE(a.nuevo, 0) AS nuevo, COALESCE(a.validado, 0) AS validado,
       COALESCE(a.resuelto, 0) AS resuelto,
       a.ultimo
FROM geo.distrito_municipal_vigente d
FULL JOIN agg a ON a.distrito_id = d.id
LEFT JOIN LATERAL (
  SELECT dm.codigo, dm.nombre FROM geo.distrito_municipal dm
  WHERE d.id IS NULL AND dm.id = a.distrito_id
  ORDER BY dm.version_capa DESC LIMIT 1
) h ON true
ORDER BY 2 NULLS LAST, 1`;

const iso = (f: Date | null) => (f ? new Date(f).toISOString() : null);

const posterior = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

async function calcularResumen(
  dep: Dependencias,
  ventana: VentanaResumen,
): Promise<ResumenEjecutivo> {
  const ahora = new Date();
  const dias = DIAS_VENTANA[ventana];
  const desde = dias === null ? null : new Date(ahora.getTime() - dias * 86_400_000);
  const r = await dep.pool.query<FilaDistrito>(SQL_RESUMEN, [desde]);

  const porSeveridad: ConteoPorSeveridad = { critica: 0, alta: 0, media: 0, baja: 0 };
  const porEstado: ConteoPorEstadoResumen = { nuevo: 0, validado: 0, resuelto: 0 };
  let total = 0;
  let ultimo: string | null = null;
  const porDistrito: ResumenDistrito[] = [];
  for (const f of r.rows) {
    const sev: ConteoPorSeveridad = {
      critica: f.critica,
      alta: f.alta,
      media: f.media,
      baja: f.baja,
    };
    const est: ConteoPorEstadoResumen = {
      nuevo: f.nuevo,
      validado: f.validado,
      resuelto: f.resuelto,
    };
    total += f.total;
    for (const k of Object.keys(sev) as (keyof ConteoPorSeveridad)[]) porSeveridad[k] += sev[k];
    for (const k of Object.keys(est) as (keyof ConteoPorEstadoResumen)[]) porEstado[k] += est[k];
    const ultimoDistrito = iso(f.ultimo);
    ultimo = posterior(ultimo, ultimoDistrito);
    // Un reporte sin distrito no debería existir (se resuelve al crearlo): cuenta en los totales,
    // pero no puede tener fila propia.
    if (!f.distrito_id) continue;
    porDistrito.push({
      distrito_id: f.distrito_id,
      codigo: f.codigo ?? f.distrito_id,
      nombre: f.nombre ?? f.distrito_id,
      total: f.total,
      por_severidad: sev,
      por_estado: est,
      ultimo_reporte_en: ultimoDistrito,
    });
  }
  // Se valida contra el contrato antes de guardarlo: un desajuste con la base debe romper aquí
  // (500 con log) y no llegar al panel como cifras a medias.
  return ResumenEjecutivoSchema.parse({
    generado_en: ahora.toISOString(),
    ventana: {
      desde: desde ? desde.toISOString() : null,
      hasta: desde ? ahora.toISOString() : null,
    },
    total,
    por_severidad: porSeveridad,
    por_estado: porEstado,
    por_distrito: porDistrito,
    ultimo_reporte_en: ultimo,
  });
}

export async function rutasEjecutivo(app: FastifyInstance, dep: Dependencias) {
  const cache = new Map<VentanaResumen, { valor: ResumenEjecutivo; en: number }>();
  // Una sola consulta en vuelo por ventana: sin esto, al caducar la caché cada panel abierto
  // lanzaría a la vez su propia pasada completa sobre la tabla de reportes.
  const enVuelo = new Map<VentanaResumen, Promise<ResumenEjecutivo>>();

  app.get(
    '/api/v1/ejecutivo/resumen',
    { preHandler: requerirRol('ejecutivo', 'tecnico', 'admin') },
    async (req, res) => {
      const q = ResumenEjecutivoQuerySchema.safeParse(req.query);
      if (!q.success)
        return res.status(400).send({
          codigo: 'FILTROS_INVALIDOS',
          mensaje: q.error.issues.map((i) => i.message).join('; '),
        });
      const ventana = q.data.ventana;
      // Cifras internas del municipio: nunca en una caché compartida.
      res.header('Cache-Control', CACHE_PRIVADA);

      const guardado = cache.get(ventana);
      if (guardado && Date.now() - guardado.en < TTL_RESUMEN_MS) {
        res.header('X-Cache', 'hit');
        app.metricas.contar('curichi_ejecutivo_cache_total', { resultado: 'hit' });
        return guardado.valor;
      }
      res.header('X-Cache', 'miss');
      app.metricas.contar('curichi_ejecutivo_cache_total', { resultado: 'miss' });
      let promesa = enVuelo.get(ventana);
      if (!promesa) {
        promesa = calcularResumen(dep, ventana)
          .then((valor) => {
            cache.set(ventana, { valor, en: Date.now() });
            return valor;
          })
          .finally(() => enVuelo.delete(ventana));
        enVuelo.set(ventana, promesa);
      }
      const valor = await promesa;
      req.log.info({ ventana, total: valor.total }, 'resumen ejecutivo calculado');
      return valor;
    },
  );
}
