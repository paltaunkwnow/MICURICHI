import {
  ReporteCambiarEstadoSchema,
  ReporteFusionarSchema,
  ReporteReclasificarSchema,
  transicionPermitida,
} from 'contracts';
import { ejecutorPg, recalcularPuntosCriticos } from 'db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Dependencias } from '../app.js';
import { requerirRol } from '../auth.js';
import { obtenerReporte } from '../consultas.js';
import { aFeature, type FilaReporte, vistaTecnica } from '../vistas.js';

const IdParam = z.object({ id: z.uuid() });
const AFECTA_PUNTOS = new Set(['validado', 'resuelto']);

export async function rutasModeracion(app: FastifyInstance, dep: Dependencias) {
  const auditar = (
    entidadId: string,
    accion: string,
    actor: string,
    antes: unknown,
    despues: unknown,
  ) =>
    dep.pool.query(
      'INSERT INTO auditoria (entidad, entidad_id, accion, actor_id, antes, despues) VALUES ($1, $2, $3, $4, $5, $6)',
      ['reporte', entidadId, accion, actor, JSON.stringify(antes), JSON.stringify(despues)],
    );

  type ResultadoCambio =
    | { ok: false; error: 404 | 409; mensaje: string }
    | { ok: true; fila: FilaReporte };
  async function cambiarEstado(
    id: string,
    nuevo: string,
    motivo: string | undefined,
    fusionadoEn: string | undefined,
    actor: { id: string; rol: string },
  ): Promise<ResultadoCambio> {
    const actual = await obtenerReporte(dep.pool, id);
    if (!actual) return { ok: false, error: 404, mensaje: 'Reporte no encontrado.' };
    if (!transicionPermitida(actual.estado, nuevo, actor.rol))
      return {
        ok: false,
        error: 409,
        mensaje: `No se puede pasar de ${actual.estado} a ${nuevo} con rol ${actor.rol}.`,
      };
    if (nuevo === 'duplicado') {
      const canonico = fusionadoEn ? await obtenerReporte(dep.pool, fusionadoEn) : null;
      if (!canonico || canonico.id === id || !['validado', 'resuelto'].includes(canonico.estado))
        return {
          ok: false,
          error: 409,
          mensaje: 'El reporte canónico debe existir, ser distinto y estar validado.',
        };
    }
    await dep.pool.query(
      `UPDATE reporte_inundacion SET estado = $2::estado_reporte, estado_motivo = $3, fusionado_en_id = $4, actualizado_en = now(),
         validado_por = CASE WHEN $2 = 'validado' THEN $5::uuid ELSE validado_por END,
         validado_en = CASE WHEN $2 = 'validado' THEN now() ELSE validado_en END
       WHERE id = $1`,
      [id, nuevo, motivo ?? null, nuevo === 'duplicado' ? fusionadoEn : null, actor.id],
    );
    await auditar(
      id,
      `estado:${actual.estado}->${nuevo}`,
      actor.id,
      { estado: actual.estado },
      { estado: nuevo, motivo, fusionado_en_id: fusionadoEn },
    );
    if (AFECTA_PUNTOS.has(actual.estado) || AFECTA_PUNTOS.has(nuevo))
      await recalcularPuntosCriticos(ejecutorPg(dep.pool));
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
      const actual = await obtenerReporte(dep.pool, p.data.id);
      if (!actual)
        return res.status(404).send({ codigo: 'NO_EXISTE', mensaje: 'Reporte no encontrado.' });
      await dep.pool.query(
        'UPDATE reporte_inundacion SET severidad_manual = $2::severidad, severidad_motivo = $3, actualizado_en = now() WHERE id = $1',
        [
          p.data.id,
          b.data.severidad_manual,
          b.data.severidad_manual === null ? null : b.data.severidad_motivo,
        ],
      );
      await auditar(
        p.data.id,
        'severidad:reclasificar',
        req.usuario!.id,
        { severidad_manual: actual.severidad_manual },
        b.data,
      );
      if (AFECTA_PUNTOS.has(actual.estado)) await recalcularPuntosCriticos(ejecutorPg(dep.pool));
      const fila = await obtenerReporte(dep.pool, p.data.id);
      return aFeature(vistaTecnica(fila!, dep.cfg.urlPublica));
    },
  );
}
