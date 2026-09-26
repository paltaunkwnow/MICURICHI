'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
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
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useForm } from 'react-hook-form';
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
  guardarBorrador,
  leerBorrador,
  olvidarBorrador,
  PASOS_REPORTE as PASOS,
} from '@/lib/borrador';
import { detallesDeError, mensajeDeEnvio, mensajeDeError } from '@/lib/errores';
import {
  contadorDescripcion,
  etiquetaDistrito,
  etiquetaUnidadVecinal,
  urlFotoRelativa,
} from '@/lib/formato';
import { motivoDeRechazoDeFoto } from '@/lib/foto';
import { CENTRO_INICIAL, leerCoordenadas } from '@/lib/geo';
import { recordarReporte } from '@/lib/misReportes';
import { useSesion } from '@/lib/sesion';
import { AccesoRequerido } from './AccesoRequerido';
import { Aviso } from './Aviso';
import { ChipSeveridad } from './ChipSeveridad';
import { MapaDiferido } from './MapaDiferido';
import { useToast } from './Toast';

interface Ubicacion {
  lat: number;
  lon: number;
  metodo: 'gps' | 'manual';
  precisionM: number | null;
}

interface FotoLista {
  objeto_key: string;
  url: string;
}

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

/** Espacio de foto abierto con «¿Querés añadir otro detalle?»; se consume al subir su foto. */
interface EspacioCamara {
  id: number;
}

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

