import { describe, expect, it } from 'vitest';
import {
  CONFIG_DOMINIO,
  calcularSeveridadBache,
  crearRegistroCategorias,
  DEFINICION_AREA_VERDE,
  DEFINICION_BACHE,
  DEFINICION_BASURA,
  DEFINICION_INUNDACION,
  type DetalleBache,
  DetalleBacheSchema,
  GRAVEDADES_BACHE,
  REGISTRO_CATEGORIAS,
  SEVERIDAD_BACHE_VERSION,
  SUBTIPOS_BACHE,
  SubtipoBacheSchema,
  TAMANOS_BACHE,
} from '../src/index.js';

// Expectativas de ADR 0024 explícitas, independientes de la fórmula de implementación.
const BANDAS = [
  ['baja', 'baja', 'media', 'alta'],
  ['media', 'media', 'alta', 'alta'],
  ['alta', 'alta', 'alta', 'critica'],
  ['critica', 'critica', 'critica', 'critica'],
] as const;
const PUNTAJES = [
  [2, 3, 4, 5],
  [3, 4, 5, 6],
  [4, 5, 6, 7],
  [5, 6, 7, 8],
];
const ORDEN = ['baja', 'media', 'alta', 'critica'];
const CASOS = GRAVEDADES_BACHE.flatMap((gravedad_declarada, g) =>
  TAMANOS_BACHE.map((tamano, t) => ({
    gravedad_declarada,
    tamano,
    banda: BANDAS[g]![t],
    puntaje: PUNTAJES[g]![t],
  })),
);

describe('Baches v1: matriz aprobada, índice auxiliar y piso', () => {
  it.each(CASOS)('$gravedad_declarada / $tamano → $banda, índice $puntaje', (caso) => {
    const detalle = { gravedad_declarada: caso.gravedad_declarada, tamano: caso.tamano };
    expect(calcularSeveridadBache(detalle)).toEqual({
      banda: caso.banda,
      puntaje: caso.puntaje,
      version: 1,
    });
    expect(DEFINICION_BACHE.severidad.calcular(detalle)).toMatchObject({
      banda: caso.banda,
      puntaje: caso.puntaje,
    });
  });

  it('no desciende al aumentar gravedad o tamaño y nunca baja del piso declarado', () => {
    for (let g = 0; g < GRAVEDADES_BACHE.length; g++) {
      for (let t = 0; t < TAMANOS_BACHE.length; t++) {
        const resultado = calcularSeveridadBache({
          gravedad_declarada: GRAVEDADES_BACHE[g]!,
          tamano: TAMANOS_BACHE[t]!,
        });
        expect(ORDEN.indexOf(resultado.banda)).toBeGreaterThanOrEqual(g);
        for (const [anteriorG, anteriorT] of [
          [g - 1, t],
          [g, t - 1],
        ]) {
          if (anteriorG! < 0 || anteriorT! < 0) continue;
          const anterior = calcularSeveridadBache({
            gravedad_declarada: GRAVEDADES_BACHE[anteriorG!]!,
            tamano: TAMANOS_BACHE[anteriorT!]!,
          });
          expect(ORDEN.indexOf(resultado.banda)).toBeGreaterThanOrEqual(
            ORDEN.indexOf(anterior.banda),
          );
        }
      }
    }
  });

  it('un mismo índice no determina la banda: conserva el piso de gravedad', () => {
    expect(
      calcularSeveridadBache({ gravedad_declarada: 'se_puede_pasar', tamano: 'rueda' }),
    ).toMatchObject({ puntaje: 3, banda: 'baja' });
    expect(
      calcularSeveridadBache({ gravedad_declarada: 'hay_que_esquivar', tamano: 'plato' }),
    ).toMatchObject({ puntaje: 3, banda: 'media' });
    expect(SEVERIDAD_BACHE_VERSION).toBe(1);
  });
});

