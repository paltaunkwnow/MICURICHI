/**
 * Lectura del código fuente para las pruebas que tienen que valer en CUALQUIER pantalla (nadie más
 * pide la cámara, nadie pide la ubicación al cargar). Vitest corre sin DOM, así que lo que pasa al
 * montar —los efectos— se comprueba leyendo cada efecto. Solo lo importan archivos `*.test.ts`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/** Carpeta `src/` de la app. */
export const SRC = resolve(import.meta.dirname, '..');

/** Cada archivo `.ts` / `.tsx` de `src/` que no es de pruebas, con su ruta relativa a `src/`. */
export function archivosDeLaApp(): { ruta: string; texto: string }[] {
  const salida: { ruta: string; texto: string }[] = [];
  const recorrer = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const ruta = join(dir, e.name);
      if (e.isDirectory()) recorrer(ruta);
      else if (
        /\.(ts|tsx)$/.test(e.name) &&
        !/\.test\.tsx?$/.test(e.name) &&
        e.name !== 'fuente-para-pruebas.ts'
      ) {
        salida.push({
          ruta: relative(SRC, ruta).replaceAll('\\', '/'),
          texto: readFileSync(ruta, 'utf8'),
        });
      }
    }
  };
  recorrer(SRC);
  return salida;
}

export function leerFuente(ruta: string): string {
  return readFileSync(join(SRC, ruta), 'utf8');
}

/**
 * Texto de cada llamada a `useEffect`, `useLayoutEffect` o `useInsertionEffect`: desde su `(`
 * hasta el `)` que la cierra, saltando cadenas y comentarios para que un paréntesis escrito ahí no
 * corte la cuenta.
 */
export function cuerposDeEfectos(fuente: string): string[] {
  const cuerpos: string[] = [];
  for (const m of fuente.matchAll(/\buse(?:Layout|Insertion)?Effect\s*\(/g)) {
    const inicio = (m.index ?? 0) + m[0].length;
    let profundidad = 1;
    let i = inicio;
    while (i < fuente.length && profundidad > 0) {
      const c = fuente[i];
      const sig = fuente[i + 1];
      if (c === '/' && sig === '/') {
        i = fuente.indexOf('\n', i);
        if (i === -1) break;
      } else if (c === '/' && sig === '*') {
        i = fuente.indexOf('*/', i + 2) + 1;
        if (i === 0) break;
      } else if (c === "'" || c === '"' || c === '`') {
        i += 1;
        while (i < fuente.length && fuente[i] !== c) i += fuente[i] === '\\' ? 2 : 1;
      } else if (c === '(') {
        profundidad += 1;
      } else if (c === ')') {
        profundidad -= 1;
      }
      i += 1;
    }
    cuerpos.push(fuente.slice(inicio, i - 1));
  }
  return cuerpos;
}
