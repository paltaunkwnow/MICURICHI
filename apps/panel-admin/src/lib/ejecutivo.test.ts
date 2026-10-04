import { BANDAS, CONFIG_DOMINIO, type ResumenEjecutivo, ResumenEjecutivoSchema } from 'contracts';
import { describe, expect, it } from 'vitest';
import {
  barrasInundaciones,
  barrasTrabajo,
  CODIGO_OTROS,
  codigoCorto,
  conteoPestana,
  conteosPorPestana,
  distritosCapaAnterior,
  marcasEje,
  PESTANAS,
  rangoPuntajePestana,
  textoAnuncio,
  textoVerificadas,
} from './ejecutivo';
import { resumenDeEjemplo } from './ejecutivo.fixture';
import { crearFormato } from './formato';

/** Formato de la ciudad por defecto (es-BO): el de la instalación actual. */
const F = crearFormato(CONFIG_DOMINIO.CIUDAD_POR_DEFECTO);

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

describe('rango de puntaje de cada pestaña (de las bandas de contracts)', () => {
  it('cada pestaña cubre exactamente las bandas de las severidades que suma', () => {
    for (const p of PESTANAS) {
      const bandas = BANDAS.filter((b) => p.severidades.includes(b.banda));
      const r = rangoPuntajePestana(p.id);
      expect(r.min, p.id).toBe(Math.min(...bandas.map((b) => b.min)));
      expect(r.max, p.id).toBe(Math.max(...bandas.map((b) => b.max)));
      expect(
        r.bandas.map((b) => b.banda),
        p.id,
      ).toEqual(bandas.map((b) => b.banda));
    }
  });

  it('«Crítica» junta dos bandas (alta y crítica); media y baja, una cada una', () => {
    expect(rangoPuntajePestana('critica').bandas.map((b) => b.banda)).toEqual(['alta', 'critica']);
    expect(rangoPuntajePestana('media').bandas.map((b) => b.banda)).toEqual(['media']);
    expect(rangoPuntajePestana('baja').bandas.map((b) => b.banda)).toEqual(['baja']);
  });

  it('con la matriz v2 (CLAUDE.md §9.1): crítica y alta 8–13, media 5–7, baja 3–4, todas 3–13', () => {
    const de = (id: Parameters<typeof rangoPuntajePestana>[0]) => {
      const { min, max } = rangoPuntajePestana(id);
      return [min, max];
    };
    expect(de('critica')).toEqual([8, 13]);
    expect(de('media')).toEqual([5, 7]);
    expect(de('baja')).toEqual([3, 4]);
    expect(de('todas')).toEqual([3, 13]);
  });

  it('las tres pestañas de severidad no se pisan y juntas cubren los puntajes de «Todas»', () => {
    const [c, m, b] = [
      rangoPuntajePestana('critica'),
      rangoPuntajePestana('media'),
      rangoPuntajePestana('baja'),
    ];
    expect(b.max + 1).toBe(m.min);
    expect(m.max + 1).toBe(c.min);
    expect(b.min).toBe(rangoPuntajePestana('todas').min);
    expect(c.max).toBe(rangoPuntajePestana('todas').max);
  });
});

/** El resumen sin el distrito de la capa anterior, con los totales rehechos: todo cae en vigentes. */
function soloVigentes(r: ResumenEjecutivo): ResumenEjecutivo {
  const anterior = r.por_distrito.find((d) => !d.en_capa_vigente);
  if (!anterior) return r;
  const a = r.activas;
  const b = anterior.activas;
  return {
    ...r,
    por_distrito: r.por_distrito.filter((d) => d.en_capa_vigente),
    activas: {
      total: a.total - b.total,
      verificadas: a.verificadas - b.verificadas,
      en_revision: a.en_revision - b.en_revision,
      por_severidad: {
        critica: a.por_severidad.critica - b.por_severidad.critica,
        alta: a.por_severidad.alta - b.por_severidad.alta,
        media: a.por_severidad.media - b.por_severidad.media,
        baja: a.por_severidad.baja - b.por_severidad.baja,
      },
    },
  };
}

const suma = (barras: Array<{ valor: number }>) => barras.reduce((s, b) => s + b.valor, 0);

describe('«Otros» en inundaciones activas por distrito', () => {
  const r = resumenDeEjemplo();

  it('los distritos de una capa anterior no tienen barra propia: van a «Otros», al final', () => {
    const barras = barrasInundaciones(r, 'todas');
    expect(barras).toHaveLength(17);
    expect(barras.map((b) => b.codigo)).not.toContain('DM-01');
    expect(new Set(barras.map((b) => b.etiqueta)).size).toBe(17);
    expect(barras.at(-1)).toMatchObject({
      codigo: CODIGO_OTROS,
      etiqueta: 'Otros',
      valor: 40,
      otros: true,
    });
    expect(barrasInundaciones(r, 'critica').at(-1)?.valor).toBe(20);
  });

  it.each(PESTANAS.map((p) => p.id))(
    'pestaña %s: las barras más «Otros» suman las activas de la pestaña',
    (pestana) => {
      expect(suma(barrasInundaciones(r, pestana))).toBe(
        conteoPestana(r.activas.por_severidad, pestana),
      );
    },
  );

  it('con «Todas», la suma es activas.total', () => {
    expect(suma(barrasInundaciones(r, 'todas'))).toBe(r.activas.total);
  });

  it('las activas sin fila de distrito también caen en «Otros»', () => {
    // api-core las suma a los totales pero no les da fila en `por_distrito`.
    const sinFila = { ...r, por_distrito: r.por_distrito.filter((d) => d.en_capa_vigente) };
    const barras = barrasInundaciones(sinFila, 'todas');
    expect(barras.at(-1)).toMatchObject({ codigo: CODIGO_OTROS, valor: 40 });
    expect(suma(barras)).toBe(r.activas.total);
  });

  it('si todo cae en distritos vigentes no hay barra «Otros»', () => {
    const vigentes = soloVigentes(r);
    for (const { id } of PESTANAS) {
      const barras = barrasInundaciones(vigentes, id);
      expect(barras).toHaveLength(16);
      expect(barras.map((b) => b.codigo)).not.toContain(CODIGO_OTROS);
      expect(suma(barras)).toBe(conteoPestana(vigentes.activas.por_severidad, id));
    }
  });

  it('«Cómo va el trabajo» sigue con una barra por distrito vigente', () => {
    const trabajo = barrasTrabajo(r);
    expect(trabajo).toHaveLength(16);
    expect(trabajo.map((b) => b.codigo)).not.toContain('DM-01');
    expect(new Set(trabajo.map((b) => b.etiqueta)).size).toBe(16);
  });
});

describe('distritos de una capa anterior (tabla de Indicadores)', () => {
  it('van aparte con su código completo, sus activas y su trabajo', () => {
    expect(distritosCapaAnterior(resumenDeEjemplo())).toEqual([
      {
        distrito_id: 'distrito_municipal:DM-01',
        codigo: 'DM-01',
        nombre: 'Distrito 1 (capa 2024)',
        activas: 40,
        por_estado: { nuevo: 15, validado: 25, resuelto: 5 },
      },
    ]);
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
