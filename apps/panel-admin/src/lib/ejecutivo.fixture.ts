import type { ConteoPorSeveridad, ResumenDistrito, ResumenEjecutivo } from 'contracts';

const ULTIMO = '2026-09-24T18:30:00-04:00';

/** Un distrito del resumen: reparte sus activas entre verificadas (hasta `verificadasMax`) y en revisión. */
function distrito(
  codigo: string,
  nombre: string,
  enCapaVigente: boolean,
  porSeveridad: ConteoPorSeveridad,
  verificadasMax: number,
  resueltos: number,
): ResumenDistrito {
  const total = porSeveridad.critica + porSeveridad.alta + porSeveridad.media + porSeveridad.baja;
  const verificadas = Math.min(verificadasMax, total);
  const enRevision = total - verificadas;
  return {
    distrito_id: `distrito_municipal:${codigo}`,
    codigo,
    nombre,
    en_capa_vigente: enCapaVigente,
    activas: { total, verificadas, en_revision: enRevision, por_severidad: porSeveridad },
    por_estado: { nuevo: enRevision, validado: verificadas, resuelto: resueltos },
    ultimo_reporte_en: total + resueltos ? ULTIMO : null,
  };
}

/**
 * Resumen SINTÉTICO para los tests (contracts 0.6.0): 16 distritos de la capa vigente con conteos
 * inventados, no datos del municipio, y uno de una capa anterior con muchas activas, que es el
 * caso que antes se colaba en el mapa y en las barras. Los distritos vienen desordenados a
 * propósito, como podría devolverlos la API.
 */
export function resumenDeEjemplo(): ResumenEjecutivo {
  const distritos: ResumenDistrito[] = [];
  for (let i = 16; i >= 1; i--) {
    const codigo = `D${String(i).padStart(2, '0')}`;
    // D16 sin reportes; el resto con conteos que crecen con el número.
    const k = i === 16 ? 0 : 1;
    const porSeveridad = {
      critica: k * (i % 3 === 1 ? 1 : 0),
      alta: k * 1,
      media: k * (i % 4),
      baja: k * 2,
    };
    distritos.push(distrito(codigo, `Distrito ${i}`, true, porSeveridad, 2, k));
  }
  // Solo existe en una capa anterior. Su código acortado («01») chocaría con el de D01.
  distritos.push(
    distrito(
      'DM-01',
      'Distrito 1 (capa 2024)',
      false,
      { critica: 10, alta: 10, media: 10, baja: 10 },
      25,
      5,
    ),
  );

  const suma = (f: (d: ResumenDistrito) => number) => distritos.reduce((s, d) => s + f(d), 0);
  const porEstado = {
    nuevo: suma((d) => d.por_estado.nuevo),
    validado: suma((d) => d.por_estado.validado),
    resuelto: suma((d) => d.por_estado.resuelto),
  };
  return {
    generado_en: '2026-09-25T10:00:00-04:00',
    ventana: { desde: null, hasta: null },
    activas: {
      total: suma((d) => d.activas.total),
      verificadas: porEstado.validado,
      en_revision: porEstado.nuevo,
      por_severidad: {
        critica: suma((d) => d.activas.por_severidad.critica),
        alta: suma((d) => d.activas.por_severidad.alta),
        media: suma((d) => d.activas.por_severidad.media),
        baja: suma((d) => d.activas.por_severidad.baja),
      },
    },
    resueltas: porEstado.resuelto,
    por_estado: porEstado,
    por_distrito: distritos,
    ultimo_reporte_en: ULTIMO,
  };
}
