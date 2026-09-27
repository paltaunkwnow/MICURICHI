'use client';

import { Camera, X } from 'lucide-react';
import {
  type KeyboardEvent,
  type Ref,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { ControladorCamara, destinoDelTab, type EstadoCamara, MENSAJES_CAMARA } from '@/lib/camara';
import { Aviso } from './Aviso';

/**
 * «Sacar foto» dentro de la página (plan 2026-09-26, pedidos D y F). La cámara se pide al tocar
 * el botón, se ve en un diálogo modal y se apaga al cerrarlo, al usar la foto o al desmontar el
 * componente: cambiar de paso, caducar la sesión o salir del formulario. La lógica vive en
 * `lib/camara.ts`; esto la muestra.
 */
export function CamaraReporte({
  deshabilitada,
  alUsarFoto,
}: {
  /** Con las fotos completas o una subiendo no se abre la cámara. */
  deshabilitada: boolean;
  /** La foto elegida y su miniatura local (`blob:`), que pasa a ser de quien la recibe. */
  alUsarFoto: (foto: File, vista: string) => void;
}) {
  // Crear el controlador no pide nada: la cámara se pide recién en `abrir()`.
  const [controlador] = useState(() => new ControladorCamara());
  const estado = useSyncExternalStore(controlador.suscribir, controlador.leer, controlador.leer);
  const boton = useRef<HTMLButtonElement>(null);
  const dialogo = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const disparo = useRef<HTMLButtonElement>(null);
  const usar = useRef<HTMLButtonElement>(null);
  const abierta =
    estado.fase === 'en-vivo' || estado.fase === 'capturando' || estado.fase === 'capturada';
  const flujo = 'flujo' in estado ? estado.flujo : null;
  /** Flujo del que el video ya mostró un cuadro: antes de eso, disparar daría una foto negra. */
  const [imagenDe, setImagenDe] = useState<MediaStream | null>(null);
  const conImagen = flujo !== null && imagenDe === flujo;

  // Desmontar apaga la cámara. `pagehide` cubre lo que no desmonta: recargar, cerrar la pestaña
  // o irse a otra página.
  useEffect(() => {
    const apagar = () => controlador.cerrar();
    window.addEventListener('pagehide', apagar);
    return () => {
      window.removeEventListener('pagehide', apagar);
      apagar();
    };
  }, [controlador]);

  // `showModal` deja inerte el resto de la página; al cerrar, el foco vuelve a «Sacar foto».
  const estabaAbierta = useRef(false);
  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (abierta && !d.open) d.showModal();
    if (!abierta && d.open) d.close();
    if (!abierta && estabaAbierta.current) boton.current?.focus();
    estabaAbierta.current = abierta;
  }, [abierta]);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (v.srcObject !== flujo) v.srcObject = flujo;
    if (!flujo) return;
    // Mudo por propiedad además de por atributo: es lo que Safari mira para reproducir en línea.
    v.muted = true;
    v.play().catch(() => {
      /* con `autoplay` ya arranca; esto es por si el navegador lo frenó */
    });
  }, [flujo]);

  useEffect(() => {
    if (estado.fase === 'en-vivo' && conImagen) disparo.current?.focus();
    if (estado.fase === 'capturada') usar.current?.focus();
  }, [estado.fase, conImagen]);

  return (
    <VistaCamara
      estado={estado}
      deshabilitada={deshabilitada}
      conImagen={conImagen}
      alImagen={(v) => setImagenDe(v.srcObject instanceof MediaStream ? v.srcObject : null)}
      alSacarFoto={() => void controlador.abrir()}
      alDisparar={() => void controlador.capturar(video.current)}
      alRepetir={() => controlador.repetir()}
      alUsar={() => {
        const usada = controlador.usar();
        if (usada) alUsarFoto(usada.foto, usada.vista);
      }}
      alCerrar={() => controlador.cerrar()}
      refs={{ boton, dialogo, video, disparo, usar }}
    />
  );
}

function textoDelEstado(estado: EstadoCamara, conImagen: boolean): string {
  switch (estado.fase) {
    case 'capturando':
      return 'Sacando la foto…';
    case 'capturada':
      return '¿Se ve bien el lugar? Si no, repetila.';
    case 'en-vivo':
      if (!conImagen) return 'Encendiendo la cámara…';
      return estado.fallo
        ? 'No pudimos sacar la foto. Probá de nuevo.'
        : 'Apuntá al lugar donde se junta el agua y tocá el botón redondo.';
    default:
      return '';
  }
}

/** Tab y Mayús+Tab no salen del diálogo. */
function atraparFoco(e: KeyboardEvent<HTMLDialogElement>) {
  if (e.key !== 'Tab') return;
  const enfocables = [
    ...e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), [href]'),
  ];
  const destino = destinoDelTab(
    enfocables.indexOf(document.activeElement as HTMLElement),
    enfocables.length,
    e.shiftKey,
  );
  if (destino === null) return;
  e.preventDefault();
  enfocables[destino]?.focus();
}

