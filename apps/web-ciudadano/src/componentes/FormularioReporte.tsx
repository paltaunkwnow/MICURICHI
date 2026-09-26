'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BANDAS,
  CONFIG_DOMINIO,
  calcularSeveridad,
  ETIQUETAS,
  PROFUNDIDADES,
  type ReporteCrearEntrada,
  ReporteCrearSchema,
  type ResolverRespuesta,
  SUMIDERO_CERCANO,
  SUMIDERO_ESTADOS,
} from 'contracts';
import { Camera, Check, ChevronLeft, Copy, Navigation, Plus, ShieldCheck, X } from 'lucide-react';
import type { Map as MapaGl } from 'maplibre-gl';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { type FieldErrors, useForm } from 'react-hook-form';
import { crearReporte, nuevaClaveIdempotencia, resolverPunto, subirFoto } from '@/lib/api';
import {
  type Borrador,
  borradorTieneContenido,
  type FotoDelBorrador,
  guardarBorrador,
  leerBorrador,
  olvidarBorrador,
} from '@/lib/borrador';
import { centroDeCiudad } from '@/lib/ciudad';
import { useCiudad } from '@/lib/ciudad-contexto';
import {
  detallesDeError,
  esCuotaAgotada,
  esSesionCaducada,
  mensajeDeEnvio,
  mensajeDeError,
  mensajeDeFoto,
} from '@/lib/errores';
import {
  contadorDescripcion,
  etiquetaDistrito,
  etiquetaUnidadVecinal,
  horaCorta,
  urlFotoRelativa,
} from '@/lib/formato';
import {
  armarEnvio,
  campoFechaDesdeIso,
  camposSinLugar,
  centroDelPaso1,
  type EstadoParaAvanzar,
  isoDesdeCampoFecha,
  limitesFechaEvento,
  MENSAJE_FALTA_UBICACION,
  mosaicoDeFotos,
  PASOS_REPORTE as PASOS,
  pasoDelError,
  problemaFechaEvento,
  puedeAvanzar,
  respuestasSumidero,
  type Sumidero,
  type Ubicacion,
  ubicacionDelEnlace,
  ubicacionDesdeGps,
  valoresIniciales,
} from '@/lib/formulario-reporte';
import { motivoDeRechazoDeFoto } from '@/lib/foto';
import { leerCoordenadas } from '@/lib/geo';
import { recordarReporte } from '@/lib/misReportes';
import { refrescarSesion, useSesion } from '@/lib/sesion';
import { AccesoRequerido } from './AccesoRequerido';
import { Aviso } from './Aviso';
import { ChipSeveridad } from './ChipSeveridad';
import { ErrorDeCarga } from './ErrorDeCarga';
import { MapaDiferido } from './MapaDiferido';
import { useToast } from './Toast';

const FRECUENCIAS = ['primera_vez', 'ocasional', 'cada_lluvia_fuerte', 'permanente'] as const;
const CAUSAS = [
  'desconocida',
  'sumidero_tapado',
  'falta_sumidero',
  'hundimiento_pavimento',
  'contrapendiente',
  'colector_saturado',
  'desborde_cauce',
] as const;
const UBICACION_TIPOS = ['via_publica', 'vivienda_o_predio', 'otro'] as const;

/** Puntaje máximo de la fórmula vigente: el «N/12» del resumen no puede quedarse en otra versión. */
const PUNTAJE_MAX = Math.max(...BANDAS.map((b) => b.max));
/**
 * Quietud del mapa antes de preguntar en qué unidad vecinal cayó el punto. Sin esta pausa, cada
 * sacudida del pulgar sería una llamada a `POST /geo/v1/resolver`, que tiene límite por IP.
 */
const ESPERA_RESOLVER_MS = 600;
/**
 * Margen para el `change` de la cámara una vez que la página recupera el foco: en algunos
 * teléfonos llega un poco después. Pasado el margen se quita el espacio vacío; si llegó una foto,
 * su subida ya se ve aparte.
 */
const ESPERA_REGRESO_CAMARA_MS = 1000;
const MAX_FOTOS = CONFIG_DOMINIO.FOTOS_MAX_POR_REPORTE;
const TEXTO_FOTOS_COMPLETAS = `Ya llegaste al máximo de ${MAX_FOTOS} fotos. Quitá una si querés cambiarla.`;
const TEXTO_UBICACION_APROXIMADA =
  'Tu ubicación es aproximada; mové el mapa hasta el punto exacto.';

/** Opción en tarjeta con radio real escondido: el aspecto es del prototipo, el control es nativo. */
function Opcion({
  nombre,
  valor,
  texto,
  detalle,
  marcado,
  onCambio,
}: {
  nombre: string;
  valor: string;
  texto: string;
  detalle?: string;
  marcado: boolean;
  onCambio: () => void;
}) {
  return (
    <label className="opc">
      <input
        type="radio"
        className="control-invisible"
        name={nombre}
        value={valor}
        checked={marcado}
        onChange={onCambio}
      />
      <span className="r" aria-hidden="true" />
      <span className={marcado ? 'font-semibold' : ''}>{texto}</span>
      {detalle ? <span className="cm">{detalle}</span> : null}
    </label>
  );
}

/** Igual que `Opcion`, pero en pastilla: para respuestas cortas, como el tipo de lugar. */
function Pastilla({
  nombre,
  valor,
  texto,
  marcado,
  onCambio,
}: {
  nombre: string;
  valor: string;
  texto: string;
  marcado: boolean;
  onCambio: () => void;
}) {
  return (
    <label className="chip">
      <input
        type="radio"
        className="control-invisible"
        name={nombre}
        value={valor}
        checked={marcado}
        onChange={onCambio}
      />
      {texto}
    </label>
  );
}

/**
 * Mensaje de error de un campo, en su lugar de la pantalla. `role="alert"` para que se anuncie al
 * aparecer, y `data-campo-con-error` para que, tras un rechazo, la vista pueda ir hasta él.
 */
function MensajeDeCampo({ campo, mensaje }: { campo: string; mensaje?: string | null }) {
  if (!mensaje) return null;
  return (
    <p
      id={`error-${campo}`}
      className="error"
      role="alert"
      data-testid={`error-campo-${campo}`}
      data-campo-con-error=""
    >
      {mensaje}
    </p>
  );
}

/**
 * «×» de una miniatura. El círculo se ve de 28 px, pero se toca en 48 × 48 (CLAUDE.md §14.4):
 * antes medía 24 px y en un teléfono quitar una foto era cuestión de puntería.
 */
function BotonQuitar({ etiqueta, onClick }: { etiqueta: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="absolute top-0 right-0 grid h-12 w-12 place-items-center"
      aria-label={etiqueta}
      onClick={onClick}
    >
      <span
        aria-hidden="true"
        className="grid h-7 w-7 place-items-center rounded-full bg-white/95 text-[15px] font-bold shadow-sm"
      >
        ×
      </span>
    </button>
  );
}

/** Texto del error de un campo cualquiera, incluso uno que el tipo del formulario no conoce. */
function mensajeDe(errores: FieldErrors<ReporteCrearEntrada>, campo: string): string {
  const e = (errores as Record<string, { message?: unknown } | undefined>)[campo];
  return typeof e?.message === 'string' ? e.message : '';
}

