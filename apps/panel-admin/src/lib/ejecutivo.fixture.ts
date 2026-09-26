import type { ResumenDistrito, ResumenEjecutivo } from 'contracts';

/**
 * Resumen SINTÉTICO para los tests: 16 distritos con conteos inventados, no datos del municipio.
 * Los distritos vienen desordenados a propósito, como podría devolverlos la API.
 */
export function resumenDeEjemplo(): ResumenEjecutivo {
  const distritos: ResumenDistrito[] = [];
  for (let i = 16; i >= 1; i--) {
    const codigo = `D${String(i).padStart(2, '0')}`;
    // D16 sin reportes; el resto con conteos que crecen con el número.
    const k = i === 16 ? 0 : 1;
    const por_severidad = {
      critica: k * (i % 3 === 1 ? 1 : 0),
      alta: k * 1,
      media: k * (i % 4),
      baja: k * 2,
    };
    const total =
      por_severidad.critica + por_severidad.alta + por_severidad.media + por_severidad.baja;
    const validado = Math.min(2, total);
    const resuelto = Math.min(1, total - validado);
    distritos.push({
      distrito_id: `distrito_municipal:${codigo}`,
      codigo,
      nombre: `Distrito ${i}`,
      total,
      por_severidad,
      por_estado: { nuevo: total - validado - resuelto, validado, resuelto },
      ultimo_reporte_en: total ? '2026-09-24T18:30:00-04:00' : null,
    });
  }
  const suma = (f: (d: ResumenDistrito) => number) => distritos.reduce((s, d) => s + f(d), 0);
  return {
    generado_en: '2026-09-25T10:00:00-04:00',
    ventana: { desde: null, hasta: null },
    total: suma((d) => d.total),
    por_severidad: {
      critica: suma((d) => d.por_severidad.critica),
      alta: suma((d) => d.por_severidad.alta),
      media: suma((d) => d.por_severidad.media),
      baja: suma((d) => d.por_severidad.baja),
    },
    por_estado: {
      nuevo: suma((d) => d.por_estado.nuevo),
      validado: suma((d) => d.por_estado.validado),
      resuelto: suma((d) => d.por_estado.resuelto),
    },
    por_distrito: distritos,
    ultimo_reporte_en: '2026-09-24T18:30:00-04:00',
  };
}
