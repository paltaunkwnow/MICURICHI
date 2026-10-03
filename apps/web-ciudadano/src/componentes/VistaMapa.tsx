'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CONFIG_DOMINIO } from 'contracts';
import { ChevronLeft, Minus, Navigation, Plus, Search } from 'lucide-react';
import type { Map as MapaGl } from 'maplibre-gl';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ErrorApi,
  obtenerAgregados,
  obtenerCapas,
  obtenerReporte,
  obtenerReportes,
} from '@/lib/api';
import { tituloDelMapa } from '@/lib/ciudad';
import { useCiudad } from '@/lib/ciudad-contexto';
import {
  colorSeveridad,
  distanciaDesde,
  etiquetaSeveridad,
  etiquetaUnidadVecinal,
  numeroConMiles,
  SEVERIDADES_ORDEN,
  textoCapaOficial,
} from '@/lib/formato';
import {
  conSeleccionado,
  type ResumenMapa,
  textoDelResumen,
  vistaTruncada,
} from '@/lib/mapa-datos';
import { useUbicacionUsuario } from '@/lib/useUbicacionUsuario';
import { TEXTO_SIN_VERIFICAR } from '@/lib/verificacion';
import { Aviso } from './Aviso';
import { AvisoUbicacionAlReportar } from './AvisoUbicacionAlReportar';
import { BarraInferior } from './BarraInferior';
import { ErrorDeCarga } from './ErrorDeCarga';
import { HojaDetalle } from './HojaDetalle';
import { LeyendaMapa } from './LeyendaMapa';
import { MapaDiferido } from './MapaDiferido';
import { TarjetaReporte } from './TarjetaReporte';
import { useToast } from './Toast';

/** Quietud del mapa antes de pedir datos de la vista nueva. */
const ESPERA_MOVIMIENTO_MS = 400;
/** Pausa al teclear antes de filtrar: escribir «Equipetrol» no son diez búsquedas. */
const ESPERA_TECLEO_MS = 250;
/** Orden de la lista: lo más grave primero, como en el prototipo. */
const PESO: Record<string, number> = { critica: 4, alta: 3, media: 2, baja: 1 };

type CapaVisible = 'auto' | 'distritos' | 'ninguna';

const CAPAS: Array<{ valor: CapaVisible; texto: string }> = [
  { valor: 'auto', texto: 'Distritos y UV' },
  { valor: 'distritos', texto: 'Solo distritos' },
  { valor: 'ninguna', texto: 'Sin capa' },
];

/**
 * Vacíos compartidos. `datos ?? []` crea un arreglo nuevo en CADA renderizado, y el mapa recibe
 * esas listas como props: un arreglo nuevo con el mismo contenido dispara el efecto de las capas
 * y vuelve a escribir el estado de las 576 unidades vecinales, o reemplaza el origen de los
 * reportes y obliga a reagrupar. Con una constante, el efecto solo corre cuando llega un dato.
 */
const SIN_CAPAS: never[] = [];
const SIN_AGREGADOS: never[] = [];
const SIN_REPORTES: never[] = [];

