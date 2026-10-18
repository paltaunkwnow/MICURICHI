import { DEFINICION_INUNDACION, type DefinicionCategoriaCualquiera, ETIQUETAS } from 'contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { UseFormReturn } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { DEFINICION_BACHE_DE_PRUEBA } from '@/lib/categoria-de-prueba';
import {
  type ValoresFormulario,
  valoresIniciales,
  valoresTrasCambiarCategoria,
} from '@/lib/formulario-reporte';
import { archivosDeLaApp, leerFuente } from '@/lib/fuente-para-pruebas';
import { crearAdaptadorGenerico } from './generico';
import { ADAPTADOR_INUNDACION } from './inundacion';
import { ADAPTADORES_FORMULARIO, adaptadorFormularioDe } from './registro';

/**
 * CA5 del plan M4 (ADR 0009, 0021): el paso 2 del formulario sale de un adaptador por categoría.
 * Inundaciones trae su componente especial (el paso 2 de hoy, extraído); las demás usan el
 * renderizador declarativo, que dibuja las `preguntas` de la definición. El código común nunca
 * pregunta por una categoría concreta.
 */

/** Un `form` de react-hook-form mínimo: la prueba solo renderiza (no dispara onChange). */
function formFalso(): UseFormReturn<ValoresFormulario> {
  return {
    setValue: () => {},
    clearErrors: () => {},
    getValues: () => ({}),
    register: () => ({ name: '', onChange: () => {}, onBlur: () => {}, ref: () => {} }),
    formState: { errors: {} },
  } as unknown as UseFormReturn<ValoresFormulario>;
}

function renderPaso2(
  def: DefinicionCategoriaCualquiera,
  valores: Partial<ValoresFormulario> = {},
): string {
  const adaptador = adaptadorFormularioDe(def);
  const Cuerpo = adaptador.CuerpoPaso2;
  return renderToStaticMarkup(
    createElement(Cuerpo, {
      form: formFalso(),
      valores: {
        ...valoresIniciales(),
        ...adaptador.valoresIniciales(),
        ...valores,
      } as ValoresFormulario,
      errores: {},
      definicion: def,
      ahora: new Date(2026, 8, 26, 10, 0),
    }),
  );
}

