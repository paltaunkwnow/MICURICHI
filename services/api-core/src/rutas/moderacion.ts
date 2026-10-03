import {
  ReporteCambiarEstadoSchema,
  ReporteFusionarSchema,
  ReporteReclasificarSchema,
  transicionExiste,
  transicionPermitida,
} from 'contracts';
import { ejecutorPg, recalcularEntornoDeReporte } from 'db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Dependencias } from '../app.js';
import { requerirRol } from '../auth.js';
import { obtenerReporte } from '../consultas.js';
import { condicionPublicado } from '../visibilidad.js';
import { aFeature, type FilaReporte, vistaTecnica } from '../vistas.js';
import { invalidarAgregadosEnVuelo } from './admin.js';

/**
 * Los uuid se normalizan a minúsculas al entrar. La base los compara como uuid, pero aquí se
 * comparan como texto y `auditoria.entidad_id` es texto: sin normalizar, `/reportes/<ID EN
 * MAYÚSCULAS>` con el canónico en minúsculas pasaba la comprobación de «distinto» y el reporte
 * quedaba duplicado de sí mismo, y el historial de un reporte se repartía entre dos claves.
 */
const IdParam = z.object({
  id: z
    .string()
    .trim()
    .refine(
      (s) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ||
        /^[0-9a-f]{8}$/i.test(s),
      { message: 'El id debe ser un UUID o un ID corto de 8 caracteres hexadecimales' },
    )
    .transform((s) => s.toLowerCase()),
});
const AFECTA_PUNTOS = new Set(['validado', 'resuelto']);

