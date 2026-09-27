/**
 * Las imágenes propias de la app van en WebP (plan 2026-09-26, pedido A). El único PNG que queda
 * es el ícono de iPhone (`apple-touch-icon`), porque iOS no acepta WebP ahí.
 *
 * Se recorre el código y `public/` en vez de mirar un par de componentes: una referencia vieja en
 * cualquier rincón (el service worker, el manifiesto) sigue pidiendo el archivo pesado.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = resolve(import.meta.dirname, '../..');
const PUBLIC = join(RAIZ, 'public');
const SRC = join(RAIZ, 'src');

function recorrer(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? recorrer(join(dir, e.name)) : [join(dir, e.name)],
  );
}

const rel = (ruta: string) => relative(RAIZ, ruta).replaceAll('\\', '/');

/** Código y textos que el navegador llega a pedir. Las pruebas quedan fuera: sus fotos son del servidor. */
function fuentes(): { ruta: string; texto: string }[] {
  const deSrc = recorrer(SRC).filter((r) => /\.(ts|tsx|css)$/.test(r) && !/\.test\.tsx?$/.test(r));
  const dePublic = recorrer(PUBLIC).filter((r) => /\.(js|json|webmanifest|svg|html)$/.test(r));
  return [...deSrc, ...dePublic].map((r) => ({ ruta: rel(r), texto: readFileSync(r, 'utf8') }));
}

/**
 * Toda mención de un .jpg, .jpeg o .png propio, también en comentarios: un comentario que dice
 * «el logo está en public/logo.png» manda a buscar el archivo viejo. Las URL externas, como las
 * teselas de OpenStreetMap, no cuentan.
 */
function mencionesDeJpgOPng(texto: string): string[] {
  const sinUrlExternas = texto.replace(/https?:\/\/[^\s'"`)]+/g, '');
  return [...sinUrlExternas.matchAll(/[\w./-]*\.(?:jpe?g|png)\b/gi)].map((m) => m[0]);
}

/**
 * Peso en bytes de cada imagen antes de pasarla a WebP (commit 8e91c12; `logo.png` sigue en
 * `public/` para el ícono de iPhone). El WebP tiene que pesar menos: si una conversión engorda el
 * archivo, la prueba lo dice en vez de que pase sin que nadie lo vea.
 */
const PESO_ANTERIOR: Record<string, number> = {
  'santa-cruz-catedral.webp': 73_218,
  'logo.webp': 52_400,
};

describe('imágenes propias en WebP', () => {
  it('public/ no trae JPEG ni PNG, salvo logo.png para el ícono de iPhone', () => {
    const pesadas = recorrer(PUBLIC)
      .filter((r) => ['.jpg', '.jpeg', '.png'].includes(extname(r).toLowerCase()))
      .map(rel);
    expect(pesadas).toEqual(['public/logo.png']);
  });

  it('la catedral y el logo existen en WebP de verdad (cabecera RIFF…WEBP)', () => {
    for (const nombre of ['santa-cruz-catedral.webp', 'logo.webp']) {
      const bytes = readFileSync(join(PUBLIC, nombre));
      expect(bytes.subarray(0, 4).toString('latin1'), nombre).toBe('RIFF');
      expect(bytes.subarray(8, 12).toString('latin1'), nombre).toBe('WEBP');
    }
  });

  it('cada WebP pesa menos que la imagen que reemplazó', () => {
    for (const [nombre, antes] of Object.entries(PESO_ANTERIOR)) {
      expect(readFileSync(join(PUBLIC, nombre)).length, nombre).toBeLessThan(antes);
    }
  });

  it('ni src/ ni public/ mencionan un .jpg o .png propio, ni en comentarios, salvo el apple-touch-icon', () => {
    const encontradas = fuentes().flatMap(({ ruta, texto }) =>
      mencionesDeJpgOPng(texto).map((ref) => `${ruta} → ${ref}`),
    );
    expect(encontradas).toEqual(['src/app/layout.tsx → /logo.png']);
    const layout = readFileSync(join(SRC, 'app/layout.tsx'), 'utf8');
    expect(layout).toMatch(/apple:\s*'\/logo\.png'/);
  });

  it('el service worker guarda en el shell el logo que se usa (WebP)', () => {
    const sw = readFileSync(join(PUBLIC, 'sw.js'), 'utf8');
    const shell = sw.match(/const SHELL = \[([^\]]*)\]/)?.[1] ?? '';
    expect(shell).toContain("'/logo.webp'");
    expect(shell).not.toMatch(/\.png|\.jpe?g/);
  });

  it('el manifiesto no declara íconos en PNG ni JPEG', () => {
    const manifiesto = JSON.parse(readFileSync(join(PUBLIC, 'manifest.webmanifest'), 'utf8')) as {
      icons?: { src: string; type?: string }[];
    };
    for (const icono of manifiesto.icons ?? []) {
      expect(icono.src).not.toMatch(/\.(png|jpe?g)$/i);
      expect(icono.type ?? '').not.toMatch(/image\/(png|jpeg)/);
    }
  });
});