export function VistaMapa() {
  const [bbox, setBbox] = useState<string | null>(null);
  const [severidad, setSeveridad] = useState<string | null>(null);
  const [puntoCritico, setPuntoCritico] = useState<string | null>(null);
  const [unidadVecinal, setUnidadVecinal] = useState<{ id: string; codigo: string } | null>(null);
  const [distrito, setDistrito] = useState<{ id: string; codigo: string; nombre: string } | null>(
    null,
  );
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [capaVisible, setCapaVisible] = useState<CapaVisible>('auto');
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const { ubicacion, centrarSiHayPermiso } = useUbicacionUsuario();
  /** «Ir a mi ubicación» sin permiso: se explica que la ubicación se pide al reportar. */
  const [avisoPermiso, setAvisoPermiso] = useState(false);
  const mapa = useRef<MapaGl | null>(null);
  const toast = useToast();
  const ciudad = useCiudad();

  const filtros = useMemo(
    () => ({
      // Un filtro explícito (punto crítico, unidad vecinal o distrito) manda sobre la vista: si no, mover
      // el mapa un pixel borraría la selección que el vecino acaba de hacer.
      bbox: puntoCritico || unidadVecinal || distrito ? undefined : (bbox ?? undefined),
      severidad: severidad ?? undefined,
      punto_critico_id: puntoCritico ?? undefined,
      unidad_vecinal_id: unidadVecinal?.id,
      distrito_id: distrito?.id,
      limite: '300',
    }),
    [bbox, severidad, puntoCritico, unidadVecinal, distrito],
  );

  // `signal` viene de TanStack Query: al cambiar la vista, aborta la petición de la vista
  // anterior en vez de dejarla llegar tarde y pisar el resultado bueno.
  const reportes = useQuery({
    queryKey: ['reportes', filtros],
    queryFn: ({ signal }) => obtenerReportes(filtros, signal),
    // Sin `staleTime` propio: el cliente de consultas no deja caducar ['reportes'] (S31). Volver a
    // la pestaña o remontar el componente no repite una vista que ya se tiene.
    /**
     * Cada movimiento del mapa cambia el bbox y con él la `queryKey`. Sin esto, TanStack
     * devuelve `undefined` mientras llega la respuesta de la vista nueva: el listado volvía a
     * «Buscando puntos…» y el mapa se quedaba sin un solo punto durante el viaje de ida y
     * vuelta. Arrastrar el mapa era ver los puntos parpadear. Con los datos de la vista anterior
     * puestos, lo que se ve es lo último bueno hasta que llega lo siguiente.
     */
    placeholderData: keepPreviousData,
  });
  const capas = useQuery({
    queryKey: ['capas'],
    queryFn: ({ signal }) => obtenerCapas(signal),
    staleTime: 10 * 60_000,
  });
  // Los agregados por unidad vecinal pintan el relleno de distritos y UV, igual que en el
  // prototipo. Sustituyen a la consulta de puntos críticos que hacía esta pantalla: el dato que
  // se muestra —cuántos vecinos reportaron este punto— ya viaja en cada reporte
  // (`n_reportes_punto`), así que era una petición de más en cada carga.
  const agregados = useQuery({
    queryKey: ['agregados'],
    queryFn: ({ signal }) => obtenerAgregados(signal),
  });

  const todas = reportes.data?.features ?? SIN_REPORTES;

  /**
   * La búsqueda escrita filtra lo que ya está cargado (unidad vecinal, distrito) sin
   * pedir nada: es instantánea y no gasta cuota. Para saltar a una unidad vecinal que no está
   * en la vista actual están las sugerencias de abajo, que sí usan el filtro del servidor.
   */
  const features = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const lista = q
      ? todas.filter((f) => {
          const p = f.properties;
          return [
            p.unidad_vecinal?.codigo,
            p.unidad_vecinal?.nombre,
            p.distrito?.codigo,
            p.distrito?.nombre,
          ]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q));
        })
      : todas;
    return [...lista].sort(
      (a, b) => (PESO[b.properties.severidad] ?? 0) - (PESO[a.properties.severidad] ?? 0),
    );
  }, [todas, busqueda]);

  /** Unidades vecinales que coinciden con lo escrito, ordenadas por cantidad de reportes. */
  const sugerencias = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (q.length < 2 || unidadVecinal) return [];
    return (agregados.data ?? [])
      .filter(
        (a) =>
          a.n_reportes > 0 &&
          (a.codigo.toLowerCase().includes(q) || (a.nombre ?? '').toLowerCase().includes(q)),
      )
      .slice(0, 4);
  }, [agregados.data, busqueda, unidadVecinal]);

  /**
   * El reporte que el vecino abrió vive en SU PROPIA consulta, por `id`, y no en el resultado de
   * la vista.
   *
   * Antes se buscaba dentro del listado del viewport (`todas.find(...)`). Eso ataba el detalle a
   * una consulta que cambia con cada movimiento: bastaba alejar el mapa para que el conjunto de
   * resultados cambiara y el panel se cerrara solo, en medio de la lectura. Son dos cosas
   * distintas y ahora son dos estados distintos: «qué hay en esta vista» y «qué decidió mirar el
   * vecino».
   *
   * `GET /api/v1/reportes/:id` es la fuente de verdad del detalle (mismos campos públicos, misma
   * coordenada desplazada). Mientras responde se muestra la copia que ya venía en el listado,
   * así que abrir un punto es instantáneo y además queda confirmado contra el servidor.
   */
  const reporteElegido = useQuery({
    queryKey: ['reporte', seleccionado],
    queryFn: ({ signal }) => obtenerReporte(seleccionado as string, signal),
    enabled: seleccionado !== null,
    // Valor y no función: pasada como función, TanStack la toma por la forma del dato y el tipo
    // de la consulta pasa a ser «una función que devuelve un reporte».
    placeholderData: todas.find((f) => f.properties.id === seleccionado),
    // Sobrevive al cambio de vista aunque el componente deje de pedirlo por un momento.
    gcTime: 5 * 60_000,
    // Un 404 es una respuesta, no un fallo de red: el reporte salió del mapa (retirado o sumado
    // a otro punto) y reintentar solo retrasa el aviso.
    retry: (intentos, e) => !(e instanceof ErrorApi && e.estado === 404) && intentos < 1,
  });
  /**
   * Un 404 pesa más que la copia que traía el listado.
   *
   * Mientras la petición viaja se muestra esa copia, que es un dato real y recién traído. Pero si
   * el servidor contesta que el reporte ya no está publicado, seguir enseñándola sería mostrar un
   * estado que dejó de ser cierto —justo lo que no se puede hacer (CLAUDE.md §9.5)—. Con
   * cualquier otro fallo (red, 5xx) sí se conserva: ahí el dato sigue valiendo, lo que falta es
   * la confirmación.
   */
  const noExiste =
    seleccionado !== null && reporteElegido.error instanceof ErrorApi
      ? reporteElegido.error.estado === 404
      : false;
  const elegido = seleccionado !== null && !noExiste ? (reporteElegido.data ?? null) : null;
  const hayFiltros =
    severidad !== null || puntoCritico !== null || unidadVecinal !== null || distrito !== null;

  /** Lo que se dibuja en el mapa incluye siempre el punto elegido, esté o no en la vista. */
  const featuresMapa = useMemo(() => conSeleccionado(features, elegido), [features, elegido]);

  /**
   * Cuántos reportes hay de verdad en la vista frente a cuántos caben en una respuesta. La API
   * acota a 300 features y devuelve el total; sin decirlo, los números de las agrupaciones
   * sumarían 300 y darían por buena una densidad que no es la real.
   */
  const total = reportes.data?.total;
  const truncada = !busqueda && vistaTruncada(total, todas.length);

  /**
   * Lo que el mapa está dibujando, en texto, para quien no ve el lienzo. Un número dentro de un
   * círculo de WebGL no lo lee ningún lector de pantalla.
   */
  const [resumen, setResumen] = useState<ResumenMapa | null>(null);
  const alResumen = useCallback((r: ResumenMapa) => {
    setResumen((previo) =>
      previo &&
      previo.sueltos === r.sueltos &&
      previo.agrupaciones === r.agrupaciones &&
      previo.agrupados === r.agrupados
        ? previo
        : r,
    );
  }, []);
  /**
   * El listado es lo único cuyo fallo cambia lo que el vecino cree estar viendo: sin él el mapa
   * sale vacío y «vacío» no significa lo mismo que «no pudimos preguntar». Las capas y los
   * agregados solo pintan el fondo, así que su fallo se deja pasar en silencio.
   */
  const fallo = reportes.isError;
  const estadoMapa = fallo ? 'fallo' : reportes.isPending ? 'cargando' : 'ok';
  const textoResumen = resumen ? textoDelResumen(resumen, estadoMapa) : '';
  const avisoDeFallo = (
    <ErrorDeCarga
      error={reportes.error}
      que="los reportes"
      alReintentar={() => reportes.refetch()}
      reintentando={reportes.isFetching}
      testId="error-reportes"
    />
  );

  /**
   * Un arrastre del mapa dispara `moveend` una vez, pero un gesto de zoom o un arrastre con
   * inercia disparan varios seguidos, y cada uno cambiaba el bbox, la `queryKey` y por tanto
   * lanzaba una consulta nueva. Con el límite de lecturas puesto en la Fase 3 (240/min), un rato
   * explorando el mapa se come la cuota y el vecino empieza a ver 429.
   *
   * Dos frenos: se espera a que el mapa se quede quieto, y el bbox se redondea a cuatro
   * decimales (~11 m) para que un temblor del ratón no cuente como vista nueva.
   */
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tecleo = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
      if (tecleo.current) clearTimeout(tecleo.current);
    },
    [],
  );
  const alMover = useCallback((nuevoBbox: string) => {
    const redondeado = nuevoBbox
      .split(',')
      .map((n) => Number.parseFloat(n).toFixed(4))
      .join(',');
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setBbox(redondeado), ESPERA_MOVIMIENTO_MS);
  }, []);
  const alTeclear = (v: string) => {
    setTexto(v);
    if (tecleo.current) clearTimeout(tecleo.current);
    tecleo.current = setTimeout(() => setBusqueda(v), ESPERA_TECLEO_MS);
  };

  const limpiarFiltros = () => {
    setSeveridad(null);
    setPuntoCritico(null);
    setUnidadVecinal(null);
    setDistrito(null);
  };

  const alSeleccionarDistrito = useCallback(
    (d: { id: string; codigo: string; nombre: string }) => {
      setDistrito(d);
      setUnidadVecinal(null);
      setPuntoCritico(null);
      toast(`Mostrando reportes de ${d.nombre || `Distrito ${d.codigo}`}`);
    },
    [toast],
  );

  const alSeleccionarUv = useCallback(
    (u: { id: string; codigo: string }) => {
      setUnidadVecinal(u);
      setDistrito(null);
      setPuntoCritico(null);
      toast(`Mostrando la ${etiquetaUnidadVecinal(u.codigo)}`);
    },
    [toast],
  );

  /**
   * El mapa se mueve a la ubicación del vecino SOLO cuando él lo pide, y ni siquiera entonces se
   * pide el permiso (plan 2026-09-26, pedido F): la ubicación se pide dentro de un reporte. Si ya
   * la dio ahí, el botón centra el mapa; si no, explica que se pide al reportar, sin disparar el
   * aviso del navegador. Al cargar no se consulta nada.
   */
  const irAMiUbicacion = async () => {
    const volar = (u: { lat: number; lon: number }) =>
      mapa.current?.flyTo({ center: [u.lon, u.lat], zoom: 16, duration: 700 });
    if (ubicacion) {
      volar(ubicacion);
      return;
    }
    const r = await centrarSiHayPermiso();
    if (r.tipo === 'lista') {
      setAvisoPermiso(false);
      volar(r.ubicacion);
    } else if (r.tipo === 'sin-permiso') setAvisoPermiso(true);
    else toast('No pudimos obtener tu ubicación. Probá de nuevo en un momento.');
  };

  /**
   * Al elegir un reporte que está fuera de pantalla —desde la lista, o desde «ver los N reportes
   * de este punto»— el mapa se acerca a él. Es lo que hacía el prototipo, que en móvil abría una
   * pantalla propia centrada en el punto (C-02).
   *
   * Solo cuando CAMBIA la elección, y solo si el punto no se ve ya: mover el mapa cada vez que
   * llega una respuesta sería quitarle el control al vecino, y es justo lo contrario de lo que
   * busca tener el detalle fijo mientras explora.
   */
  const centradoEn = useRef<string | null>(null);
  useEffect(() => {
    if (seleccionado === null) {
      centradoEn.current = null;
      return;
    }
    const m = mapa.current;
    if (!m || !elegido || centradoEn.current === seleccionado) return;
    centradoEn.current = seleccionado;
    const [lon, lat] = elegido.geometry.coordinates;
    if (!m.getBounds().contains([lon, lat]))
      m.easeTo({ center: [lon, lat], zoom: Math.max(m.getZoom(), 15), duration: 600 });
  }, [seleccionado, elegido]);

  const chipCapa = elegido
    ? textoCapaOficial(elegido.properties.distrito, elegido.properties.unidad_vecinal)
    : distrito
      ? `${distrito.nombre || `Distrito ${distrito.codigo}`} · ${features.length} ${features.length === 1 ? 'punto' : 'puntos'}`
      : unidadVecinal
        ? `${etiquetaUnidadVecinal(unidadVecinal.codigo)} · ${features.length} ${features.length === 1 ? 'punto' : 'puntos'}`
        : `${features.length} ${features.length === 1 ? 'punto' : 'puntos'} en esta vista · capa oficial vigente`;

  const buscador = (
    <div>
      <div className="buscar">
        <Search size={18} aria-hidden="true" className="shrink-0 text-tinta-600" />
        <input
          type="search"
          value={texto}
          onChange={(e) => alTeclear(e.target.value)}
          placeholder="Buscar UV, barrio o distrito"
          aria-label="Buscar unidad vecinal, barrio o distrito"
        />
      </div>
      {sugerencias.length ? (
        <ul className="tarjeta mt-1.5 overflow-hidden p-1" aria-label="Unidades vecinales">
          {sugerencias.map((s) => (
            <li key={s.unidad_vecinal_id}>
              <button
                type="button"
                className="fila min-h-[44px] py-2 text-[14.5px]"
                data-testid="sugerencia-busqueda"
                onClick={() => {
                  setUnidadVecinal({ id: s.unidad_vecinal_id, codigo: s.codigo });
                  setTexto('');
                  setBusqueda('');
                  toast(`Mostrando la ${etiquetaUnidadVecinal(s.codigo)}`);
                }}
              >
                <span className="font-semibold">{etiquetaUnidadVecinal(s.codigo)}</span>
                <span className="text-tinta-600">{s.nombre}</span>
                <span className="mini ml-auto">{s.n_reportes}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );

  const chipsSeveridad = (
    <fieldset className="flex flex-wrap gap-2">
      <legend className="sr-only">Filtrar por severidad</legend>
      <button
        type="button"
        className="chip chip-filtro"
        aria-pressed={severidad === null}
        onClick={() => setSeveridad(null)}
      >
        Todos
      </button>
      {SEVERIDADES_ORDEN.map((s) => (
        <button
          key={s}
          type="button"
          className="chip chip-filtro"
          aria-pressed={severidad === s}
          onClick={() => setSeveridad(severidad === s ? null : s)}
        >
          <span
            className="d"
            style={{ background: colorSeveridad(s).relleno }}
            aria-hidden="true"
          />
          {etiquetaSeveridad(s)}
        </button>
      ))}
    </fieldset>
  );

  /**
   * El mismo detalle se coloca en dos sitios —la columna de escritorio y la hoja de móvil— y
   * solo uno está visible en cada tamaño. Llevan identificador de prueba distinto para que un
   * test apunte al que se ve y no a la copia oculta.
   */
  const detalle = (testId: string) => {
    if (seleccionado === null) return null;
    if (elegido)
      return (
        <HojaDetalle
          reporte={elegido}
          testId={testId}
          distanciaM={distanciaDesde(ubicacion, elegido)}
          onCerrar={() => setSeleccionado(null)}
          onVerPunto={(id) => {
            setPuntoCritico(id);
            setSeveridad(null);
            setUnidadVecinal(null);
          }}
        />
      );
    // Sin copia del listado y sin respuesta todavía: puede pasar al llegar con un punto elegido
    // que no está en la vista. Se dice que se está buscando, no que no existe.
    if (!reporteElegido.isError)
      return (
        <div data-testid="detalle-cargando" className="tarjeta p-5" aria-busy="true">
          <p className="ayuda" aria-live="polite">
            Buscando el reporte…
          </p>
        </div>
      );
    return (
      <div data-testid="detalle-no-disponible" className="tarjeta p-5">
        <h2 className="titular text-xl">
          {noExiste ? 'No encontramos este reporte' : 'No pudimos abrir este reporte'}
        </h2>
        <p className="mt-2 text-[15px] text-tinta-600">
          {noExiste
            ? 'Puede que lo hayan retirado del mapa o sumado a otro punto mientras lo mirabas.'
            : 'El servidor no respondió. El punto sigue en el mapa; probá de nuevo en un momento.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2.5">
          {noExiste ? null : (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => reporteElegido.refetch()}
              disabled={reporteElegido.isFetching}
            >
              {reporteElegido.isFetching ? 'Reintentando…' : 'Reintentar'}
            </button>
          )}
          <button
            type="button"
            className="btn btn-fantasma btn-sm"
            onClick={() => setSeleccionado(null)}
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* El título de la página no se dibuja: en móvil el mapa ocupa todo y en escritorio el
          encabezado de la lista ya dice cuántos puntos hay. Existe para los lectores de pantalla. */}
      <h1 className="sr-only">{tituloDelMapa(ciudad)}</h1>
      <div className="split min-h-0 flex-1 md:grid-cols-[400px_minmax(0,1fr)]">
        {/* Columna izquierda de escritorio: la lista manda, y al elegir un punto la reemplaza
            su detalle para que el mapa nunca quede tapado (W-01 / W-02 del prototipo). */}
        <div className="lado">
          {seleccionado !== null ? (
            <div className="lista pt-[18px]">
              <button
                type="button"
                className="btn btn-fantasma btn-sm mb-4"
                onClick={() => setSeleccionado(null)}
              >
                <ChevronLeft size={16} aria-hidden="true" />
                Volver a la lista
              </button>
              {detalle('hoja-detalle')}
            </div>
          ) : (
            <>
              <div className="cima">
                {buscador}
                <div className="mt-3">{chipsSeveridad}</div>
                <div className="mt-4 flex items-baseline justify-between gap-3">
                  <h2 className="titular text-xl" data-testid="kpi-publicados">
                    {reportes.isPending
                      ? 'Buscando puntos…'
                      : fallo
                        ? 'Sin conexión con el servidor'
                        : `${numeroConMiles(total ?? features.length, ciudad.locale)} ${
                            (total ?? features.length) === 1
                              ? 'punto reportado'
                              : 'puntos reportados'
                          }`}
                  </h2>
                  <span className="text-[13.5px] text-tinta-600">
                    {reportes.isFetching && !reportes.isPending
                      ? 'Actualizando…'
                      : 'Ordenar: severidad'}
                  </span>
                </div>
                {truncada ? (
                  <Aviso tono="tinta" className="mt-3" data-testid="aviso-vista-truncada">
                    Se muestran {numeroConMiles(todas.length, ciudad.locale)} de{' '}
                    {numeroConMiles(total as number, ciudad.locale)} puntos de esta vista: los más
                    recientes. Acercá el mapa o filtrá por severidad para ver el resto.
                  </Aviso>
                ) : null}
                {hayFiltros ? (
                  <button
                    type="button"
                    className="btn btn-fantasma btn-sm mt-3"
                    onClick={limpiarFiltros}
                  >
                    Quitar filtros
                    {distrito ? ` · ${distrito.nombre || `Distrito ${distrito.codigo}`}` : ''}
                    {unidadVecinal ? ` · ${etiquetaUnidadVecinal(unidadVecinal.codigo)}` : ''}
                  </button>
                ) : null}
              </div>
              <div className="lista">
                {reportes.isPending ? (
                  <p aria-live="polite" className="ayuda">
                    Buscando reportes…
                  </p>
                ) : fallo ? (
                  avisoDeFallo
                ) : features.length === 0 ? (
                  <VacioLista
                    hayFiltros={hayFiltros || busqueda !== ''}
                    alLimpiar={limpiarFiltros}
                  />
                ) : (
                  features.map((f) => (
                    <TarjetaReporte
                      key={f.properties.id}
                      reporte={f}
                      distanciaM={distanciaDesde(ubicacion, f)}
                      seleccionado={seleccionado === f.properties.id}
                      onSeleccionar={setSeleccionado}
                    />
                  ))
                )}
                <p className="ayuda mt-4">
                  Los puntos son reportes de vecinos. Se publican sin revisión previa: los que un
                  técnico todavía no revisó llevan la marca «{TEXTO_SIN_VERIFICAR}». El distrito y
                  la unidad vecinal los asigna el sistema por point-in-polygon contra las capas
                  oficiales, no los escribe el vecino.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Mapa */}
        <div className="mapcol">
          <MapaDiferido
            className="map"
            reportes={featuresMapa}
            capas={capas.data ?? SIN_CAPAS}
            agregados={agregados.data ?? SIN_AGREGADOS}
            capaVisible={capaVisible}
            encuadrarACapas
            seleccionado={seleccionado}
            onSeleccionar={setSeleccionado}
            onSeleccionarDistrito={alSeleccionarDistrito}
            onSeleccionarUv={alSeleccionarUv}
            onMover={alMover}
            onResumen={alResumen}
            alListo={(m) => {
              mapa.current = m;
            }}
          />

          {/* Lo que hay dibujado, en texto: el contenido de un lienzo WebGL —y sobre todo el
              número dentro de una agrupación— no lo lee ningún lector de pantalla. */}
          <p className="sr-only" role="status" data-testid="resumen-mapa">
            {textoResumen}
          </p>

          {/* Móvil: buscador y filtros flotan sobre el mapa (C-01). */}
          <div className="flot inset-x-3 top-3 md:hidden">
            {buscador}
            <div className="mt-2.5 flex flex-wrap gap-2">{chipsSeveridad}</div>
          </div>

          {/* Escritorio: chip de contexto arriba a la izquierda y acción arriba a la derecha. */}
          <div className="flot top-4 left-4 hidden md:block">
            <span className="chip chip-mapa" data-testid="chip-capa">
              {chipCapa}
            </span>
          </div>
          <div className="flot top-4 right-4 hidden md:block">
            <Link href="/reportar" className="btn no-underline">
              <Plus size={18} aria-hidden="true" />
              Reportar un punto
            </Link>
          </div>

          {/* Leyenda y capas, abajo a la izquierda. La leyenda dice qué es «NO SE HA VERIFICADO» y
              por qué hay barrios grises; las capas, mismo trío de opciones que el prototipo.
              `pointer-events-none` en el contenedor: es un `div` flotante sin fondo propio, pero
              su caja de layout sigue ahí y por defecto tapa el clic de cualquier pastilla del
              mapa real que caiga debajo (la leyenda de adentro ya no lo hace, pero el contenedor
              seguía haciéndolo). Solo el fieldset de capas necesita el clic de vuelta. */}
          <div
            className={`flot pointer-events-none bottom-[104px] left-3 grid max-w-[280px] gap-2 md:bottom-4 md:left-4 ${seleccionado !== null ? 'bajo-hoja' : ''}`}
          >
            <LeyendaMapa />
            <fieldset className="pointer-events-auto flex flex-wrap gap-2">
              <legend className="sr-only">Capas del mapa</legend>
              {CAPAS.map((c) => (
                <button
                  key={c.valor}
                  type="button"
                  className="chip"
                  aria-pressed={capaVisible === c.valor}
                  onClick={() => setCapaVisible(c.valor)}
                >
                  {c.texto}
                </button>
              ))}
            </fieldset>
          </div>

          <div
            className={`flot right-3 bottom-[104px] grid gap-2.5 md:right-4 md:bottom-4 ${seleccionado !== null ? 'sobre-hoja' : ''}`}
          >
            <button
              type="button"
              className="bico bico-sm md:h-[46px] md:w-[46px]"
              aria-label="Acercar el mapa"
              onClick={() => mapa.current?.zoomIn()}
            >
              <Plus size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="bico bico-sm md:h-[46px] md:w-[46px]"
              aria-label="Alejar el mapa"
              onClick={() => mapa.current?.zoomOut()}
            >
              <Minus size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="bico bico-sm bico-verde md:h-[46px] md:w-[46px]"
              aria-label="Centrar el mapa en mi ubicación"
              onClick={() => void irAMiUbicacion()}
            >
              <Navigation size={17} aria-hidden="true" />
            </button>
          </div>

          {/* Móvil: acción principal al alcance del pulgar; se aparta cuando sube la hoja. */}
          {seleccionado === null ? (
            <div className="flot inset-x-3 bottom-4 md:hidden">
              <Link
                href="/reportar"
                className="btn btn-bloque no-underline"
                data-testid="boton-reportar"
              >
                <Plus size={19} aria-hidden="true" />
                Reportar un punto
              </Link>
            </div>
          ) : null}

          {/* «Ir a mi ubicación» sin permiso: al lado de «Reportar un punto», que es donde se
              pide. En escritorio, a la izquierda de los botones del mapa. */}
          {avisoPermiso && seleccionado === null ? (
            <div className="flot inset-x-3 bottom-[76px] md:inset-x-auto md:right-[76px] md:bottom-4 md:w-[340px]">
              <AvisoUbicacionAlReportar alCerrar={() => setAvisoPermiso(false)} />
            </div>
          ) : null}

          {/* Estado vacío o fallo en móvil: sin lista lateral, el aviso va sobre el mapa. */}
          {!avisoPermiso &&
          !reportes.isPending &&
          (fallo || features.length === 0) &&
          seleccionado === null ? (
            <div className="flot inset-x-3 bottom-[76px] md:hidden">
              {fallo ? (
                avisoDeFallo
              ) : (
                <div className="tarjeta p-4">
                  <VacioLista
                    hayFiltros={hayFiltros || busqueda !== ''}
                    alLimpiar={limpiarFiltros}
                    compacto
                  />
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Móvil: el detalle sube como hoja sobre el mapa. */}
      {seleccionado !== null ? (
        <div className="hoja md:hidden">{detalle('hoja-detalle-movil')}</div>
      ) : null}

      <BarraInferior />
    </div>
  );
}

function VacioLista({
  hayFiltros,
  alLimpiar,
  compacto = false,
}: {
  hayFiltros: boolean;
  alLimpiar: () => void;
  compacto?: boolean;
}) {
  return (
    <div className={compacto ? '' : 'tarjeta p-5'} aria-live="polite">
      <h2 className="titular text-xl">
        {hayFiltros
          ? 'Ningún punto coincide con la búsqueda'
          : 'Todavía nadie reportó en esta zona'}
      </h2>
      <p className="mt-2 text-[15px] text-tinta-600">
        {hayFiltros
          ? 'Probá con otra severidad, borrá el texto o mové el mapa para buscar en otra zona.'
          : 'Que no haya puntos no significa que no se anegue. Si conocés un lugar donde se junta el agua, sos el primero en marcarlo.'}
      </p>
      {hayFiltros ? (
        <button type="button" className="btn btn-fantasma btn-sm mt-3" onClick={alLimpiar}>
          Limpiar filtros
        </button>
      ) : (
        <>
          <Link href="/reportar" className="btn btn-sm mt-3 no-underline">
            Reportar el primero acá
          </Link>
          <p className="ayuda mt-2">
            Para reportar hace falta estar en el lugar, con un teléfono que te ubique con{' '}
            {CONFIG_DOMINIO.PRECISION_DISPOSITIVO_MAX_M} m de precisión o menos.
          </p>
        </>
      )}
    </div>
  );
}