describe('el registro de adaptadores de formulario', () => {
  it('Inundaciones trae el suyo; las demás usan el declarativo', () => {
    expect(adaptadorFormularioDe(DEFINICION_INUNDACION)).toBe(ADAPTADOR_INUNDACION);
    const bache = adaptadorFormularioDe(DEFINICION_BACHE_DE_PRUEBA);
    expect(bache).not.toBe(ADAPTADOR_INUNDACION);
    expect(bache.slug).toBe('bache');
    expect(Object.keys(ADAPTADORES_FORMULARIO)).toEqual(['inundacion/paso2']);
  });

  it('el código común no pregunta por una categoría concreta (ADR 0009 §6.3)', () => {
    const culpables = archivosDeLaApp()
      .filter(({ texto }) =>
        /[!=]==?\s*['"]inundacion['"]|['"]inundacion['"]\s*[!=]==?/.test(texto),
      )
      .map(({ ruta }) => ruta);
    expect(culpables).toEqual([]);
  });

  it('el formulario resuelve la categoría desde la URL y no toca la preferencia del mapa (ADR 0014)', () => {
    const fuente = leerFuente('componentes/FormularioReporte.tsx');
    // Resuelve con la URL y SIN preferencia guardada (guardada: null en los dos lugares).
    expect(fuente.match(/guardada:\s*null/g)?.length).toBeGreaterThanOrEqual(2);
    // Nunca guarda la preferencia del dispositivo: eso es solo del mapa.
    expect(fuente).not.toContain('guardarPreferenciaCategoria');
    expect(fuente).not.toContain('leerPreferenciaCategoria');
  });
});

describe('Inundaciones: el adaptador reproduce el paso 2 de hoy', () => {
  it('su detalle lleva los seis campos de dominio, con el sumidero coherente', () => {
    const detalle = ADAPTADOR_INUNDACION.aDetalle({
      ...valoresIniciales(),
      profundidad_estimada: 'muslo',
      frecuencia: 'permanente',
      causa_presunta: 'colector_saturado',
      sumidero_cercano: 'no',
      sumidero_estado: 'tapado',
      agua_brota_sumidero: true,
    } as unknown as ValoresFormulario);
    expect(detalle).toEqual({
      profundidad_estimada: 'muslo',
      frecuencia: 'permanente',
      causa_presunta: 'colector_saturado',
      // «No» hay sumidero: no queda estado ni «brota».
      sumidero_cercano: 'no',
      sumidero_estado: null,
      agua_brota_sumidero: null,
    });
  });

  it('la previsualización de severidad trae banda, puntaje y máximo (7/13)', () => {
    const sev = ADAPTADOR_INUNDACION.previsualizarSeveridad({
      ...valoresIniciales(),
      profundidad_estimada: 'rodilla',
      frecuencia: 'cada_lluvia_fuerte',
    } as unknown as ValoresFormulario);
    expect(sev).toEqual({ banda: 'media', puntaje: 7, max: 13 });
    // Sin profundidad o sin frecuencia todavía no hay severidad.
    expect(
      ADAPTADOR_INUNDACION.previsualizarSeveridad(valoresIniciales() as ValoresFormulario),
    ).toBeNull();
  });

  it('sus filas de la revisión son Profundidad y Frecuencia, con los textos de hoy', () => {
    const filas = ADAPTADOR_INUNDACION.filasRevision({
      ...valoresIniciales(),
      profundidad_estimada: 'rodilla',
      frecuencia: 'ocasional',
    } as unknown as ValoresFormulario);
    expect(filas).toEqual([
      {
        etiqueta: ETIQUETAS.campos.profundidad,
        valor: `${ETIQUETAS.profundidad.rodilla.corta} · ${ETIQUETAS.profundidad.rodilla.rango}`,
        paso: 2,
      },
      { etiqueta: 'Frecuencia', valor: ETIQUETAS.frecuencia.ocasional, paso: 2 },
    ]);
  });

  it('el paso 2 dibuja la fecha, profundidad, frecuencia y la tarjeta de severidad', () => {
    const html = renderPaso2(DEFINICION_INUNDACION, {
      profundidad_estimada: 'rodilla',
      frecuencia: 'ocasional',
    });
    expect(html).toContain('id="evento"');
    expect(html).toContain('name="profundidad_estimada"');
    expect(html).toContain('name="frecuencia"');
    expect(html).toContain('Severidad calculada');
    // El «/13» del puntaje es propio de Inundaciones.
    expect(html).toContain('/13');
  });
});

describe('renderizador declarativo (categoría sin componente especial)', () => {
  it('dibuja las preguntas con nombres detalle.<id>, sin chocar con el núcleo', () => {
    const html = renderPaso2(DEFINICION_BACHE_DE_PRUEBA);
    expect(html).toContain('Tamaño del bache');
    expect(html).toContain('name="detalle.tamano"');
    // Booleana.
    expect(html).toContain('¿Es peligroso para el tránsito?');
    expect(html).toContain('name="detalle.hay_riesgo"');
    // Opción múltiple.
    expect(html).toContain('Afecta a');
    expect(html).toContain('name="detalle.afecta_a"');
    // El título del paso lo pone el armazón (no el cuerpo): acá no aparece.
    expect(html).not.toContain('¿Hasta dónde llegó');
  });

  it('el cuerpo que se envía son las respuestas del detalle', () => {
    const adaptador = adaptadorFormularioDe(DEFINICION_BACHE_DE_PRUEBA);
    const detalle = adaptador.aDetalle({
      ...valoresIniciales(),
      detalle: { tamano: 'grande', hay_riesgo: true, afecta_a: ['autos'] },
    } as unknown as ValoresFormulario);
    expect(detalle).toEqual({ tamano: 'grande', hay_riesgo: true, afecta_a: ['autos'] });
  });

  it('la revisión arma sus filas desde las preguntas contestadas', () => {
    const adaptador = adaptadorFormularioDe(DEFINICION_BACHE_DE_PRUEBA);
    const filas = adaptador.filasRevision({
      detalle: { tamano: 'grande', hay_riesgo: true, afecta_a: ['autos', 'motos'] },
    } as unknown as ValoresFormulario);
    expect(filas).toEqual([
      { etiqueta: 'Tamaño del bache', valor: 'Grande, como una llanta', paso: 2 },
      { etiqueta: '¿Es peligroso para el tránsito?', valor: 'Sí', paso: 2 },
      { etiqueta: 'Afecta a', valor: 'Autos, Motos', paso: 2 },
    ]);
  });

  it('el avance exige las preguntas obligatorias', () => {
    const conObligatoria = {
      ...DEFINICION_BACHE_DE_PRUEBA,
      preguntas: [
        {
          id: 'tamano',
          etiqueta: 'Tamaño',
          tipo: 'opcion_unica',
          obligatoria: true,
          opciones: [{ valor: 'chico', etiqueta: 'Chico' }],
        },
      ],
    } as unknown as DefinicionCategoriaCualquiera;
    const adaptador = crearAdaptadorGenerico(conObligatoria);
    expect(
      adaptador.puedeAvanzarPaso2({ detalle: {} } as unknown as ValoresFormulario, new Date()),
    ).toBe(false);
    expect(
      adaptador.puedeAvanzarPaso2(
        { detalle: { tamano: 'chico' } } as unknown as ValoresFormulario,
        new Date(),
      ),
    ).toBe(true);
  });

  it('la previsualización usa def.severidad.calcular y muestra SOLO la banda', () => {
    const adaptador = adaptadorFormularioDe(DEFINICION_BACHE_DE_PRUEBA);
    // Las respuestas que ofrece el formulario satisfacen su esquema sintético.
    const sev = adaptador.previsualizarSeveridad({
      detalle: {
        tamano: 'grande',
        hay_riesgo: false,
        afecta_a: [],
      },
    } as unknown as ValoresFormulario);
    expect(sev).toEqual({ banda: 'media' });
    expect(sev?.puntaje).toBeUndefined();
    // Con un detalle que su esquema rechaza, todavía no hay previsualización.
    expect(
      adaptador.previsualizarSeveridad({
        detalle: { tamano: 'grande' },
      } as unknown as ValoresFormulario),
    ).toBeNull();
  });
});

describe('cambio de categoría que conserva el núcleo (con el registro de dos categorías)', () => {
  it('conserva la ubicación, el tipo de lugar, la descripción y las fotos; reinicia el paso 2', () => {
    const actuales = {
      ...valoresIniciales(),
      ...ADAPTADOR_INUNDACION.valoresIniciales(),
      lat: -17.7,
      lon: -63.1,
      ubicacion_tipo: 'vivienda_o_predio',
      descripcion: 'Ya lo escribí',
      fotos: ['x.webp'],
      profundidad_estimada: 'muslo',
      frecuencia: 'permanente',
    } as ValoresFormulario;
    const inicialesBache = adaptadorFormularioDe(DEFINICION_BACHE_DE_PRUEBA).valoresIniciales();
    const nuevos = valoresTrasCambiarCategoria(actuales, inicialesBache);
    expect(nuevos.lat).toBe(-17.7);
    expect(nuevos.ubicacion_tipo).toBe('vivienda_o_predio');
    expect(nuevos.descripcion).toBe('Ya lo escribí');
    expect(nuevos.fotos).toEqual(['x.webp']);
    // Las respuestas de Inundaciones desaparecen; se adoptan las de la categoría nueva.
    expect(nuevos.profundidad_estimada).toBeUndefined();
    expect(nuevos.frecuencia).toBeUndefined();
    expect(nuevos.detalle).toEqual({});
  });
});
