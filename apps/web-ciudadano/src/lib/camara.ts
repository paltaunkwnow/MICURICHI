import { CONFIG_DOMINIO } from 'contracts';

/**
 * La cámara del reporte, sin React: qué se pide, cómo se saca la foto, qué se dice cuando algo
 * falla y cuándo se apaga. El componente (`componentes/CamaraReporte.tsx`) solo lo muestra.
 *
 * La foto sale solo de la cámara, dentro de la página (plan 2026-09-26, pedido D). Con un input de
 * archivo, aun pidiendo la cámara con su atributo de captura, el escritorio y algunos navegadores
 * internos abren la galería, así que no queda ninguno. Es una barrera de la interfaz, no una
 * garantía: quien tenga la sesión puede mandar cualquier imagen a la API igual (CLAUDE.md §13).
 *
 * Y la cámara se pide solo al tocar «Sacar foto», nunca al cargar (pedido F): crear el
 * controlador no toca `navigator`; lo hace `abrir()`.
 */

/**
 * Lo que se pide a la cámara. `ideal` y no `exact`: una computadora sin cámara trasera usa la que
 * tenga, en vez de fallar. Sin ancho ni alto, Chrome entrega 640 × 480.
 */
export const RESTRICCIONES_CAMARA = {
  audio: false,
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
} as const satisfies MediaStreamConstraints;

/** Lado máximo de la foto que sale del teléfono: el mismo tope por lado que aplica el servidor. */
export const LADO_MAX_PX = Math.min(
  CONFIG_DOMINIO.FOTO_ANCHO_MAX_PX,
  CONFIG_DOMINIO.FOTO_ALTO_MAX_PX,
);

/**
 * Se manda JPEG y el servidor la convierte a WebP: Safari en iPhone no codifica WebP desde un
 * lienzo, y 0,9 deja margen para esa segunda compresión.
 */
export const CALIDAD_JPEG = 0.9;

export type ProblemaCamara =
  | 'inseguro'
  | 'sin-soporte'
  | 'denegada'
  | 'sin-camara'
  | 'ocupada'
  | 'cortada'
  | 'desconocido';

/**
 * Un texto por caso, porque lo que hay que hacer es distinto en cada uno. Todos dicen que el
 * reporte se puede enviar sin foto (la foto es opcional), salvo la cámara que se cortó, donde
 * basta con volver a abrirla.
 */
export const MENSAJES_CAMARA: Record<ProblemaCamara, string> = {
  inseguro:
    'La cámara solo funciona si la página se abre con una conexión segura (https). Igual podés enviar el reporte sin foto.',
  'sin-soporte':
    'Este navegador no permite usar la cámara: abrí la página en Chrome o Safari. Igual podés enviar el reporte sin foto.',
  denegada:
    'No diste permiso para usar la cámara. Para sacar la foto, habilitala en los permisos del sitio de tu navegador y volvé a tocar «Sacar foto». También podés enviar el reporte sin foto.',
  'sin-camara':
    'No encontramos ninguna cámara en este equipo, pero podés enviar el reporte sin foto.',
  ocupada:
    'La cámara está ocupada por otra aplicación. Cerrala y volvé a tocar «Sacar foto», o enviá el reporte sin foto.',
  cortada: 'Se cortó la cámara. Volvé a tocar «Sacar foto» para abrirla de nuevo.',
  desconocido: 'No pudimos abrir la cámara. Probá de nuevo o enviá el reporte sin foto.',
};

/** Lo que se lee del navegador para abrir la cámara. Aparte, para poder simularlo en las pruebas. */
export interface EntornoCamara {
  /** `window.isSecureContext`: sin https (o localhost) el navegador ni ofrece `mediaDevices`. */
  seguro: boolean;
  mediaDevices: Pick<MediaDevices, 'getUserMedia'> | undefined;
}

export function entornoDelNavegador(): EntornoCamara {
  return { seguro: window.isSecureContext, mediaDevices: navigator.mediaDevices };
}

/** Nombre del error de `getUserMedia` (DOMException), incluidos los nombres viejos de Chrome. */
export function problemaDelError(error: unknown): ProblemaCamara {
  const nombre =
    typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
  switch (nombre) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denegada';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'sin-camara';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'ocupada';
    default:
      return 'desconocido';
  }
}

export function detenerPistas(flujo: MediaStream | null | undefined): void {
  for (const pista of flujo?.getTracks() ?? []) pista.stop();
}

/** Medidas que entran en `max` × `max` sin deformar la imagen. Nunca agranda. */
export function medidasDeCaptura(
  ancho: number,
  alto: number,
  max: number = LADO_MAX_PX,
): { ancho: number; alto: number } {
  const escala = Math.min(1, max / Math.max(ancho, alto));
  return { ancho: Math.round(ancho * escala), alto: Math.round(alto * escala) };
}

// ------------------------------------------------------------------ sacar la foto