export async function rutasModeracion(app: FastifyInstance, dep: Dependencias) {
  type ResultadoCambio =
    | { ok: false; error: 400 | 403 | 404 | 409; codigo: string; mensaje: string }
    | { ok: true; fila: FilaReporte };

  const noPermitida = (mensaje: string): ResultadoCambio => ({
    ok: false,
    error: 409,
    codigo: 'TRANSICION_NO_PERMITIDA',
    mensaje,
  });

  /**
   * Cambia el estado dentro de una transacción con la fila bloqueada (`FOR UPDATE`).
   * Sin el bloqueo, dos técnicos moderando el mismo reporte a la vez leen ambos el estado
   * anterior, ambos superan `transicionPermitida` y la segunda escritura pisa a la primera
   * (por ejemplo: validado y rechazado a la vez, o dos fusiones contra canónicos distintos).
   */
  async function cambiarEstado(
    id: string,
    nuevo: string,
    motivo: string | undefined,
    fusionadoEnCrudo: string | undefined,
    actor: { id: string; rol: string },
  ): Promise<ResultadoCambio> {
    let fusionadoEn =
      nuevo === 'duplicado' ? fusionadoEnCrudo?.trim().replace(/^#/, '').toLowerCase() : undefined;

    if (nuevo === 'duplicado' && fusionadoEn) {
      if (fusionadoEn.length === 8) {
        const rCorto = await dep.pool.query<{ id: string; estado: string }>(
          `SELECT id::text, estado::text FROM reporte_inundacion WHERE id::text LIKE $1 || '%' AND ${condicionPublicado('')} LIMIT 2`,
          [fusionadoEn],
        );
        if (rCorto.rows.length === 0) {
          return {
            ok: false,
            error: 404,
            codigo: 'NO_EXISTE',
            mensaje: `No se encontró ningún reporte publicado con el ID corto "${fusionadoEn}".`,
          };
        }
        if (rCorto.rows.length > 1) {
          return {
            ok: false,
            error: 400,
            codigo: 'ID_AMBIGUO',
            mensaje: `El ID corto "${fusionadoEn}" coincide con más de un reporte. Usá el UUID completo.`,
          };
        }
        fusionadoEn = rCorto.rows[0]!.id;
      }
    }

    if (fusionadoEn === id)
      return {
        ok: false,
        error: 409,
        codigo: 'FUSION_CONSIGO_MISMO',
        mensaje: 'Un reporte no puede ser duplicado de sí mismo: elegí otro como canónico.',
      };
    const cliente = await dep.pool.connect();
    let estadoAnterior: string;
    try {
      await cliente.query('BEGIN');
      // En una fusión se bloquean el reporte Y su canónico, en la misma sentencia y en orden de
      // id. Sin bloquear el canónico, dos fusiones cruzadas simultáneas (A→B y B→A) leían cada
      // una al otro todavía validado y se guardaban las dos: un ciclo. Con el orden fijo, la
      // segunda espera a la primera en vez de trabarse con ella, y al despertar ve el estado nuevo.
      // Solo los ya publicados: nadie modera un reporte que todavía espera su publicar_en (404),
      // ni lo usa como canónico.
      const bloqueadas = await cliente.query<{
        id: string;
        estado: string;
        estado_motivo: string | null;
      }>(
        `SELECT id::text, estado::text, estado_motivo FROM reporte_inundacion
          WHERE id = ANY($1::uuid[]) AND ${condicionPublicado('')} ORDER BY id FOR UPDATE`,
        [fusionadoEn ? [id, fusionadoEn] : [id]],
      );
      const porId = new Map(bloqueadas.rows.map((f) => [f.id, f]));
      const actual = porId.get(id);
      if (!actual) {
        await cliente.query('ROLLBACK');
        return { ok: false, error: 404, codigo: 'NO_EXISTE', mensaje: 'Reporte no encontrado.' };
      }
      estadoAnterior = actual.estado;
      if (!transicionPermitida(actual.estado, nuevo, actor.rol)) {
        await cliente.query('ROLLBACK');
        // La transición existe pero no para este rol (validado → rechazado y reabrir son de
        // admin): es un permiso, no un estado imposible.
        if (transicionExiste(actual.estado, nuevo))
          return {
            ok: false,
            error: 403,
            codigo: 'SIN_PERMISO',
            mensaje: `Pasar de ${actual.estado} a ${nuevo} lo puede hacer solo un administrador.`,
          };
        return noPermitida(`No se puede pasar de ${actual.estado} a ${nuevo}.`);
      }
      // Se mira después del bloqueo: si otra fusión lo acaba de convertir en duplicado, aquí ya
      // se ve. Solo `validado` (§7.3): un resuelto o un duplicado no pueden ser canónicos.
      if (nuevo === 'duplicado') {
        const canonicoFila = fusionadoEn ? porId.get(fusionadoEn) : undefined;
        if (!canonicoFila) {
          await cliente.query('ROLLBACK');
          return noPermitida('El reporte canónico no existe o no está publicado.');
        }
        if (canonicoFila.estado !== 'validado') {
          await cliente.query('ROLLBACK');
          return noPermitida(
            `El reporte canónico debe estar en estado 'validado' (actualmente está '${canonicoFila.estado}'). Validalo primero para poder fusionar en él.`,
          );
        }
      }
      await cliente.query(
        `UPDATE reporte_inundacion SET estado = $2::estado_reporte, estado_motivo = $3, fusionado_en_id = $4, actualizado_en = now(),
           validado_por = CASE WHEN $2 = 'validado' THEN $5::uuid ELSE validado_por END,
           validado_en = CASE WHEN $2 = 'validado' THEN now() ELSE validado_en END
         WHERE id = $1`,
        [id, nuevo, motivo ?? null, fusionadoEn ?? null, actor.id],
      );
      await cliente.query(
        'INSERT INTO auditoria (entidad, entidad_id, accion, actor_id, antes, despues) VALUES ($1, $2, $3, $4, $5, $6)',
        [
          'reporte',
          id,
          `estado:${actual.estado}->${nuevo}`,
          actor.id,
          // El motivo anterior va en `antes`: la fila solo guarda el vigente, y al reabrir un
          // rechazado el porqué del rechazo se perdía.
          JSON.stringify({ estado: actual.estado, motivo: actual.estado_motivo }),
          JSON.stringify({ estado: nuevo, motivo, fusionado_en_id: fusionadoEn }),
        ],
      );
      if (fusionadoEn) {
        // Lo que era duplicado de este reporte pasa a serlo de su canónico. Si no, X→B y luego
        // B→C dejaban a X apuntando a un duplicado, y la cadena crecía con cada fusión.
        await cliente.query(
          `WITH reapuntados AS (
             UPDATE reporte_inundacion SET fusionado_en_id = $2, actualizado_en = now()
              WHERE fusionado_en_id = $1
             RETURNING id::text AS id
           )
           INSERT INTO auditoria (entidad, entidad_id, accion, actor_id, antes, despues)
           SELECT 'reporte', id, 'fusion:reapuntar', $3, $4::jsonb, $5::jsonb FROM reapuntados`,
          [
            id,
            fusionadoEn,
            actor.id,
            JSON.stringify({ fusionado_en_id: id }),
            JSON.stringify({ fusionado_en_id: fusionadoEn }),
          ],
        );
      }
      await cliente.query('COMMIT');
    } catch (e) {
      await cliente.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      cliente.release();
    }
    app.metricas.contar('curichi_moderacion_total', { desde: estadoAnterior, hacia: nuevo });
    // Fuera de la transacción: el recálculo abre la suya y necesita ver el cambio ya confirmado.
    // Solo se recalcula la vecindad del reporte, no la tabla entera (§9.2).
    if (AFECTA_PUNTOS.has(estadoAnterior) || AFECTA_PUNTOS.has(nuevo))
      await recalcularPuntosDelEntorno(id);
    // Después del recálculo: los indicadores cuentan también los puntos críticos. No hay caché
    // (ver admin.ts): esto solo evita que la próxima petición se suba a un cálculo de antes.
    invalidarAgregadosEnVuelo(app);
    const fila = await obtenerReporte(dep.pool, id, 'publicado');
    return { ok: true, fila: fila! };
  }

  /**
   * Recálculo de los puntos críticos del entorno del reporte, DESPUÉS del COMMIT. Si falla (por
   * ejemplo, vence el `statement_timeout` esperando el lock del recálculo completo del
   * mantenimiento) la moderación ya está guardada: responder 500 invitaba a repetirla, y el punto
   * quedaba desactualizado para siempre, porque el mantenimiento solo rehace lo que encuentra
   * publicable sin `punto_critico_id`. Por eso aquí se registra y se deja el entorno marcado.
   */
  async function recalcularPuntosDelEntorno(reporteId: string): Promise<void> {
    try {
      const r = await recalcularEntornoDeReporte(ejecutorPg(dep.pool), reporteId);
      // La componente encadenó más reportes de la cuenta y el recálculo quedó pendiente para el
      // mantenimiento. No es un error de la moderación —el cambio de estado ya está guardado—
      // pero sí una señal de que en esa zona el radio de recurrencia está agrupando de más
      // (§9.2), y eso hay que poder verlo sin entrar a mirar la base.
      if (r.desbordado) {
        app.metricas.contar('curichi_puntos_criticos_desbordes_total');
        app.log.warn(
          { reporteId, afectados: r.afectados },
          'puntos críticos: componente demasiado grande; se recalcula en el mantenimiento',
        );
      }
    } catch (err) {
      app.metricas.contar('curichi_puntos_criticos_fallos_total');
      app.log.error(
        { err, reporteId },
        'puntos críticos: falló el recálculo del entorno; queda para el mantenimiento',
      );
      // Se retira el punto crítico del reporte: la FK (ON DELETE SET NULL) desvincula a todos
      // sus miembros, y los que siguen publicables son justo lo que el mantenimiento busca. Si el
      // reporte no tenía punto, ya es él quien queda publicable sin punto. Retirarlo, y no solo
      // desvincular a los miembros, evita dejar en el mapa un punto con datos viejos, también
      // cuando el reporte que sale era su único miembro. Con espera corta: si el recálculo
      // completo tiene tomadas esas filas, el técnico no tiene por qué esperarlo otra vez entero.
      await ejecutorPg(dep.pool)
        .transaccion(async (tx) => {
          await tx.ejecutar("SET LOCAL lock_timeout = '2s'");
          await tx.consultar(
            'DELETE FROM punto_critico WHERE id = (SELECT punto_critico_id FROM reporte_inundacion WHERE id = $1)',
            [reporteId],
          );
        })
        .catch((e) =>
          app.log.error(
            { err: e, reporteId },
            'puntos críticos: tampoco se pudo marcar el entorno para el mantenimiento',
          ),
        );
    }
  }

  async function resolverId(id: string): Promise<string | null> {
    if (id.length === 8) {
      const r = await dep.pool.query<{ id: string }>(
        `SELECT id::text FROM reporte_inundacion WHERE id::text LIKE $1 || '%' AND ${condicionPublicado('')} LIMIT 2`,
        [id],
      );
      if (r.rows.length === 1 && r.rows[0]) return r.rows[0].id;
      return null;
    }
    return id;
  }

  app.patch(
    '/api/v1/reportes/:id/estado',
    { preHandler: requerirRol('tecnico', 'admin') },
    async (req, res) => {
      const p = IdParam.safeParse(req.params);
      const b = ReporteCambiarEstadoSchema.safeParse(req.body);
      if (!p.success)
        return res.status(404).send({ codigo: 'NO_EXISTE', mensaje: 'Reporte no encontrado.' });
      const targetId = await resolverId(p.data.id);
      if (!targetId)
        return res.status(404).send({ codigo: 'NO_EXISTE', mensaje: 'Reporte no encontrado.' });
      if (!b.success)
        return res.status(400).send({
          codigo: 'PAYLOAD_INVALIDO',
          mensaje: b.error.issues.map((i) => i.message).join('; '),
        });
      const r = await cambiarEstado(
        targetId,
        b.data.estado,
        b.data.estado_motivo,
        b.data.fusionado_en_id,
        req.usuario!,
      );
      if (!r.ok) return res.status(r.error).send({ codigo: r.codigo, mensaje: r.mensaje });
      return aFeature(vistaTecnica(r.fila, dep.cfg.urlPublica));
    },
  );

  app.post(
    '/api/v1/reportes/:id/fusionar',
    { preHandler: requerirRol('tecnico', 'admin') },
    async (req, res) => {
      const p = IdParam.safeParse(req.params);
      const b = ReporteFusionarSchema.safeParse(req.body);
      if (!p.success)
        return res.status(404).send({ codigo: 'NO_EXISTE', mensaje: 'Reporte no encontrado.' });
      const targetId = await resolverId(p.data.id);
      if (!targetId)
        return res.status(404).send({ codigo: 'NO_EXISTE', mensaje: 'Reporte no encontrado.' });
      if (!b.success)
        return res.status(400).send({
          codigo: 'PAYLOAD_INVALIDO',
          mensaje: b.error.issues.map((i) => i.message).join('; '),
        });
      const r = await cambiarEstado(
        targetId,
        'duplicado',
        b.data.motivo,
        b.data.canonico_id,
        req.usuario!,
      );
      if (!r.ok) return res.status(r.error).send({ codigo: r.codigo, mensaje: r.mensaje });
      return aFeature(vistaTecnica(r.fila, dep.cfg.urlPublica));
    },
  );

  app.patch(
    '/api/v1/reportes/:id/severidad',
    { preHandler: requerirRol('tecnico', 'admin') },
    async (req, res) => {
      const p = IdParam.safeParse(req.params);
      const b = ReporteReclasificarSchema.safeParse(req.body);
      if (!p.success)
        return res.status(404).send({ codigo: 'NO_EXISTE', mensaje: 'Reporte no encontrado.' });
      const targetId = await resolverId(p.data.id);
      if (!targetId)
        return res.status(404).send({ codigo: 'NO_EXISTE', mensaje: 'Reporte no encontrado.' });
      if (!b.success)
        return res.status(400).send({
          codigo: 'PAYLOAD_INVALIDO',
          mensaje: b.error.issues.map((i) => i.message).join('; '),
        });
      // Misma transacción con la fila bloqueada: si no, dos reclasificaciones simultáneas
      // auditan un "antes" que ya no era el vigente.
      const cliente = await dep.pool.connect();
      let estadoActual: string;
      try {
        await cliente.query('BEGIN');
        const bloqueado = await cliente.query<{ estado: string; severidad_manual: string | null }>(
          `SELECT estado::text, severidad_manual::text FROM reporte_inundacion
            WHERE id = $1 AND ${condicionPublicado('')} FOR UPDATE`,
          [targetId],
        );
        const actual = bloqueado.rows[0];
        if (!actual) {
          await cliente.query('ROLLBACK');
          return res.status(404).send({ codigo: 'NO_EXISTE', mensaje: 'Reporte no encontrado.' });
        }
        estadoActual = actual.estado;
        await cliente.query(
          'UPDATE reporte_inundacion SET severidad_manual = $2::severidad, severidad_motivo = $3, actualizado_en = now() WHERE id = $1',
          [
            targetId,
            b.data.severidad_manual,
            b.data.severidad_manual === null ? null : b.data.severidad_motivo,
          ],
        );
        await cliente.query(
          'INSERT INTO auditoria (entidad, entidad_id, accion, actor_id, antes, despues) VALUES ($1, $2, $3, $4, $5, $6)',
          [
            'reporte',
            targetId,
            'severidad:reclasificar',
            req.usuario!.id,
            JSON.stringify({ severidad_manual: actual.severidad_manual }),
            JSON.stringify(b.data),
          ],
        );
        await cliente.query('COMMIT');
      } catch (e) {
        await cliente.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        cliente.release();
      }
      // La severidad no mueve el punto, pero sí puede cambiar su `severidad_max`.
      if (AFECTA_PUNTOS.has(estadoActual)) await recalcularPuntosDelEntorno(targetId);
      invalidarAgregadosEnVuelo(app);
      const fila = await obtenerReporte(dep.pool, targetId, 'publicado');
      return aFeature(vistaTecnica(fila!, dep.cfg.urlPublica));
    },
  );
}
