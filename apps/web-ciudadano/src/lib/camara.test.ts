import { CONFIG_DOMINIO } from 'contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  CALIDAD_JPEG,
  type ClaseImageCapture,
  ControladorCamara,
  capturarFoto,
  destinoDelTab,
  type EntornoCamara,
  type LienzoMinimo,
  MENSAJES_CAMARA,
  medidasDeCaptura,
  problemaDelError,
  RESTRICCIONES_CAMARA,
} from './camara';

/** Pista de video falsa: cuenta los `stop()` y puede cortarse sola, como una cámara que se desenchufa. */
class PistaFalsa extends EventTarget {
  readonly kind = 'video';
  detenida = 0;
  stop() {
    this.detenida += 1;
  }
  cortar() {
    this.dispatchEvent(new Event('ended'));
  }
}

function flujoFalso(cuantas = 2) {
  const pistas = Array.from({ length: cuantas }, () => new PistaFalsa());
  const flujo = {
    getTracks: () => pistas,
    getVideoTracks: () => pistas.filter((p) => p.kind === 'video'),
  } as unknown as MediaStream;
  return { flujo, pistas };
}

function entornoCon(mediaDevices: EntornoCamara['mediaDevices']) {
  return (): EntornoCamara => ({ seguro: true, mediaDevices });
}

function controlador(
  entorno: () => EntornoCamara,
  capturar = vi.fn(async () => new Blob([new Uint8Array([0xff, 0xd8])], { type: 'image/jpeg' })),
) {
  const revocadas: string[] = [];
  let n = 0;
  const c = new ControladorCamara({
    entorno,
    capturar,
    crearVista: () => `blob:vista-${++n}`,
    revocarVista: (u) => revocadas.push(u),
  });
  return { c, capturar, revocadas };
}

function error(nombre: string) {
  return new DOMException('simulado', nombre);
}

const VIDEO = { videoWidth: 1920, videoHeight: 1080 } as HTMLVideoElement;

