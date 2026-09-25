import {
  ReporteCambiarEstadoSchema,
  ReporteFusionarSchema,
  ReporteReclasificarSchema,
  transicionPermitida,
} from 'contracts';
import { ejecutorPg, recalcularEntornoDeReporte } from 'db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Dependencias } from '../app.js';
import { requerirRol } from '../auth.js';
import { obtenerReporte } from '../consultas.js';
import { aFeature, type FilaReporte, vistaTecnica } from '../vistas.js';

const IdParam = z.object({ id: z.uuid() });
const AFECTA_PUNTOS = new Set(['validado', 'resuelto']);

export async function rutasModeracion(app: FastifyInstance, dep: Dependencias) {
  type ResultadoCambio =
    | { ok: false; error: 404 | 409; mensaje: string }
    | { ok: true; fila: FilaReporte };

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
    fusionadoEn: string | undefined,
    actor: { id: string; rol: string },
  ): Promise<ResultadoCambio> {
    const cliente = await dep.pool.connect();
    let estadoAnterior: string;
    try {
      await cliente.query('BEGIN');
      const bloqueado = await cliente.query<{ estado: string }>(
        'SELECT estado::text FROM reporte_inundacion WHERE id = $1 FOR UPDATE',
        [id],
      );
      const actual = bloqueado.rows[0];
      if (!actual) {
        await cliente.query('ROLLBACK');
        return { ok: false, error: 404, mensaje: 'Reporte no encontrado.' };
      }
      estadoAnterior = actual.estado;
      if (!transicionPermitida(actual.estado, nuevo, actor.rol)) {
        await cliente.query('ROLLBACK');
        return {
          ok: false,
          error: 409,
          mensaje: `No se puede pasar de ${actual.estado} a ${nuevo} con rol ${actor.rol}.`,
        };
      }
      if (nuevo === 'duplicado') {
        const c = fusionadoEn
          ? await cliente.query<{ id: string; estado: string }>(
              'SELECT id::text, estado::text FROM reporte_inundacion WHERE id = $1',
              [fusionadoEn],
            )
          : null;
        const canonico = c?.rows[0];
        if (
          !canonico ||
          canonico.id === id ||
          !['validado', 'resuelto'].includes(canonico.estado)
        ) {
          await cliente.query('ROLLBACK');
          return {
            ok: false,
            error: 409,
            mensaje: 'El reporte canónico debe existir, ser distinto y estar validado.',
          };
        }
      }
      await cliente.query(
        `UPDATE reporte_inundacion SET estado = $2::estado_reporte, estado_motivo = $3, fusionado_en_id = $4, actualizado_en = now(),
           validado_por = CASE WHEN $2 = 'validado' THEN $5::uuid ELSE validado_por END,
           validado_en = CASE WHEN $2 = 'validado' THEN now() ELSE validado_en END
         WHERE id = $1`,
        [id, nuevo, motivo ?? null, nuevo === 'duplicado' ? fusionadoEn : null, actor.id],
      );
      await cliente.query(
        'INSERT INTO auditoria (entidad, entidad_id, accion, actor_id, antes, despues) VALUES ($1, $2, $3, $4, $5, $6)',
        [
          'reporte',
          id,
          `estado:${actual.estado}->${nuevo}`,
          actor.id,
          JSON.stringify({ estado: actual.estado }),
          JSON.stringify({ estado: nuevo, motivo, fusionado_en_id: fusionadoEn }),
        ],
      );
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
    if (AFECTA_PUNTOS.has(estadoAnterior) || AFECTA_PUNTOS.has(nuevo)) {
      const r = await recalcularEntornoDeReporte(ejecutorPg(dep.pool), id);
      // La componente encadenó más reportes de la cuenta y el recálculo quedó pendiente para el
      // mantenimiento. No es un error de la moderación —el cambio de estado ya está guardado—
      // pero sí una señal de que en esa zona el radio de recurrencia está agrupando de más
      // (§9.2), y eso hay que poder verlo sin entrar a mirar la base.
      if (r.desbordado) {
        app.metricas.contar('curichi_puntos_criticos_desbordes_total');
        app.log.warn(
          { reporteId: id, afectados: r.afectados },
          'puntos críticos: componente demasiado grande; se recalcula en el mantenimiento',
        );
      }
    }
    const fila = await obtenerReporte(dep.pool, id);
    return { ok: true, fila: fila! };
  }

  app.patch(
    '/api/v1/reportes/:id/estado',
    { preHandler: requerirRol('tecnico', 'admin') },
    async (req, res) => {
      const p = IdParam.safeParse(req.params);
      const b = ReporteCambiarEstadoSchema.safeParse(req.body);
      if (!p.success)
        return res.status(404).send({ codigo: 'NO_EXISTE', mensaje: 'Reporte no encontrado.' });
      if (!b.success)
        return res.status(400).send({
          codigo: 'PAYLOAD_INVALIDO',
          mensaje: b.error.issues.map((i) => i.message).join('; '),
        });
      const r = await cambiarEstado(
        p.data.id,
        b.data.estado,
        b.data.estado_motivo,
        b.data.fusionado_en_id,
        req.usuario!,
      );
      if (!r.ok)
        return res.status(r.error).send({
          codigo: r.error === 404 ? 'NO_EXISTE' : 'TRANSICION_NO_PERMITIDA',
          mensaje: r.mensaje,
        });
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
      if (!b.success)
        return res.status(400).send({
          codigo: 'PAYLOAD_INVALIDO',
          mensaje: b.error.issues.map((i) => i.message).join('; '),
        });
      const r = await cambiarEstado(
        p.data.id,
        'duplicado',
        b.data.motivo,
        b.data.canonico_id,
        req.usuario!,
      );
      if (!r.ok)
        return res.status(r.error).send({
          codigo: r.error === 404 ? 'NO_EXISTE' : 'TRANSICION_NO_PERMITIDA',
          mensaje: r.mensaje,
        });
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
          'SELECT estado::text, severidad_manual::text FROM reporte_inundacion WHERE id = $1 FOR UPDATE',
          [p.data.id],
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
            p.data.id,
            b.data.severidad_manual,
            b.data.severidad_manual === null ? null : b.data.severidad_motivo,
          ],
        );
        await cliente.query(
          'INSERT INTO auditoria (entidad, entidad_id, accion, actor_id, antes, despues) VALUES ($1, $2, $3, $4, $5, $6)',
          [
            'reporte',
            p.data.id,
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
      if (AFECTA_PUNTOS.has(estadoActual))
        await recalcularEntornoDeReporte(ejecutorPg(dep.pool), p.data.id);
      const fila = await obtenerReporte(dep.pool, p.data.id);
      return aFeature(vistaTecnica(fila!, dep.cfg.urlPublica));
    },
  );
}
