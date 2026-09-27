/**
 * Formato de salida de las fotos (contrato 0.8.0): entre lo que entre —JPEG, PNG o WebP—, se
 * guarda un WebP de 1600 px por lado como máximo, de un solo cuadro y sin metadatos.
 */
import { CONFIG_DOMINIO } from 'contracts';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { sanitizarImagen } from '../src/rutas/fotos.js';
import { trozosRiff } from './ayudas.js';

const METADATOS = ['EXIF', 'XMP ', 'ICCP'];

const XMP =
  '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
  '<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Vecino de prueba</dc:creator>' +
  '</rdf:Description></rdf:RDF></x:xmpmeta>';

function lienzo(ancho: number, alto: number, fondo = '#28934D') {
  return sharp({ create: { width: ancho, height: alto, channels: 3, background: fondo } });
}

describe('sanitizarImagen: WebP de salida', () => {
  it('un JPEG con EXIF GPS, XMP y perfil ICC sale como RIFF…WEBP sin ninguno de esos trozos', async () => {
    const entrada = await lienzo(2400, 1600)
      .jpeg()
      .withExif({
        IFD3: {
          GPSLatitudeRef: 'S',
          GPSLatitude: '17/1 47/1 0/1',
          GPSLongitudeRef: 'W',
          GPSLongitude: '63/1 10/1 0/1',
        },
      })
      .withXmp(XMP)
      .withIccProfile('p3')
      .toBuffer();
    const antes = await sharp(entrada).metadata();
    expect(antes.exif && antes.xmp && antes.icc, 'la entrada trae los tres metadatos').toBeTruthy();

    const { datos, ancho, alto } = await sanitizarImagen(entrada);
    const trozos = trozosRiff(datos);
    for (const t of METADATOS) expect(trozos).not.toContain(t);
    const meta = await sharp(datos).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect([ancho, alto]).toEqual([1600, 1067]);
  });

  it('un PNG de entrada sale en WebP', async () => {
    const { datos } = await sanitizarImagen(await lienzo(300, 200).png().toBuffer());
    expect(trozosRiff(datos)).not.toContain('ICCP');
    expect((await sharp(datos).metadata()).format).toBe('webp');
  });

  it('un WebP de entrada se vuelve a codificar y sale en WebP sin su EXIF', async () => {
    const entrada = await lienzo(300, 200)
      .webp()
      .withExif({ IFD0: { Copyright: 'Vecino de prueba' } })
      .toBuffer();
    expect(trozosRiff(entrada), 'la entrada lleva EXIF').toContain('EXIF');
    const { datos } = await sanitizarImagen(entrada);
    const trozos = trozosRiff(datos);
    for (const t of METADATOS) expect(trozos).not.toContain(t);
    expect((await sharp(datos).metadata()).format).toBe('webp');
  });

  it('de un WebP animado queda solo el primer cuadro', async () => {
    const cuadro = (fondo: string) => lienzo(60, 40, fondo).png().toBuffer();
    const animado = await sharp(
      [await cuadro('#f00'), await cuadro('#0f0'), await cuadro('#00f')],
      {
        join: { animated: true },
      },
    )
      .webp({ loop: 0, delay: [100, 100, 100] })
      .toBuffer();
    expect((await sharp(animado).metadata()).pages, 'la entrada tiene tres cuadros').toBe(3);

    const { datos, ancho, alto } = await sanitizarImagen(animado);
    const meta = await sharp(datos).metadata();
    expect(meta.pages ?? 1).toBe(1);
    expect(trozosRiff(datos)).not.toContain('ANIM');
    expect(trozosRiff(datos)).not.toContain('ANMF');
    expect([ancho, alto]).toEqual([60, 40]);
    // El primer cuadro es el rojo.
    const { data } = await sharp(datos).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(200);
    expect(data[1]).toBeLessThan(60);
  });

  it('el tope es por lado: una imagen de 1200 × 4000 queda con alto 1600', async () => {
    const { datos, ancho, alto } = await sanitizarImagen(await lienzo(1200, 4000).png().toBuffer());
    expect([ancho, alto]).toEqual([480, CONFIG_DOMINIO.FOTO_ALTO_MAX_PX]);
    const meta = await sharp(datos).metadata();
    expect([meta.width, meta.height]).toEqual([480, 1600]);
  });

  it('una imagen chica no se agranda', async () => {
    const { ancho, alto } = await sanitizarImagen(await lienzo(320, 240).jpeg().toBuffer());
    expect([ancho, alto]).toEqual([320, 240]);
  });
});