describe('pedir la cámara', () => {
  it('crear el controlador (lo que pasa al montar el formulario) no pide la cámara', () => {
    const getUserMedia = vi.fn();
    const entorno = vi.fn(entornoCon({ getUserMedia }));
    const { c } = controlador(entorno);
    expect(c.leer().fase).toBe('inactiva');
    expect(entorno).not.toHaveBeenCalled();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('al tocar «Sacar foto» pide la cámara trasera con 1920 × 1080 ideales y sin micrófono', async () => {
    const { flujo } = flujoFalso();
    const getUserMedia = vi.fn(async () => flujo);
    const { c } = controlador(entornoCon({ getUserMedia }));
    await c.abrir();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith(RESTRICCIONES_CAMARA);
    expect(RESTRICCIONES_CAMARA).toEqual({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });
    expect(c.leer()).toMatchObject({ fase: 'en-vivo', flujo });
  });

  it('mientras espera el permiso queda «abriendo»', async () => {
    let dar: (f: MediaStream) => void = () => {};
    const getUserMedia = vi.fn(() => new Promise<MediaStream>((r) => (dar = r)));
    const { c } = controlador(entornoCon({ getUserMedia }));
    const abriendo = c.abrir();
    expect(c.leer().fase).toBe('abriendo');
    dar(flujoFalso().flujo);
    await abriendo;
    expect(c.leer().fase).toBe('en-vivo');
  });

  it('sin navigator.mediaDevices va a la rama de navegador sin cámara, sin pedir nada', async () => {
    const { c } = controlador(() => ({ seguro: true, mediaDevices: undefined }));
    await c.abrir();
    expect(c.leer()).toEqual({ fase: 'error', problema: 'sin-soporte' });
    expect(MENSAJES_CAMARA['sin-soporte']).toContain(
      'Este navegador no permite usar la cámara: abrí la página en Chrome o Safari',
    );
  });

  it('en un contexto no seguro (http) lo dice en vez de culpar al navegador', async () => {
    const getUserMedia = vi.fn();
    const { c } = controlador(() => ({ seguro: false, mediaDevices: { getUserMedia } }));
    await c.abrir();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(c.leer()).toEqual({ fase: 'error', problema: 'inseguro' });
    expect(MENSAJES_CAMARA.inseguro).toMatch(/https/);
  });

  it.each([
    ['NotAllowedError', 'denegada'],
    ['SecurityError', 'denegada'],
    ['NotFoundError', 'sin-camara'],
    ['OverconstrainedError', 'sin-camara'],
    ['NotReadableError', 'ocupada'],
    ['AbortError', 'ocupada'],
    ['LoQueSea', 'desconocido'],
  ] as const)('%s se muestra como «%s»', async (nombre, problema) => {
    const getUserMedia = vi.fn(async () => {
      throw error(nombre);
    });
    const { c } = controlador(entornoCon({ getUserMedia }));
    await c.abrir();
    expect(c.leer()).toEqual({ fase: 'error', problema });
    expect(problemaDelError(error(nombre))).toBe(problema);
  });

  it('cada problema tiene su texto, y todos dejan claro que se puede seguir sin foto', () => {
    expect(MENSAJES_CAMARA.denegada).toMatch(/permiso/);
    expect(MENSAJES_CAMARA['sin-camara']).toContain('podés enviar el reporte sin foto');
    for (const [problema, texto] of Object.entries(MENSAJES_CAMARA)) {
      if (problema === 'cortada') continue;
      expect(texto, problema).toMatch(/sin foto/);
    }
    // Todos distintos: un texto genérico para todo no le dice a nadie qué hacer.
    expect(new Set(Object.values(MENSAJES_CAMARA)).size).toBe(Object.keys(MENSAJES_CAMARA).length);
  });

  it('volver a tocar «Sacar foto» después de un error lo vuelve a intentar', async () => {
    const { flujo } = flujoFalso();
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(error('NotAllowedError'))
      .mockResolvedValueOnce(flujo);
    const { c } = controlador(entornoCon({ getUserMedia }));
    await c.abrir();
    expect(c.leer().fase).toBe('error');
    await c.abrir();
    expect(c.leer().fase).toBe('en-vivo');
  });
});

describe('apagar la cámara', () => {
  it('al cerrar se detiene cada pista', async () => {
    const { flujo, pistas } = flujoFalso(2);
    const { c } = controlador(entornoCon({ getUserMedia: async () => flujo }));
    await c.abrir();
    c.cerrar();
    expect(pistas.map((p) => p.detenida)).toEqual([1, 1]);
    expect(c.leer()).toEqual({ fase: 'inactiva' });
  });

  it('si se cierra mientras se esperaba el permiso, el flujo que llega tarde se apaga igual', async () => {
    const { flujo, pistas } = flujoFalso(2);
    let dar: (f: MediaStream) => void = () => {};
    const getUserMedia = () => new Promise<MediaStream>((r) => (dar = r));
    const { c } = controlador(entornoCon({ getUserMedia }));
    const abriendo = c.abrir();
    c.cerrar();
    dar(flujo);
    await abriendo;
    expect(pistas.map((p) => p.detenida)).toEqual([1, 1]);
    expect(c.leer()).toEqual({ fase: 'inactiva' });
  });

  it('«Usar esta foto» entrega el archivo, conserva la miniatura y apaga la cámara', async () => {
    const { flujo, pistas } = flujoFalso(1);
    const { c, revocadas } = controlador(entornoCon({ getUserMedia: async () => flujo }));
    await c.abrir();
    await c.capturar(VIDEO);
    expect(c.leer()).toMatchObject({ fase: 'capturada', vista: 'blob:vista-1' });
    const usada = c.usar();
    expect(usada?.vista).toBe('blob:vista-1');
    expect(usada?.foto).toBeInstanceOf(File);
    expect(usada?.foto.type).toBe('image/jpeg');
    expect(pistas[0]?.detenida).toBe(1);
    // La miniatura pasa a ser de quien la usa: no se revoca acá.
    expect(revocadas).toEqual([]);
    expect(c.leer()).toEqual({ fase: 'inactiva' });
  });

  it('«Repetir» descarta la foto (y su miniatura) sin apagar la cámara', async () => {
    const { flujo, pistas } = flujoFalso(1);
    const { c, revocadas } = controlador(entornoCon({ getUserMedia: async () => flujo }));
    await c.abrir();
    await c.capturar(VIDEO);
    c.repetir();
    expect(revocadas).toEqual(['blob:vista-1']);
    expect(pistas[0]?.detenida).toBe(0);
    expect(c.leer()).toMatchObject({ fase: 'en-vivo', flujo });
  });

  it('cerrar con una foto sin usar revoca su miniatura', async () => {
    const { flujo } = flujoFalso(1);
    const { c, revocadas } = controlador(entornoCon({ getUserMedia: async () => flujo }));
    await c.abrir();
    await c.capturar(VIDEO);
    c.cerrar();
    expect(revocadas).toEqual(['blob:vista-1']);
  });

  it('si la cámara se corta sola, lo dice y apaga lo que quede', async () => {
    const { flujo, pistas } = flujoFalso(2);
    const { c } = controlador(entornoCon({ getUserMedia: async () => flujo }));
    await c.abrir();
    pistas[0]?.cortar();
    expect(c.leer()).toEqual({ fase: 'error', problema: 'cortada' });
    expect(pistas.map((p) => p.detenida)).toEqual([1, 1]);
  });

  it('si falla la captura, la cámara sigue abierta y avisa', async () => {
    const { flujo } = flujoFalso(1);
    const capturar = vi.fn(async () => {
      throw new Error('sin cuadro');
    });
    const { c } = controlador(entornoCon({ getUserMedia: async () => flujo }), capturar);
    await c.abrir();
    await c.capturar(VIDEO);
    expect(c.leer()).toMatchObject({ fase: 'en-vivo', fallo: true });
  });

  it('avisa a los suscriptores en cada cambio y deja de hacerlo al desuscribirse', async () => {
    const { flujo } = flujoFalso(1);
    const { c } = controlador(entornoCon({ getUserMedia: async () => flujo }));
    const oyente = vi.fn();
    const soltar = c.suscribir(oyente);
    await c.abrir();
    expect(oyente).toHaveBeenCalledTimes(2); // abriendo, en-vivo
    soltar();
    c.cerrar();
    expect(oyente).toHaveBeenCalledTimes(2);
  });
});

describe('sacar la foto', () => {
  function lienzoFalso() {
    const dibujos: unknown[][] = [];
    const pedidos: { tipo: string; calidad: number }[] = [];
    const lienzo: LienzoMinimo = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: (...args: unknown[]) => dibujos.push(args) }),
      toBlob: (cb, tipo, calidad) => {
        pedidos.push({ tipo, calidad });
        cb(new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: tipo }));
      },
    };
    return { lienzo, dibujos, pedidos };
  }

  it('medidas: entra en 1600 por lado sin deformarse y nunca agranda', () => {
    expect(medidasDeCaptura(1920, 1080)).toEqual({ ancho: 1600, alto: 900 });
    expect(medidasDeCaptura(1080, 1920)).toEqual({ ancho: 900, alto: 1600 });
    expect(medidasDeCaptura(4000, 3000)).toEqual({ ancho: 1600, alto: 1200 });
    expect(medidasDeCaptura(640, 480)).toEqual({ ancho: 640, alto: 480 });
    expect(Math.max(CONFIG_DOMINIO.FOTO_ANCHO_MAX_PX, CONFIG_DOMINIO.FOTO_ALTO_MAX_PX)).toBe(1600);
  });

  it('sin ImageCapture: dibuja el cuadro del video escalado y lo pide en JPEG 0,9', async () => {
    const { lienzo, dibujos, pedidos } = lienzoFalso();
    const foto = await capturarFoto({ video: VIDEO }, { crearLienzo: () => lienzo });
    expect(foto.type).toBe('image/jpeg');
    expect([lienzo.width, lienzo.height]).toEqual([1600, 900]);
    expect(dibujos).toEqual([[VIDEO, 0, 0, 1600, 900]]);
    expect(pedidos).toEqual([{ tipo: 'image/jpeg', calidad: CALIDAD_JPEG }]);
    expect(CALIDAD_JPEG).toBe(0.9);
  });

  it('con ImageCapture usa takePhoto y achica a 1600 por lado lo que venga más grande', async () => {
    const { lienzo, dibujos } = lienzoFalso();
    const grande = new Blob([new Uint8Array(10)], { type: 'image/jpeg' });
    const tomar = vi.fn(async () => grande);
    const cerrarMapa = vi.fn();
    const mapa = { width: 4000, height: 3000, close: cerrarMapa };
    const pista = new PistaFalsa() as unknown as MediaStreamTrack;
    const IC = vi.fn(function (this: { takePhoto: typeof tomar }) {
      this.takePhoto = tomar;
    }) as unknown as ClaseImageCapture;
    const foto = await capturarFoto(
      { video: VIDEO, pista },
      {
        ImageCapture: IC,
        createImageBitmap: async () => mapa,
        crearLienzo: () => lienzo,
      },
    );
    expect(IC).toHaveBeenCalledWith(pista);
    expect(tomar).toHaveBeenCalledTimes(1);
    expect(dibujos).toEqual([[mapa, 0, 0, 1600, 1200]]);
    expect(cerrarMapa).toHaveBeenCalled();
    expect(foto.type).toBe('image/jpeg');
  });

  it('con ImageCapture y una foto JPEG que ya entra, la manda tal cual', async () => {
    const chica = new Blob([new Uint8Array(10)], { type: 'image/jpeg' });
    const IC = vi.fn(function (this: { takePhoto: () => Promise<Blob> }) {
      this.takePhoto = async () => chica;
    }) as unknown as ClaseImageCapture;
    const crearLienzo = vi.fn();
    const foto = await capturarFoto(
      { video: VIDEO, pista: new PistaFalsa() as unknown as MediaStreamTrack },
      {
        ImageCapture: IC,
        createImageBitmap: async () => ({ width: 1280, height: 720 }),
        crearLienzo,
      },
    );
    expect(foto).toBe(chica);
    expect(crearLienzo).not.toHaveBeenCalled();
  });

  it('si takePhoto falla, cae al cuadro del video', async () => {
    const { lienzo, dibujos } = lienzoFalso();
    const IC = vi.fn(function (this: { takePhoto: () => Promise<Blob> }) {
      this.takePhoto = async () => {
        throw error('UnknownError');
      };
    }) as unknown as ClaseImageCapture;
    const foto = await capturarFoto(
      { video: VIDEO, pista: new PistaFalsa() as unknown as MediaStreamTrack },
      {
        ImageCapture: IC,
        createImageBitmap: async () => ({ width: 1, height: 1 }),
        crearLienzo: () => lienzo,
      },
    );
    expect(foto.type).toBe('image/jpeg');
    expect(dibujos).toEqual([[VIDEO, 0, 0, 1600, 900]]);
  });

  it('sin cuadro de video (todavía no llegó la imagen) no inventa una foto vacía', async () => {
    const { lienzo } = lienzoFalso();
    await expect(
      capturarFoto(
        { video: { videoWidth: 0, videoHeight: 0 } as HTMLVideoElement },
        { crearLienzo: () => lienzo },
      ),
    ).rejects.toThrow();
  });
});

describe('foco atrapado en el diálogo', () => {
  it('Tab desde el último vuelve al primero y Mayús+Tab desde el primero va al último', () => {
    expect(destinoDelTab(2, 3, false)).toBe(0);
    expect(destinoDelTab(0, 3, true)).toBe(2);
    // Foco fuera del diálogo (índice -1): se lo trae adentro.
    expect(destinoDelTab(-1, 3, false)).toBe(0);
    expect(destinoDelTab(-1, 3, true)).toBe(2);
    // En el medio, el navegador se encarga.
    expect(destinoDelTab(1, 3, false)).toBeNull();
    expect(destinoDelTab(1, 3, true)).toBeNull();
    // Sin nada enfocable no hay adónde ir.
    expect(destinoDelTab(-1, 0, false)).toBeNull();
  });
});