/** Lo mínimo de un `<canvas>` que usa la captura. */
export interface LienzoMinimo {
  width: number;
  height: number;
  getContext(tipo: '2d'): {
    drawImage(imagen: CanvasImageSource, x: number, y: number, w: number, h: number): void;
  } | null;
  toBlob(alTerminar: (b: Blob | null) => void, tipo: string, calidad: number): void;
}

/** Lo mínimo de un `ImageBitmap`: sus medidas y, si lo tiene, `close()` para liberar memoria. */
interface MapaDeBits {
  width: number;
  height: number;
  close?: () => void;
}

export type ClaseImageCapture = new (pista: MediaStreamTrack) => { takePhoto(): Promise<Blob> };

export interface DependenciasCaptura {
  /** Solo existe en Chrome y derivados. Donde no está, se usa el cuadro del video. */
  ImageCapture?: ClaseImageCapture;
  createImageBitmap?: (foto: Blob) => Promise<MapaDeBits>;
  crearLienzo: () => LienzoMinimo;
}

export interface FuenteCaptura {
  video: Pick<HTMLVideoElement, 'videoWidth' | 'videoHeight'>;
  pista?: MediaStreamTrack;
}

function dependenciasDelNavegador(): DependenciasCaptura {
  const g = globalThis as { ImageCapture?: ClaseImageCapture };
  return {
    ImageCapture: g.ImageCapture,
    createImageBitmap:
      typeof createImageBitmap === 'function' ? (b) => createImageBitmap(b) : undefined,
    crearLienzo: () => document.createElement('canvas'),
  };
}

function dibujar(
  imagen: CanvasImageSource,
  medidas: { ancho: number; alto: number },
  crearLienzo: () => LienzoMinimo,
): Promise<Blob> {
  const lienzo = crearLienzo();
  lienzo.width = medidas.ancho;
  lienzo.height = medidas.alto;
  const ctx = lienzo.getContext('2d');
  if (!ctx) return Promise.reject(new Error('El navegador no dejó dibujar la foto.'));
  ctx.drawImage(imagen, 0, 0, medidas.ancho, medidas.alto);
  return new Promise((resolver, rechazar) =>
    lienzo.toBlob(
      (b) => (b ? resolver(b) : rechazar(new Error('El navegador no pudo guardar la foto.'))),
      'image/jpeg',
      CALIDAD_JPEG,
    ),
  );
}

/**
 * Con `ImageCapture.takePhoto()` sale la foto del sensor, con más detalle que un cuadro del
 * video; se achica a `LADO_MAX_PX` por lado para no mandar 5 MB por datos móviles cuando el
 * servidor la va a dejar en 1600 igual. Si no existe o falla (hay teléfonos donde falla), se
 * dibuja el cuadro del video en un lienzo.
 */
export async function capturarFoto(
  fuente: FuenteCaptura,
  deps: DependenciasCaptura = dependenciasDelNavegador(),
): Promise<Blob> {
  if (deps.ImageCapture && deps.createImageBitmap && fuente.pista) {
    try {
      const foto = await new deps.ImageCapture(fuente.pista).takePhoto();
      const mapa = await deps.createImageBitmap(foto);
      try {
        const medidas = medidasDeCaptura(mapa.width, mapa.height);
        const entra =
          medidas.ancho === mapa.width &&
          foto.type === 'image/jpeg' &&
          foto.size <= CONFIG_DOMINIO.FOTO_MAX_BYTES;
        return entra
          ? foto
          : await dibujar(mapa as unknown as CanvasImageSource, medidas, deps.crearLienzo);
      } finally {
        mapa.close?.();
      }
    } catch {
      // Se sigue con el cuadro del video.
    }
  }
  const { videoWidth, videoHeight } = fuente.video;
  if (!videoWidth || !videoHeight) throw new Error('Todavía no llegó la imagen de la cámara.');
  return dibujar(
    fuente.video as CanvasImageSource,
    medidasDeCaptura(videoWidth, videoHeight),
    deps.crearLienzo,
  );
}

// ------------------------------------------------------------------ el controlador

export type EstadoCamara =
  | { fase: 'inactiva' }
  | { fase: 'abriendo' }
  | { fase: 'en-vivo'; flujo: MediaStream; fallo?: boolean }
  | { fase: 'capturando'; flujo: MediaStream }
  | { fase: 'capturada'; flujo: MediaStream; foto: Blob; vista: string }
  | { fase: 'error'; problema: ProblemaCamara };

export interface DependenciasCamara {
  entorno: () => EntornoCamara;
  capturar: (fuente: FuenteCaptura) => Promise<Blob>;
  /** `URL.createObjectURL`: la miniatura sale de la memoria del teléfono, sin pedir nada. */
  crearVista: (foto: Blob) => string;
  revocarVista: (url: string) => void;
}

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Estado de la cámara y sus transiciones. Cada camino que deja de mostrarla (cerrar, usar la
 * foto, un corte, un cierre mientras se esperaba el permiso) pasa por `detenerPistas`: una
 * cámara que queda encendida es la lucecita prendida que asusta a cualquiera.
 */
