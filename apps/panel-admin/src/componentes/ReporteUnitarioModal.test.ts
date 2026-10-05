import {
  type Ciudad,
  CONFIG_DOMINIO,
  NOTA_METODOLOGICA,
  type ReporteTecnico,
  type ReporteTecnicoFeature,
} from 'contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProveedorCiudad } from '@/lib/ciudad-contexto';
import { PUNTAJE_MAXIMO, textoPuntaje } from '@/lib/severidad';
import {
  generarJsonReporteUnitario,
  generarTextoReporteUnitario,
  ReporteUnitarioModal,
} from './ReporteUnitarioModal';

function reportePrueba(extra: Partial<ReporteTecnico> = {}): ReporteTecnicoFeature {
  return {
    type: 'Feature',
    id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    geometry: {
      type: 'Point',
      coordinates: [-63.181234, -17.785678],
    },
    properties: {
      id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      creado_en: '2026-09-27T14:30:00.000Z',
      evento_en: '2026-09-27T12:00:00.000Z',
      distrito: { id: 'distrito_municipal:07', codigo: '07', nombre: 'Distrito 7' },
      unidad_vecinal: { id: 'unidad_vecinal:123', codigo: '123', nombre: 'Los Lotes' },
      descripcion: 'Agua acumulada frente al colegio tras la lluvia torrencial.',
      fotos: ['https://ejemplo.com/foto1.webp'],
      profundidad_estimada: 'rodilla',
      frecuencia: 'agua_estancada',
      causa_presunta: 'sumidero_tapado',
      severidad: 'media',
      severidad_calculada: 'media',
      severidad_puntaje: 6,
      severidad_manual: null,
      severidad_motivo: null,
      estado: 'resuelto',
      estado_motivo: 'Cuadrilla municipal desobstruyó el colector principal.',
      verificado: true,
      punto_critico_id: 'c1d2e3f4-a5b6-7c8d-9e0f-1a2b3c4d5e6f',
      n_reportes_punto: 3,
      precision_degradada: false,
      ubicacion_metodo: 'gps',
      precision_gps_m: 6.5,
      distancia_dispositivo_m: 2,
      ubicacion_tipo: 'via_publica',
      sumidero_cercano: 'si',
      sumidero_estado: 'tapado',
      agua_brota_sumidero: true,
      fusionado_en_id: null,
      validado_por: 'tecnico@curichi.local',
      validado_en: '2026-09-27T15:00:00.000Z',
      actualizado_en: '2026-09-27T16:00:00.000Z',
      version_capa: '2026_09',
      resolucion_flags: {},
      autor_id: 'usr-ciudadano-99',
      ...extra,
    },
  };
}

const CIUDAD = CONFIG_DOMINIO.CIUDAD_POR_DEFECTO;
const OTRA_CIUDAD: Ciudad = { ...CIUDAD, nombre: 'Cochabamba' };

/** Lo que dijo la ficha en su versión de antes: nada de esto puede volver (CLAUDE.md regla 6). */
const INSTITUCIONAL_INVENTADO = [
  'GOBIERNO AUTÓNOMO MUNICIPAL',
  'Gobierno Autónomo Municipal',
  'Dirección de Drenaje y Mantenimiento',
  'FIRMA SUPERVISOR DE DRENAJE',
  'SUPERVISIÓN Y CONTROL',
  'FIRMA TÉCNICO EVALUADOR',
  'Inspección Operativa en Terreno',
  'Código Oficial',
  'EVALUACIÓN HIDROLÓGICA',
  'Evaluación Hidráulica',
  'Evaluación Hidrológica',
  'Usuario verificado',
  'Dictamen',
];