/**
 * Lo que se ve, según el estado. Aparte del contenedor para poder probar el marcado de cada
 * estado sin navegador.
 */
export function VistaCamara({
  estado,
  deshabilitada,
  conImagen,
  alImagen,
  alSacarFoto,
  alDisparar,
  alRepetir,
  alUsar,
  alCerrar,
  refs = {},
}: {
  estado: EstadoCamara;
  deshabilitada: boolean;
  /** El video ya mostró un cuadro del flujo actual. */
  conImagen: boolean;
  alImagen?: (video: HTMLVideoElement) => void;
  alSacarFoto: () => void;
  alDisparar: () => void;
  alRepetir: () => void;
  alUsar: () => void;
  alCerrar: () => void;
  refs?: {
    boton?: Ref<HTMLButtonElement>;
    dialogo?: Ref<HTMLDialogElement>;
    video?: Ref<HTMLVideoElement>;
    disparo?: Ref<HTMLButtonElement>;
    usar?: Ref<HTMLButtonElement>;
  };
}) {
  const abriendo = estado.fase === 'abriendo';
  // `aria-disabled` y no `disabled`: el foco tiene que poder volver a este botón al cerrar la
  // cámara, aunque la foto recién elegida se esté subiendo.
  const inactivo = deshabilitada || abriendo;
  const capturada = estado.fase === 'capturada' ? estado : null;

  return (
    <>
      <button
        ref={refs.boton}
        type="button"
        data-testid="boton-sacar-foto"
        className="btn btn-fantasma btn-bloque mt-4"
        aria-disabled={inactivo || undefined}
        aria-busy={abriendo || undefined}
        aria-describedby="ayuda-foto"
        onClick={() => {
          if (!inactivo) alSacarFoto();
        }}
      >
        <Camera size={18} aria-hidden="true" />
        {abriendo ? 'Abriendo la cámara…' : 'Sacar foto'}
      </button>
      {estado.fase === 'error' ? (
        <Aviso tono="err" role="alert" className="mt-3" data-testid="error-camara">
          {MENSAJES_CAMARA[estado.problema]}
        </Aviso>
      ) : null}

      <dialog
        ref={refs.dialogo}
        className="camara"
        aria-labelledby="titulo-camara"
        aria-describedby="estado-camara"
        onCancel={(e) => {
          // Escape o el gesto de «atrás»: se cierra siempre por el controlador, que apaga la
          // cámara. Si el navegador cerrara el diálogo por su cuenta, la cámara seguiría prendida.
          e.preventDefault();
          alCerrar();
        }}
        onKeyDown={atraparFoco}
      >
        <div className="flex flex-none items-center gap-3 px-4 py-3">
          <h2 id="titulo-camara" className="titular text-[19px] text-white">
            Sacar foto
          </h2>
          <button
            type="button"
            className="ml-auto grid h-12 w-12 flex-none place-items-center rounded-full bg-white/95 text-tinta-900"
            aria-label="Cerrar la cámara"
            onClick={alCerrar}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="camara-visor">
          <video
            ref={refs.video}
            className="camara-imagen"
            playsInline
            muted
            autoPlay
            hidden={capturada !== null}
            aria-label="Vista en vivo de la cámara"
            onLoadedData={(e) => alImagen?.(e.currentTarget)}
          />
          {capturada ? (
            // biome-ignore lint/performance/noImgElement: miniatura local (blob:) de la foto recién sacada
            <img
              className="camara-imagen"
              src={capturada.vista}
              alt="La foto que acabás de sacar"
            />
          ) : null}
        </div>
        <p
          id="estado-camara"
          className="flex-none px-5 pt-3 text-center text-[15.5px] text-white/90"
          aria-live="polite"
        >
          {textoDelEstado(estado, conImagen)}
        </p>
        <div className="flex flex-none items-center justify-center gap-3 px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">
          {capturada ? (
            <>
              <button
                type="button"
                className="btn btn-fantasma flex-1"
                data-testid="boton-repetir-foto"
                onClick={alRepetir}
              >
                Repetir
              </button>
              <button
                ref={refs.usar}
                type="button"
                className="btn flex-1"
                data-testid="boton-usar-foto"
                onClick={alUsar}
              >
                Usar esta foto
              </button>
            </>
          ) : (
            <button
              ref={refs.disparo}
              type="button"
              className="disparo h-[72px] w-[72px]"
              data-testid="boton-disparo"
              aria-label="Sacar la foto"
              disabled={estado.fase !== 'en-vivo' || !conImagen}
              onClick={alDisparar}
            />
          )}
        </div>
      </dialog>
    </>
  );
}