describe('Baches reales: detalle estricto, subtipos e invariantes de definición', () => {
  const valido = { gravedad_declarada: 'peligroso', tamano: 'rueda' } as const;
  it.each([
    {},
    { gravedad_declarada: 'peligroso' },
    { tamano: 'rueda' },
    { ...valido, gravedad_declarada: 'inventada' },
    { ...valido, tamano: 'enorme' },
    { ...valido, gravedad_declarada: null },
    { ...valido, tamano: 1 },
    { ...valido, subtipo: 'bache' },
    { ...valido, profundidad_estimada: 'rodilla' },
    { ...valido, extra: true },
    { profundidad_estimada: 'rodilla', frecuencia: 'ocasional' },
  ])('rechaza detalle inválido sin defaults: %j', (entrada) => {
    expect(DetalleBacheSchema.safeParse(entrada).success).toBe(false);
    expect(() => calcularSeveridadBache(entrada as DetalleBache)).toThrow();
  });

  it('expone exactamente cinco subtipos y dos preguntas que coinciden con los enums', () => {
    expect(GRAVEDADES_BACHE).toEqual([
      'se_puede_pasar',
      'hay_que_esquivar',
      'peligroso',
      'causo_accidente',
    ]);
    expect(TAMANOS_BACHE).toEqual(['plato', 'rueda', 'medio_carril', 'todo_el_carril']);
    expect(SUBTIPOS_BACHE).toEqual([
      'bache',
      'hundimiento_calzada',
      'tapa_alcantarilla_faltante',
      'asfalto_levantado',
      'calle_tierra_intransitable',
    ]);
    expect(DEFINICION_BACHE.subtipos?.map((o) => o.valor)).toEqual([...SUBTIPOS_BACHE]);
    for (const valor of SUBTIPOS_BACHE) expect(SubtipoBacheSchema.parse(valor)).toBe(valor);
    for (const valor of [undefined, null, '', 'otro', 'Bache'])
      expect(SubtipoBacheSchema.safeParse(valor).success).toBe(false);
    expect(Object.keys(DetalleBacheSchema.shape)).toEqual(['gravedad_declarada', 'tamano']);
    expect(DEFINICION_BACHE.preguntas.map((p) => p.id)).toEqual(['gravedad_declarada', 'tamano']);
    expect(
      DEFINICION_BACHE.preguntas.every((p) => p.obligatoria && p.tipo === 'opcion_unica'),
    ).toBe(true);
    expect(DEFINICION_BACHE.preguntas[0]!.opciones!.map((o) => o.valor)).toEqual([
      ...GRAVEDADES_BACHE,
    ]);
    expect(DEFINICION_BACHE.preguntas[1]!.opciones!.map((o) => o.valor)).toEqual([
      ...TAMANOS_BACHE,
    ]);
    expect(DEFINICION_BACHE.preguntas[1]!.opciones!.map((o) => o.etiqueta)).toEqual([
      'Como un plato',
      'Como una rueda',
      'Medio carril',
      'Todo el carril',
    ]);
    expect(DEFINICION_BACHE.preguntas[1]!.opciones!.every((o) => o.ayuda === undefined)).toBe(true);
  });

  it('el registro real conserva fábrica y encuentra las cuatro definiciones iniciales', () => {
    expect(REGISTRO_CATEGORIAS.slugs).toEqual(['inundacion', 'bache', 'area_verde', 'basura']);
    expect(REGISTRO_CATEGORIAS.obtener('bache')).toBe(DEFINICION_BACHE);
    expect(REGISTRO_CATEGORIAS.obtener('basura')).toBe(DEFINICION_BASURA);
    expect(REGISTRO_CATEGORIAS.obtener('area_verde')).toBe(DEFINICION_AREA_VERDE);
    const soloInundacion = crearRegistroCategorias([DEFINICION_INUNDACION]);
    expect(soloInundacion.tiene('bache')).toBe(false);
    expect(DEFINICION_INUNDACION.recurrenciaRadioM).toBe(25);
    expect(DEFINICION_INUNDACION.severidad.version).toBe(2);
    expect(DEFINICION_BACHE).toMatchObject({
      slug: 'bache',
      nombre: 'Baches',
      nombreCorto: 'Bache',
      icono: 'TrafficCone',
      verbo: 'Reportar un bache',
      preguntaUbicacion: '¿Dónde está el bache?',
      colores: { c1: '#F6EDE3', c5: '#9C6A35', c7: '#7A4E1E' },
      detalleVersion: 1,
      severidad: { version: 1 },
      recurrenciaRadioM: 10,
      ubicacionTipoPorDefecto: 'via_publica',
      geometria: 'punto',
      cupo: {
        ambito: 'cuenta+categoria',
        ventana: 'dia_local',
        limite: CONFIG_DOMINIO.REPORTES_POR_DIA_POR_CUENTA,
      },
    });
    expect(DEFINICION_BACHE.camposPublicos).toEqual(['gravedad_declarada', 'tamano']);
    expect(DEFINICION_BACHE.camposExportacion.map((c) => c.clave)).toEqual([
      'gravedad_declarada',
      'tamano',
    ]);
    expect(DEFINICION_BACHE.componenteEspecialPaso2).toBeUndefined();
    expect(DEFINICION_BACHE.derivaA).toBeUndefined();
    expect(DEFINICION_BACHE.avisoEmergencia).toBeUndefined();
    expect(DEFINICION_BACHE.notaMetodologica).toContain('percepción');
    expect(DEFINICION_BACHE.notaMetodologica).toContain('no una comprobación de accidente');
    expect(DEFINICION_BACHE.notaMetodologica).toContain('estudio técnico formal');
    expect(DEFINICION_BACHE.notaMetodologica).not.toMatch(/[\r\n]/);
  });
});