/** El texto que ve la persona: sin etiquetas, sin los `<!-- -->` de React y con las entidades vueltas a su signo. */
function textoVisible(html: string): string {
  return html
    .replace(/<!--.*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Los saltos de línea del .txt no cuentan: una oración partida a 80 columnas sigue siendo la misma. */
function sinSaltos(texto: string): string {
  return texto.replace(/\s+/g, ' ');
}

function renderizarFicha(f: ReporteTecnicoFeature = reportePrueba(), ciudad: Ciudad = CIUDAD) {
  return renderToStaticMarkup(
    createElement(
      ProveedorCiudad,
      { ciudad },
      createElement(ReporteUnitarioModal, { reporte: f, onCerrar: () => {} }),
    ),
  );
}

describe('ReporteUnitarioModal: generación de ficha técnica unitaria', () => {
  const formatoPrueba = {
    fechaHora: (f: string | null | undefined) => (f ? `FMT(${f})` : '—'),
    numero: (n: number) => String(n),
  };

  it('genera el texto estructurado del reporte unitario con todas sus secciones', () => {
    const f = reportePrueba();
    const texto = generarTextoReporteUnitario(f, formatoPrueba, CIUDAD);

    // Encabezado: el sistema y la ciudad de la instalación, sin organismos inventados
    expect(texto).toContain('Mi Curichi · Santa Cruz de la Sierra');
    expect(texto).not.toContain('GOBIERNO AUTÓNOMO MUNICIPAL');
    expect(texto).toContain('FICHA TÉCNICA - REPORTE UNITARIO DE INUNDACIÓN');

    // Identificación
    expect(texto).toContain('ID Reporte (UUID):  a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');
    expect(texto).toContain('Código de Rastreo:  a1b2c3d4');
    expect(texto).toContain('Estado Actual:      RESUELTO');
    expect(texto).toContain('Condición:          TÉCNICAMENTE VERIFICADO');

    // Localización
    expect(texto).toContain('Distrito 7');
    expect(texto).toContain('Los Lotes');
    expect(texto).toContain('Latitud: -17.785678, Longitud: -63.181234');
    expect(texto).toContain('Vía pública');

    // Datos del reporte y severidad
    expect(texto).toContain('A la rodilla');
    expect(texto).toContain('Agua estancada');
    expect(texto).toContain('Sumidero tapado');
    expect(texto).toContain('Puntaje de Severidad: 6 de 13 puntos');
    expect(texto).toContain('Severidad Efectiva:   MEDIA');

    // Descripción del ciudadano
    expect(texto).toContain('Agua acumulada frente al colegio tras la lluvia torrencial.');

    // Moderación y cierre técnico
    expect(texto).toContain('Validado Por:       tecnico@curichi.local');
    expect(texto).toContain('Cuadrilla municipal desobstruyó el colector principal.');

    // Firmas: dos líneas neutras, sin cargos ni oficinas
    expect(texto).toContain('Firma y aclaración');
    expect(texto).not.toContain('FIRMA SUPERVISOR DE DRENAJE');
    expect(texto).not.toContain('FIRMA TÉCNICO EVALUADOR');
  });

  it('maneja reportes sin fotos, sin evento_en y sin validación previa', () => {
    const f = reportePrueba({
      fotos: [],
      evento_en: null,
      validado_por: null,
      validado_en: null,
      estado_motivo: null,
      estado: 'nuevo',
      verificado: false,
    });
    const texto = generarTextoReporteUnitario(f, formatoPrueba, CIUDAD);

    expect(texto).toContain('Sin fotografías adjuntas.');
    expect(texto).toContain('NO SE HA VERIFICADO');
    expect(texto).toContain('Pendiente de asignación');
  });

  // M-5.1: el puntaje máximo sale de contracts y es el mismo en el .txt y en la vista imprimible.
  it('el puntaje máximo es el de contracts, el mismo en el .txt y en la vista imprimible', () => {
    const texto = generarTextoReporteUnitario(reportePrueba(), formatoPrueba, CIUDAD);
    const vista = textoVisible(renderizarFicha());
    expect(textoPuntaje(6)).toBe(`6 de ${PUNTAJE_MAXIMO} puntos`);
    expect(texto).toContain(`Puntaje de Severidad: ${textoPuntaje(6)}`);
    expect(vista).toContain(`Puntaje Severidad: ${textoPuntaje(6)}`);
    // Lo que decía la vista imprimible antes: otra cifra para el mismo puntaje.
    expect(vista).not.toContain('/ 12 puntos');
    expect(vista).not.toMatch(/\d+ \/ \d+ puntos/);
  });

  // M-5.2: la nota metodológica (§9.4) viaja en el .txt, en la vista imprimible y en el JSON.
  it('el .txt lleva la sección LIMITACIONES con la nota metodológica, antes de las firmas', () => {
    const texto = generarTextoReporteUnitario(reportePrueba(), formatoPrueba, CIUDAD);
    const seccion = texto.indexOf('LIMITACIONES');
    expect(seccion).toBeGreaterThan(-1);
    expect(sinSaltos(texto)).toContain(NOTA_METODOLOGICA);
    expect(texto.indexOf('Firma y aclaración')).toBeGreaterThan(seccion);
    // La nota va después del registro fotográfico, como última sección numerada.
    expect(seccion).toBeGreaterThan(texto.indexOf('REGISTRO FOTOGRÁFICO'));
    // Una sola vez: no se repite en cada sección.
    expect(sinSaltos(texto).split(NOTA_METODOLOGICA)).toHaveLength(2);
  });

  it('la nota del .txt se parte en líneas de hasta 80 columnas, como el resto de la ficha', () => {
    const texto = generarTextoReporteUnitario(reportePrueba(), formatoPrueba, CIUDAD);
    const desde = texto.indexOf('LIMITACIONES');
    const hasta = texto.indexOf('\n\n', desde);
    const lineas = texto.slice(desde, hasta).split('\n');
    expect(lineas.length).toBeGreaterThan(3);
    for (const l of lineas) expect(l.length, l).toBeLessThanOrEqual(80);
  });

  it('la vista imprimible lleva la nota metodológica en una sección propia, antes de las firmas', () => {
    const html = renderizarFicha();
    const vista = textoVisible(html);
    expect(vista).toContain(NOTA_METODOLOGICA);
    expect(vista).toContain('Limitaciones');
    expect(vista.indexOf(NOTA_METODOLOGICA)).toBeLessThan(vista.indexOf('Firma y aclaración'));
    expect(vista.split(NOTA_METODOLOGICA)).toHaveLength(2);
  });

  it('el JSON descargado es el mismo Feature con la nota metodológica como miembro propio', () => {
    const f = reportePrueba();
    const json = JSON.parse(generarJsonReporteUnitario(f)) as Record<string, unknown>;
    expect(json.type).toBe('Feature');
    expect(json.nota_metodologica).toBe(NOTA_METODOLOGICA);
    const { nota_metodologica: _nota, ...resto } = json;
    expect(resto).toEqual(f);
    // Legible a mano, como antes.
    expect(generarJsonReporteUnitario(f)).toContain('\n  "nota_metodologica"');
  });

  // M-5.3: nada de contenido institucional inventado.
  it('el .txt no menciona organismos, cargos ni estudios que el sistema no tiene', () => {
    const texto = generarTextoReporteUnitario(reportePrueba(), formatoPrueba, CIUDAD);
    for (const inventado of INSTITUCIONAL_INVENTADO) {
      expect(texto, inventado).not.toContain(inventado);
    }
    expect(texto).not.toMatch(/hidrol[óo]gic/i);
    expect(texto).toContain('3. DATOS DEL REPORTE Y SEVERIDAD');
    expect(texto).toContain('Cuenta registrada (usr-ciudadano-99)');
    // El anónimo sigue diciéndose anónimo.
    expect(
      generarTextoReporteUnitario(reportePrueba({ autor_id: null }), formatoPrueba, CIUDAD),
    ).toContain('Autor Registrado:   Anónimo');
  });

  it('el encabezado del .txt usa la ciudad que recibe, no una escrita en el código', () => {
    const texto = generarTextoReporteUnitario(reportePrueba(), formatoPrueba, OTRA_CIUDAD);
    expect(texto).toContain('Mi Curichi · Cochabamba');
    expect(texto).not.toContain('Santa Cruz');
  });
});

describe('ReporteUnitarioModal: vista imprimible', () => {
  const html = renderizarFicha();
  const vista = textoVisible(html);

  it('no menciona organismos, cargos ni estudios que el sistema no tiene', () => {
    for (const inventado of INSTITUCIONAL_INVENTADO) {
      expect(vista, inventado).not.toContain(inventado);
    }
    // «Modelo hidráulico» sí aparece, pero solo para decir lo que el sistema NO es (la nota).
    expect(vista).not.toMatch(/hidrol[óo]gic|evaluaci[óo]n hidr[áa]ulic/i);
  });

  it('el encabezado es «Mi Curichi · <ciudad>», con la ciudad de la configuración', () => {
    expect(vista).toContain('Mi Curichi · Santa Cruz de la Sierra');
    const otra = textoVisible(renderizarFicha(reportePrueba(), OTRA_CIUDAD));
    expect(otra).toContain('Mi Curichi · Cochabamba');
    expect(otra).not.toContain('Santa Cruz');
  });

  it('dice «Código», no «Código Oficial», y nombra la sección «Datos del reporte y severidad»', () => {
    expect(vista).toContain('Código: a1b2c3d4');
    expect(vista).toContain('3. Datos del reporte y severidad');
  });

  it('las firmas son dos líneas neutras: «Firma y aclaración», sin cargos ni oficinas', () => {
    expect(vista.match(/Firma y aclaración/g)).toHaveLength(2);
  });

  // M-5.4: el diálogo se puede enfocar por código (es donde cae el foco al abrir) y se nombra solo.
  it('es un diálogo modal con nombre, que puede recibir el foco al abrirse', () => {
    const apertura = html.match(/<div[^>]*role="dialog"[^>]*>/)?.[0] ?? '';
    expect(apertura).toContain('aria-modal="true"');
    expect(apertura).toContain('aria-labelledby="titulo-reporte-unitario"');
    // tabindex -1: enfocable con .focus(), pero fuera del orden de Tab.
    expect(apertura).toContain('tabindex="-1"');
    expect(html).toMatch(/<h2[^>]*id="titulo-reporte-unitario"/);
  });

  it('tiene un botón para cerrar con nombre accesible', () => {
    expect(html).toMatch(/<button[^>]*aria-label="Cerrar ventana"/);
  });

  it('conserva el título y los botones de siempre (los data-testid no cambian)', () => {
    expect(vista).toContain('FICHA TÉCNICA - REPORTE UNITARIO DE INUNDACIÓN');
    for (const id of ['btn-imprimir-reporte-unitario', 'btn-descargar-txt', 'btn-descargar-json']) {
      expect(html, id).toContain(`data-testid="${id}"`);
    }
  });
});

/**
 * Ubicación aproximada (contracts 0.18.0, ADR 0007): la ficha, que es lo que el técnico imprime o
 * adjunta, tiene que decir que el punto no se comprobó con el dispositivo. La nota metodológica
 * (sección «Limitaciones») nombra el caso para todos los reportes, así que acá se mira el renglón
 * del método, no la ficha entera.
 */
describe('ReporteUnitarioModal: ubicación aproximada (ADR 0007)', () => {
  const formatoPrueba = {
    fechaHora: (f: string | null | undefined) => (f ? `FMT(${f})` : '—'),
    numero: (n: number) => String(n),
  };
  const ETIQUETA = 'Ubicación aproximada — sin comprobar con el dispositivo';
  const ACLARACION = 'El punto lo puso la persona a mano; su dispositivo no tenía GPS preciso.';

  const aproximada = () =>
    reportePrueba({
      ubicacion_metodo: 'aproximada',
      precision_gps_m: 178,
      distancia_dispositivo_m: null,
    });

  /** Los renglones del bloque «Método de Captura» del .txt, hasta «Precisión GPS». */
  function bloqueMetodo(texto: string): string[] {
    const desde = texto.indexOf('Método de Captura:');
    const hasta = texto.indexOf('Precisión GPS:');
    expect(desde).toBeGreaterThan(-1);
    expect(hasta).toBeGreaterThan(desde);
    return texto.slice(desde, hasta).trimEnd().split('\n');
  }

  it('el .txt marca el método como aproximado, en el mismo renglón de siempre', () => {
    const texto = generarTextoReporteUnitario(aproximada(), formatoPrueba, CIUDAD);
    expect(texto).toContain(`Método de Captura:  ${ETIQUETA}`);
    expect(texto).toContain('Precisión GPS:      ± 178 m');
    // El texto de «manual» sería falso: el punto no se ajustó cerca del teléfono.
    expect(texto).not.toMatch(/Movido a mano|Selección manual/);
  });

  it('el .txt explica por qué no se comprobó, sangrado bajo el método y en 80 columnas', () => {
    const texto = generarTextoReporteUnitario(aproximada(), formatoPrueba, CIUDAD);
    const renglones = bloqueMetodo(texto);
    expect(renglones.length).toBeGreaterThan(1);
    expect(sinSaltos(renglones.join(' '))).toContain(ACLARACION);
    for (const r of renglones) expect(r.length, r).toBeLessThanOrEqual(80);
    // Los renglones de continuación empiezan bajo el valor, no bajo la etiqueta.
    for (const r of renglones.slice(1)) expect(r.startsWith(' '.repeat(20)), r).toBe(true);
  });

  it('la vista imprimible marca el método y lo explica', () => {
    const vista = textoVisible(renderizarFicha(aproximada()));
    expect(vista).toContain(`Método de Captura: ${ETIQUETA}`);
    expect(vista).toContain(ACLARACION);
    expect(vista).toContain('Precisión Declarada: ± 178 m');
    expect(vista).not.toMatch(/Movido a mano|Selección manual/);
  });

  it('«gps» y «manual» no cambian: su renglón de siempre y ni marca ni aclaración', () => {
    const casos = [
      ['gps', 2, 'En la posición del teléfono (dentro de su margen de error)'],
      ['manual', 12, 'Movido a mano por la persona'],
    ] as const;
    for (const [ubicacion_metodo, distancia_dispositivo_m, linea] of casos) {
      const f = reportePrueba({ ubicacion_metodo, distancia_dispositivo_m });
      const texto = generarTextoReporteUnitario(f, formatoPrueba, CIUDAD);
      expect(bloqueMetodo(texto), ubicacion_metodo).toEqual([`Método de Captura:  ${linea}`]);
      const vista = textoVisible(renderizarFicha(f));
      expect(vista, ubicacion_metodo).toContain(`Método de Captura: ${linea}`);
      for (const salida of [texto, vista]) {
        expect(salida, ubicacion_metodo).not.toContain(ETIQUETA);
        expect(salida, ubicacion_metodo).not.toContain(ACLARACION);
      }
    }
  });

  it('el GeoJSON de la ficha lleva el método tal como llegó', () => {
    const json = JSON.parse(generarJsonReporteUnitario(aproximada())) as {
      properties: { ubicacion_metodo: string; distancia_dispositivo_m: number | null };
    };
    expect(json.properties.ubicacion_metodo).toBe('aproximada');
    expect(json.properties.distancia_dispositivo_m).toBeNull();
  });
});
