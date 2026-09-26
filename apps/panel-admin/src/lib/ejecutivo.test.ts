import { ResumenEjecutivoSchema } from 'contracts';
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
  marcasEje,
  RAMPAS,
  rellenoDistritos,
  textoActualizado,
} from './ejecutivo';
import { resumenDeEjemplo } from './ejecutivo.fixture';

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

  it('sin reportes no hay rangos, y el cero va con el color neutro, nunca con el de un rango', () => {
    expect(construirEscala(0, rampa)).toEqual([]);
    const e = construirEscala(10, rampa);
    expect(colorParaConteo(0, e)).toBe(COLOR_SIN_REPORTES);
    expect(colorParaConteo(1, e)).toBe(rampa[0]);
    expect(colorParaConteo(10, e)).toBe(rampa[4]);
  });

  it('el relleno del mapa colorea cada distrito por su conteo en la pestaña activa', () => {
    const r = resumenDeEjemplo();
    const critica = rellenoDistritos(r, 'critica');
    // D01 tiene 1 crítica + 1 alta = 2; D16 tiene 0 → neutro.
    expect(critica.descripciones.D01).toBe('Distrito 1 · 2 reportes');
    expect(critica.colores.D16).toBe(COLOR_SIN_REPORTES);
    expect(Object.keys(critica.colores)).toHaveLength(16);
    // Cambiar de pestaña cambia la rampa.
    const baja = rellenoDistritos(r, 'baja');
    expect(RAMPAS.baja).toContain(baja.colores.D02);
  });
});

describe('datos de las gráficas', () => {
  const r = resumenDeEjemplo();

  it('el resumen de ejemplo cumple el contrato', () => {
    expect(ResumenEjecutivoSchema.safeParse(r).success).toBe(true);
  });

  it('una barra por distrito, ordenadas por código numérico (D2 antes que D10)', () => {
    const b = barrasInundaciones(r, 'todas');
    expect(b).toHaveLength(16);
    expect(b.map((x) => x.codigo).slice(0, 3)).toEqual(['D01', 'D02', 'D03']);
    expect(b[0]?.etiqueta).toBe('01');
    expect(b[0]?.valor).toBe(r.por_distrito.find((d) => d.codigo === 'D01')?.total);
  });

  it('las barras apiladas acumulan en revisión → validados → resueltos sin huecos', () => {
    const [d] = barrasTrabajo(r);
    expect(d?.segmentos.map((s) => [s.estado, s.valor, s.desde, s.hasta])).toEqual([
      ['nuevo', 2, 0, 2],
      ['validado', 2, 2, 4],
      ['resuelto', 1, 4, 5],
    ]);
    expect(d?.total).toBe(5);
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
});
