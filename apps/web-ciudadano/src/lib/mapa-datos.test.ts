import { describe, expect, it } from 'vitest';
import type { ReporteFeature } from './api';
import {
  BANDAS_CLUSTER,
  claveDeUbicacion,
  conSeleccionado,
  esGestoDelUsuario,
  MAX_PASTILLAS,
  numeroCompacto,
  opcionesDelMarcadorDeSeleccion,
  radioCluster,
  tamanoTextoCluster,
  textoDelResumen,
  vistaTruncada,
} from './mapa-datos';

function reporte(id: string): ReporteFeature {
  return {
    type: 'Feature',
    id,
    geometry: { type: 'Point', coordinates: [-63.18, -17.78] },
    properties: { id, severidad: 'alta' },
  } as unknown as ReporteFeature;
}

/** Locale de la instalación actual; cada instalación manda el suyo en la configuración. */
const LOCALE = 'es-BO';

describe('numeroCompacto', () => {
  it('usa el separador decimal del locale de la ciudad, no uno escrito en el código', () => {
    expect(numeroCompacto(1200, 'es-BO')).toBe('1,2 mil');
    expect(numeroCompacto(1200, 'es-MX')).toBe('1.2 mil');
  });

  it('escribe la cantidad exacta por debajo de mil', () => {
    // Acá la precisión importa y el ancho no es problema: son como mucho tres cifras.
    expect(numeroCompacto(1, LOCALE)).toBe('1');
    expect(numeroCompacto(9, LOCALE)).toBe('9');
    expect(numeroCompacto(27, LOCALE)).toBe('27');
    expect(numeroCompacto(245, LOCALE)).toBe('245');
    expect(numeroCompacto(999, LOCALE)).toBe('999');
  });

  it('pasa a miles, en castellano y con coma decimal, a partir de mil', () => {
    expect(numeroCompacto(1000, LOCALE)).toBe('1,0 mil');
    expect(numeroCompacto(1200, LOCALE)).toBe('1,2 mil');
    expect(numeroCompacto(5842, LOCALE)).toBe('5,8 mil');
    expect(numeroCompacto(9999, LOCALE)).toBe('10,0 mil');
  });

  it('suelta el decimal a partir de diez mil, que ya no cabe', () => {
    expect(numeroCompacto(12_000, LOCALE)).toBe('12 mil');
    expect(numeroCompacto(123_456, LOCALE)).toBe('123 mil');
  });

  it('no rompe con entradas imposibles', () => {
    expect(numeroCompacto(0, LOCALE)).toBe('0');
    expect(numeroCompacto(-5, LOCALE)).toBe('0');
    expect(numeroCompacto(Number.NaN, LOCALE)).toBe('');
  });
});

describe('tamaño del círculo de agrupación', () => {
  it('crece con la cantidad pero con techo', () => {
    const radios = [2, 9, 10, 49, 50, 99, 100, 499, 500, 50_000].map(radioCluster);
    // Monótono: nunca encoge al haber más reportes.
    for (let i = 1; i < radios.length; i++)
      expect(radios[i] as number).toBeGreaterThanOrEqual(radios[i - 1] as number);
    // Y con tope: un círculo que crece sin límite tapa el barrio que describe.
    const maximo = Math.max(...BANDAS_CLUSTER.map((b) => b.radio));
    expect(radioCluster(50_000)).toBe(maximo);
    expect(maximo).toBeLessThanOrEqual(32);
  });

  it('respeta el objetivo táctil mínimo de WCAG 2.5.8 (24 px) ya en la banda más chica', () => {
    expect(radioCluster(2) * 2).toBeGreaterThanOrEqual(24);
  });

  it('mantiene la letra legible en todas las bandas', () => {
    for (const b of BANDAS_CLUSTER) expect(tamanoTextoCluster(b.desde)).toBeGreaterThanOrEqual(12);
  });
});

