'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BANDAS,
  CONFIG_DOMINIO,
  calcularSeveridad,
  ETIQUETAS,
  PROFUNDIDADES,
  type ResolverRespuesta,
  SUMIDERO_CERCANO,
  SUMIDERO_ESTADOS,
} from 'contracts';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Camera,
  Check,
  ChevronLeft,
  Copy,
  type LucideIcon,
  Navigation,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { Map as MapaGl } from 'maplibre-gl';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { type FieldErrors, useForm } from 'react-hook-form';
import {
  crearReporte,
  ErrorApi,
  nuevaClaveIdempotencia,
  resolverPunto,
  subirFoto,
} from '@/lib/api';
import {
  type Borrador,
  borradorTieneContenido,
  type FotoDelBorrador,
  guardarBorrador,
  leerBorrador,
  olvidarBorrador,
} from '@/lib/borrador';
import { estadoDelCupo, textoCupo } from '@/lib/cupo';
import {
  detallesDeError,
  esCuotaAgotada,
  esSesionCaducada,
  esUbicacionRechazada,
  mensajeDeCuota,
  mensajeDeEnvio,
  mensajeDeError,
  mensajeDeFoto,
} from '@/lib/errores';
import {
  contadorDescripcion,
  etiquetaDistrito,
  etiquetaUnidadVecinal,
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
  resolverFormulario,
  respuestasSumidero,
  type Sumidero,
  type Ubicacion,
  ubicacionDelEnlace,
  type ValoresFormulario,
  valoresIniciales,
} from '@/lib/formulario-reporte';
import { MiniaturasLocales, motivoDeRechazoDeFoto } from '@/lib/foto';
import { CLAVE_MIS_REPORTES } from '@/lib/misReportes';
import { textoDemora } from '@/lib/publicacion';
import {
  aceptarPunto,
  coordenadasEscritas,
  type Direccion,
  encuadreDelPaso1,
  moverDentroDelRadio,
  PASO_BOTON_M,
  puntoInicial,
  puntoYaElegido,
  RADIO_M,
  recortarAlCirculo,
  textoDistancia,
} from '@/lib/radio';
import { refrescarSesion, useSesion } from '@/lib/sesion';
import {
  ControladorUbicacion,
  DispositivoCongelado,
  decidirEnvio,
} from '@/lib/ubicacion-dispositivo';
import { TEXTO_SIN_VERIFICAR } from '@/lib/verificacion';
import { AccesoRequerido } from './AccesoRequerido';
import { Aviso } from './Aviso';
import { ErrorDeFoto, PieDeRevision } from './AvisosDelReporte';
import { CamaraReporte } from './CamaraReporte';
import { ChipSeveridad } from './ChipSeveridad';
import { CuentaRegresiva, TextoTrasEnviar } from './CuentaRegresiva';
import { CupoAgotado } from './CupoAgotado';
import { ErrorDeCarga } from './ErrorDeCarga';
import { MapaDiferido } from './MapaDiferido';
import { VistaPedirUbicacion } from './PedirUbicacion';
import { useToast } from './Toast';

const FRECUENCIAS = [
  'primera_vez',
  'ocasional',
  'cada_lluvia_fuerte',
  'permanente',
  'agua_estancada',
] as const;
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
const MAX_FOTOS = CONFIG_DOMINIO.FOTOS_MAX_POR_REPORTE;
const TEXTO_FOTOS_COMPLETAS = `Ya llegaste al máximo de ${MAX_FOTOS} fotos. Quitá una si querés cambiarla.`;
const MINUTOS_POSICION = Math.round(CONFIG_DOMINIO.POSICION_ANTIGUEDAD_MAX_S / 60);

/** Los botones «mover 5 m»: la alternativa al arrastre del marcador (CLAUDE.md §14.1). */
const BOTONES_MOVER: Array<{ direccion: Direccion; Icono: LucideIcon; texto: string }> = [
  { direccion: 'norte', Icono: ArrowUp, texto: 'al norte' },
  { direccion: 'sur', Icono: ArrowDown, texto: 'al sur' },
  { direccion: 'oeste', Icono: ArrowLeft, texto: 'al oeste' },
  { direccion: 'este', Icono: ArrowRight, texto: 'al este' },
];

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
function mensajeDe(errores: FieldErrors<ValoresFormulario>, campo: string): string {
  const e = (errores as Record<string, { message?: unknown } | undefined>)[campo];
  return typeof e?.message === 'string' ? e.message : '';
}

