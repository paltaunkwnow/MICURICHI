import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Las imágenes propias del panel se sirven en WebP (plan de producción, paso S05). Esta prueba
 * recorre `public/` y `src/` para que no vuelva a entrar un JPEG o un PNG, ni un enlace a uno.
 */

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const PUBLICO = join(RAIZ, 'public');
const FUENTE = join(RAIZ, 'src');
const ESTA_PRUEBA = fileURLToPath(import.meta.url);

/** Copia del worker de MapLibre que `scripts/copiar-worker-maplibre.mjs` rehace en cada arranque. */
const GENERADO = join(PUBLICO, 'maplibre');

const TEXTO = new Set(['.ts', '.tsx', '.js', '.mjs', '.css', '.json', '.svg', '.webmanifest']);
const FORMATO_VIEJO = /\.(?:jpe?g|png)$/i;
const MENCION_VIEJA = /\.(?:jpe?g|png)\b/i;
// Lo que se pide a otro servidor (las teselas raster de OpenStreetMap) no es imagen propia.
const URL_EXTERNA = /https?:\/\/[^\s'"`)]+/g;

/**
 * Peso en bytes de cada imagen antes de pasarla a WebP (commit 8e91c12). El WebP tiene que pesar
 * menos: si una conversión engorda el archivo, la prueba lo dice en vez de que pase sin que nadie
 * lo vea.
 */
const PESO_ANTERIOR: Record<string, number> = {
  'plano-zonificacion.webp': 352_417,
  'logo.webp': 52_400,
};

function archivos(carpeta: string): string[] {
  return readdirSync(carpeta, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name))
    .filter((ruta) => !ruta.startsWith(GENERADO));
}

const TODOS = [...archivos(PUBLICO), ...archivos(FUENTE)];
const DE_TEXTO = TODOS.filter((r) => TEXTO.has(extname(r)) && r !== ESTA_PRUEBA);
const rel = (ruta: string) => relative(RAIZ, ruta).replaceAll('\\', '/');

/** Ancho y alto de un WebP leídos de su cabecera RIFF (VP8, VP8L o VP8X). */
function medidasWebp(datos: Buffer): { ancho: number; alto: number } {
  expect(datos.toString('ascii', 0, 4)).toBe('RIFF');
  expect(datos.toString('ascii', 8, 12)).toBe('WEBP');
  const trozo = datos.toString('ascii', 12, 16);
  if (trozo === 'VP8X') {
    return { ancho: 1 + datos.readUIntLE(24, 3), alto: 1 + datos.readUIntLE(27, 3) };
  }
  if (trozo === 'VP8L') {
    const bits = datos.readUInt32LE(21);
    return { ancho: (bits & 0x3fff) + 1, alto: ((bits >>> 14) & 0x3fff) + 1 };
  }
  expect(trozo).toBe('VP8 ');
  return { ancho: datos.readUInt16LE(26) & 0x3fff, alto: datos.readUInt16LE(28) & 0x3fff };
}

describe('imágenes propias del panel en WebP', () => {
  it('public/ y src/ no tienen archivos JPEG ni PNG', () => {
    expect(TODOS.filter((r) => FORMATO_VIEJO.test(r)).map(rel)).toEqual([]);
  });

  it('ningún archivo de public/ ni de src/ nombra una imagen .jpg, .jpeg o .png propia', () => {
    const conMencion = DE_TEXTO.filter((ruta) =>
      MENCION_VIEJA.test(readFileSync(ruta, 'utf8').replace(URL_EXTERNA, '')),
    );
    expect(conMencion.map(rel)).toEqual([]);
  });

  it('cada imagen .webp que nombra el código existe en public/', () => {
    const nombradas = new Set<string>();
    for (const ruta of DE_TEXTO.filter((r) => r.startsWith(FUENTE))) {
      for (const [, nombre] of readFileSync(ruta, 'utf8').matchAll(
        /["'`]\/([\w./-]+\.webp)["'`]/g,
      )) {
        if (nombre) nombradas.add(nombre);
      }
    }
    expect([...nombradas].sort()).toEqual(['logo.webp', 'plano-zonificacion.webp']);
    for (const nombre of nombradas) expect(existsSync(join(PUBLICO, nombre)), nombre).toBe(true);
  });

  it('el plano conserva su tamaño original, para que se lea sin ampliar, en la vista y en la descarga', () => {
    const plano = readFileSync(join(PUBLICO, 'plano-zonificacion.webp'));
    expect(medidasWebp(plano)).toEqual({ ancho: 1400, alto: 1711 });
    const pagina = readFileSync(join(FUENTE, 'app', '(panel)', 'plano', 'page.tsx'), 'utf8');
    expect(pagina).toContain('href="/plano-zonificacion.webp"');
    expect(pagina).toContain('download="plano-zonificacion-santa-cruz.webp"');
    expect(pagina).toContain('src="/plano-zonificacion.webp"');
  });

  it('cada WebP pesa menos que la imagen que reemplazó', () => {
    for (const [nombre, antes] of Object.entries(PESO_ANTERIOR)) {
      expect(readFileSync(join(PUBLICO, nombre)).length, nombre).toBeLessThan(antes);
    }
  });

  it('el logo de la barra lateral es WebP', () => {
    expect(medidasWebp(readFileSync(join(PUBLICO, 'logo.webp')))).toEqual({
      ancho: 200,
      alto: 200,
    });
    const barra = readFileSync(join(FUENTE, 'componentes', 'BarraLateral.tsx'), 'utf8');
    expect(barra).toContain('src="/logo.webp"');
  });
});
