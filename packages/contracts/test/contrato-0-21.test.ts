import { describe, expect, it } from 'vitest';
import {
  DEFINICION_INUNDACION,
  type DefinicionCategoriaCualquiera,
  type TextosCategoria,
  type TextosCategoriaResueltos,
  textosDeCategoria,
} from '../src/categorias/index.js';

/**
 * 0.21.0 · CA1 · `DefinicionCategoria.textos` (aditivo). Los textos de pantalla propios de la
 * categoría salen a la definición; inundación los trae idénticos a los que la web tenía fijos, así
 * que con una sola categoría activa no cambia nada visible. Estas pruebas reproducen la composición
 * EXACTA que hace la web (cada `componer*` cita el lugar del código fuente) y la comparan con el
 * literal de hoy. Si M4.2 usa el fragmento con la fórmula documentada, el resultado es idéntico.
 */

/** `apps/web-ciudadano/src/lib/ciudad.ts:22-24` — `tituloDelMapa`. */
const componerTituloMapa = (t: TextosCategoriaResueltos, ciudad: string) =>
  `Mapa de ${t.puntosDelMapa} de ${ciudad}`;
/** `apps/web-ciudadano/src/componentes/Mapa.tsx:~318` — `aria-label` por defecto del mapa. */
const componerAriaLabelMapa = (t: TextosCategoriaResueltos) => `Mapa de ${t.puntosDelMapa}`;
/** `apps/web-ciudadano/src/app/reporte/[id]/page.tsx:~67` — h1 oculto del detalle. */
const componerH1Detalle = (t: TextosCategoriaResueltos, lugar: string) =>
  `${t.puntoSingular} en ${lugar}`;
/** `apps/web-ciudadano/src/componentes/HojaDetalle.tsx:~190-193` — aviso de percepción. */
const componerAvisoPercepcion = (t: TextosCategoriaResueltos) =>
  `Dato de percepción, no medido: ${t.avisoPercepcion} y la ubicación tiene el error del GPS.`;

describe('0.21.0 · CA1 · DEFINICION_INUNDACION.textos compone los literales de hoy', () => {
  const t = textosDeCategoria(DEFINICION_INUNDACION);

  it('inundación trae `textos` explícitos (no usa el respaldo)', () => {
    expect(DEFINICION_INUNDACION.textos).toBeDefined();
    expect(DEFINICION_INUNDACION.textos).toEqual({
      puntosDelMapa: 'puntos de inundación',
      puntoSingular: 'Punto de inundación',
      listaVaciaCuerpo:
        'Que no haya puntos no significa que no se anegue. Si conocés un lugar donde se junta el agua, sos el primero en marcarlo.',
      tituloPaso2: '¿Hasta dónde llegó y cada cuánto pasa?',
      avisoPercepcion: 'la profundidad se estima por referencia corporal',
      descripcionReportar: 'Marcá dónde se junta el agua en tu barrio.',
    });
  });

  it('el título del mapa es exactamente el de hoy (ciudad.ts:22-24; E2E datos-reales:132)', () => {
    expect(componerTituloMapa(t, 'Santa Cruz de la Sierra')).toBe(
      'Mapa de puntos de inundación de Santa Cruz de la Sierra',
    );
  });

  it('el aria-label por defecto del mapa es exactamente el de hoy (Mapa.tsx:~318)', () => {
    expect(componerAriaLabelMapa(t)).toBe('Mapa de puntos de inundación');
  });

  it('el h1 del detalle es exactamente el de hoy (reporte/[id]/page.tsx:~67)', () => {
    expect(componerH1Detalle(t, 'UV 123')).toBe('Punto de inundación en UV 123');
  });

  it('el cuerpo de la lista vacía es exactamente el de hoy (VistaMapa.tsx:~774)', () => {
    expect(t.listaVaciaCuerpo).toBe(
      'Que no haya puntos no significa que no se anegue. Si conocés un lugar donde se junta el agua, sos el primero en marcarlo.',
    );
  });

  it('el título del paso 2 es exactamente el de hoy (FormularioReporte.tsx:~1267)', () => {
    expect(t.tituloPaso2).toBe('¿Hasta dónde llegó y cada cuánto pasa?');
  });

  it('el aviso de percepción del detalle es exactamente el de hoy (HojaDetalle.tsx:~190-193)', () => {
    expect(componerAvisoPercepcion(t)).toBe(
      'Dato de percepción, no medido: la profundidad se estima por referencia corporal y la ubicación tiene el error del GPS.',
    );
  });

  it('la descripción de /reportar es exactamente la de hoy (reportar/page.tsx metadata)', () => {
    expect(t.descripcionReportar).toBe('Marcá dónde se junta el agua en tu barrio.');
  });
});

describe('0.21.0 · CA1 · respaldo de textosDeCategoria y opcionalidad', () => {
  it('el respaldo rellena desde nombre/nombreCorto/descripcion cuando no hay `textos`', () => {
    // Una definición sin `textos` COMPILA (el campo es opcional); al quitarlo se usa el respaldo.
    const { textos: _omitido, ...sinTextos } = DEFINICION_INUNDACION;
    const sintetica: DefinicionCategoriaCualquiera = {
      ...sinTextos,
      slug: 'prueba_sintetica',
      nombre: 'Baches',
      nombreCorto: 'Bache',
      descripcion: 'Dónde hay baches en la ciudad, según los vecinos.',
    };
    expect(sintetica.textos).toBeUndefined();

    const t = textosDeCategoria(sintetica);
    expect(t.puntosDelMapa).toBe('puntos de baches');
    expect(t.puntoSingular).toBe('Punto de bache');
    // Los textos sin derivación de nombre caen en un genérico neutro respecto de la categoría.
    expect(t.listaVaciaCuerpo).toBe(
      'Que no haya puntos no significa que no pase. Si conocés un lugar así, sos el primero en marcarlo.',
    );
    expect(t.tituloPaso2).toBe('Contanos un poco más');
    expect(t.avisoPercepcion).toBe('los datos se estiman a ojo');
    // descripcionReportar respalda con la `descripcion` de la categoría.
    expect(t.descripcionReportar).toBe('Dónde hay baches en la ciudad, según los vecinos.');
  });

  it('el respaldo completa solo los campos que faltan y respeta los presentes', () => {
    const parciales: TextosCategoria = { tituloPaso2: '¿Qué tan grande es?' };
    const t = textosDeCategoria({
      nombre: 'Baches',
      nombreCorto: 'Bache',
      descripcion: 'Baches de la ciudad.',
      textos: parciales,
    });
    expect(t.tituloPaso2).toBe('¿Qué tan grande es?');
    expect(t.puntosDelMapa).toBe('puntos de baches');
  });

  it('todos los campos quedan resueltos (ninguno undefined)', () => {
    const t = textosDeCategoria(DEFINICION_INUNDACION);
    for (const valor of Object.values(t)) expect(typeof valor).toBe('string');
  });
});