export function FormularioReporte() {
  const parametros = useSearchParams();
  const toast = useToast();
  const cliente = useQueryClient();
  const {
    usuario,
    cargando: comprobandoSesion,
    errorDeCarga: errorSesion,
    reintentando: reintentandoSesion,
    reintentar: reintentarSesion,
    reportesRestantesHoy,
    demoraProximoS,
  } = useSesion();
  /**
   * Al tocar «Reportar un punto» se vuelve a preguntar a `/auth/yo`: el cupo en caché puede ser de
   * antes de los envíos de hoy (también desde otro teléfono). Hasta que contesta no se ofrece
   * compartir la ubicación, y con el cupo agotado se avisa antes de pedirla (S16). Es un efecto que
   * corre al abrir esta pantalla, que es lo que hace el enlace «Reportar un punto».
   */
  const [cupoRevisado, setCupoRevisado] = useState(false);
  useEffect(() => {
    let vigente = true;
    void refrescarSesion(cliente).finally(() => {
      if (vigente) setCupoRevisado(true);
    });
    return () => {
      vigente = false;
    };
  }, [cliente]);
  const cupo = estadoDelCupo({ restantes: reportesRestantesHoy, revisado: cupoRevisado });
  /**
   * La sesión se fue a mitad del formulario. Se guarda aparte de `usuario` porque son dos cosas
   * distintas: «nunca tuviste cuenta» y «la tenías y venció mientras escribías». La segunda
   * merece otro texto, y sobre todo no puede llevarse por delante lo ya escrito.
   */
  const [sesionCaducada, setSesionCaducada] = useState(false);
  const [paso, setPaso] = useState(1);
  /**
   * Paso al que vuelve «Continuar» del paso 1 cuando se volvió a pedir la ubicación a mitad del
   * camino (un borrador retomado, una posición vencida o movida al enviar): lo demás ya estaba
   * contestado y no hay por qué recorrerlo de nuevo.
   */
  const [pasoPendiente, setPasoPendiente] = useState<number | null>(null);
  /**
   * La posición del teléfono (plan 2026-09-26, pedido E). Crear el controlador no pide nada: la
   * ubicación se pide al tocar «Compartir mi ubicación».
   */
  const [ubicador] = useState(() => new ControladorUbicacion());
  const estadoUbicacion = useSyncExternalStore(ubicador.suscribir, ubicador.leer, ubicador.leer);
  const ancla = estadoUbicacion.fase === 'lista' ? estadoUbicacion.ancla : null;
  /** El `dispositivo` del primer intento de envío: los reintentos lo repiten tal cual. */
  const congelado = useRef(new DispositivoCongelado());
  /** Releyendo la posición al tocar «Enviar reporte». */
  const [releyendo, setReleyendo] = useState(false);
  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(null);
  const [resuelto, setResuelto] = useState<ResolverRespuesta | null>(null);
  const [resolviendo, setResolviendo] = useState(false);
  const [errorUbicacion, setErrorUbicacion] = useState<string | null>(null);
  /**
   * Aviso del paso 1 que no es un error del punto: por qué se vuelve a pedir la ubicación, o por
   * qué el punto del enlace o del borrador se movió a la posición del teléfono.
   */
  const [avisoUbicacion, setAvisoUbicacion] = useState<string | null>(null);
  const [mostrarCoordenadas, setMostrarCoordenadas] = useState(false);
  const [errorCoordenadas, setErrorCoordenadas] = useState<string | null>(null);
  const [latTexto, setLatTexto] = useState('');
  const [lonTexto, setLonTexto] = useState('');
  const [fotos, setFotos] = useState<FotoDelBorrador[]>([]);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  /**
   * El reporte creado y cuánto le falta para publicarse según el servidor (`null` si un api-core
   * anterior no lo manda), con el momento en que llegó la respuesta: la cuenta regresiva corre
   * desde ahí.
   */
  const [creado, setCreado] = useState<{
    id: string;
    segundos: number | null;
    recibidoEn: number;
  } | null>(null);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [retomado, setRetomado] = useState(false);
  /**
   * Miniatura local (`blob:`) de cada foto sacada en esta visita, por `objeto_key`: se ve al
   * instante y sin pedirla al servidor. Una foto de un borrador retomado no la tiene y usa la URL
   * del servidor, que a su dueño se la sirve con su cookie.
   */
  const [miniaturas, setMiniaturas] = useState<Record<string, string>>({});
  /** Toda miniatura creada y todavía no liberada, para revocarlas al salir o al empezar de nuevo. */
  const vistas = useRef(new MiniaturasLocales());
  /** Tras un rechazo: llevar la vista hasta el primer mensaje de error del paso. */
  const [mostrarError, setMostrarError] = useState(false);
  const mapa = useRef<MapaGl | null>(null);
  const ubicacionRef = useRef<Ubicacion | null>(null);
  ubicacionRef.current = ubicacion;

  /**
   * «Me pasa a mí»: el detalle de un punto abre este flujo ya ubicado ahí, si ese punto queda a
   * 60 m o menos de la posición del teléfono (`puntoInicial`). Si el reporte nuevo cae dentro del
   * radio de recurrencia, el sistema lo agrupa solo en el mismo punto crítico (CLAUDE.md §9.2).
   */
  const enlace = ubicacionDelEnlace(parametros?.get('lat'), parametros?.get('lon'));
  const enlaceRef = useRef(enlace);
  enlaceRef.current = enlace;

  const form = useForm<ValoresFormulario>({
    resolver: resolverFormulario,
    context: { ubicacion },
    mode: 'onSubmit',
    defaultValues: valoresIniciales(),
  });
  const valores = form.watch();

  // Asegura que lat y lon en el formulario nunca queden desincronizados respecto al estado ubicacion
  useEffect(() => {
    if (ubicacion) {
      form.setValue('lat', ubicacion.lat, { shouldValidate: false });
      form.setValue('lon', ubicacion.lon, { shouldValidate: false });
      form.clearErrors(['lat', 'lon']);
    }
  }, [ubicacion, form]);

  /** Ubicación para la que vale `resuelto` (la misma referencia): esa no se vuelve a preguntar. */
  const resueltoPara = useRef<Ubicacion | null>(null);

  // Al salir del formulario se libera la memoria de las miniaturas.
  useEffect(() => {
    const creadas = vistas.current;
    return () => creadas.soltarTodas();
  }, []);

  // Salir del formulario, recargar o cerrar la pestaña apaga el GPS si seguía buscando.
  useEffect(() => {
    const apagar = () => ubicador.detener();
    window.addEventListener('pagehide', apagar);
    return () => {
      window.removeEventListener('pagehide', apagar);
      apagar();
    };
  }, [ubicador]);

  // El mapa del paso 1 se destruye al salir del paso o al perder la posición del teléfono: su
  // referencia no puede quedar apuntando a un mapa muerto, que las coordenadas intentarían mover.
  useEffect(() => {
    if (paso !== 1 || !ancla) mapa.current = null;
  }, [paso, ancla]);

  /**
   * Llegó la posición del teléfono con la precisión exigida (cada «Compartir mi ubicación», no la
   * relectura al enviar): el punto arranca en lo que ya estaba elegido si sigue dentro del
   * círculo, si no en el punto del enlace si queda cerca, y si no en la posición del teléfono.
   * Un punto aceptado con «Continuar» ya no es precargado (`aceptarPunto` en `irAdelante`), así
   * que no se muda en silencio a la posición nueva tras un 422 de la posición, una posición vencida
   * o un borrador retomado. Si quedó fuera del círculo nuevo se mueve, se avisa «Movimos el
   * punto…» y no se salta a la revisión.
   */
  const vezAnclada = estadoUbicacion.fase === 'lista' ? estadoUbicacion.vez : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo cuando llega una posición nueva; lo demás se lee por ref o del render que la trajo
  useEffect(() => {
    const e = ubicador.leer();
    if (vezAnclada === null || e.fase !== 'lista') return;
    const actual = ubicacionRef.current;
    const { punto, aviso, movido } = puntoInicial({
      ancla: e.ancla,
      guardado: puntoYaElegido(actual, { aceptado: pasoPendiente !== null }),
      enlace: enlaceRef.current,
    });
    if (!actual || punto.lat !== actual.lat || punto.lon !== actual.lon) fijarUbicacion(punto);
    setAvisoUbicacion(aviso);
    // El punto que la persona había elegido ya no es el mismo: que lo mire y siga paso a paso, en
    // vez de volver de un salto a la revisión y enviar un lugar que no eligió.
    if (movido) setPasoPendiente(null);
  }, [vezAnclada]);

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
        form.setValue('lat', b.ubicacion.lat, { shouldValidate: false });
        form.setValue('lon', b.ubicacion.lon, { shouldValidate: false });
        setResuelto(b.resuelto as ResolverRespuesta);
      } else if (b.ubicacion) {
        // Se guardó mientras se resolvía: se vuelve a preguntar en vez de dejar «Continuar» trabado.
        fijarUbicacion(b.ubicacion);
      }
      // La posición del teléfono no se guarda con el borrador: se vuelve a pedir en el paso 1, y
      // «Continuar» lleva de vuelta adonde había quedado.
      if (b.paso > 1) setPasoPendiente(b.paso);
      setPaso(1);
      setRetomado(true);
    }
  }, [form]);

  // Guardar en cada cambio. Es `sessionStorage`, así que escribir es barato y síncrono; lo que
  // no se puede es perder el último cambio por esperar a un momento mejor. La posición del
  // teléfono no va: solo el punto del reporte.
  useEffect(() => {
    if (!restaurado.current || creado) return;
    guardarBorrador({
      paso: pasoPendiente ?? paso,
      ubicacion,
      resuelto,
      fotos,
      valores: valores as Borrador['valores'],
      clave: claveEnvio.current as string,
    });
  }, [paso, pasoPendiente, ubicacion, resuelto, fotos, valores, creado]);

  const empezarDeCero = () => {
    olvidarBorrador();
    claveEnvio.current = nuevaClaveIdempotencia();
    congelado.current.soltar();
    form.reset(valoresIniciales());
    setResolviendo(false);
    setFotos([]);
    // Una foto a medio subir es del formulario que se descarta: su miniatura se suelta con las
    // demás y la subida, cuando responda, ya no se suma (ver `subir`). Se deja de esperarla para
    // que «Continuar» y «Sacar foto» no queden trabados por ella.
    vistas.current.soltarTodas();
    subir.reset();
    setMiniaturas({});
    setUbicacion(null);
    setResuelto(null);
    setErrorEnvio(null);
    setErrorUbicacion(null);
    setAvisoUbicacion(null);
    setErrorCoordenadas(null);
    setErrorFoto(null);
    setRetomado(false);
    setPasoPendiente(null);
    setPaso(1);
    // Como recién abierto, pero sin volver a pedir la ubicación si ya se compartió: el punto
    // vuelve al enlace (si queda cerca) o a la posición del teléfono.
    if (ancla) {
      const { punto, aviso } = puntoInicial({ ancla, guardado: null, enlace });
      fijarUbicacion(punto);
      setAvisoUbicacion(aviso);
      mapa.current?.jumpTo({ center: [punto.lon, punto.lat] });
    }
  };

  function fijarUbicacion(u: Ubicacion) {
    setUbicacion(u);
    // lat y lon no tienen control visible, pero SÍ están en el contrato que valida el formulario.
    // Si no se registran, `handleSubmit` falla la validación por lat/lon indefinidos y no llega a
    // llamar al callback: el botón de enviar no hacía nada.
    form.setValue('lat', u.lat, { shouldValidate: false });
    form.setValue('lon', u.lon, { shouldValidate: false });
    form.clearErrors(['lat', 'lon']);
    setErrorUbicacion(null);
    setAvisoUbicacion(null);
    setErrorCoordenadas(null);
    // Otro punto es otro envío: la posición congelada para reintentar el anterior ya no vale.
    congelado.current.soltar();
    // La unidad vecinal a la vista es la del punto anterior: se borra y «Continuar» espera la
    // respuesta del punto nuevo, que pide el efecto de abajo.
    setResuelto(null);
    setResolviendo(true);
  }

  /** Un punto elegido en el mapa (arrastre, toque, flechas), recortado al círculo. */
  function elegirPunto(lat: number, lon: number) {
    if (!ancla) return;
    const p = recortarAlCirculo({ lat, lon }, ancla);
    fijarUbicacion({ lat: p.lat, lon: p.lon });
  }

  /** «Mover 5 m»: desde el punto actual, sin salir del círculo. */
  function moverPunto(direccion: Direccion) {
    if (!ancla) return;
    const p = moverDentroDelRadio(ubicacion ?? ancla, direccion, PASO_BOTON_M, ancla);
    fijarUbicacion({ lat: p.lat, lon: p.lon });
  }

  function confirmarCoordenadas() {
    if (!ancla) return;
    const r = coordenadasEscritas(latTexto, lonTexto, ancla);
    if (r.tipo !== 'ok') {
      setErrorCoordenadas(r.mensaje);
      return;
    }
    mapa.current?.jumpTo({ center: [r.punto.lon, r.punto.lat] });
    fijarUbicacion({ lat: r.punto.lat, lon: r.punto.lon });
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

  const subir = useMutation({
    mutationFn: ({ foto }: { foto: File; vista: string }) => subirFoto(foto),
    // TanStack llama a estos dos aunque el formulario se haya reiniciado en el medio (`subir.reset()`
    // solo deja de esperarla). Una subida empezada antes de «Empezar de nuevo» tiene su miniatura
    // ya soltada: no se suma al formulario nuevo, que mostraría un `blob:` revocado, y su error no
    // es de este formulario. La foto queda sin reporte y la borra el mantenimiento.
    onSuccess: (f, { vista }) => {
      if (!vistas.current.sigueViva(vista)) return;
      setFotos((prev) => [
        ...prev,
        { objeto_key: f.objeto_key, url: f.url, subida_en: Date.now() },
      ]);
      setMiniaturas((m) => ({ ...m, [f.objeto_key]: vista }));
      setErrorFoto(null);
      toast('Foto agregada · metadatos eliminados');
    },
    onError: (e, { vista }) => {
      const deEsteFormulario = vistas.current.sigueViva(vista);
      vistas.current.soltar(vista);
      // 401: la sesión venció mientras se elegía la foto. Mismo camino que el envío («Se cerró tu
      // sesión», con el borrador guardado) en vez de un error suelto que no dice qué hacer.
      if (esSesionCaducada(e)) {
        setSesionCaducada(true);
        return;
      }
      if (!deEsteFormulario) return;
      // El resto (incluido el 429 de cuota de fotos, con su propio texto) va junto a las fotos y
      // no toca nada más del formulario.
      setErrorFoto(mensajeDeFoto(e));
    },
  });

  const mosaico = mosaicoDeFotos({ subidas: fotos.length, subiendo: subir.isPending });

  /**
   * «Usar esta foto» de la cámara. Se comprueba ANTES de subir: el servidor lo rechaza igual
   * (413 / 415), pero llegar hasta ahí significa haber mandado la foto por datos móviles para que
   * le digan que no, y quien peor conexión tiene es quien más lo paga.
   */
  function alSacarFoto(foto: File, vista: string) {
    vistas.current.guardar(vista);
    const error = mosaico.completas ? TEXTO_FOTOS_COMPLETAS : motivoDeRechazoDeFoto(foto);
    if (error) {
      vistas.current.soltar(vista);
      setErrorFoto(error);
      return;
    }
    setErrorFoto(null);
    subir.mutate({ foto, vista });
  }

  function quitarFoto(clave: string) {
    setFotos((p) => p.filter((x) => x.objeto_key !== clave));
    const vista = miniaturas[clave];
    if (vista) vistas.current.soltar(vista);
    setMiniaturas(({ [clave]: _quitada, ...resto }) => resto);
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
  // nada (TRASPASO §3.8). Se elige el primero del documento: los errores de campo (en el área con
  // scroll) van antes que el aviso del envío (en el pie, que siempre está a la vista).
  useEffect(() => {
    if (!mostrarError) return;
    setMostrarError(false);
    const primero = document.querySelector<HTMLElement>('[data-campo-con-error]');
    const plegado = primero?.closest('details');
    if (plegado) plegado.open = true;
    primero?.scrollIntoView({ block: 'center' });
  }, [mostrarError]);

  const enviar = useMutation({
    mutationFn: (payload: Parameters<typeof crearReporte>[0]) =>
      crearReporte(payload, claveEnvio.current as string),
    onSuccess: (f) => {
      congelado.current.soltar();
      ubicador.detener();
      const p = f.properties;
      // El reporte ya está del lado del servidor: el borrador deja de tener sentido y quedarse
      // guardado significaría que el próximo reporte arrancaría con los datos de este.
      olvidarBorrador();
      setCreado({
        id: p.id,
        segundos: typeof p.segundos_para_publicar === 'number' ? p.segundos_para_publicar : null,
        recibidoEn: Date.now(),
      });
      // El cupo de la cuenta acaba de cambiar en el servidor, y «Mis reportes» tiene uno más.
      void refrescarSesion(cliente);
      void cliente.invalidateQueries({ queryKey: [...CLAVE_MIS_REPORTES] });
      void cliente.invalidateQueries({ queryKey: ['reportes'] });
      void cliente.invalidateQueries({ queryKey: ['agregados'] });
    },
    onError: (e) => {
      // Un «no» del servidor (4xx) es definitivo: el próximo intento vuelve a leer la posición.
      // Con un fallo dudoso (red, plazo, 5xx) se conserva, para que el reintento sea el mismo.
      if (e instanceof ErrorApi && e.estado >= 400 && e.estado < 500) congelado.current.soltar();
      // 401: la sesión venció entre que se abrió el formulario y se pulsó «Enviar». El borrador
      // sigue guardado, así que se ofrece volver a entrar en vez de tirar el trabajo.
      if (esSesionCaducada(e)) {
        setSesionCaducada(true);
        return;
      }
      // 422 de la posición del teléfono (precisión, antigüedad o radio): se vuelve a pedir en el
      // paso 1, con el texto de cada caso, y «Continuar» trae de vuelta a la revisión.
      if (esUbicacionRechazada(e)) {
        ubicador.reiniciar();
        setAvisoUbicacion(mensajeDeError(e));
        setPasoPendiente(PASOS);
        setPaso(1);
        return;
      }
      // 429 de cuota: no es un fallo de red ni algo que se arregle reintentando, y el texto
      // genérico de «probá de nuevo» sería mentira. Se muestra el del servidor y se vuelve a
      // preguntar el cupo: con 0 restantes el formulario pasa al aviso de cupo agotado.
      if (esCuotaAgotada(e)) {
        setErrorEnvio(mensajeDeCuota(e));
        void refrescarSesion(cliente);
        return;
      }
      setErrorEnvio(mensajeDeEnvio(e));
      const detalles = detallesDeError(e);
      for (const d of detalles) {
        form.setError(d.campo as keyof ValoresFormulario, { message: d.mensaje });
      }
      if (detalles.length) llevarAlError(detalles.map((d) => d.campo));
    },
  });

  // ---------------------------------------------------------------- confirmación

  if (creado) return <Confirmacion {...creado} />;

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
  // Con el cupo agotado se avisa acá, antes del paso 1: ni la ubicación ni la cámara se piden
  // para un reporte que el servidor va a rechazar. El borrador sigue guardado para mañana.
  if (cupo === 'comprobando')
    return (
      <p className="ayuda p-6" role="status">
        Comprobando cuántos reportes te quedan hoy…
      </p>
    );
  if (cupo === 'agotado') return <CupoAgotado />;

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
    ancla,
    ubicacion,
    resuelto,
    resolviendo,
    profundidad_estimada: valores.profundidad_estimada,
    frecuencia: valores.frecuencia,
    evento_en: valores.evento_en,
    descripcion: valores.descripcion,
    subiendoFoto: subir.isPending,
    enviando: enviar.isPending || releyendo,
    ahora,
  };
  const errores = form.formState.errors;
  const limitesFecha = limitesFechaEvento(ahora);
  const errorFecha = errores.evento_en?.message ?? problemaFechaEvento(valores.evento_en, ahora);

  const irAdelante = () => {
    if (paso === 1 && mostrarCoordenadas && latTexto.trim() && lonTexto.trim()) {
      if (ancla) {
        const r = coordenadasEscritas(latTexto, lonTexto, ancla);
        if (r.tipo === 'ok') {
          mapa.current?.jumpTo({ center: [r.punto.lon, r.punto.lat] });
          fijarUbicacion({ lat: r.punto.lat, lon: r.punto.lon });
        } else {
          setErrorCoordenadas(r.mensaje);
          return;
        }
      }
    }
    if (paso === 1 && ubicacion) {
      // «Continuar» acepta el punto: deja de ser el que puso la app y ya no se muda solo cuando
      // vuelva a llegar la posición del teléfono. Es el mismo lugar, así que la unidad vecinal
      // resuelta sigue valiendo y no se vuelve a preguntar.
      const aceptado = aceptarPunto(ubicacion);
      if (aceptado !== ubicacion) {
        if (resueltoPara.current === ubicacion) resueltoPara.current = aceptado;
        setUbicacion(aceptado);
      }
    }
    if (paso === 1 && pasoPendiente) {
      setPaso(pasoPendiente);
      setPasoPendiente(null);
      return;
    }
    setPaso((p) => Math.min(PASOS, p + 1));
  };
  const irAtras = () => setPaso((p) => Math.max(1, p - 1));

  /** Vuelve al paso 1 a ajustar el punto o a compartir la ubicación, y después a la revisión. */
  const volverAlPaso1 = () => {
    setPasoPendiente(PASOS);
    setPaso(1);
  };

  const enviarFormulario = form.handleSubmit(
    async (datos) => {
      // Defensa: con una foto subiendo el botón está deshabilitado, pero Enter también envía.
      if (subir.isPending || enviar.isPending || releyendo) return;
      if (!ubicacion) {
        setErrorUbicacion(MENSAJE_FALTA_UBICACION);
        setPaso(1);
        return;
      }
      setErrorEnvio(null);
      // Un reintento repite el `dispositivo` del primer intento. Si no hay, se relee la posición:
      // el teléfono pudo moverse desde el paso 1.
      let dispositivo = congelado.current.actual();
      if (!dispositivo) {
        const antes = ubicador.leer();
        setReleyendo(true);
        const relectura = await ubicador.releer();
        setReleyendo(false);
        const decision = decidirEnvio({
          punto: ubicacion,
          relectura,
          anterior: antes.fase === 'lista' ? antes.ancla : null,
          ahora: Date.now(),
        });
        if (decision.tipo === 'vencida') {
          ubicador.reiniciar();
          setAvisoUbicacion(
            `Tu ubicación tiene más de ${MINUTOS_POSICION} minutos y no pudimos volver a leerla. Compartila de nuevo para enviar el reporte.`,
          );
          volverAlPaso1();
          return;
        }
        if (decision.tipo === 'movido') {
          setErrorUbicacion(
            `Te moviste ${decision.movidoM} m: ajustá el punto para que quede a ${RADIO_M} m o menos de donde estás.`,
          );
          volverAlPaso1();
          return;
        }
        dispositivo = congelado.current.tomar(decision.lectura, Date.now());
      }
      enviar.mutate(armarEnvio(datos, ubicacion, fotos, dispositivo));
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
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={enviarFormulario}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && paso < PASOS && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
          e.preventDefault();
          if (puedeAvanzar(paso, estadoAvance)) {
            irAdelante();
          }
        }
      }}
      noValidate
    >
      <div className="flex-shrink-0 bg-[var(--color-crema)] z-10">
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

        {/* Cuántos le quedan hoy a la cuenta. Es aviso, no control: decide el servidor al enviar. */}
        {reportesRestantesHoy !== null ? (
          <p className="ayuda px-5 pb-3" data-testid="cupo-reportes">
            {textoCupo(reportesRestantesHoy)}
          </p>
        ) : null}

        {retomado ? (
          <div className="px-5 pb-3">
            <Aviso tono="info" data-testid="borrador-retomado">
              <b className="mb-1 block text-[14.5px]">Retomamos lo que habías empezado</b>
              {ancla
                ? 'Seguimos desde donde lo dejaste.'
                : 'Para seguir desde donde lo dejaste, volvé a compartir tu ubicación: no la guardamos.'}{' '}
              Nada de esto se envió todavía.
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
      </div>

      {/* ---------------------------------------------------------------- paso 1 */}
      {paso === 1 ? (
        <>
          <div className="flex-none px-5 pb-3">
            <p className="pno">Paso 1 de {PASOS}</p>
            <p className="preg">¿Dónde se junta el agua?</p>
          </div>
          {!ancla ? (
            // Sin la posición del teléfono no hay mapa: primero se comparte la ubicación, y solo
            // al tocar el botón (plan 2026-09-26, pedido F).
            <VistaPedirUbicacion
              estado={estadoUbicacion}
              alCompartir={() => ubicador.compartir()}
              alSimular={() => ubicador.simular()}
              aviso={avisoUbicacion}
            />
          ) : (
            <>
              <div className="relative mx-5 min-h-[260px] flex-1 overflow-hidden rounded-[20px]">
                <MapaDiferido
                  className="map"
                  ariaLabel="Mapa para elegir la ubicación del reporte"
                  centro={centroDelPaso1(ubicacion, ancla)}
                  zoom={17}
                  circulo={{ lat: ancla.lat, lon: ancla.lon, radioM: RADIO_M }}
                  seleccionUbicacion={ubicacion ? { lat: ubicacion.lat, lon: ubicacion.lon } : null}
                  onUbicacion={elegirPunto}
                  alListo={(m) => {
                    mapa.current = m;
                    // El círculo entero a la vista (y el punto, si quedó afuera), sea cual sea el
                    // tamaño de la pantalla.
                    m.fitBounds(encuadreDelPaso1(ancla, ubicacionRef.current), {
                      // Arriba, lugar para el dibujo del marcador, que sale hacia arriba del punto.
                      padding: { top: 56, bottom: 24, left: 24, right: 24 },
                      duration: 0,
                    });
                  }}
                />
                <div className="flot right-3 bottom-3 grid gap-2">
                  <button
                    type="button"
                    className="bico bico-sm bico-verde"
                    data-testid="boton-punto-en-mi-ubicacion"
                    onClick={() => {
                      mapa.current?.easeTo({ center: [ancla.lon, ancla.lat] });
                      fijarUbicacion({ lat: ancla.lat, lon: ancla.lon });
                    }}
                    aria-label="Poner el punto en mi ubicación"
                  >
                    <Navigation size={17} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="px-5 pt-3">
                <p className="lbl" id="titulo-mover-punto">
                  Mover el punto {PASO_BOTON_M} m
                </p>
                <fieldset className="grid grid-cols-4 gap-2" aria-labelledby="titulo-mover-punto">
                  {BOTONES_MOVER.map(({ direccion, Icono, texto }) => (
                    <button
                      key={direccion}
                      type="button"
                      className="btn btn-fantasma btn-sm min-h-12"
                      data-testid={`mover-${direccion}`}
                      aria-label={`Mover el punto ${PASO_BOTON_M} m ${texto}`}
                      onClick={() => moverPunto(direccion)}
                    >
                      <Icono size={18} aria-hidden="true" />
                    </button>
                  ))}
                </fieldset>
                <p className="ayuda mt-2" data-testid="ayuda-circulo">
                  El círculo marca {RADIO_M} m alrededor de tu ubicación (precisión de{' '}
                  {Math.round(ancla.precisionM)} m) y el punto no puede salir de él. También podés
                  arrastrar el marcador, tocar el mapa o, con el marcador elegido, usar las flechas
                  del teclado.
                </p>
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
                      Alternativa sin arrastrar: escribí la latitud y la longitud en grados
                      decimales (EPSG:4326). Tienen que quedar a {RADIO_M} m o menos de donde estás.
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
                          onChange={(e) => {
                            setLatTexto(e.target.value);
                            setErrorCoordenadas(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              confirmarCoordenadas();
                            }
                          }}
                          placeholder={ancla.lat.toFixed(6)}
                          aria-describedby={errorCoordenadas ? 'error-coordenadas' : undefined}
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
                          onChange={(e) => {
                            setLonTexto(e.target.value);
                            setErrorCoordenadas(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              confirmarCoordenadas();
                            }
                          }}
                          placeholder={ancla.lon.toFixed(6)}
                          aria-describedby={errorCoordenadas ? 'error-coordenadas' : undefined}
                        />
                      </div>
                    </div>
                    {errorCoordenadas ? (
                      <p
                        id="error-coordenadas"
                        className="error"
                        role="alert"
                        data-testid="error-coordenadas"
                      >
                        {errorCoordenadas}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      data-testid="boton-confirmar-ubicacion"
                      className="btn btn-tinta btn-sm"
                      onClick={confirmarCoordenadas}
                    >
                      Confirmar ubicación
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="pie" aria-live="polite">
                {avisoUbicacion ? (
                  <Aviso tono="alerta" className="mb-3" data-testid="aviso-ubicacion">
                    {avisoUbicacion}
                  </Aviso>
                ) : null}
                {errorUbicacion ? (
                  <Aviso tono="err" className="mb-3" data-testid="error-ubicacion">
                    {errorUbicacion}
                  </Aviso>
                ) : resuelto?.dentro_cobertura && ubicacion ? (
                  <Aviso tono="ok" className="mb-3" data-testid="ubicacion-resuelta">
                    <b>
                      {etiquetaUnidadVecinal(resuelto.unidad_vecinal?.codigo)} ·{' '}
                      {etiquetaDistrito(resuelto.distrito?.codigo)}
                    </b>
                    <br />
                    {resuelto.asignado_por_proximidad
                      ? `Asignada por proximidad, a ${Math.round(resuelto.distancia_m ?? 0)} m. `
                      : ''}
                    <span data-testid="distancia-al-punto">{textoDistancia(ubicacion, ancla)}</span>{' '}
                    Arrastrá el marcador para ajustar el punto exacto.
                  </Aviso>
                ) : (
                  <Aviso tono="info" className="mb-3" data-testid="ubicacion-pendiente">
                    {resolviendo
                      ? 'Buscando la unidad vecinal…'
                      : 'Arrastrá el marcador hasta el punto exacto.'}
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
          )}
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

            {fotos.length > 0 || subir.isPending ? (
              <ul className="mt-4 grid grid-cols-3 gap-2.5" aria-label="Fotos del reporte">
                {fotos.map((f) => (
                  <li key={f.objeto_key} className="relative aspect-square">
                    <span className="foto block h-full w-full">
                      {/* biome-ignore lint/performance/noImgElement: miniatura de la foto ya subida */}
                      <img
                        src={miniaturas[f.objeto_key] ?? urlFotoRelativa(f.url)}
                        alt="Foto que sacaste"
                      />
                    </span>
                    <BotonQuitar
                      etiqueta="Quitar esta foto"
                      onClick={() => quitarFoto(f.objeto_key)}
                    />
                  </li>
                ))}
                {subir.isPending ? (
                  <li className="relative aspect-square">
                    {subir.variables?.vista ? (
                      <span className="foto block h-full w-full" aria-hidden="true">
                        {/* biome-ignore lint/performance/noImgElement: miniatura local de la foto que se está subiendo */}
                        <img src={subir.variables.vista} alt="" />
                      </span>
                    ) : null}
                    <div
                      role="status"
                      data-testid="foto-subiendo-mosaico"
                      className="absolute inset-0 grid place-items-center content-center justify-items-center gap-1 rounded-xl border-[1.5px] border-dashed border-verde-700 bg-white/75 px-1 text-center text-[12.5px] font-semibold text-tinta-900"
                    >
                      <Camera size={20} aria-hidden="true" />
                      Subiendo…
                    </div>
                  </li>
                ) : null}
              </ul>
            ) : null}
            {/* La foto sale solo de la cámara, dentro de la página: no hay input de archivo ni
                galería (plan 2026-09-26, pedido D). */}
            <CamaraReporte
              deshabilitada={mosaico.completas || subir.isPending}
              alUsarFoto={alSacarFoto}
            />
            <p id="ayuda-foto" className="ayuda mt-1.5" aria-live="polite">
              {mosaico.completas
                ? TEXTO_FOTOS_COMPLETAS
                : subir.isPending
                  ? 'Subiendo la foto… Cuando termine, podés sacar otra.'
                  : 'Es opcional: la cámara se abre acá mismo, y podés enviar el reporte sin foto.'}
            </p>
            <div className="mt-1.5 flex justify-between text-[13.5px] text-tinta-600">
              <span>Hasta {MAX_FOTOS} fotos</span>
              <span>
                {fotos.length}/{MAX_FOTOS}
              </span>
            </div>
            {errorFoto ? <ErrorDeFoto mensaje={errorFoto} className="mt-3" /> : null}
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
                alEditar={volverAlPaso1}
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
              <ErrorDeFoto mensaje={errorFoto} titulo="Foto sin subir" className="mt-3.5" />
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
          </div>
          {/* El aviso del envío va en el pie, junto al botón: el área de arriba hace scroll y un
              aviso al final de ella quedaba debajo del pliegue (plan 2026-10-04, M-6.1). */}
          <PieDeRevision
            errorEnvio={errorEnvio}
            deshabilitado={!puedeAvanzar(4, estadoAvance)}
            textoBoton={
              releyendo
                ? 'Confirmando tu ubicación…'
                : enviar.isPending
                  ? 'Enviando…'
                  : subir.isPending
                    ? 'Subiendo foto…'
                    : 'Enviar reporte'
            }
          >
            <Aviso tono="info" className="mt-2" data-testid="aviso-demora">
              <b className="block">{textoDemora(demoraProximoS)}</b>
              Aparece en el mapa como «{TEXTO_SIN_VERIFICAR}» hasta que un técnico municipal lo
              revise.
            </Aviso>
            <p className="ayuda mt-2 text-center">
              Al enviar volvemos a leer tu ubicación para comprobar que el punto siga a {RADIO_M} m
              o menos de vos; no la guardamos. En el mapa nunca aparece quién reportó.
            </p>
          </PieDeRevision>
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

/**
 * Confirmación (C-12): el reporte ya llegó y se publica solo cuando llega su `publicar_en`. La
 * cuenta regresiva parte de los segundos que calculó el servidor; al terminar, el mapa público no
 * se entera solo (no se refresca por su cuenta), así que se dice que hay que recargarlo y el
 * enlace al mapa lo recarga.
 */
function Confirmacion({
  id,
  segundos,
  recibidoEn,
}: {
  id: string;
  segundos: number | null;
  recibidoEn: number;
}) {
  const toast = useToast();
  const cliente = useQueryClient();
  const codigo = id.slice(0, 8).toUpperCase();
  // Volver al mapa después de enviar es pedir verlo con lo nuevo: se descarta lo que había en
  // memoria, que el mapa guarda sin caducidad.
  const alVolverAlMapa = () => {
    void cliente.invalidateQueries({ queryKey: ['reportes'] });
    void cliente.invalidateQueries({ queryKey: ['agregados'] });
  };
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
        {segundos !== null ? (
          <p className="titular mt-2.5 text-[20px] text-white tabular-nums">
            <CuentaRegresiva segundos={segundos} recibidoEn={recibidoEn} />
          </p>
        ) : null}
        <p className="mt-2.5 text-[15.5px] leading-[1.5] text-white">
          <TextoTrasEnviar segundos={segundos} recibidoEn={recibidoEn} />
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
        Cuando un técnico lo verifica, si el punto ya estaba reportado por otro vecino, el sistema
        agrupa los reportes cercanos en un mismo punto crítico. Eso le da más peso cuando el
        municipio prioriza obras. Podés seguir su estado en «Mis reportes».
      </Aviso>

      <div className="mt-4.5 grid gap-2.5">
        <Link href="/mis-reportes" className="btn btn-bloque no-underline">
          Ver mis reportes
        </Link>
        <Link
          href="/"
          className="btn btn-fantasma btn-bloque no-underline"
          onClick={alVolverAlMapa}
        >
          Volver al mapa
        </Link>
      </div>
    </div>
  );
}
