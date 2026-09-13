import { createHash } from 'node:crypto';
import {
  CONFIG_DOMINIO,
  calcularSeveridad,
  ReporteCrearSchema,
  ReporteFiltrosSchema,
} from 'contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Dependencias } from '../app.js';
import { listarReportes, obtenerReporte } from '../consultas.js';
import { aFeature, vistaPublica, vistaTecnica } from '../vistas.js';

const IdParam = z.object({ id: z.uuid() });

export function esTecnico(rol: string | undefined) {
  return rol === 'tecnico' || rol === 'admin';
}

export async function rutasReportes(app: FastifyInstance, dep: Dependencias) {
  app.post(
    '/api/v1/reportes',
    {
      config: { rateLimit: { max: dep.cfg.rateLimitMax, timeWindow: dep.cfg.rateLimitVentanaMs } },
    },
    async (req, res) => {
      const p = ReporteCrearSchema.safeParse(req.body);
      if (!p.success) {
        return res.status(400).send({
          codigo: 'PAYLOAD_INVALIDO',
          mensaje: 'Revisá los datos del reporte.',
          detalles: p.error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
        });
      }
      const d = p.data;
      const geo = await dep.resolver.resolver(d.lat, d.lon);
      if (!geo.dentro_cobertura || !geo.unidad_vecinal || !geo.distrito) {
        return res.status(422).send({
          codigo: 'FUERA_DE_COBERTURA',
          mensaje:
            'Ese punto queda fuera del área del municipio o no cae en ninguna unidad vecinal.',
          detalles: geo,
        });
      }
      const sev = calcularSeveridad(d);
      const ipHash = createHash('sha256')
        .update(`${req.ip}|${dep.cfg.salIp}|${new Date().toISOString().slice(0, 10)}`)
        .digest('hex');
      const cliente = await dep.pool.connect();
      try {
        await cliente.query('BEGIN');
        const ins = await cliente.query<{ id: string }>(
          `INSERT INTO reporte_inundacion (geom, evento_en, autor_id, distrito_id, unidad_vecinal_id, manzana_id, version_capa, resolucion_flags,
           ubicacion_metodo, precision_gps_m, ubicacion_tipo, descripcion, tirante_estimado, duracion_estimada, frecuencia, afectacion, causa_presunta,
           sumidero_cercano, sumidero_estado, agua_brota_sumidero, severidad_calculada, severidad_puntaje, severidad_version, estado, ip_hash)
         VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326), $3, $4, $5, $6, $7, $8, $9::jsonb,
           $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, 'nuevo', $25) RETURNING id`,
          [
            d.lon,
            d.lat,
            d.evento_en ?? null,
            req.usuario?.id ?? null,
            geo.distrito.id,
            geo.unidad_vecinal.id,
            geo.manzana?.id ?? null,
            geo.version_capa,
            JSON.stringify({
              en_limite: geo.en_limite,
              asignado_por_proximidad: geo.asignado_por_proximidad,
              distancia_m: geo.distancia_m,
              distrito_discrepante: geo.distrito_discrepante,
            }),
            d.ubicacion_metodo,
            d.precision_gps_m ?? null,
            d.ubicacion_tipo,
            d.descripcion,
            d.tirante_estimado,
            d.duracion_estimada,
            d.frecuencia,
            d.afectacion,
            d.causa_presunta,
            d.sumidero_cercano ?? null,
            d.sumidero_estado ?? null,
            d.agua_brota_sumidero ?? null,
            sev.banda,
            sev.puntaje,
            sev.version,
            ipHash,
          ],
        );
        const id = ins.rows[0]!.id;
        if (d.fotos.length) {
          await cliente.query(
            'UPDATE reporte_foto SET reporte_id = $1 WHERE objeto_key = ANY($2::text[]) AND reporte_id IS NULL AND exif_sanitizado',
            [id, d.fotos],
          );
        }
        await cliente.query(
          'INSERT INTO auditoria (entidad, entidad_id, accion, actor_id, despues) VALUES ($1, $2, $3, $4, $5)',
          [
            'reporte',
            id,
            'crear',
            req.usuario?.id ?? null,
            JSON.stringify({
              estado: 'nuevo',
              severidad: sev.banda,
              puntaje: sev.puntaje,
              reglas: sev.reglas,
            }),
          ],
        );
        await cliente.query('COMMIT');
        const fila = await obtenerReporte(dep.pool, id);
        return res.status(201).send(aFeature(vistaPublica(fila!, dep.cfg.urlPublica, true)));
      } catch (e) {
        await cliente.query('ROLLBACK');
        throw e;
      } finally {
        cliente.release();
      }
    },
  );

  app.get('/api/v1/reportes', async (req, res) => {
    const q = ReporteFiltrosSchema.safeParse(req.query);
    if (!q.success)
      return res.status(400).send({
        codigo: 'FILTROS_INVALIDOS',
        mensaje: q.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      });
    const tecnico = esTecnico(req.usuario?.rol);
    const { filas, total } = await listarReportes(dep.pool, {
      filtros: q.data,
      soloPublicos: !tecnico,
    });
    return {
      type: 'FeatureCollection',
      features: filas.map((f) =>
        aFeature(
          tecnico ? vistaTecnica(f, dep.cfg.urlPublica) : vistaPublica(f, dep.cfg.urlPublica),
        ),
      ),
      total,
      pagina: q.data.pagina,
      limite: q.data.limite,
    };
  });

  app.get('/api/v1/reportes/:id', async (req, res) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success)
      return res.status(404).send({ codigo: 'NO_EXISTE', mensaje: 'Reporte no encontrado.' });
    const fila = await obtenerReporte(dep.pool, p.data.id);
    const tecnico = esTecnico(req.usuario?.rol);
    if (!fila || (!tecnico && !['validado', 'resuelto'].includes(fila.estado)))
      return res
        .status(404)
        .send({ codigo: 'NO_EXISTE', mensaje: 'Reporte no encontrado o aún no publicado.' });
    return aFeature(
      tecnico ? vistaTecnica(fila, dep.cfg.urlPublica) : vistaPublica(fila, dep.cfg.urlPublica),
    );
  });
}

export { CONFIG_DOMINIO };