export class ControladorCamara {
  private estado: EstadoCamara = { fase: 'inactiva' };
  private readonly oyentes = new Set<() => void>();
  /** Cada `abrir()` y cada `cerrar()` cambia el turno: un permiso que llega tarde ya no vale. */
  private turno = 0;
  private readonly deps: DependenciasCamara;

  constructor(deps: Partial<DependenciasCamara> = {}) {
    this.deps = {
      entorno: entornoDelNavegador,
      capturar: (f) => capturarFoto(f),
      crearVista: (b) => URL.createObjectURL(b),
      revocarVista: (u) => URL.revokeObjectURL(u),
      ...deps,
    };
  }

  /** Para `useSyncExternalStore`: devuelve siempre el mismo objeto mientras no cambie. */
  leer = (): EstadoCamara => this.estado;

  suscribir = (oyente: () => void): (() => void) => {
    this.oyentes.add(oyente);
    return () => {
      this.oyentes.delete(oyente);
    };
  };

  private poner(estado: EstadoCamara) {
    this.estado = estado;
    for (const o of this.oyentes) o();
  }

  private flujoActual(): MediaStream | null {
    return 'flujo' in this.estado ? this.estado.flujo : null;
  }

  async abrir(): Promise<void> {
    if (this.estado.fase !== 'inactiva' && this.estado.fase !== 'error') return;
    const turno = ++this.turno;
    const entorno = this.deps.entorno();
    if (!entorno.seguro) return this.poner({ fase: 'error', problema: 'inseguro' });
    if (typeof entorno.mediaDevices?.getUserMedia !== 'function') {
      return this.poner({ fase: 'error', problema: 'sin-soporte' });
    }
    this.poner({ fase: 'abriendo' });
    let flujo: MediaStream;
    try {
      flujo = await entorno.mediaDevices.getUserMedia(RESTRICCIONES_CAMARA);
    } catch (e) {
      if (turno === this.turno) this.poner({ fase: 'error', problema: problemaDelError(e) });
      return;
    }
    if (turno !== this.turno) {
      // Se cerró (o se desmontó) mientras el navegador preguntaba: se apaga sin mostrarla.
      detenerPistas(flujo);
      return;
    }
    for (const pista of flujo.getTracks()) {
      pista.addEventListener('ended', () => {
        if (this.flujoActual() !== flujo) return;
        this.soltar();
        this.poner({ fase: 'error', problema: 'cortada' });
      });
    }
    this.poner({ fase: 'en-vivo', flujo });
  }

  async capturar(video: FuenteCaptura['video'] | null): Promise<void> {
    if (this.estado.fase !== 'en-vivo' || !video) return;
    const { flujo } = this.estado;
    const turno = this.turno;
    this.poner({ fase: 'capturando', flujo });
    try {
      const foto = await this.deps.capturar({ video, pista: flujo.getVideoTracks()[0] });
      if (turno !== this.turno || this.flujoActual() !== flujo) return;
      this.poner({ fase: 'capturada', flujo, foto, vista: this.deps.crearVista(foto) });
    } catch {
      if (turno !== this.turno || this.flujoActual() !== flujo) return;
      this.poner({ fase: 'en-vivo', flujo, fallo: true });
    }
  }

  repetir(): void {
    if (this.estado.fase !== 'capturada') return;
    this.deps.revocarVista(this.estado.vista);
    this.poner({ fase: 'en-vivo', flujo: this.estado.flujo });
  }

  /**
   * Entrega la foto como archivo y apaga la cámara. La miniatura (`vista`) pasa a ser de quien la
   * recibe, que la revoca cuando ya no la muestra.
   */
  usar(): { foto: File; vista: string } | null {
    if (this.estado.fase !== 'capturada') return null;
    const { foto, vista, flujo } = this.estado;
    const tipo = foto.type || 'image/jpeg';
    const archivo = new File([foto], `foto.${EXTENSION[tipo] ?? 'jpg'}`, { type: tipo });
    this.turno += 1;
    detenerPistas(flujo);
    this.poner({ fase: 'inactiva' });
    return { foto: archivo, vista };
  }

  /** Apaga la cámara y descarta lo que no se usó. Se puede llamar siempre, las veces que sea. */
  cerrar(): void {
    this.turno += 1;
    if (this.estado.fase === 'inactiva') return;
    this.soltar();
    this.poner({ fase: 'inactiva' });
  }

  private soltar() {
    if (this.estado.fase === 'capturada') this.deps.revocarVista(this.estado.vista);
    detenerPistas(this.flujoActual());
  }
}

/**
 * Adónde va el foco con Tab dentro del diálogo, dado el índice del elemento enfocado entre los
 * enfocables (`-1` si el foco quedó afuera). `null`: el navegador lo resuelve solo.
 */
export function destinoDelTab(actual: number, total: number, atras: boolean): number | null {
  if (total === 0) return null;
  if (actual === -1) return atras ? total - 1 : 0;
  if (atras && actual === 0) return total - 1;
  if (!atras && actual === total - 1) return 0;
  return null;
}
