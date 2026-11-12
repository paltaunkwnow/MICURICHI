/**
 * Textos de pantalla propios de una categoría (0.21.0, ADR 0009, 0021). La web pública tenía fijos,
 * con «inundación» y «agua», varios textos que en realidad son de la categoría: el título y el
 * `aria-label` del mapa, el h1 del detalle, el cuerpo de la lista vacía, el título del paso 2, el
 * aviso de percepción del detalle y la descripción de la página de reporte. Al sacarlos a la
 * definición, la web los toma del registro (M4) y una categoría nueva (Baches, M6) solo trae los
 * suyos, sin tocar el núcleo.
 *
 * Se prefieren **fragmentos** que el consumidor compone a plantillas con marcadores: un fragmento es
 * más fácil de traducir, de reutilizar en dos lugares (p. ej. `puntosDelMapa` arma el título y el
 * `aria-label`) y no obliga al núcleo a interpretar marcadores. Los textos que no se arman bien con
 * un fragmento —una oración entera cuyo cuerpo cambia por completo entre categorías— se guardan
 * completos. Cada campo documenta cómo lo compone hoy la web, con el literal exacto de inundación.
 *
 * `textos` es opcional en la definición y cada campo es opcional dentro de `textos`: una categoría
 * que no los trae (o las definiciones sintéticas de las pruebas de api-core y geo-service) sigue
 * compilando, y `textosDeCategoria` rellena lo que falte.
 */

export interface TextosCategoria {
  /**
   * Fragmento plural en minúsculas para el encabezado y el `aria-label` del mapa. Inundación:
   * `'puntos de inundación'`. La web lo compone como `Mapa de ${puntosDelMapa} de ${ciudad}` (título)
   * y `Mapa de ${puntosDelMapa}` (`aria-label` por defecto del componente del mapa).
   */
  puntosDelMapa?: string;
  /**
   * Fragmento singular con mayúscula inicial para el h1 (oculto) del detalle de un reporte.
   * Inundación: `'Punto de inundación'`. La web lo compone como `${puntoSingular} en ${lugar}`.
   */
  puntoSingular?: string;
  /**
   * Oración completa del estado vacío de la lista cuando no hay ningún reporte y no hay filtros (su
   * vocabulario cambia por completo entre categorías, así que no es un fragmento). Inundación:
   * `'Que no haya puntos no significa que no se anegue. Si conocés un lugar donde se junta el agua,
   * sos el primero en marcarlo.'`.
   */
  listaVaciaCuerpo?: string;
  /**
   * Título del paso 2 del formulario («Qué pasa»). Oración completa propia de la categoría.
   * Inundación: `'¿Hasta dónde llegó y cada cuánto pasa?'`.
   */
  tituloPaso2?: string;
  /**
   * Fragmento del aviso de percepción del detalle: la parte que nombra lo que se estima a ojo.
   * Inundación: `'la profundidad se estima por referencia corporal'`. La web lo compone como
   * `Dato de percepción, no medido: ${avisoPercepcion} y la ubicación tiene el error del GPS.`
   * (el resto de la oración es común a todas las categorías).
   */
  avisoPercepcion?: string;
  /**
   * Oración completa para el `metadata.description` de la página de reporte (`/reportar`).
   * Inundación: `'Marcá dónde se junta el agua en tu barrio.'`.
   */
  descripcionReportar?: string;
}

/** Los textos de una categoría con todos los campos resueltos (ninguno `undefined`). */
export type TextosCategoriaResueltos = Required<TextosCategoria>;

/** Lo mínimo que `textosDeCategoria` necesita de una definición para calcular el respaldo. */
interface FuenteTextosCategoria {
  nombre: string;
  nombreCorto: string;
  descripcion: string;
  textos?: TextosCategoria;
}

/**
 * Devuelve los textos de una categoría con todos los campos resueltos, rellenando los que falten con
 * un respaldo simple y documentado, para que ningún consumidor invente el suyo. Reglas del respaldo:
 *
 * - `puntosDelMapa` → `puntos de ${nombre en minúsculas}` (p. ej. «puntos de baches»);
 * - `puntoSingular` → `Punto de ${nombreCorto en minúsculas}` (p. ej. «Punto de bache»);
 * - `descripcionReportar` → la `descripcion` de la categoría (ya es un texto propio y presente);
 * - `listaVaciaCuerpo`, `tituloPaso2` y `avisoPercepcion` no se derivan bien de `nombre`, así que su
 *   respaldo es un texto genérico, neutro respecto de la categoría.
 *
 * El respaldo no busca igualar los literales de inundación: inundación trae sus `textos` explícitos y
 * nunca pasa por aquí. Es la red para una categoría futura que olvide algún texto.
 */
export function textosDeCategoria(def: FuenteTextosCategoria): TextosCategoriaResueltos {
  const t = def.textos ?? {};
  const nombreMin = def.nombre.toLocaleLowerCase('es');
  const cortoMin = def.nombreCorto.toLocaleLowerCase('es');
  return {
    puntosDelMapa: t.puntosDelMapa ?? `puntos de ${nombreMin}`,
    puntoSingular: t.puntoSingular ?? `Punto de ${cortoMin}`,
    listaVaciaCuerpo:
      t.listaVaciaCuerpo ??
      'Que no haya puntos no significa que no pase. Si conocés un lugar así, sos el primero en marcarlo.',
    tituloPaso2: t.tituloPaso2 ?? 'Contanos un poco más',
    avisoPercepcion: t.avisoPercepcion ?? 'los datos se estiman a ojo',
    descripcionReportar: t.descripcionReportar ?? def.descripcion,
  };
}
