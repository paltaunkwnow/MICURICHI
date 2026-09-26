import {
  type ConteoActivas,
  type ConteoPorEstadoResumen,
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
  /** Severidad efectiva de las activas (nuevo + validado); los resueltos no entran. */
  critica: number;
  alta: number;
  media: number;
  baja: number;
  nuevo: number;
  validado: number;
  resuelto: number;
  ultimo: Date | null;
  en_capa_vigente: boolean;
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
 *
 * La severidad se cuenta solo sobre las activas (nuevo + validado): la cifra grande del panel es
 * la inundación que sigue ahí, y un resuelto es trabajo hecho (contracts 0.6.0).
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
         count(*) FILTER (WHERE estado <> 'resuelto' AND severidad = 'critica')::int AS critica,
         count(*) FILTER (WHERE estado <> 'resuelto' AND severidad = 'alta')::int AS alta,
         count(*) FILTER (WHERE estado <> 'resuelto' AND severidad = 'media')::int AS media,
         count(*) FILTER (WHERE estado <> 'resuelto' AND severidad = 'baja')::int AS baja,
         count(*) FILTER (WHERE estado = 'nuevo')::int AS nuevo,
         count(*) FILTER (WHERE estado = 'validado')::int AS validado,
         count(*) FILTER (WHERE estado = 'resuelto')::int AS resuelto,
         max(creado_en) AS ultimo
  FROM r GROUP BY distrito_id
)
SELECT COALESCE(d.id, a.distrito_id) AS distrito_id,
       COALESCE(d.codigo, h.codigo) AS codigo,
       COALESCE(d.nombre, h.nombre) AS nombre,
       COALESCE(a.critica, 0) AS critica, COALESCE(a.alta, 0) AS alta,
       COALESCE(a.media, 0) AS media, COALESCE(a.baja, 0) AS baja,
       COALESCE(a.nuevo, 0) AS nuevo, COALESCE(a.validado, 0) AS validado,
       COALESCE(a.resuelto, 0) AS resuelto,
       a.ultimo,
       d.id IS NOT NULL AS en_capa_vigente