export function FormularioReporte() {
  const parametros = useSearchParams();
  const toast = useToast();
  const { usuario, cargando: comprobandoSesion, puedeReportarDesde } = useSesion();
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
  const [mostrarCoordenadas, setMostrarCoordenadas] = useState(false);
  const [latTexto, setLatTexto] = useState('');
  const [lonTexto, setLonTexto] = useState('');
  const [fotos, setFotos] = useState<FotoLista[]>([]);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  const [creado, setCreado] = useState<{ id: string } | null>(null);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [retomado, setRetomado] = useState(false);
  const [espaciosCamara, setEspaciosCamara] = useState<EspacioCamara[]>([]);
  const mapa = useRef<MapaGl | null>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const siguienteEspacio = useRef(1);

  /**
   * «Me pasa a mí»: el detalle de un punto abre este flujo ya ubicado ahí. Si el reporte nuevo
   * cae dentro del radio de recurrencia, el sistema lo agrupa solo en el mismo punto crítico
   * (CLAUDE.md §9.2) — no hace falta un endpoint aparte para «sumarse».
   */
  const centroInicial: [number, number] = (() => {
    const lat = Number(parametros?.get('lat'));
    const lon = Number(parametros?.get('lon'));
    return Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)
      ? [lon, lat]
      : CENTRO_INICIAL;
  })();

  const form = useForm<ReporteCrearEntrada>({
    resolver: zodResolver(ReporteCrearSchema),
    mode: 'onSubmit',
    defaultValues: {
      ubicacion_tipo: 'via_publica',
      causa_presunta: 'desconocida',
      descripcion: '',
      fotos: [],
      sitio_web: '',
    },
  });
  const valores = form.watch();

  const resolviendoRef = useRef<AbortController | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
      resolviendoRef.current?.abort();
    },
    [],
  );

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
  useEffect(() => {
    if (restaurado.current) return;
    restaurado.current = true;
    const b = leerBorrador();
    if (!b || !borradorTieneContenido(b)) return;
    claveEnvio.current = b.clave;
    form.reset({ ...form.getValues(), ...b.valores });
    setFotos(b.fotos);
    if (b.ubicacion) setUbicacion(b.ubicacion);
    if (b.resuelto) setResuelto(b.resuelto as ResolverRespuesta);
    setPaso(b.paso);
    setRetomado(true);
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
    form.reset({
      ubicacion_tipo: 'via_publica',
      causa_presunta: 'desconocida',
      descripcion: '',
      fotos: [],
      sitio_web: '',
    });
    setFotos([]);
    setUbicacion(null);
    setResuelto(null);
    setErrorEnvio(null);
    setErrorUbicacion(null);
    setRetomado(false);
    setPaso(1);
  };

  function fijarUbicacion(
    lat: number,
    lon: number,
    metodo: 'gps' | 'manual',
    precisionM: number | null,
  ) {
    setUbicacion({ lat, lon, metodo, precisionM });
    // Estos cuatro campos no tienen control visible, pero SÍ están en ReporteCrearSchema, que es
    // el resolver del formulario. Si no se registran, `handleSubmit` falla la validación por
    // lat/lon indefinidos y no llega a llamar al callback: el botón de enviar no hacía nada.
    form.setValue('lat', lat, { shouldValidate: false });
    form.setValue('lon', lon, { shouldValidate: false });
    form.setValue('ubicacion_metodo', metodo, { shouldValidate: false });
    form.setValue('precision_gps_m', precisionM, { shouldValidate: false });
    form.clearErrors(['lat', 'lon', 'ubicacion_metodo']);
    setErrorUbicacion(null);

    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(async () => {
      resolviendoRef.current?.abort();
      const control = new AbortController();
      resolviendoRef.current = control;
      setResolviendo(true);
      try {
        const r = await resolverPunto(lat, lon, control.signal);
        if (control.signal.aborted) return;
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
  }

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
        mapa.current?.flyTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 17,
          duration: 700,
        });
        fijarUbicacion(
          pos.coords.latitude,
          pos.coords.longitude,
          'gps',
          pos.coords.accuracy ?? null,
        );
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
      setFotos((prev) => [...prev, { objeto_key: f.objeto_key, url: f.url }]);
      setErrorFoto(null);
      toast('Foto agregada · metadatos eliminados');
    },
    onError: (e) => setErrorFoto(mensajeDeError(e)),
  });

  /**
   * Único camino de subida, sea el «Agregar» de la galería o un espacio de «Foto de referencia»
   * con la cámara. Se comprueba ANTES de subir: el servidor lo rechaza igual (413 / 415), pero
   * llegar hasta ahí significa haber mandado hasta 8 MB por datos móviles para que le digan que
   * no, y quien peor conexión tiene es quien más lo paga.
   */
  function alElegirFoto(e: ChangeEvent<HTMLInputElement>, alSubir?: () => void) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const error = motivoDeRechazoDeFoto(f);
    if (error) {
      setErrorFoto(error);
      return;
    }
    subir.mutate(f, alSubir ? { onSuccess: alSubir } : undefined);
  }

  const quitarEspacio = (id: number) => setEspaciosCamara((p) => p.filter((x) => x.id !== id));

  // El tope cuenta también los espacios abiertos y sin foto: si no, se podrían abrir más
  // espacios que fotos admite el reporte y el último fallaría al subir.
  const lugaresOcupados = fotos.length + espaciosCamara.length;
  const fotosCompletas = lugaresOcupados >= CONFIG_DOMINIO.FOTOS_MAX_POR_REPORTE;

  function abrirOtroDetalle() {
    if (fotosCompletas) return;
    const id = siguienteEspacio.current++;
    // flushSync pinta el espacio ya, dentro del mismo toque: el `<input>` tiene que existir para
    // abrir la cámara, y los navegadores solo la abren en respuesta directa a un gesto. Si aun así
    // no se abre, el espacio queda a la vista con su propio botón y basta con tocarlo.
    flushSync(() => setEspaciosCamara((p) => [...p, { id }]));
    document.getElementById(`foto-referencia-${id}`)?.click();
  }

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
    },
    onError: (e) => {
      // 401: la sesión venció entre que se abrió el formulario y se pulsó «Enviar». El borrador
      // sigue guardado, así que se ofrece volver a entrar en vez de tirar el trabajo.
      if (e instanceof ErrorApi && e.estado === 401) {
        setSesionCaducada(true);
        return;
      }
      // 429 de cuota: no es un fallo de red ni algo que se arregle reintentando, y el texto
      // genérico de «probá de nuevo» sería mentira. El servidor ya manda un mensaje con el
      // tiempo que falta; se usa ese.
      if (e instanceof ErrorApi && e.estado === 429 && e.codigo === 'CUOTA_DE_REPORTES') {
        setErrorEnvio(e.message);
        return;
      }
      setErrorEnvio(mensajeDeEnvio(e));
      for (const d of detallesDeError(e)) {
        form.setError(d.campo as keyof ReporteCrearEntrada, { message: d.mensaje });
      }
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
  if (!usuario) return <AccesoRequerido />;

  // ---------------------------------------------------------------- pasos

  const severidad =
    valores.profundidad_estimada && valores.frecuencia
      ? calcularSeveridad({
          profundidad_estimada: valores.profundidad_estimada,
          frecuencia: valores.frecuencia,
        })
      : null;

  const puedePaso2 = !!ubicacion && !!resuelto?.dentro_cobertura;
  const puedePaso3 = !!valores.profundidad_estimada && !!valores.frecuencia;
  const puedePaso4 = (valores.descripcion ?? '').trim().length >= CONFIG_DOMINIO.DESCRIPCION_MIN;

  const irAdelante = () => setPaso((p) => Math.min(PASOS, p + 1));
  const irAtras = () => setPaso((p) => Math.max(1, p - 1));

  const enviarFormulario = form.handleSubmit(
    (datos) => {
      if (!ubicacion) {
        setErrorEnvio('Falta la ubicación: volvé al paso 1 y elegí el punto.');
        setPaso(1);
        return;
      }
      setErrorEnvio(null);
      enviar.mutate({
        ...datos,
        lat: ubicacion.lat,
        lon: ubicacion.lon,
        ubicacion_metodo: ubicacion.metodo,
        precision_gps_m: ubicacion.precisionM,
        fotos: fotos.map((f) => f.objeto_key),
      });
    },
    (errores) => {
      // Sin esto, un fallo de validación en un campo sin control visible (lat, lon,
      // ubicacion_metodo) dejaba el botón sin efecto y sin ningún mensaje.
      const ocultos = ['lat', 'lon', 'ubicacion_metodo', 'precision_gps_m'] as const;
      if (ocultos.some((c) => errores[c])) {
        setErrorEnvio('Falta la ubicación: volvé al paso 1 y elegí el punto.');
        setPaso(1);
        return;
      }
      const pasoDelError =
        errores.profundidad_estimada || errores.frecuencia ? 2 : errores.descripcion ? 3 : 4;
      setPaso(pasoDelError);
      setErrorEnvio('Revisá los campos marcados y volvé a intentar.');
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
            Vas a poder enviar otro a las{' '}
            {puedeReportarDesde.toLocaleTimeString('es-BO', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })}
            . Podés ir completando este mientras tanto.
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
            <MapaDiferido
              className="map"
              ariaLabel="Mapa para elegir la ubicación del reporte"
              centro={centroInicial}
              zoom={17}
              seguirCentro
              onUbicacion={(lat, lon) => fijarUbicacion(lat, lon, 'manual', null)}
              alListo={(m) => {
                mapa.current = m;
              }}
            />
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
                      placeholder="-17.78"
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
                      placeholder="-63.18"
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
                    fijarUbicacion(c.lat, c.lon, 'manual', null);
                  }}
                >
                  Confirmar ubicación
                </button>
              </div>
            ) : null}
          </div>

          <div className="pie" aria-live="polite">
            {errorUbicacion ? (
              <Aviso tono="err" className="mb-3">
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
              <Aviso tono="info" className="mb-3">
                {resolviendo
                  ? 'Buscando la unidad vecinal…'
                  : 'Mové el mapa hasta el punto exacto.'}
              </Aviso>
            )}
            <button
              type="button"
              data-testid="boton-siguiente"
              className="btn btn-bloque"
              disabled={!puedePaso2}
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
                  formulario. Lo mismo al retomar un borrador. */}
              <input
                id="evento"
                type="date"
                className="campo"
                max={new Date().toISOString().slice(0, 10)}
                value={valores.evento_en ? String(valores.evento_en).slice(0, 10) : ''}
                onChange={(e) =>
                  form.setValue(
                    'evento_en',
                    e.target.value ? new Date(`${e.target.value}T12:00:00Z`).toISOString() : null,
                  )
                }
              />
              <p className="ayuda mt-1.5">Si la dejás vacía, tomamos la fecha de hoy.</p>
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
                    onCambio={() => form.setValue('profundidad_estimada', p)}
                  />
                ))}
              </div>
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
                    onCambio={() => form.setValue('frecuencia', f)}
                  />
                ))}
              </div>
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
              disabled={!puedePaso3}
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
                  <button
                    type="button"
                    className="absolute top-1.5 right-1.5 grid h-6 w-6 place-items-center rounded-full bg-white/95 text-[13px] font-bold"
                    aria-label="Quitar esta foto"
                    onClick={() => setFotos((p) => p.filter((x) => x.objeto_key !== f.objeto_key))}
                  >
                    ×
                  </button>
                </li>
              ))}
              {espaciosCamara.map((esp) => (
                <li key={esp.id} className="relative aspect-square">
                  <label
                    htmlFor={`foto-referencia-${esp.id}`}
                    className="grid h-full w-full cursor-pointer place-items-center justify-items-center gap-1 rounded-xl border-[1.5px] border-dashed border-verde-700 bg-white px-1 text-center text-[12.5px] text-tinta-600 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-verde-700"
                  >
                    <Camera size={20} aria-hidden="true" />
                    {subir.isPending ? 'Subiendo…' : 'Foto de referencia'}
                  </label>
                  {/* `capture` pide la cámara trasera en el teléfono; en escritorio se comporta
                      como un selector de archivos más. El tipo real lo decide el servidor por
                      los bytes, y antes `motivoDeRechazoDeFoto` descarta lo que no se admite. */}
                  <input
                    id={`foto-referencia-${esp.id}`}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    aria-label="Foto de referencia"
                    disabled={subir.isPending}
                    onChange={(e) => alElegirFoto(e, () => quitarEspacio(esp.id))}
                  />
                  <button
                    type="button"
                    className="absolute top-1.5 right-1.5 grid h-6 w-6 place-items-center rounded-full bg-white/95 text-[13px] font-bold"
                    aria-label="Quitar este espacio de foto"
                    onClick={() => quitarEspacio(esp.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
              {lugaresOcupados < CONFIG_DOMINIO.FOTOS_MAX_POR_REPORTE ? (
                <li className="aspect-square">
                  <button
                    type="button"
                    className="grid h-full w-full place-items-center justify-items-center gap-1 rounded-xl border-[1.5px] border-dashed border-[#C9D2CD] bg-white text-[12.5px] text-tinta-600"
                    onClick={() => archivo.current?.click()}
                    disabled={subir.isPending}
                  >
                    <Plus size={20} aria-hidden="true" />
                    {subir.isPending ? 'Subiendo…' : 'Agregar'}
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
              onChange={(e) => alElegirFoto(e)}
            />
            <button
              type="button"
              data-testid="boton-otro-detalle"
              className="btn btn-fantasma btn-bloque mt-2.5"
              onClick={abrirOtroDetalle}
              disabled={fotosCompletas || subir.isPending}
              aria-describedby="ayuda-otro-detalle"
            >
              <Camera size={18} aria-hidden="true" />
              ¿Querés añadir otro detalle?
            </button>
            <p id="ayuda-otro-detalle" className="ayuda mt-1.5" aria-live="polite">
              {fotosCompletas
                ? `Ya llegaste al máximo de ${CONFIG_DOMINIO.FOTOS_MAX_POR_REPORTE} fotos. Quitá una si querés cambiarla.`
                : 'Abre la cámara para sacar una foto de referencia de otro detalle del lugar.'}
            </p>
            <div className="mt-1.5 flex justify-between text-[13.5px] text-tinta-600">
              <span>Hasta {CONFIG_DOMINIO.FOTOS_MAX_POR_REPORTE} fotos</span>
              <span>
                {fotos.length}/{CONFIG_DOMINIO.FOTOS_MAX_POR_REPORTE} ·{' '}
                {CONFIG_DOMINIO.FOTO_MAX_BYTES / 1024 / 1024} MB c/u
              </span>
            </div>
            {errorFoto ? (
              <Aviso tono="err" className="mt-3">
                {errorFoto}
              </Aviso>
            ) : null}
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
                aria-invalid={!!form.formState.errors.descripcion}
                aria-describedby="contador-descripcion"
                {...form.register('descripcion')}
              />
              <p id="contador-descripcion" className="ayuda mt-1.5">
                {contadorDescripcion(valores.descripcion?.length ?? 0)}
              </p>
              {form.formState.errors.descripcion ? (
                <p className="error" aria-live="polite">
                  {form.formState.errors.descripcion.message}
                </p>
              ) : null}
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
                        onCambio={() => {
                          form.setValue('sumidero_cercano', v);
                          // Sin sumidero no hay nada que esté tapado: la respuesta anterior no
                          // puede viajar escondida en el envío.
                          if (v === 'no') form.setValue('sumidero_estado', null);
                        }}
                      />
                    ))}
                  </div>
                  {valores.sumidero_cercano ? (
                    <button
                      type="button"
                      className="mt-1.5 inline-flex min-h-12 items-center px-0.5 text-[14px] font-bold text-agua-700"
                      onClick={() => {
                        form.setValue('sumidero_cercano', null);
                        form.setValue('sumidero_estado', null);
                      }}
                    >
                      Dejar sin responder
                    </button>
                  ) : null}
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
                          onCambio={() => form.setValue('sumidero_estado', v)}
                        />
                      ))}
                    </div>
                  </fieldset>
                ) : null}
                <label className="opc">
                  <input type="checkbox" {...form.register('agua_brota_sumidero')} />
                  <span>El agua brota del sumidero cuando llueve</span>
                </label>
              </div>
            </details>
          </div>
          <div className="pie">
            <button
              type="button"
              data-testid="boton-siguiente"
              className="btn btn-bloque"
              disabled={!puedePaso4}
              onClick={irAdelante}
            >
              Continuar
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
                valor={`${fotos.length} ${fotos.length === 1 ? 'foto' : 'fotos'}`}
                alEditar={() => setPaso(3)}
              />
            </dl>

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
                    onCambio={() => form.setValue('ubicacion_tipo', t)}
                  />
                ))}
              </div>
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
              <Aviso tono="err" className="mt-3.5">
                {errorEnvio}
              </Aviso>
            ) : null}
          </div>
          <div className="pie">
            <button
              type="submit"
              data-testid="boton-enviar"
              className="btn btn-bloque"
              disabled={enviar.isPending}
            >
              {enviar.isPending ? 'Enviando…' : 'Enviar reporte'}
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