describe('conSeleccionado', () => {
  it('deja la lista igual cuando el elegido ya está', () => {
    const lista = [reporte('a'), reporte('b')];
    expect(conSeleccionado(lista, lista[0] as ReporteFeature)).toBe(lista);
  });

  it('deja la lista igual cuando no hay nada elegido', () => {
    const lista = [reporte('a')];
    expect(conSeleccionado(lista, null)).toBe(lista);
  });

  it('añade el elegido cuando la vista dejó de traerlo', () => {
    // Es el caso del alejamiento: el reporte se cae del resultado y su detalle sigue abierto.
    const lista = [reporte('a')];
    const fuera = reporte('z');
    const resultado = conSeleccionado(lista, fuera);
    expect(resultado).toHaveLength(2);
    expect(resultado.map((f) => f.properties.id)).toContain('z');
    expect(lista).toHaveLength(1);
  });
});

describe('textoDelResumen', () => {
  it('cuenta las agrupaciones y dice cómo abrirlas', () => {
    const t = textoDelResumen({ sueltos: 3, agrupaciones: 2, agrupados: 24 });
    expect(t).toContain('3 puntos sueltos');
    expect(t).toContain('24 puntos agrupados en 2 zonas');
    expect(t).toContain('acercá el mapa');
  });

  it('usa el singular donde toca', () => {
    expect(textoDelResumen({ sueltos: 1, agrupaciones: 1, agrupados: 1 })).toBe(
      '1 punto suelto. 1 punto agrupado en 1 zona; acercá el mapa para verlos uno a uno.',
    );
  });

  it('distingue vacío, cargando y fallo: los tres se ven igual en pantalla', () => {
    // Decir «ningún punto» mientras se pregunta, o cuando la consulta falló, es afirmar algo
    // que no se sabe. Sin nada dibujado, los tres casos son el mismo rectángulo gris.
    const vacio = { sueltos: 0, agrupaciones: 0, agrupados: 0 };
    expect(textoDelResumen(vacio)).toContain('Ningún');
    expect(textoDelResumen(vacio, 'cargando')).toContain('Buscando');
    expect(textoDelResumen(vacio, 'cargando')).not.toContain('Ningún');
    expect(textoDelResumen(vacio, 'fallo')).toBe('No pudimos cargar los reportes de esta vista.');
    expect(textoDelResumen(vacio, 'fallo')).not.toContain('Ningún');
  });
});

describe('vistaTruncada', () => {
  it('avisa solo cuando el total supera lo que se pudo traer', () => {
    expect(vistaTruncada(1245, 300)).toBe(true);
    expect(vistaTruncada(300, 300)).toBe(false);
    expect(vistaTruncada(12, 12)).toBe(false);
    expect(vistaTruncada(undefined, 300)).toBe(false);
  });
});

describe('tope de pastillas', () => {
  it('es un número razonable de nodos del DOM', () => {
    expect(MAX_PASTILLAS).toBeGreaterThan(10);
    expect(MAX_PASTILLAS).toBeLessThanOrEqual(120);
  });
});

describe('marcador de la ubicación elegida', () => {
  it('se mueve solo cuando cambian las coordenadas, no cuando llega otro objeto igual', () => {
    // `seleccionUbicacion={{ lat, lon }}` en línea crea un objeto nuevo en cada render.
    expect(claveDeUbicacion({ lat: -17.78, lon: -63.18 })).toBe(
      claveDeUbicacion({ lat: -17.78, lon: -63.18 }),
    );
    expect(claveDeUbicacion({ lat: -17.78, lon: -63.18 })).not.toBe(
      claveDeUbicacion({ lat: -17.78, lon: -63.19 }),
    );
    expect(claveDeUbicacion(null)).toBeNull();
    expect(claveDeUbicacion(undefined)).toBeNull();
  });

  it('en un mapa fijo (la revisión del reporte) no se puede arrastrar', () => {
    expect(opcionesDelMarcadorDeSeleccion(true).draggable).toBe(false);
    expect(opcionesDelMarcadorDeSeleccion(false).draggable).toBe(true);
  });
});

describe('esGestoDelUsuario', () => {
  it('solo un gesto de la persona cuenta; los movimientos del propio código no', () => {
    // `flyTo` del GPS, `jumpTo` de las coordenadas y el `load` del mapa no traen `originalEvent`.
    expect(esGestoDelUsuario(undefined)).toBe(false);
    expect(esGestoDelUsuario({})).toBe(false);
    expect(esGestoDelUsuario({ originalEvent: undefined })).toBe(false);
    expect(esGestoDelUsuario({ originalEvent: { type: 'mouseup' } })).toBe(true);
  });
});
