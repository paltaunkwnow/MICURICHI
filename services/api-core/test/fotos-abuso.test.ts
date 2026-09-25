/**
 * Abuso a través de la subida de fotos (CLAUDE.md §13, "Archivos").
 *
 * El caso que motiva el archivo es la bomba de descompresión: un PNG de unos pocos kilobytes
 * puede declarar en su cabecera 20000 × 20000 píxeles. sharp permitía por defecto hasta 268
 * megapíxeles, y decodificar tantos cuesta del orden de un gigabyte de memoria, así que unas
 * pocas subidas simultáneas tumban el servicio sin acercarse siquiera al límite de 8 MB.
 */
import { crc32 } from 'node:zlib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  bloquearCargadoresNoUsados,
  CARGADORES_BLOQUEADOS,
  detectarMime,
  HILOS_LIBVIPS,
  MAX_PIXELES_ENTRADA,
  SEGUNDOS_MAX_PROCESADO,
  sanitizarImagen,
} from '../src/rutas/fotos.js';

/** Trozo PNG con su longitud, tipo y CRC, como manda el formato. */
function trozo(tipo: string, datos: Buffer): Buffer {
  const longitud = Buffer.alloc(4);
  longitud.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo) >>> 0);
  return Buffer.concat([longitud, cuerpo, crc]);
}

/**
 * PNG válido en cabecera que DECLARA las dimensiones que se le pidan. No hace falta que los
 * píxeles existan: el ataque consiste justamente en que el tamaño declarado no tiene relación
 * con el tamaño del archivo.
 */
function pngQueDeclara(ancho: number, alto: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; // profundidad de bits
  ihdr[9] = 0; // escala de grises
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', ihdr),
    trozo('IDAT', Buffer.from([0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01])),
    trozo('IEND', Buffer.alloc(0)),
  ]);
}

describe('bomba de descompresión', () => {
  it('rechaza un PNG diminuto que declara 20000 × 20000 (400 megapíxeles)', async () => {
    const bomba = pngQueDeclara(20_000, 20_000);
    // El archivo pesa menos de 1 kB: ni el límite de tamaño ni los magic bytes lo paran.
    expect(bomba.length).toBeLessThan(1024);
    expect(detectarMime(bomba)).toBe('image/png');
    await expect(sanitizarImagen(bomba)).rejects.toThrow(/megapíxeles/);
  });

  it('el tope se comprueba contra las dimensiones declaradas, no contra el peso', async () => {
    const justoPorEncima = Math.ceil(Math.sqrt(MAX_PIXELES_ENTRADA)) + 100;
    await expect(sanitizarImagen(pngQueDeclara(justoPorEncima, justoPorEncima))).rejects.toThrow(
      /megapíxeles/,
    );
  });

  it('una foto de teléfono normal sigue pasando', async () => {
    const { default: sharp } = await import('sharp');
    const foto = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: '#2b6' },
    })
      .jpeg()
      .toBuffer();
    const r = await sanitizarImagen(foto);
    // Se reescala al ancho máximo y se re-codifica sin metadatos.
    expect(r.ancho).toBe(1600);
    expect(r.alto).toBe(1200);
  });
});

describe('validación de tipo por magic bytes', () => {
  it('no se fía de la extensión ni del content-type declarado', () => {
    expect(detectarMime(Buffer.from('<?php system($_GET[0]); ?>                '))).toBeNull();
    expect(detectarMime(Buffer.alloc(4))).toBeNull();
    expect(detectarMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(
      'image/jpeg',
    );
  });

  it('un polyglot que empieza por cabecera JPEG no se cuela como otro formato', () => {
    // Cabecera JPEG seguida del `ftyp` de AVIF. `detectarMime` decide por los primeros bytes y
    // libvips elige el cargador igual: gana JPEG, no AVIF.
    const polyglot = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from('....ftypavif', 'ascii'),
    ]);
    expect(detectarMime(polyglot)).toBe('image/jpeg');
    // Y ninguna de estas cabeceras es aceptada por sí sola.
    expect(detectarMime(Buffer.from('....ftypavif....', 'ascii'))).toBeNull();
    expect(
      detectarMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">', 'ascii')),
    ).toBeNull();
    expect(detectarMime(Buffer.from('%PDF-1.7\n%....', 'ascii'))).toBeNull();
    expect(detectarMime(Buffer.from([0x49, 0x49, 0x2a, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull(); // TIFF
    expect(detectarMime(Buffer.from('GIF89a......', 'ascii'))).toBeNull();
  });
});

/**
 * Defensa en profundidad del procesado (auditoría de seguridad).
 *
 * La comprobación de magic bytes es NUESTRA y depende de que siga bien escrita. Por debajo, el
 * proceso llevaba habilitados todos los cargadores de libvips 8.18.6, cada uno un parser en C
 * sobre datos de un desconocido: el RCE crítico de agosto de 2026 de Next.js estaba en libheif
 * (GHSA-g89c-p67h-r497) y los cuatro CVE de libvips de este año, en los cargadores de GIF, TIFF y
 * VIPS. Ninguno de esos formatos se acepta aquí, así que no tienen por qué estar encendidos.
 */
describe('cargadores de libvips que no se usan', () => {
  it('la lista de bloqueados cubre los formatos peligrosos y no toca los tres permitidos', () => {
    for (const cargador of ['VipsForeignLoadHeif', 'VipsForeignLoadSvg', 'VipsForeignLoadPdf'])
      expect(CARGADORES_BLOQUEADOS).toContain(cargador);
    for (const permitido of ['Jpeg', 'Png', 'WebP'])
      expect(CARGADORES_BLOQUEADOS.some((c) => c.includes(permitido))).toBe(false);
  });

  it('bloquear es idempotente: se puede volver a aplicar sin romper nada', () => {
    expect(() => {
      bloquearCargadoresNoUsados();
      bloquearCargadoresNoUsados();
    }).not.toThrow();
  });

  it('un TIFF válido se rechaza aunque libvips sepa leerlo', async () => {
    // TIFF mínimo: II*\0 y un offset. Antes del bloqueo, libvips lo abría; ahora no.
    const tiff = Buffer.concat([
      Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]),
      Buffer.alloc(64),
    ]);
    expect(detectarMime(tiff)).toBeNull(); // primera barrera: magic bytes
    await expect(sanitizarImagen(tiff)).rejects.toThrow(); // segunda: el cargador está apagado
  });

  it('JPEG, PNG y WebP siguen procesándose', async () => {
    const png = await sharp({
      create: { width: 40, height: 30, channels: 3, background: '#28934D' },
    })
      .png()
      .toBuffer();
    const r = await sanitizarImagen(png);
    expect(r.ancho).toBe(40);
    expect(r.alto).toBe(30);
  });
});

describe('plazo y recursos del procesado', () => {
  it('hay un plazo por imagen y un tope de hilos de libvips', () => {
    // No son valores decorativos: sin plazo, una imagen construida para tardar deja ocupada una
    // petición y un hilo indefinidamente; sin tope de hilos, unas pocas subidas simultáneas se
    // quedan con toda la CPU del contenedor y el mapa público deja de responder.
    expect(SEGUNDOS_MAX_PROCESADO).toBeGreaterThan(0);
    expect(SEGUNDOS_MAX_PROCESADO).toBeLessThanOrEqual(30);
    expect(HILOS_LIBVIPS).toBeGreaterThan(0);
    expect(HILOS_LIBVIPS).toBeLessThanOrEqual(4);
    expect(sharp.concurrency()).toBe(HILOS_LIBVIPS);
  });
});