export function FormularioReporte() {
  const parametros = useSearchParams();
  const toast = useToast();
  const cliente = useQueryClient();
  /** Centro del mapa sin punto elegido, locale y zona de las horas: los de esta instalación. */
  const ciudad = useCiudad();
  const {
    usuario,
    cargando: comprobandoSesion,
    errorDeCarga: errorSesion,
    reintentando: reintentandoSesion,
    reintentar: reintentarSesion,
    puedeReportarDesde,
  } = useSesion();
  /**
   * La sesión se fue a mitad del formulario. Se guarda aparte de `usuario` porque son dos cosas
   * distintas: «nunca tuviste cuenta» y «la tenías y venció mientras escribías». La segunda
   * merece otro texto, y sobre todo no puede llevarse por delante lo ya escrito.
   */
  const [sesionCaducada, setSesionCaducada] = useState(false);
  const [paso, setPaso] = useState(1);
  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(null);
  const [resuelto, setResuelto] = useState<ResolverRespuesta | null>(null);
  const [resolviendo, setResolviendo] = useState(false);
  const [errorUbicacion, setErrorUbicacion] = useState<string | null>(null);
  /** Aviso que no es error: la ubicación del teléfono llegó con kilómetros de imprecisión. */
  const [avisoUbicacion, setAvisoUbicacion] = useState<string | null>(null);
  const [mostrarCoordenadas, setMostrarCoordenadas] = useState(false);
  const [latTexto, setLatTexto] = useState('');
  const [lonTexto, setLonTexto] = useState('');
  const [fotos, setFotos] = useState<FotoDelBorrador[]>([]);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  const [creado, setCreado] = useState<{ id: string } | null>(null);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [retomado, setRetomado] = useState(false);
  /** Se abrió la cámara para «otro detalle» y todavía no volvió con una foto. */
  const [esperandoCamara, setEsperandoCamara] = useState(false);
  /**
   * El borrador ya se leyó. El mapa del paso 1 no se monta antes: se crea UNA vez con su centro, y
   * si naciera en el centro por defecto mientras el borrador trae otro punto, el marcador clavado
   * en el medio de la pantalla mostraría un lugar distinto del que se va a enviar.
   */
  const [borradorLeido, setBorradorLeido] = useState(false);
  /** Tras un rechazo: llevar la vista hasta el primer mensaje de error del paso. */
  const [mostrarError, setMostrarError] = useState(false);
  const mapa = useRef<MapaGl | null>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const camara = useRef<HTMLInputElement | null>(null);
  const ubicacionRef = useRef<Ubicacion | null>(null);
  ubicacionRef.current = ubicacion;
  const pasoRef = useRef(paso);
  pasoRef.current = paso;

  /**
   * «Me pasa a mí»: el detalle de un punto abre este flujo ya ubicado ahí. Si el reporte nuevo
   * cae dentro del radio de recurrencia, el sistema lo agrupa solo en el mismo punto crítico
   * (CLAUDE.md §9.2) — no hace falta un endpoint aparte para «sumarse».
   */
  const enlace = ubicacionDelEnlace(parametros?.get('lat'), parametros?.get('lon'));

  const form = useForm<ReporteCrearEntrada>({
    resolver: zodResolver(ReporteCrearSchema),
    mode: 'onSubmit',
    defaultValues: valoresIniciales(),
  });
  const valores = form.watch();

  /** Ubicación para la que vale `resuelto` (la misma referencia): esa no se vuelve a preguntar. */
  const resueltoPara = useRef<Ubicacion | null>(null);
  const dejarDeVigilarCamara = useRef<(() => void) | null>(null);
  useEffect(() => () => dejarDeVigilarCamara.current?.(), []);

  // El mapa del paso 1 se destruye al salir del paso: su referencia no puede quedar apuntando a un
  // mapa muerto, que el GPS o las coordenadas intentarían mover.
  useEffect(() => {
    if (paso !== 1) mapa.current = null;
  }, [paso]);

  /**
   * Una clave por formulario, estable entre reintentos: si el envío se corta y el vecino vuelve a
   * darle, el servidor devuelve el reporte ya creado en vez de duplicarlo. Se restaura con el
   * borrador para que eso siga valiendo aunque la página se haya recargado por el medio.
   */
  const claveEnvio = useRef<string | null>(null);
  claveEnvio.current ??= nuevaClaveIdempotencia();

  // ------------------------------------------------------------- borrador
  // Se restaura una sola vez, al montar. Si se restaurara en cada render, cada tecla del vecino
  // competiría con lo guardado y el formulario pelearía consigo mismo.
  const restaurado = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: se restaura una sola vez, al montar (ver arriba)
  useEffect(() => {
    if (restaurado.current) return;
    restaurado.current = true;
    const b = leerBorrador();
    if (b && borradorTieneContenido(b)) {
      claveEnvio.current = b.clave;
      form.reset({ ...form.getValues(), ...b.valores });
      setFotos(b.fotos);
      if (b.ubicacion && b.resuelto) {
        resueltoPara.current = b.ubicacion;
        setUbicacion(b.ubicacion);
        setResuelto(b.resuelto as ResolverRespuesta);
      } else if (b.ubicacion) {
        // Se guardó mientras se resolvía: se vuelve a preguntar en vez de dejar «Continuar» trabado.
        fijarUbicacion(b.ubicacion);
      }
      setPaso(b.paso);
      setRetomado(true);
    } else if (enlace) {
      fijarUbicacion({ ...enlace, metodo: 'manual', precisionM: null, precargada: true });
    }
    setBorradorLeido(true);
  }, [form]);

  // Guardar en cada cambio. Es `sessionStorage`, así que escribir es barato y síncrono; lo que
  // no se puede es perder el último cambio por esperar a un momento mejor.
  useEffect(() => {
    if (!restaurado.current || creado) return;
    guardarBorrador({
      paso,
      ubicacion,
      resuelto,
      fotos,
      valores: valores as Borrador['valores'],
      clave: claveEnvio.current as string,
    });
  }, [paso, ubicacion, resuelto, fotos, valores, creado]);

  const empezarDeCero = () => {
    olvidarBorrador();
    claveEnvio.current = nuevaClaveIdempotencia();
    form.reset(valoresIniciales());
    setResolviendo(false);
    setFotos([]);
    setUbicacion(null);
    setResuelto(null);
    setErrorEnvio(null);
    setErrorUbicacion(null);
    setAvisoUbicacion(null);
    setErrorFoto(null);
    setEsperandoCamara(false);
    setRetomado(false);
    setPaso(1);
    // Como recién abierto: el punto de partida vuelve a ser el del enlace, o el centro de la ciudad.
    if (enlace) fijarUbicacion({ ...enlace, metodo: 'manual', precisionM: null, precargada: true });
    mapa.current?.jumpTo({ center: centroDelPaso1(null, enlace, centroDeCiudad(ciudad)) });
  };

  function fijarUbicacion(u: Ubicacion) {
    setUbicacion(u);
    // Estos cuatro campos no tienen control visible, pero SÍ están en ReporteCrearSchema, que es
    // el resolver del formulario. Si no se registran, `handleSubmit` falla la validación por
    // lat/lon indefinidos y no llega a llamar al callback: el botón de enviar no hacía nada.
    form.setValue('lat', u.lat, { shouldValidate: false });
    form.setValue('lon', u.lon, { shouldValidate: false });
    form.setValue('ubicacion_metodo', u.metodo, { shouldValidate: false });
    form.setValue('precision_gps_m', u.precisionM, { shouldValidate: false });
    form.clearErrors(['lat', 'lon', 'ubicacion_metodo', 'precision_gps_m']);
    setErrorUbicacion(null);
    setAvisoUbicacion(null);
    // La unidad vecinal a la vista es la del punto anterior: se borra y «Continuar» espera la
    // respuesta del punto nuevo, que pide el efecto de abajo.
    setResuelto(null);
    setResolviendo(true);
  }

  /**
   * Cada punto nuevo se resuelve tras un momento de quietud; si cambia antes, la limpieza cancela
   * la espera y la pregunta en vuelo (su respuesta sería la de otro punto). Es un efecto y no un
   * temporizador suelto: en desarrollo React desmonta y vuelve a montar una vez, y el temporizador
   * que se programaba al restaurar el borrador o al llegar por «Me pasa a mí» moría en ese
   * desmontaje y nadie lo volvía a pedir.
   */
  useEffect(() => {
    if (!ubicacion || resueltoPara.current === ubicacion) return;
    const control = new AbortController();
    const espera = setTimeout(async () => {
      try {
        const r = await resolverPunto(ubicacion.lat, ubicacion.lon, control.signal);
        if (control.signal.aborted) return;
        resueltoPara.current = ubicacion;
        setResuelto(r);
        setErrorUbicacion(
          r.dentro_cobertura
            ? null
            : 'Ese punto queda fuera del municipio. Movelo dentro de la ciudad para poder reportar.',
        );
      } catch (e) {
        if (control.signal.aborted) return;
        setResuelto(null);
        setErrorUbicacion(mensajeDeError(e));
      } finally {
        if (!control.signal.aborted) setResolviendo(false);
      }
    }, ESPERA_RESOLVER_MS);
    return () => {
      clearTimeout(espera);
      control.abort();
    };
  }, [ubicacion]);

  function usarMiUbicacion() {
    if (!navigator.geolocation) {
      setErrorUbicacion(
        'Tu navegador no permite compartir la ubicación. Podés mover el mapa o escribir las coordenadas.',
      );
      return;
    }
    toast('Buscando tu ubicación…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Una respuesta tardía no mueve en silencio un punto que la persona ya dio por bueno.
        if (pasoRef.current !== 1) return;
        const { ubicacion: u, aproximada } = ubicacionDesdeGps(pos.coords);
        // `flyTo` no trae `originalEvent`: el mapa no lo toma como un gesto y no pisa el método ni
        // la precisión del GPS con los de una elección manual.
        mapa.current?.flyTo({ center: [u.lon, u.lat], zoom: aproximada ? 14 : 17, duration: 700 });
        fijarUbicacion(u);
        if (aproximada) setAvisoUbicacion(TEXTO_UBICACION_APROXIMADA);
      },
      () =>
        setErrorUbicacion(
          'No pudimos obtener tu ubicación. Mové el mapa hasta el punto o escribí las coordenadas.',
        ),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  const subir = useMutation({
    mutationFn: subirFoto,
    onSuccess: (f) => {
      setFotos((prev) => [
        ...prev,
        { objeto_key: f.objeto_key, url: f.url, subida_en: Date.now() },
      ]);
      setErrorFoto(null);
      toast('Foto agregada · metadatos eliminados');
    },
    onError: (e) => {
      // 401: la sesión venció mientras se elegía la foto. Mismo camino que el envío («Se cerró tu
      // sesión», con el borrador guardado) en vez de un error suelto que no dice qué hacer.
      if (esSesionCaducada(e)) {
        setSesionCaducada(true);
        return;
      }
      // El resto (incluido el 429 de cuota de fotos, con su propio texto) va junto a las fotos y
      // no toca nada más del formulario.
      setErrorFoto(mensajeDeFoto(e));
    },
  });

  const mosaico = mosaicoDeFotos({
    subidas: fotos.length,
    subiendo: subir.isPending,
    esperandoCamara,
  });

  /**
   * Único camino de subida, sea el «Agregar» de la galería o la cámara de «otro detalle». Se
   * comprueba ANTES de subir: el servidor lo rechaza igual (413 / 415), pero llegar hasta ahí
   * significa haber mandado hasta 8 MB por datos móviles para que le digan que no, y quien peor
   * conexión tiene es quien más lo paga.
   */
  function alElegirFoto(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (mosaico.completas) {
      setErrorFoto(TEXTO_FOTOS_COMPLETAS);
      return;
    }
    const error = motivoDeRechazoDeFoto(f);
    if (error) {
      setErrorFoto(error);
      return;
    }
    subir.mutate(f);
  }

  /**
   * El input de la cámara está siempre montado (uno solo, no uno por espacio): quitar el espacio
   * vacío nunca se lleva por delante una foto que todavía está llegando. `cancel` (Chrome 113+,
   * Safari 16.4+, Firefox 91+) avisa que la persona cerró la cámara sin sacar nada.
   */
  const conectarCamara = useCallback((el: HTMLInputElement | null) => {
    camara.current = el;
    if (!el) return;
    const alCancelar = () => setEsperandoCamara(false);
    el.addEventListener('cancel', alCancelar);
    return () => {
      el.removeEventListener('cancel', alCancelar);
      camara.current = null;
    };
  }, []);

  /**
   * Para los navegadores sin evento `cancel`: al volver de la cámara (la página recupera el foco o
   * vuelve a estar visible) se quita el espacio vacío. Antes quedaba para siempre y ocupaba uno de
   * los tres lugares de foto.
   */
  function vigilarRegresoDeLaCamara() {
    dejarDeVigilarCamara.current?.();
    let espera: ReturnType<typeof setTimeout> | null = null;
    function quitarEscuchas() {
      window.removeEventListener('focus', alVolver);
      document.removeEventListener('visibilitychange', alVolver);
    }
    function alVolver() {
      if (document.visibilityState !== 'visible') return;
      quitarEscuchas();
      espera = setTimeout(() => setEsperandoCamara(false), ESPERA_REGRESO_CAMARA_MS);
    }
    window.addEventListener('focus', alVolver);
    document.addEventListener('visibilitychange', alVolver);
    dejarDeVigilarCamara.current = () => {
      quitarEscuchas();
      if (espera) clearTimeout(espera);
    };
  }

  function abrirOtroDetalle() {
    if (mosaico.completas || subir.isPending) return;
    setEsperandoCamara(true);
    // El clic abre la cámara dentro del mismo toque, que es lo único que aceptan los navegadores.
    // Si aun así no se abre, el espacio queda a la vista con su propio botón y basta con tocarlo.
    camara.current?.click();
  }

  /** Respuesta a «¿Hay sumidero cercano?», con las otras dos puestas en regla (contracts 0.6.0). */
  function responderSumidero(cercano: Sumidero['sumidero_cercano']) {
    const r = respuestasSumidero(cercano, form.getValues());
    form.setValue('sumidero_cercano', r.sumidero_cercano);
    form.setValue('sumidero_estado', r.sumidero_estado);
    form.setValue('agua_brota_sumidero', r.agua_brota_sumidero);
    form.clearErrors(['sumidero_cercano', 'sumidero_estado', 'agua_brota_sumidero']);
  }

  /** Lleva a la persona al paso del primer campo rechazado, que es donde está su mensaje. */
  function llevarAlError(campos: string[]) {
    const destino = pasoDelError(campos);
    if (destino === 1) setErrorUbicacion(MENSAJE_FALTA_UBICACION);
    setPaso(destino);
    setMostrarError(true);
  }

  // Tras un rechazo, el paso del error ya está montado: se abre el bloque plegado si el mensaje
  // quedó adentro y se lleva la vista hasta él. Un mensaje que no se ve es un botón que no hace
  // nada (TRASPASO §3.8).
  useEffect(() => {
    if (!mostrarError) return;
    setMostrarError(false);
    const primero = document.querySelector<HTMLElement>('[data-campo-con-error]');
    const plegado = primero?.closest('details');
    if (plegado) plegado.open = true;
    primero?.scrollIntoView({ block: 'center' });
  }, [mostrarError]);

  const enviar = useMutation({
    mutationFn: (payload: ReporteCrearEntrada) =>
      crearReporte(payload, claveEnvio.current as string),
    onSuccess: (f) => {
      const p = f.properties;
      recordarReporte({
        id: p.id,
        enviado_en: new Date().toISOString(),
        titulo: p.unidad_vecinal?.nombre || 'Punto reportado',
        unidad_vecinal: p.unidad_vecinal?.codigo ?? null,
        distrito: p.distrito?.codigo ?? null,
        severidad: p.severidad,
        tiene_foto: p.fotos.length > 0,
      });
      // El reporte ya está del lado del servidor: el borrador deja de tener sentido y quedarse
      // guardado significaría que el próximo reporte arrancaría con los datos de este.
      olvidarBorrador();
      setCreado({ id: p.id });
      // El turno de la cuenta acaba de cambiar en el servidor; sin esto, el aviso de «ya enviaste
      // uno hace poco» no salía hasta que caducara la consulta, cinco minutos después.
      void refrescarSesion(cliente);
    },
    onError: (e) => {
      // 401: la sesión venció entre que se abrió el formulario y se pulsó «Enviar». El borrador
      // sigue guardado, así que se ofrece volver a entrar en vez de tirar el trabajo.
      if (esSesionCaducada(e)) {
        setSesionCaducada(true);
        return;
      }
      // 429 de cuota: no es un fallo de red ni algo que se arregle reintentando, y el texto
      // genérico de «probá de nuevo» sería mentira. El servidor ya manda un mensaje con el
      // tiempo que falta; se usa ese, y se vuelve a preguntar el turno para el aviso de arriba.
      if (esCuotaAgotada(e)) {
        setErrorEnvio(e.message);
        void refrescarSesion(cliente);
        return;
      }
      setErrorEnvio(mensajeDeEnvio(e));
      const detalles = detallesDeError(e);
      for (const d of detalles) {
        form.setError(d.campo as keyof ReporteCrearEntrada, { message: d.mensaje });
      }
      if (detalles.length) llevarAlError(detalles.map((d) => d.campo));
    },
  });

  // ---------------------------------------------------------------- confirmación

  if (creado) return <Confirmacion id={creado.id} />;

  /*
   * Puerta de acceso. Va DESPUÉS de todos los hooks —incluido el que restaura el borrador— para
   * no romper el orden de hooks de React y para que, al volver de iniciar sesión, lo escrito ya
   * esté cargado y no haya que reconstruir nada.
   *
   * Esto es cortesía, no control: quien decide es api-core, que responde 401 a cualquier
   * `POST /api/v1/reportes` sin sesión venga de donde venga.
   */
  if (sesionCaducada) return <AccesoRequerido motivo="caducada" />;
  if (comprobandoSesion)
    return (
      <p className="ayuda p-6" role="status">
        Un momento…
      </p>
    );
  // Que no se pueda preguntar por la sesión (plazo, API caída) NO es «no tenés cuenta»: a quien sí
  // la tiene no se lo puede mandar a crear otra. Se dice lo que pasó y se ofrece reintentar; lo
  // escrito sigue en el borrador.
  if (errorSesion)
    return (
      <div className="flex flex-1 items-center justify-center p-5">
        <div className="w-full max-w-md">
          <ErrorDeCarga
            error={errorSesion}
            que="tu sesión"
            alReintentar={reintentarSesion}
            reintentando={reintentandoSesion}
            testId="error-sesion"
          />
        </div>
      </div>
    );
  if (!usuario) return <AccesoRequerido />;

  // ---------------------------------------------------------------- pasos

  const ahora = new Date();
  const severidad =
    valores.profundidad_estimada && valores.frecuencia
      ? calcularSeveridad({
          profundidad_estimada: valores.profundidad_estimada,
          frecuencia: valores.frecuencia,
        })
      : null;

  const estadoAvance: EstadoParaAvanzar = {
    ubicacion,
    resuelto,
    resolviendo,
    profundidad_estimada: valores.profundidad_estimada,
    frecuencia: valores.frecuencia,
    evento_en: valores.evento_en,
    descripcion: valores.descripcion,
    subiendoFoto: subir.isPending,
    enviando: enviar.isPending,
    ahora,
  };
  const errores = form.formState.errors;
  const limitesFecha = limitesFechaEvento(ahora);
  const errorFecha = errores.evento_en?.message ?? problemaFechaEvento(valores.evento_en, ahora);

  const irAdelante = () => setPaso((p) => Math.min(PASOS, p + 1));
  const irAtras = () => setPaso((p) => Math.max(1, p - 1));

  const enviarFormulario = form.handleSubmit(
    (datos) => {
      // Defensa: con una foto subiendo el botón está deshabilitado, pero Enter también envía.
      if (subir.isPending) return;
      if (!ubicacion) {
        setErrorUbicacion(MENSAJE_FALTA_UBICACION);
        setPaso(1);
        return;
      }
      setErrorEnvio(null);
      enviar.mutate(armarEnvio(datos, ubicacion, fotos));
    },
    (rechazados) => {
      // Cada error se muestra en su campo y se lleva a la persona al paso donde está. Antes todo
      // iba a la revisión con un «revisá los campos marcados» genérico, lejos del campo: con la
      // fecha del evento o el sumidero, un botón que no hacía nada (TRASPASO §3.8). Lo que no
      // tiene un control propio se dice en la revisión, con su propio texto.
      const campos = Object.keys(rechazados);
      const sueltos = camposSinLugar(campos)
        .map((c) => mensajeDe(rechazados, c))
        .filter((m) => m !== '');
      setErrorEnvio(sueltos.length ? sueltos.join(' ') : null);
      llevarAlError(campos);
    },
  );

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={enviarFormulario} noValidate>
      <div className="cab">
        {paso === 1 ? (
          <Link href="/" className="atras no-underline" aria-label="Salir del reporte">
            <X size={19} aria-hidden="true" />
          </Link>
        ) : (
          <button
            type="button"
            className="atras"
            onClick={irAtras}
            aria-label="Volver al paso anterior"
          >
            <ChevronLeft size={19} aria-hidden="true" />
          </button>
        )}
        <h1 className="titular text-xl">Reportar un punto</h1>
      </div>

      <div className="pasos px-5 pb-3">
        {Array.from({ length: PASOS }, (_, k) => k + 1).map((i) => (
          <i key={i} className={i <= paso ? 'on' : ''} />
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        Paso {paso} de {PASOS}
      </p>

      {/* Aviso por adelantado de que el turno de esta cuenta todavía no está disponible. No
          impide escribir —el turno puede llegar antes de que termine— pero evita que alguien
          complete todas las pantallas para encontrarse un rechazo al final. El que decide sigue
          siendo el servidor al enviar. */}
      {puedeReportarDesde && (
        <div className="px-5 pb-3">
          <Aviso tono="alerta">
            <b className="mb-1 block text-[14.5px]">Ya enviaste un reporte hace poco</b>
            Vas a poder enviar otro a las {horaCorta(puedeReportarDesde, ciudad)}. Podés ir
            completando este mientras tanto.
          </Aviso>
        </div>
      )}

      {retomado ? (
        <div className="px-5 pb-3">
          <Aviso tono="info" data-testid="borrador-retomado">
            <b className="mb-1 block text-[14.5px]">Retomamos lo que habías empezado</b>
            Seguimos desde donde lo dejaste. Nada de esto se envió todavía.
            <button
              type="button"
              className="btn btn-fantasma btn-sm mt-2.5"
              onClick={empezarDeCero}
            >
              Empezar de nuevo
            </button>
          </Aviso>
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- paso 1 */}
      {paso === 1 ? (
        <>
          <div className="flex-none px-5 pb-3">
            <p className="pno">Paso 1 de {PASOS}</p>
            <p className="preg">¿Dónde se junta el agua?</p>
          </div>
          <div className="relative mx-5 min-h-[260px] flex-1 overflow-hidden rounded-[20px]">
            {borradorLeido ? (
              <MapaDiferido
                className="map"
                ariaLabel="Mapa para elegir la ubicación del reporte"
                centro={centroDelPaso1(ubicacion, enlace, centroDeCiudad(ciudad))}
                zoom={17}
                seguirCentro
                onUbicacion={(lat, lon) =>
                  fijarUbicacion({ lat, lon, metodo: 'manual', precisionM: null })
                }
                alListo={(m) => {
                  mapa.current = m;
                  // Si el punto cambió mientras el mapa cargaba (llegó el GPS, se confirmaron
                  // coordenadas), se lo lleva ahí. `jumpTo` no es un gesto: no elige nada.
                  const u = ubicacionRef.current;
                  if (u) m.jumpTo({ center: [u.lon, u.lat] });
                }}
              />
            ) : null}
            {/* El marcador queda clavado en el centro y lo que se mueve es el mapa: con el
                pulgar es más preciso que arrastrar un pin diminuto. */}
            <div className="flot pointer-events-none top-1/2 left-1/2 -translate-x-1/2 -translate-y-full">
              <svg width="38" height="48" viewBox="0 0 38 48" fill="none" aria-hidden="true">
                <title>Marcador del punto</title>
                <path
                  d="M19 47s15-14.2 15-25A15 15 0 1 0 4 22c0 10.8 15 25 15 25Z"
                  fill="#1B6B38"
                  stroke="#fff"
                  strokeWidth="3"
                />
                <circle cx="19" cy="21" r="5.5" fill="#fff" />
              </svg>
            </div>
            <div className="flot right-3 bottom-3 grid gap-2">
              <button
                type="button"
                className="bico bico-sm bico-verde"
                onClick={usarMiUbicacion}
                aria-label="Usar mi ubicación"
              >
                <Navigation size={17} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="px-5 pt-3">
            <button
              type="button"
              data-testid="opcion-coordenadas"
              className="btn btn-fantasma btn-sm btn-bloque"
              onClick={() => setMostrarCoordenadas((v) => !v)}
              aria-expanded={mostrarCoordenadas}
            >
              Ingresar coordenadas
            </button>
            {mostrarCoordenadas ? (
              <div className="tarjeta mt-2.5 space-y-3 p-4">
                <p className="ayuda">
                  Alternativa sin mapa: escribí la latitud y la longitud en grados decimales
                  (EPSG:4326).
                </p>
                <div className="flex flex-wrap gap-3">
                  <div className="flex-1">
                    <label htmlFor="lat" className="lbl">
                      Latitud
                    </label>
                    <input
                      id="lat"
                      inputMode="decimal"
                      className="campo"
                      value={latTexto}
                      onChange={(e) => setLatTexto(e.target.value)}
                      placeholder={String(ciudad.centro.lat)}
                    />
                  </div>
                  <div className="flex-1">
                    <label htmlFor="lon" className="lbl">
                      Longitud
                    </label>
                    <input
                      id="lon"
                      inputMode="decimal"
                      className="campo"
                      value={lonTexto}
                      onChange={(e) => setLonTexto(e.target.value)}
                      placeholder={String(ciudad.centro.lon)}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="boton-confirmar-ubicacion"
                  className="btn btn-tinta btn-sm"
                  onClick={() => {
                    const c = leerCoordenadas(latTexto, lonTexto);
                    if (!c) {
                      setErrorUbicacion(
                        'Revisá las coordenadas: la latitud va entre -90 y 90, y la longitud entre -180 y 180.',
                      );
                      return;
                    }
                    mapa.current?.jumpTo({ center: [c.lon, c.lat], zoom: 17 });
                    fijarUbicacion({ lat: c.lat, lon: c.lon, metodo: 'manual', precisionM: null });
                  }}
                >
                  Confirmar ubicación
                </button>
              </div>
            ) : null}
          </div>

          <div className="pie" aria-live="polite">
            {avisoUbicacion ? (
              <Aviso tono="alerta" className="mb-3" data-testid="aviso-ubicacion-aproximada">
                {avisoUbicacion}
              </Aviso>
            ) : null}
            {errorUbicacion ? (
              <Aviso tono="err" className="mb-3" data-testid="error-ubicacion">
                {errorUbicacion}
              </Aviso>
            ) : resuelto?.dentro_cobertura ? (
              <Aviso tono="ok" className="mb-3" data-testid="ubicacion-resuelta">
                <b>
                  {etiquetaUnidadVecinal(resuelto.unidad_vecinal?.codigo)} ·{' '}
                  {etiquetaDistrito(resuelto.distrito?.codigo)}
                </b>
                <br />
                {resuelto.asignado_por_proximidad
                  ? `Asignada por proximidad, a ${Math.round(resuelto.distancia_m ?? 0)} m. `
                  : ''}
                Mové el mapa para ajustar el punto exacto.
              </Aviso>
            ) : (
              <Aviso tono="info" className="mb-3" data-testid="ubicacion-pendiente">
                {resolviendo
                  ? 'Buscando la unidad vecinal…'
                  : 'Mové el mapa hasta el punto exacto.'}
              </Aviso>
            )}
            <button
              type="button"
              data-testid="boton-siguiente"
              className="btn btn-bloque"
              disabled={!puedeAvanzar(1, estadoAvance)}
              onClick={irAdelante}
            >
              Continuar
            </button>
          </div>
        </>
      ) : null}

      {/* ---------------------------------------------------------------- paso 2 */}
      {paso === 2 ? (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
            <p className="pno">Paso 2 de {PASOS}</p>
            <p className="preg">¿Hasta dónde llegó y cada cuánto pasa?</p>

            <div className="mt-5">
              <label htmlFor="evento" className="lbl">
                Fecha del evento (opcional)
              </label>
              {/* Controlado: el paso 2 se desmonta al avanzar, y con un input sin `value` la
                  fecha elegida desaparecía de la pantalla al volver aunque siguiera en el
                  formulario. Lo mismo al retomar un borrador. Los límites y el valor van en la
                  hora local de quien reporta, no en UTC. */}
              <input
                id="evento"
                type="date"
                className="campo"
                min={limitesFecha.min}
                max={limitesFecha.max}
                value={campoFechaDesdeIso(valores.evento_en)}
                aria-invalid={!!errorFecha}
                aria-describedby={errorFecha ? 'ayuda-evento error-evento_en' : 'ayuda-evento'}
                onChange={(e) => {
                  form.clearErrors('evento_en');
                  form.setValue(
                    'evento_en',
                    e.target.value ? isoDesdeCampoFecha(e.target.value, new Date()) : null,
                  );
                }}
              />
              <p id="ayuda-evento" className="ayuda mt-1.5">
                Si la dejás vacía, tomamos la fecha de hoy.
              </p>
              <MensajeDeCampo campo="evento_en" mensaje={errorFecha} />
            </div>

            <fieldset className="mt-5">
              <legend className="lbl">{ETIQUETAS.campos.profundidad_estimada}</legend>
              <p className="ayuda mb-2.5">
                ¿Hasta dónde llegaba el agua? Tomá tu cuerpo como referencia.
              </p>
              <div className="grid gap-2.5">
                {PROFUNDIDADES.map((p) => (
                  <Opcion
                    key={p}
                    nombre="profundidad_estimada"
                    valor={p}
                    texto={ETIQUETAS.profundidad[p].corta}
                    detalle={ETIQUETAS.profundidad[p].rango}
                    marcado={valores.profundidad_estimada === p}
                    onCambio={() => {
                      form.setValue('profundidad_estimada', p);
                      form.clearErrors('profundidad_estimada');
                    }}
                  />
                ))}
              </div>
              <MensajeDeCampo
                campo="profundidad_estimada"
                mensaje={errores.profundidad_estimada?.message}
              />
            </fieldset>

            <fieldset className="mt-5">
              <legend className="lbl">Frecuencia</legend>
              <div className="grid gap-2.5">
                {FRECUENCIAS.map((f) => (
                  <Opcion
                    key={f}
                    nombre="frecuencia"
                    valor={f}
                    texto={ETIQUETAS.frecuencia[f]}
                    marcado={valores.frecuencia === f}
                    onCambio={() => {
                      form.setValue('frecuencia', f);
                      form.clearErrors('frecuencia');
                    }}
                  />
                ))}
              </div>
              <MensajeDeCampo campo="frecuencia" mensaje={errores.frecuencia?.message} />
            </fieldset>

            {severidad ? (
              <div className="tarjeta mt-4.5 px-[18px] py-4" aria-live="polite">
                <p className="glbl mt-0">Severidad calculada</p>
                <div className="mt-2.5 flex items-center gap-3">
                  <ChipSeveridad severidad={severidad.banda} grande />
                  <b className="titular ml-auto text-[22px] tabular-nums">
                    {severidad.puntaje}
                    <span className="text-[14px] text-tinta-600">/{PUNTAJE_MAX}</span>
                  </b>
                </div>
                <p className="mt-2.5 text-[14px] leading-[1.45] text-tinta-600">
                  La calcula el sistema con lo que declaraste. El técnico puede corregirla, siempre
                  dejando el motivo escrito.
                </p>
              </div>
            ) : null}
          </div>
          <div className="pie">
            <button
              type="button"
              data-testid="boton-siguiente"
              className="btn btn-bloque"
              disabled={!puedeAvanzar(2, estadoAvance)}
              onClick={irAdelante}
            >
              Continuar
            </button>
          </div>
        </>
      ) : null}

      {/* ---------------------------------------------------------------- paso 3 */}
      {paso === 3 ? (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
            <p className="pno">Paso 3 de {PASOS}</p>
            <p className="preg">Mostranos cómo se ve</p>

            <ul className="mt-4 grid grid-cols-3 gap-2.5">
              {fotos.map((f) => (
                <li key={f.objeto_key} className="relative aspect-square">
                  <span className="foto block h-full w-full">
                    {/* biome-ignore lint/performance/noImgElement: miniatura de la foto ya subida */}
                    <img src={urlFotoRelativa(f.url)} alt="Foto que subiste" />
                  </span>
                  <BotonQuitar
                    etiqueta="Quitar esta foto"
                    onClick={() => setFotos((p) => p.filter((x) => x.objeto_key !== f.objeto_key))}
                  />
                </li>
              ))}
              {subir.isPending ? (
                <li className="aspect-square">
                  <div
                    role="status"
                    data-testid="foto-subiendo-mosaico"
                    className="grid h-full w-full place-items-center justify-items-center gap-1 rounded-xl border-[1.5px] border-dashed border-verde-700 bg-white px-1 text-center text-[12.5px] text-tinta-600"
                  >
                    <Camera size={20} aria-hidden="true" />
                    Subiendo…
                  </div>
                </li>
              ) : null}
              {mosaico.espacioCamara ? (
                <li className="relative aspect-square" data-testid="espacio-camara">
                  <label
                    htmlFor="foto-camara"
                    className="grid h-full w-full cursor-pointer place-items-center justify-items-center gap-1 rounded-xl border-[1.5px] border-dashed border-verde-700 bg-white px-1 text-center text-[12.5px] text-tinta-600"
                  >
                    <Camera size={20} aria-hidden="true" />
                    Foto de referencia
                  </label>
                  <BotonQuitar
                    etiqueta="Quitar este espacio de foto"
                    onClick={() => setEsperandoCamara(false)}
                  />
                </li>
              ) : null}
              {mosaico.agregar ? (
                <li className="aspect-square">
                  <button
                    type="button"
                    className="grid h-full w-full place-items-center justify-items-center gap-1 rounded-xl border-[1.5px] border-dashed border-[#C9D2CD] bg-white text-[12.5px] text-tinta-600"
                    onClick={() => archivo.current?.click()}
                    disabled={subir.isPending}
                  >
                    <Plus size={20} aria-hidden="true" />
                    Agregar
                  </button>
                </li>
              ) : null}
            </ul>
            <input
              ref={archivo}
              id="fotos"
              type="file"
              accept={CONFIG_DOMINIO.FOTO_MIME_PERMITIDOS.join(',')}
              className="sr-only"
              aria-label="Elegir una foto del punto"
              disabled={subir.isPending}
              onChange={alElegirFoto}
            />
            {/* `capture` pide la cámara trasera en el teléfono; en escritorio se comporta como un
                selector de archivos más. El tipo real lo decide el servidor por los bytes, y
                antes `motivoDeRechazoDeFoto` descarta lo que no se admite. */}
            <input
              ref={conectarCamara}
              id="foto-camara"
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              aria-label="Foto de referencia"
              disabled={subir.isPending}
              onClick={vigilarRegresoDeLaCamara}
              onChange={(e) => {
                setEsperandoCamara(false);
                alElegirFoto(e);
              }}
            />
            <button
              type="button"
              data-testid="boton-otro-detalle"
              className="btn btn-fantasma btn-bloque mt-2.5"
              onClick={abrirOtroDetalle}
              disabled={mosaico.completas || subir.isPending}
              aria-describedby="ayuda-otro-detalle"
            >
              <Camera size={18} aria-hidden="true" />
              ¿Querés añadir otro detalle?
            </button>
            <p id="ayuda-otro-detalle" className="ayuda mt-1.5" aria-live="polite">
              {mosaico.completas
                ? TEXTO_FOTOS_COMPLETAS
                : 'Abre la cámara para sacar una foto de referencia de otro detalle del lugar.'}
            </p>
            <div className="mt-1.5 flex justify-between text-[13.5px] text-tinta-600">
              <span>Hasta {MAX_FOTOS} fotos</span>
              <span>
                {fotos.length}/{MAX_FOTOS} · {CONFIG_DOMINIO.FOTO_MAX_BYTES / 1024 / 1024} MB c/u
              </span>
            </div>
            {errorFoto ? (
              <Aviso tono="err" className="mt-3" data-testid="error-foto">
                {errorFoto}
              </Aviso>
            ) : null}
            <MensajeDeCampo campo="fotos" mensaje={errores.fotos?.message} />
            <Aviso tono="ok" icono={ShieldCheck} className="mt-3">
              Antes de subirlas borramos los metadatos, incluida la ubicación que guarda la cámara.
            </Aviso>

            <div className="mt-5">
              <label htmlFor="descripcion" className="lbl">
                ¿Qué pasa en ese punto?
              </label>
              <textarea
                id="descripcion"
                rows={4}
                className="campo resize-none"
                placeholder="Contanos qué ves: hasta dónde llega el agua, cuánto tarda en irse…"
                aria-invalid={!!errores.descripcion}
                aria-describedby="contador-descripcion"
                {...form.register('descripcion')}
              />
              <p id="contador-descripcion" className="ayuda mt-1.5">
                {contadorDescripcion(valores.descripcion?.length ?? 0)}
              </p>
              <MensajeDeCampo campo="descripcion" mensaje={errores.descripcion?.message} />
            </div>

            <details className="tarjeta mt-4 p-4">
              <summary className="cursor-pointer font-semibold">
                Causa presunta y sumidero <span className="mini ml-1">Opcional</span>
              </summary>
              <div className="mt-4 space-y-4">
                <div>
                  <label htmlFor="causa_presunta" className="lbl">
                    ¿Por qué creés que pasa?
                  </label>
                  <select
                    id="causa_presunta"
                    className="campo"
                    {...form.register('causa_presunta')}
                  >
                    {CAUSAS.map((c) => (
                      <option key={c} value={c}>
                        {ETIQUETAS.causa_presunta[c]}
                      </option>
                    ))}
                  </select>
                  <MensajeDeCampo
                    campo="causa_presunta"
                    mensaje={errores.causa_presunta?.message}
                  />
                </div>
                {/* Radios y no <select>: «no contestó» tiene que ser `null`, nunca `''`. Con
                    los desplegables anteriores, uno sin elegir mandaba la cadena vacía y la
                    validación fallaba SIEMPRE que el vecino no los tocaba (TRASPASO §3.8). Aquí
                    `setValue` solo escribe un valor del enum o `null`; si algún día vuelve a ser
                    un control registrado, necesita `setValueAs` que convierta '' en null. */}
                <fieldset>
                  <legend className="lbl">{ETIQUETAS.campos.sumidero_cercano}</legend>
                  <div className="grid grid-cols-2 gap-2.5">
                    {SUMIDERO_CERCANO.map((v) => (
                      <Opcion
                        key={v}
                        nombre="sumidero_cercano"
                        valor={v}
                        texto={ETIQUETAS.sumidero_cercano[v]}
                        marcado={valores.sumidero_cercano === v}
                        onCambio={() => responderSumidero(v)}
                      />
                    ))}
                  </div>
                  {valores.sumidero_cercano ? (
                    <button
                      type="button"
                      className="mt-1.5 inline-flex min-h-12 items-center px-0.5 text-[14px] font-bold text-agua-700"
                      onClick={() => responderSumidero(null)}
                    >
                      Dejar sin responder
                    </button>
                  ) : null}
                  <MensajeDeCampo
                    campo="sumidero_cercano"
                    mensaje={errores.sumidero_cercano?.message}
                  />
                </fieldset>
                {valores.sumidero_cercano === 'si' ? (
                  <fieldset>
                    <legend className="lbl">{ETIQUETAS.campos.sumidero_estado}</legend>
                    <div className="grid grid-cols-2 gap-2.5">
                      {SUMIDERO_ESTADOS.map((v) => (
                        <Opcion
                          key={v}
                          nombre="sumidero_estado"
                          valor={v}
                          texto={ETIQUETAS.sumidero_estado[v]}
                          marcado={valores.sumidero_estado === v}
                          onCambio={() => {
                            form.setValue('sumidero_estado', v);
                            form.clearErrors('sumidero_estado');
                          }}
                        />
                      ))}
                    </div>
                  </fieldset>
                ) : null}
                <MensajeDeCampo
                  campo="sumidero_estado"
                  mensaje={errores.sumidero_estado?.message}
                />
                {/* Controlada y con `null` como «sin contestar»: registrada, react-hook-form le
                    escribía `false` al montarla y todo reporte decía que el agua no brotaba. Con
                    «No» en el sumidero cercano no se pregunta: no hay de dónde brotar. */}
                {valores.sumidero_cercano !== 'no' ? (
                  <label className="opc">
                    <input
                      type="checkbox"
                      name="agua_brota_sumidero"
                      checked={valores.agua_brota_sumidero === true}
                      onChange={(e) => {
                        form.setValue('agua_brota_sumidero', e.target.checked ? true : null);
                        form.clearErrors('agua_brota_sumidero');
                      }}
                    />
                    <span>El agua brota del sumidero cuando llueve</span>
                  </label>
                ) : null}
                <MensajeDeCampo
                  campo="agua_brota_sumidero"
                  mensaje={errores.agua_brota_sumidero?.message}
                />
              </div>
            </details>
          </div>
          <div className="pie">
            <button
              type="button"
              data-testid="boton-siguiente"
              className="btn btn-bloque"
              disabled={!puedeAvanzar(3, estadoAvance)}
              onClick={irAdelante}
            >
              {subir.isPending ? 'Subiendo foto…' : 'Continuar'}
            </button>
          </div>
        </>
      ) : null}

      {/* ---------------------------------------------------------------- paso 4 */}
      {paso === 4 ? (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
            <p className="pno">Paso 4 de {PASOS}</p>
            <p className="preg">Revisá antes de enviar</p>

            {ubicacion ? (
              <div className="relative mt-4 h-[108px] overflow-hidden rounded-xl">
                <MapaDiferido
                  className="map"
                  ariaLabel="Ubicación elegida"
                  centro={[ubicacion.lon, ubicacion.lat]}
                  zoom={16}
                  fijo
                  seleccionUbicacion={{ lat: ubicacion.lat, lon: ubicacion.lon }}
                />
              </div>
            ) : null}

            {severidad ? (
              <div className="mt-3.5 flex items-center gap-3">
                <ChipSeveridad severidad={severidad.banda} grande />
                <b className="titular ml-auto text-[19px] tabular-nums">
                  {severidad.puntaje}/{PUNTAJE_MAX}
                </b>
              </div>
            ) : null}

            <dl className="mt-2">
              <FilaRevision
                etiqueta="Lugar"
                valor={
                  <>
                    {resuelto?.unidad_vecinal
                      ? etiquetaUnidadVecinal(resuelto.unidad_vecinal.codigo)
                      : 'Sin unidad vecinal'}
                    <br />
                    <span className="text-[13.5px] font-normal text-tinta-600">
                      {etiquetaDistrito(resuelto?.distrito?.codigo)}
                      {resuelto?.version_capa ? ` · capa ${resuelto.version_capa}` : ''}
                    </span>
                  </>
                }
                alEditar={() => setPaso(1)}
              />
              <FilaRevision
                etiqueta={ETIQUETAS.campos.profundidad}
                valor={
                  valores.profundidad_estimada
                    ? `${ETIQUETAS.profundidad[valores.profundidad_estimada].corta} · ${ETIQUETAS.profundidad[valores.profundidad_estimada].rango}`
                    : '—'
                }
                alEditar={() => setPaso(2)}
              />
              <FilaRevision
                etiqueta="Frecuencia"
                valor={valores.frecuencia ? ETIQUETAS.frecuencia[valores.frecuencia] : '—'}
                alEditar={() => setPaso(2)}
              />
              <FilaRevision
                etiqueta="Fotos"
                valor={`${fotos.length} ${fotos.length === 1 ? 'foto' : 'fotos'}${subir.isPending ? ' · subiendo otra' : ''}`}
                alEditar={() => setPaso(3)}
              />
            </dl>

            {/* Enviar con una foto a medio subir creaba el reporte sin ella y la dejaba huérfana
                en el servidor: se espera, y se dice por qué el botón está quieto. */}
            {subir.isPending ? (
              <Aviso tono="info" className="mt-3.5" role="status" data-testid="foto-subiendo">
                Subiendo foto… Esperá a que termine para enviar el reporte.
              </Aviso>
            ) : null}
            {errorFoto ? (
              <Aviso tono="err" className="mt-3.5" data-testid="error-foto">
                <b className="mb-1 block text-[14.5px]">Foto sin subir</b>
                {errorFoto}
              </Aviso>
            ) : null}

            <fieldset className="mt-4.5">
              <legend className="lbl">¿Qué hay en ese punto?</legend>
              <div className="flex flex-wrap gap-2">
                {UBICACION_TIPOS.map((t) => (
                  <Pastilla
                    key={t}
                    nombre="ubicacion_tipo"
                    valor={t}
                    texto={ETIQUETAS.ubicacion_tipo[t]}
                    marcado={valores.ubicacion_tipo === t}
                    onCambio={() => {
                      form.setValue('ubicacion_tipo', t);
                      form.clearErrors('ubicacion_tipo');
                    }}
                  />
                ))}
              </div>
              <MensajeDeCampo campo="ubicacion_tipo" mensaje={errores.ubicacion_tipo?.message} />
            </fieldset>
            {valores.ubicacion_tipo === 'vivienda_o_predio' ? (
              <Aviso tono="alerta" className="mt-3">
                El mapa público va a desplazar el punto hasta {CONFIG_DOMINIO.JITTER_PUBLICO_M} m.
              </Aviso>
            ) : null}

            {/* Honeypot antispam: invisible para las personas. */}
            <input
              {...form.register('sitio_web')}
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="sr-only"
            />

            {errorEnvio ? (
              <Aviso
                tono="err"
                className="mt-3.5"
                data-testid="error-envio"
                data-campo-con-error=""
              >
                {errorEnvio}
              </Aviso>
            ) : null}
          </div>
          <div className="pie">
            <button
              type="submit"
              data-testid="boton-enviar"
              className="btn btn-bloque"
              disabled={!puedeAvanzar(4, estadoAvance)}
            >
              {enviar.isPending
                ? 'Enviando…'
                : subir.isPending
                  ? 'Subiendo foto…'
                  : 'Enviar reporte'}
            </button>
            <p className="ayuda mt-2 text-center">
              En el mapa nunca aparece quién reportó. Tu reporte pasa por revisión municipal antes
              de publicarse.
            </p>
          </div>
        </>
      ) : null}
    </form>
  );
}

function FilaRevision({
  etiqueta,
  valor,
  alEditar,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  alEditar: () => void;
}) {
  return (
    <div className="flex items-start gap-3 border-b-[1.5px] border-filete py-3 text-[15.5px]">
      <dt className="flex-none basis-[92px] text-[14.5px] text-tinta-600">{etiqueta}</dt>
      <dd className="m-0 min-w-0 flex-1 font-semibold">{valor}</dd>
      <button
        type="button"
        onClick={alEditar}
        className="flex-none px-0.5 text-[14px] font-bold text-agua-700"
      >
        Editar
      </button>
    </div>
  );
}

/** Confirmación (C-12): lo que el vecino se lleva es el código con el que puede seguir su punto. */
function Confirmacion({ id }: { id: string }) {
  const toast = useToast();
  const codigo = id.slice(0, 8).toUpperCase();
  return (
    <div
      data-testid="reporte-creado"
      className="mx-auto w-full max-w-2xl px-5 pt-6 pb-10"
      aria-live="polite"
    >
      <div className="hero p-[22px]">
        <div className="brillo grid h-[60px] w-[60px] place-items-center rounded-full bg-white/20">
          <Check size={32} aria-hidden="true" />
        </div>
        <h1 className="titular mt-4 text-[25px] text-white">Gracias, ya lo tenemos</h1>
        <p className="mt-2.5 text-[15.5px] leading-[1.5] text-white">
          Un técnico de la municipalidad va a revisarlo antes de publicarlo. Mientras tanto, tu
          reporte está <b>en revisión</b> y no aparece en el mapa público.
        </p>
      </div>

      <div className="tarjeta mt-3.5 flex items-center gap-3 px-[18px] py-4">
        <div>
          <p className="glbl mt-0">Código de seguimiento</p>
          <p className="titular mt-1 text-[21px] font-bold tracking-[0.04em]" data-id={id}>
            {codigo}
          </p>
        </div>
        <button
          type="button"
          className="bico bico-sm ml-auto"
          aria-label="Copiar el código de seguimiento"
          onClick={() => {
            navigator.clipboard?.writeText(codigo).then(
              () => toast('Código copiado'),
              () => toast('No pudimos copiarlo: anotalo a mano'),
            );
          }}
        >
          <Copy size={17} aria-hidden="true" />
        </button>
      </div>

      <Aviso tono="info" className="mt-3">
        <b className="mb-1 block text-[14.5px]">¿Qué pasa ahora?</b>
        Si el punto ya estaba reportado por otro vecino, el sistema agrupa los reportes cercanos en
        un mismo punto crítico. Eso le da más peso cuando el municipio prioriza obras.
      </Aviso>

      <div className="mt-4.5 grid gap-2.5">
        <Link href="/mis-reportes" className="btn btn-bloque no-underline">
          Ver mis reportes
        </Link>
        <Link href="/" className="btn btn-fantasma btn-bloque no-underline">
          Volver al mapa
        </Link>
      </div>
    </div>
  );
}