FROM geo.distrito_municipal_vigente d
FULL JOIN agg a ON a.distrito_id = d.id
LEFT JOIN LATERAL (
  SELECT dm.codigo, dm.nombre FROM geo.distrito_municipal dm
  WHERE d.id IS NULL AND dm.id = a.distrito_id
  ORDER BY dm.version_capa DESC LIMIT 1
) h ON true
ORDER BY 2 NULLS LAST, 1`;

/**
 * Hora truncada al minuto (contracts 0.6.0): con pocos reportes en un distrito, los segundos
 * señalan a una persona, y aquí se cuentan reportes en `nuevo`, que todavía no son públicos. Se
 * trunca en JS sobre el instante y no con `date_trunc`, que trunca en la zona de la sesión.
 */
const alMinuto = (f: Date | null) =>
  f ? new Date(Math.floor(new Date(f).getTime() / 60_000) * 60_000).toISOString() : null;

const posterior = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

const activasDe = (f: FilaDistrito): ConteoActivas => ({
  total: f.nuevo + f.validado,
  verificadas: f.validado,
  en_revision: f.nuevo,
  por_severidad: { critica: f.critica, alta: f.alta, media: f.media, baja: f.baja },
});

function sumarActivas(a: ConteoActivas, b: ConteoActivas): ConteoActivas {
  const s = a.por_severidad;
  const t = b.por_severidad;
  return {
    total: a.total + b.total,
    verificadas: a.verificadas + b.verificadas,
    en_revision: a.en_revision + b.en_revision,
    por_severidad: {
      critica: s.critica + t.critica,
      alta: s.alta + t.alta,
      media: s.media + t.media,
      baja: s.baja + t.baja,
    },
  };
}

async function calcularResumen(
  dep: Dependencias,
  ventana: VentanaResumen,
): Promise<ResumenEjecutivo> {
  const ahora = new Date();
  const dias = DIAS_VENTANA[ventana];
  const desde = dias === null ? null : new Date(ahora.getTime() - dias * 86_400_000);
  const r = await dep.pool.query<FilaDistrito>(SQL_RESUMEN, [desde]);

  let activas: ConteoActivas = {
    total: 0,
    verificadas: 0,
    en_revision: 0,
    por_severidad: { critica: 0, alta: 0, media: 0, baja: 0 },
  };
  const porEstado: ConteoPorEstadoResumen = { nuevo: 0, validado: 0, resuelto: 0 };
  let ultimo: string | null = null;
  const porDistrito: ResumenDistrito[] = [];
  for (const f of r.rows) {
    const activasDistrito = activasDe(f);
    const est: ConteoPorEstadoResumen = {
      nuevo: f.nuevo,
      validado: f.validado,
      resuelto: f.resuelto,
    };
    activas = sumarActivas(activas, activasDistrito);
    for (const k of Object.keys(est) as (keyof ConteoPorEstadoResumen)[]) porEstado[k] += est[k];
    const ultimoDistrito = alMinuto(f.ultimo);
    ultimo = posterior(ultimo, ultimoDistrito);
    // Un reporte sin distrito no debería existir (se resuelve al crearlo): cuenta en los totales,
    // pero no puede tener fila propia.
    if (!f.distrito_id) continue;
    porDistrito.push({
      distrito_id: f.distrito_id,
      codigo: f.codigo ?? f.distrito_id,
      nombre: f.nombre ?? f.distrito_id,
      en_capa_vigente: f.en_capa_vigente,
      activas: activasDistrito,
      por_estado: est,
      ultimo_reporte_en: ultimoDistrito,
    });
  }
  // Se valida contra el contrato antes de guardarlo: un desajuste con la base debe romper aquí
  // (500 con log) y no llegar al panel como cifras que no cuadran.
  return ResumenEjecutivoSchema.parse({
    generado_en: ahora.toISOString(),
    ventana: {
      desde: desde ? desde.toISOString() : null,
      hasta: desde ? ahora.toISOString() : null,
    },
    activas,
    resueltas: porEstado.resuelto,
    por_estado: porEstado,
    por_distrito: porDistrito,
    ultimo_reporte_en: ultimo,
  });
}

/** Invalidador de la caché del resumen, uno por instancia de la app (los tests montan varias). */
const invalidadores = new WeakMap<FastifyInstance, () => void>();

/**
 * Olvida el resumen cacheado en ESTE proceso. Lo usa `invalidarCachesDeAgregados` (admin.ts)
 * después de cada moderación; las demás réplicas siguen con su copia hasta el TTL.
 */
export function invalidarResumenEjecutivo(app: FastifyInstance): void {
  invalidadores.get(app)?.();
}

export async function rutasEjecutivo(app: FastifyInstance, dep: Dependencias) {
  const cache = new Map<VentanaResumen, { valor: ResumenEjecutivo; en: number }>();
  // Una sola consulta en vuelo por ventana: sin esto, al caducar la caché cada panel abierto
  // lanzaría a la vez su propia pasada completa sobre la tabla de reportes.
  const enVuelo = new Map<VentanaResumen, Promise<ResumenEjecutivo>>();
  // Sube con cada invalidación. Un cálculo que leyó la base antes de moderar y termina después
  // no puede volver a guardar su cifra, y la petición siguiente tampoco se sube a él.
  let generacion = 0;
  invalidadores.set(app, () => {
    generacion++;
    cache.clear();
    enVuelo.clear();
  });

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
        const deEstaGeneracion = generacion;
        const calculo: Promise<ResumenEjecutivo> = calcularResumen(dep, ventana)
          .then((valor) => {
            if (deEstaGeneracion === generacion) cache.set(ventana, { valor, en: Date.now() });
            return valor;
          })
          .finally(() => {
            if (enVuelo.get(ventana) === calculo) enVuelo.delete(ventana);
          });
        enVuelo.set(ventana, calculo);
        promesa = calculo;
      }
      const valor = await promesa;
      req.log.info({ ventana, activas: valor.activas.total }, 'resumen ejecutivo calculado');
      return valor;
    },
  );
}
