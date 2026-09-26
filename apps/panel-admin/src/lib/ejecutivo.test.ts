import { CONFIG_DOMINIO, ResumenEjecutivoSchema } from 'contracts';
import { describe, expect, it } from 'vitest';
import {
  barrasInundaciones,
  barrasTrabajo,
  COLOR_SIN_REPORTES,
  codigoCorto,
  colorParaConteo,
  construirEscala,
  conteoPestana,
  conteosPorPestana,
  crearOrigenConsultas,
  distritosCapaAnterior,
  marcasEje,
  OPACIDAD_COROPLETA,
  RAMPAS,
  rellenoDistritos,
  textoActualizado,
  textoActualizadoDesde,
  textoAnuncio,
  textoVerificadas,
} from './ejecutivo';
import { resumenDeEjemplo } from './ejecutivo.fixture';
import { crearFormato } from './formato';

/** Formato de la ciudad por defecto (es-BO): el de la instalación actual. */
const F = crearFormato(CONFIG_DOMINIO.CIUDAD_POR_DEFECTO);

// --- Contraste WCAG 2.x (solo para las pruebas) --------------------------------------------------

function canales(hex: string): number[] {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
}

function luminancia(hex: string): number {
  const [r, g, b] = canales(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (claro + 0.05) / (oscuro + 0.05);
}

/** Color que se ve en el mapa: el relleno con su opacidad sobre el fondo del estilo base. */
function sobreFondo(color: string, fondo: string, alfa: number): string {
  const f = canales(fondo);
  return `#${canales(color)
    .map((c, i) => Math.round(alfa * c + (1 - alfa) * (f[i] as number)))
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Fondo del estilo base del mapa (`Mapa.tsx`, capa `fondo`), debajo de la coropleta. */
const FONDO_MAPA = '#EEF2EF';

describe('pestañas del panel ejecutivo', () => {
  const s = { critica: 3, alta: 4, media: 5, baja: 6 };

  it('«Crítica» suma crítica + alta; media y baja van solas; «Todas» es la suma completa', () => {
    expect(conteoPestana(s, 'critica')).toBe(7);
    expect(conteoPestana(s, 'media')).toBe(5);
    expect(conteoPestana(s, 'baja')).toBe(6);
    expect(conteoPestana(s, 'todas')).toBe(18);
    expect(conteosPorPestana(s)).toEqual({ critica: 7, media: 5, baja: 6, todas: 18 });
  });

  it('las tres pestañas de severidad suman lo mismo que «Todas» (no se pierde ni se duplica)', () => {
    const c = conteosPorPestana(s);
    expect(c.critica + c.media + c.baja).toBe(c.todas);
  });
});

describe('escala de colores por conteo', () => {
  const rampa = RAMPAS.todas;

  it('cinco rangos enteros contiguos de 1 al máximo, del más claro al más oscuro', () => {
    const e = construirEscala(12, rampa);
    expect(e.map((p) => [p.desde, p.hasta])).toEqual([
      [1, 2],
      [3, 4],
      [5, 7],
      [8, 9],
      [10, 12],
    ]);
    expect(e.map((p) => p.color)).toEqual([...rampa]);
  });

  it('con pocos valores posibles hay menos rangos y el máximo sigue siendo el más oscuro', () => {
    const e = construirEscala(3, rampa);
    expect(e.map((p) => [p.desde, p.hasta])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
    expect(e.at(-1)?.color).toBe(rampa.at(-1));
  });

  it('sin activas no hay rangos, y el cero va con el color neutro, nunca con el de un rango', () => {
    expect(construirEscala(0, rampa)).toEqual([]);
    const e = construirEscala(10, rampa);
    expect(colorParaConteo(0, e)).toBe(COLOR_SIN_REPORTES);
    expect(colorParaConteo(1, e)).toBe(rampa[0]);
    expect(colorParaConteo(10, e)).toBe(rampa[4]);
  });

  it('el primer paso de cada rampa se distingue de «sin activas» con contraste ≥ 3:1, en la leyenda y en el mapa', () => {
    // Antes el primer paso tenía 1,03–1,09:1 con el gris de «sin reportes»: un distrito con una
    // inundación activa se veía igual que uno sin ninguna (WCAG 1.4.11).
    const sinActivasEnMapa = sobreFondo(COLOR_SIN_REPORTES, FONDO_MAPA, OPACIDAD_COROPLETA);
    for (const [pestana, r] of Object.entries(RAMPAS)) {
      const primero = r[0] as string;
      expect(contraste(primero, COLOR_SIN_REPORTES), pestana).toBeGreaterThanOrEqual(3);
      const primeroEnMapa = sobreFondo(primero, FONDO_MAPA, OPACIDAD_COROPLETA);
      expect(
        contraste(primeroEnMapa, sinActivasEnMapa),
        `${pestana} en el mapa`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('cada rampa oscurece paso a paso: el máximo siempre es el color más oscuro', () => {
    for (const r of Object.values(RAMPAS)) {
      const l = r.map(luminancia);
      for (let i = 1; i < l.length; i++) expect(l[i]).toBeLessThan(l[i - 1] as number);
    }
  });

  it('el relleno del mapa colorea cada distrito vigente por sus activas en la pestaña', () => {
    const r = resumenDeEjemplo();
    const critica = rellenoDistritos(r, 'critica', F);
    // D01 tiene 1 crítica + 1 alta activas = 2; D16 no tiene ninguna → neutro.
    expect(critica.descripciones.D01).toBe('Distrito 1 · 2 inundaciones activas');
    expect(critica.colores.D16).toBe(COLOR_SIN_REPORTES);
    expect(Object.keys(critica.colores)).toHaveLength(16);
    // Cambiar de pestaña cambia la rampa.
    const baja = rellenoDistritos(r, 'baja', F);
    expect(RAMPAS.baja).toContain(baja.colores.D02);
  });
});

describe('distritos de una capa anterior', () => {
  const r = resumenDeEjemplo();

  it('no entran al mapa ni al máximo de la escala', () => {
    const relleno = rellenoDistritos(r, 'todas', F);
    expect(Object.keys(relleno.colores)).not.toContain('DM-01');
    expect(relleno.descripciones).not.toHaveProperty('DM-01');
    // El máximo es el de los vigentes (D07, 7 activas), no las 40 del distrito anterior, que
    // dejaban a todos los demás en los pasos más claros.
    expect(relleno.escala.at(-1)?.hasta).toBe(7);
  });

  it('no aparecen como barras: sin la segunda barra «01» en ninguna gráfica', () => {
    const inundaciones = barrasInundaciones(r, 'todas');
    const trabajo = barrasTrabajo(r);
    for (const barras of [inundaciones, trabajo]) {
      expect(barras).toHaveLength(16);
      expect(barras.map((b) => b.codigo)).not.toContain('DM-01');
      expect(new Set(barras.map((b) => b.etiqueta)).size).toBe(16);
    }
  });

  it('van aparte con su código completo, sus activas de la pestaña y su trabajo', () => {
    expect(distritosCapaAnterior(r, 'todas')).toEqual([
      {
        distrito_id: 'distrito_municipal:DM-01',
        codigo: 'DM-01',
        nombre: 'Distrito 1 (capa 2024)',
        activas: 40,
        por_estado: { nuevo: 15, validado: 25, resuelto: 5 },
      },
    ]);
    expect(distritosCapaAnterior(r, 'critica')[0]?.activas).toBe(20);
  });
});

describe('datos de las gráficas', () => {
  const r = resumenDeEjemplo();

  it('el resumen de ejemplo cumple el contrato 0.6.0', () => {
    const v = ResumenEjecutivoSchema.safeParse(r);
    expect(v.error?.issues ?? []).toEqual([]);
  });

  it('una barra por distrito vigente con sus activas, ordenadas por código numérico (D2 antes que D10)', () => {
    const b = barrasInundaciones(r, 'todas');
    expect(b.map((x) => x.codigo).slice(0, 3)).toEqual(['D01', 'D02', 'D03']);
    expect(b[0]?.etiqueta).toBe('01');
    expect(b[0]?.valor).toBe(r.por_distrito.find((d) => d.codigo === 'D01')?.activas.total);
  });

  it('las barras apiladas acumulan en revisión → validados → resueltos sin huecos', () => {
    const [d] = barrasTrabajo(r);
    expect(d?.segmentos.map((s) => [s.estado, s.valor, s.desde, s.hasta])).toEqual([
      ['nuevo', 3, 0, 3],
      ['validado', 2, 3, 5],
      ['resuelto', 1, 5, 6],
    ]);
    expect(d?.total).toBe(6);
  });

  it('codigoCorto quita el prefijo del distrito', () => {
    expect(codigoCorto('D07')).toBe('07');
    expect(codigoCorto('DM-12')).toBe('12');
    expect(codigoCorto('3')).toBe('3');
  });

  it('marcas del eje con pasos redondos y como mucho cinco divisiones', () => {
    expect(marcasEje(0)).toEqual([0, 1]);
    expect(marcasEje(3)).toEqual([0, 1, 2, 3]);
    expect(marcasEje(12)).toEqual([0, 5, 10, 15]);
    expect(marcasEje(230)).toEqual([0, 50, 100, 150, 200, 250]);
  });

  it('texto de actualización', () => {
    expect(textoActualizado(3_000)).toBe('actualizado hace unos segundos');
    expect(textoActualizado(42_000)).toBe('actualizado hace 40 s');
    expect(textoActualizado(185_000)).toBe('actualizado hace 3 min');
  });

  it('«actualizado hace…» se mide desde `generado_en`, no desde que llegó la respuesta', () => {
    const ahora = Date.parse('2026-09-25T10:03:05-04:00');
    expect(textoActualizadoDesde('2026-09-25T10:00:00-04:00', ahora)).toBe(
      'actualizado hace 3 min',
    );
    expect(textoActualizadoDesde('no es una fecha', ahora)).toBe('');
  });
});

describe('cifras en texto', () => {
  const r = resumenDeEjemplo();

  it('la línea bajo el número grande separa verificadas y en revisión', () => {
    expect(textoVerificadas(r.activas, F)).toBe('55 verificadas · 59 en revisión');
    expect(
      textoVerificadas(
        {
          total: 2,
          verificadas: 1,
          en_revision: 1,
          por_severidad: { critica: 0, alta: 0, media: 1, baja: 1 },
        },
        F,
      ),
    ).toBe('1 verificada · 1 en revisión');
  });

  it('el anuncio para lectores de pantalla depende solo de las cifras, nunca del reloj', () => {
    const t = textoAnuncio(r, F);
    expect(t).toBe('114 inundaciones activas: 55 verificadas y 59 en revisión.');
    // Otra respuesta con las mismas cifras (solo cambia `generado_en`) no cambia el texto, así
    // que la región viva no vuelve a hablar en cada refresco.
    expect(textoAnuncio({ ...r, generado_en: '2026-09-25T10:01:00-04:00' }, F)).toBe(t);
  });

  it('las cifras llevan el separador de miles de la ciudad del despliegue', () => {
    const miles = {
      total: 2468,
      verificadas: 1234,
      en_revision: 1234,
      por_severidad: { critica: 0, alta: 0, media: 1234, baja: 1234 },
    };
    expect(textoVerificadas(miles, F)).toBe('1.234 verificadas · 1.234 en revisión');
    const mx = crearFormato({ locale: 'es-MX', zona_horaria: 'America/Mexico_City' });
    expect(textoVerificadas(miles, mx)).toBe('1,234 verificadas · 1,234 en revisión');
    expect(textoAnuncio({ ...r, activas: miles }, mx)).toBe(
      '2,468 inundaciones activas: 1,234 verificadas y 1,234 en revisión.',
    );
  });
});

describe('origen de las consultas del resumen', () => {
  it('la primera la pide la persona; los refrescos automáticos son sondeos', () => {
    const o = crearOrigenConsultas();
    expect(o.esSondeo()).toBe(false);
    expect(o.esSondeo()).toBe(true);
    expect(o.esSondeo()).toBe(true);
  });

  it('después de una acción de la persona (período, reintento) la siguiente consulta no es sondeo', () => {
    const o = crearOrigenConsultas();
    o.esSondeo();
    o.marcarAccion();
    expect(o.esSondeo()).toBe(false);
    expect(o.esSondeo()).toBe(true);
  });
});
