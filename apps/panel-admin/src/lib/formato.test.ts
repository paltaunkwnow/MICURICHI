import { CONFIG_DOMINIO, UBICACION_METODOS } from 'contracts';
import { describe, expect, it } from 'vitest';
import {
  aclaracionMetodo,
  avisosResolucion,
  coordenadas,
  crearFormato,
  distanciaDispositivo,
  etiquetaCapa,
  etiquetaDistrito,
  etiquetaEstado,
  etiquetaMetodo,
  etiquetaProfundidad,
  etiquetaSeveridad,
  etiquetaSiNo,
  etiquetaUnidadVecinal,
  idCorto,
  porcentaje,
  precisionGps,
} from './formato';

describe('etiquetas del dominio', () => {
  it('traduce severidad y estado con los textos de contracts', () => {
    expect(etiquetaSeveridad('critica')).toBe('Crítica');
    expect(etiquetaEstado('validado')).toBe('Validado');
    expect(etiquetaEstado('nuevo')).toBe('Nuevo');
  });

  it('compone la profundidad con referencia corporal y rango', () => {
    expect(etiquetaProfundidad('rodilla')).toBe('A la rodilla · 10–40 cm');
    expect(etiquetaProfundidad('mas_70')).toContain('>70 cm');
  });

  it('describe el método de ubicación respecto del teléfono, sin repetir la distancia', () => {
    // «gps» es un punto dentro del margen de error del teléfono: max(2 m, precisión) de su
    // posición al enviar. Puede estar a 25 m si el teléfono declaró ± 30 m.
    expect(etiquetaMetodo('gps', 1)).toBe(
      'En la posición del teléfono (dentro de su margen de error)',
    );
    expect(etiquetaMetodo('gps', 25)).toBe(
      'En la posición del teléfono (dentro de su margen de error)',
    );
    // «manual»: la persona lo movió más allá de ese margen. Cuánto lo dice la fila «Distancia al
    // dispositivo», justo debajo: repetirlo acá era leer lo mismo dos veces.
    expect(etiquetaMetodo('manual', 12)).toBe('Movido a mano por la persona');
    expect(etiquetaMetodo('manual', 60)).toBe('Movido a mano por la persona');
    for (const d of [1, 12, 60]) {
      expect(etiquetaMetodo('manual', d)).not.toMatch(/[0-9]/);
      expect(etiquetaMetodo('gps', d)).not.toMatch(/[0-9]/);
    }
  });

  it('no promete el radio de 60 m en los reportes anteriores a la ubicación obligatoria', () => {
    // Sin distancia guardada (reportes anteriores a contracts 0.9.0, o un api-core anterior que
    // todavía no manda el campo), «manual» era un clic en cualquier parte del mapa.
    expect(etiquetaMetodo('manual', null)).toBe(
      'Selección manual en el mapa, sin control de distancia al teléfono',
    );
    expect(etiquetaMetodo('manual', undefined)).toBe(
      'Selección manual en el mapa, sin control de distancia al teléfono',
    );
    // Antes de 0.9.0, «gps» era el botón del GPS del formulario, sin margen comprobado.
    expect(etiquetaMetodo('gps', null)).toBe('En la posición del teléfono');
    expect(etiquetaMetodo('gps', undefined)).toBe('En la posición del teléfono');
  });

  it('muestra la distancia al dispositivo en metros enteros', () => {
    expect(distanciaDispositivo(12)).toBe('a 12 m del teléfono');
    expect(distanciaDispositivo(0)).toBe('a 0 m del teléfono');
    expect(distanciaDispositivo(null)).toBe(
      'Sin dato: el reporte es anterior a la ubicación obligatoria',
    );
    expect(distanciaDispositivo(undefined)).toBe(
      'Sin dato: el reporte es anterior a la ubicación obligatoria',
    );
  });

  it('describe los booleanos nulos', () => {
    expect(etiquetaSiNo(null)).toBe('Sin dato');
    expect(etiquetaSiNo(true)).toBe('Sí');
  });

  it('con «gps» o «manual», la distancia al dispositivo se dice como siempre', () => {
    // El método es un segundo dato opcional: sin él, o con uno de estos dos, nada cambia.
    expect(distanciaDispositivo(12, 'manual')).toBe('a 12 m del teléfono');
    expect(distanciaDispositivo(0, 'gps')).toBe('a 0 m del teléfono');
    expect(distanciaDispositivo(null, 'gps')).toBe(
      'Sin dato: el reporte es anterior a la ubicación obligatoria',
    );
    expect(distanciaDispositivo(undefined, 'manual')).toBe(
      'Sin dato: el reporte es anterior a la ubicación obligatoria',
    );
  });

  it('nombra las capas conocidas y deja pasar las desconocidas', () => {
    expect(etiquetaCapa('unidad_vecinal')).toBe('Unidad vecinal');
    expect(etiquetaCapa('otra_capa')).toBe('otra_capa');
  });
});

/**
 * Ubicación aproximada (contracts 0.18.0, ADR 0007): el reporte entró desde un dispositivo sin GPS
 * preciso, con el punto puesto a mano, `precision_gps_m` de más de 50 y la distancia en `null`.
 * Mostrarlo con el texto de «manual» diría que el punto se ajustó cerca del teléfono, y no es cierto.
 */
