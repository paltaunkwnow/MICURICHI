/**
 * Auxiliar de pruebas (no entra en la app). Las pruebas del panel corren en Node, sin DOM, así que
 * no pueden hacer clic: esto recorre el árbol de elementos que devuelve un componente de función
 * SIN hooks —antes de que React lo renderice— y entrega los elementos que cumplen una condición,
 * para llamar su `onClick` o su `onChange` como lo haría el navegador.
 */
export interface ElementoDelArbol {
  type: unknown;
  props: Record<string, unknown>;
}

export function elementosDelArbol(
  raiz: unknown,
  cumple: (elemento: ElementoDelArbol) => boolean,
): ElementoDelArbol[] {
  const hallados: ElementoDelArbol[] = [];
  const visitar = (nodo: unknown): void => {
    if (Array.isArray(nodo)) {
      for (const hijo of nodo) visitar(hijo);
      return;
    }
    if (!nodo || typeof nodo !== 'object' || !('props' in nodo)) return;
    const elemento = nodo as ElementoDelArbol;
    if (cumple(elemento)) hallados.push(elemento);
    visitar(elemento.props.children);
  };
  visitar(raiz);
  return hallados;
}

/**
 * Llama el manejador (`onClick`, `onChange`…) de un elemento, como lo haría el navegador al
 * activar el control. Falla si el elemento no existe o no tiene ese manejador.
 */
export function disparar(elemento: ElementoDelArbol | undefined, manejador: string): void {
  const funcion = elemento?.props[manejador];
  if (typeof funcion !== 'function') throw new Error(`El elemento no tiene ${manejador}`);
  funcion();
}