describe('ubicación aproximada (ADR 0007)', () => {
  const ETIQUETA = 'Ubicación aproximada — sin comprobar con el dispositivo';
  const ACLARACION = 'El punto lo puso la persona a mano; su dispositivo no tenía GPS preciso.';
  const NO_APLICA = 'No aplica: el punto no se comprobó contra el dispositivo';

  it('«aproximada» dice que el punto no se comprobó con el dispositivo', () => {
    expect(etiquetaMetodo('aproximada', null)).toBe(ETIQUETA);
  });

  it('no depende de la distancia: ni la promete, ni cae en el texto de «manual»', () => {
    // api-core la guarda en null, pero si llegara un número (o un 0) la etiqueta no lo repite.
    for (const d of [null, undefined, 0, 12, 60, 950]) {
      const texto = etiquetaMetodo('aproximada', d);
      expect(texto, `distancia ${String(d)}`).toBe(ETIQUETA);
      expect(texto).not.toMatch(/[0-9]/);
      expect(texto).not.toBe(etiquetaMetodo('manual', d));
      expect(texto).not.toMatch(/movido a mano|selección manual|posición del teléfono/i);
    }
  });

  it('cada método de contracts tiene su propia etiqueta, y ninguna es la de respaldo', () => {
    // Un método nuevo en contracts rompe el typecheck de `etiquetaMetodo` (switch exhaustivo); esto
    // además asegura que ninguno de los de hoy cae en otro texto ni en el de respaldo.
    for (const d of [null, 12]) {
      const etiquetas = UBICACION_METODOS.map((m) => etiquetaMetodo(m, d));
      expect(new Set(etiquetas).size, `distancia ${String(d)}`).toBe(UBICACION_METODOS.length);
      for (const e of etiquetas) expect(e).not.toMatch(/sin descripci[óo]n/i);
    }
  });

  it('«gps» y «manual» no llevan aclaración; «aproximada» dice por qué no se comprobó', () => {
    expect(aclaracionMetodo('aproximada')).toBe(ACLARACION);
    expect(aclaracionMetodo('gps')).toBeNull();
    expect(aclaracionMetodo('manual')).toBeNull();
    // Todos los métodos de contracts tienen respuesta (una cadena o null, nunca undefined).
    for (const m of UBICACION_METODOS) expect(aclaracionMetodo(m)).not.toBeUndefined();
  });

  it('la distancia al dispositivo no aplica: ni «a 0 m del teléfono» ni «anterior a la ubicación obligatoria»', () => {
    for (const d of [null, undefined, 0, 7]) {
      expect(distanciaDispositivo(d, 'aproximada'), `distancia ${String(d)}`).toBe(NO_APLICA);
    }
    expect(NO_APLICA).not.toMatch(/anterior a la ubicación obligatoria|del teléfono/);
  });
});

describe('fechas y números', () => {
  const { fechaCorta, fechaHora } = crearFormato(CONFIG_DOMINIO.CIUDAD_POR_DEFECTO);

  it('formatea fechas en la zona horaria de la ciudad por defecto (Santa Cruz)', () => {
    // 03:30 UTC del 2 de marzo es 23:30 del 1 de marzo en America/La_Paz (UTC-4).
    expect(fechaCorta('2026-03-02T03:30:00Z')).toMatch(/01 mar\.? 2026/);
    expect(fechaHora('2026-03-02T03:30:00Z')).toMatch(/23:30/);
    expect(fechaCorta(null)).toBe('—');
    expect(fechaHora(undefined)).toBe('—');
  });

  it('calcula porcentajes enteros y evita dividir por cero', () => {
    expect(porcentaje(1, 3)).toBe(33);
    expect(porcentaje(2, 3)).toBe(67);
    expect(porcentaje(5, 0)).toBe(0);
  });

  it('muestra coordenadas como lat, lon con 6 decimales', () => {
    expect(coordenadas(-63.18, -17.78)).toBe('-17.780000, -63.180000');
  });

  it('redondea la precisión GPS y acorta identificadores', () => {
    expect(precisionGps(12.6)).toBe('± 13 m');
    expect(precisionGps(null)).toBe('Sin dato');
    expect(idCorto('0a1b2c3d-4e5f-6789-abcd-ef0123456789')).toBe('0a1b2c3d');
  });
});

describe('avisosResolucion', () => {
  it('no avisa nada cuando la resolución fue normal', () => {
    expect(avisosResolucion({})).toEqual([]);
    expect(avisosResolucion(null)).toEqual([]);
    expect(
      avisosResolucion({
        en_limite: false,
        asignado_por_proximidad: false,
        distancia_m: null,
        distrito_discrepante: false,
      }),
    ).toEqual([]);
  });

  it('traduce cada bandera a un aviso en español', () => {
    expect(
      avisosResolucion({
        en_limite: true,
        asignado_por_proximidad: true,
        distancia_m: 12.4,
        distrito_discrepante: true,
      }),
    ).toEqual([
      'Punto en el borde de dos UV',
      'Asignado por proximidad (12 m)',
      'Distrito discrepante',
    ]);
  });

  it('omite la distancia si no viene como número', () => {
    expect(avisosResolucion({ asignado_por_proximidad: true })).toEqual([
      'Asignado por proximidad',
    ]);
  });
});

describe('etiquetas de unidad administrativa', () => {
  it('no repite el prefijo cuando el código ya lo trae', () => {
    // Los códigos que entrega el municipio pueden venir con prefijo o sin él: con la capa
    // sintética son «UV-106» y con otra podrían ser «106».
    expect(etiquetaUnidadVecinal('UV-106')).toBe('UV-106');
    expect(etiquetaUnidadVecinal('106')).toBe('UV 106');
    expect(etiquetaUnidadVecinal(null)).toBe('—');
  });

  it('normaliza el código de distrito', () => {
    expect(etiquetaDistrito('D02')).toBe('Distrito 02');
    expect(etiquetaDistrito('DM-11')).toBe('Distrito 11');
    expect(etiquetaDistrito('7')).toBe('Distrito 7');
    expect(etiquetaDistrito(undefined)).toBe('—');
  });
});
