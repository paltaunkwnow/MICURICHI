'use client';

import type { AgregadoUv, CapaInfo, Severidad } from 'contracts';
import type { Map as MapaGl, MapMouseEvent } from 'maplibre-gl';
// MapLibre 6 es ESM puro: no tiene export por defecto.
import * as maplibregl from 'maplibre-gl';
import { etiquetarControlesDelMapa } from '@/lib/accesibilidad-mapa';
import { configurarWorkerDeMapLibre } from '@/lib/worker-maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import type { ReporteFeature } from '@/lib/api';
import { colorSeveridad, etiquetaSeveridad } from '@/lib/formato';
import {
  BANDAS_CLUSTER,
  type BandaCluster,
  MAX_PASTILLAS,
  type ResumenMapa,
} from '@/lib/mapa-datos';

/**
 * Santa Cruz de la Sierra: el centro histórico, cerca de la plaza principal. Es dónde abre el
 * mapa antes de saber qué capa rige; en cuanto llegan las capas, el encuadre pasa a salir de su
 * propio bbox (`encuadrarACapas`), que es el dato y no una constante.
 *
 * Medido sobre la entrega real del municipio: los 16 distritos cubren
 * `-63,2567 −17,9587 … −62,8069 −17,6319` (unos 48 × 36 km), con centroide en
 * `-63,134 −17,801`. Ese centroide cae en la periferia sur; el centro histórico es mejor punto
 * de partida para alguien que abre la aplicación.
 */
export const CENTRO_INICIAL: [number, number] = [-63.18, -17.78];

/**
 * Base clara y desaturada, como en el prototipo: las teselas quedan casi en gris para que lo
 * único con color sea la severidad de los puntos y el relleno de los distritos.
 */
const ESTILO_BASE: maplibregl.StyleSpecification = {
  version: 8,
  /**
   * Glifos servidos por la propia app (`public/glifos/`), no por un servidor ajeno.
   *
   * Antes esto apuntaba a `demotiles.maplibre.org`, que es el servidor de DEMOSTRACIÓN de
   * MapLibre —sin compromiso de servicio y sin permiso para producción—, y encima pedía una
   * tipografía que ahí no existe: cada etiqueta del mapa provocaba un 404 contra un tercero y
   * las letras acababan dibujadas por el navegador como último recurso. Se comprobó pidiendo
   * el archivo a mano: `Open Sans Bold` devuelve 404 y `Noto Sans Bold`, 200.
   *
   * Está guardado el rango 0-255, que cubre el castellano entero (tildes, ñ, ¿, ¡, ·) y los
   * números. Si algún nombre trajera un carácter de fuera de ese rango, MapLibre lo dibuja
   * localmente, que es exactamente lo que hacía antes con TODO el texto.
   */
  glyphs: '/glifos/{fontstack}/{range}.pbf',
  sources: {
    base: {
      type: 'raster',
      // OpenStreetMap estándar: sin clave ni cuota, SOLO para desarrollo local (CLAUDE.md §14.3).
      // Su política de uso no permite producción: en Fase 2 se reemplaza por una base propia.
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxzoom: 19,
    },
  },
  layers: [
    // El fondo mantiene la identidad del mapa aunque las teselas tarden o fallen.
    { id: 'fondo', type: 'background', paint: { 'background-color': '#EEF2EF' } },
    {
      id: 'base',
      type: 'raster',
      source: 'base',
      // Equivalente de `filter: saturate(.16) brightness(1.09) contrast(.92)` del prototipo,
      // ajustado a ojo contra las teselas reales: la escala de `raster-saturation` de MapLibre
      // no es la de la función CSS y con −0,84 el mapa seguía saliendo a todo color.
      paint: {
        'raster-opacity': 0.95,
        'raster-saturation': -0.97,
        'raster-contrast': -0.12,
        'raster-brightness-min': 0.16,
        'raster-brightness-max': 1,
      },
    },
  ],
};

export interface PropsMapa {
  reportes?: ReporteFeature[];
  capas?: CapaInfo[];
  /** Conteos por unidad vecinal: pintan el relleno de UV y distrito, como en el prototipo. */
  agregados?: AgregadoUv[];
  /** 'auto' muestra distritos y, al acercar, unidades vecinales. */
  capaVisible?: 'auto' | 'distritos' | 'ninguna';
  seleccionado?: string | null;
  /** Id del reporte recién enviado: su marcador late unos segundos para que se lo encuentre. */
  destacado?: string | null;
  onSeleccionar?: (id: string | null) => void;
  onMover?: (bbox: string, zoom: number) => void;
  /** Modo selección de ubicación: marcador arrastrable y clic para mover. */
  seleccionUbicacion?: { lat: number; lon: number } | null;
  onUbicacion?: (lat: number, lon: number) => void;
  /**
   * Modo del paso 1 del reporte: el marcador queda fijo en el centro de la pantalla y lo que se
   * mueve es el mapa. Con el pulgar es más preciso que arrastrar un pin diminuto.
   */
  seguirCentro?: boolean;
  centro?: [number, number];
  zoom?: number;
  className?: string;
  ariaLabel?: string;
  /** Deja el mapa quieto (vista de contexto en una tarjeta o en la revisión del reporte). */
  fijo?: boolean;
  /**
   * Encuadra el mapa sobre la capa administrativa vigente en cuanto se conoce su bbox.
   *
   * Hace falta porque el centro y el zoom por defecto son una constante, y una constante no
   * puede acertar con una ciudad que no conoce: con la muestra sintética (doce unidades
   * vecinales alrededor del centro) el zoom 13 era correcto, y con los 48 km de Santa Cruz
   * mostraba un barrio. El bbox lo publica geo-service en `/geo/v1/capas`.
   *
   * No es geolocalización: no se consulta dónde está quien mira, solo dónde está la ciudad. Y se
   * hace UNA vez y solo si nadie tocó el mapa todavía, para no arrebatarle la vista a alguien
   * que ya estaba mirando otra cosa.
   */
  encuadrarACapas?: boolean;
  /**
   * Qué está dibujando el mapa ahora mismo, para que la pantalla lo pueda contar en texto.
   *
   * Lo que hay dentro de un lienzo WebGL no lo lee ningún lector de pantalla, y una agrupación
   * es justamente información —«acá hay 27 reportes»— que no está en ningún otro sitio de la
   * página. Con esto, `VistaMapa` la anuncia en una región viva.
   */
  onResumen?: (resumen: ResumenMapa) => void;
  /** Expone la instancia para los controles externos (+ / − / mi ubicación). */
  alListo?: (mapa: MapaGl) => void;
}

function coloresPorSeveridad(): maplibregl.ExpressionSpecification {
  const pares: (string | Severidad)[] = [];
  for (const s of ['baja', 'media', 'alta', 'critica'] as Severidad[])
    pares.push(s, colorSeveridad(s).relleno);
  return [
    'match',
    ['get', 'severidad'],
    ...pares,
    '#8a98a6',
  ] as unknown as maplibregl.ExpressionSpecification;
}

/** Zoom a partir del cual el prototipo cambia de distritos a unidades vecinales. */
const ZOOM_UV = 14;

/**
 * Zoom a partir del cual ya no se agrupa: cada reporte se dibuja donde está.
 *
 * Se queda por debajo del zoom máximo del mapa a propósito. Acercándose lo suficiente, el vecino
 * tiene que poder ver los puntos uno a uno; si la agrupación llegara hasta el final, dos reportes
 * de la misma cuadra no se podrían separar nunca.
 */
const ZOOM_MAX_CLUSTER = 15;

/**
 * Valor imposible como id de reporte: con él, el filtro del anillo de selección no casa con
 * ninguna feature. Escribir un filtro vacío no vale, porque un filtro ausente dibuja TODAS.
 */
const SIN_SELECCION = '@ninguno@';

/** Radio de agrupación en píxeles de pantalla. */
const RADIO_CLUSTER = 44;

/**
 * El número dentro del círculo, escrito por MapLibre.
 *
 * `text-field` es una propiedad de layout: se evalúa dentro del motor y no puede llamar a una
 * función de TypeScript. Por eso la regla de `numeroCompacto` está escrita dos veces, acá como
 * expresión y allá como función; las dos usan el mismo locale y los mismos cortes, y el test de
 * `mapa-datos` fija el resultado esperado.
 *
 * No se usa `point_count_abbreviated` de MapLibre porque abrevia en inglés («1.2K») y toda la
 * interfaz va en castellano (CLAUDE.md §12.1).
 */
function expresionNumeroCompacto(): maplibregl.ExpressionSpecification {
  const n: unknown = ['get', 'point_count'];
  const enMiles = (decimales: number) => [
    'concat',
    [
      'number-format',
      ['/', n, 1000],
      { locale: 'es-BO', 'min-fraction-digits': decimales, 'max-fraction-digits': decimales },
    ],
    ' mil',
  ];
  return [
    'case',
    ['<', n, 1000],
    ['to-string', n],
    ['<', n, 10000],
    enMiles(1),
    enMiles(0),
  ] as unknown as maplibregl.ExpressionSpecification;
}

/** `['step', ['get','point_count'], v0, corte1, v1, …]` a partir de las bandas compartidas. */
function escalonPorCantidad(
  valor: (b: BandaCluster) => number,
): maplibregl.ExpressionSpecification {
  const [primera, ...resto] = BANDAS_CLUSTER as BandaCluster[];
  const pasos: unknown[] = [];
  for (const b of resto) pasos.push(b.desde, valor(b));
  return [
    'step',
    ['get', 'point_count'],
    valor(primera as BandaCluster),
    ...pasos,
  ] as unknown as maplibregl.ExpressionSpecification;
}

/**
 * Color del anillo de una agrupación: la severidad más grave que hay dentro.
 *
 * Es la opción C de las cuatro que se plantearon: la severidad decide el ESTILO del círculo y la
 * cantidad se queda con el número, que es la información que el vecino no puede deducir de
 * ninguna otra forma. Pintar el relleno por severidad habría hecho que un círculo grande y rojo
 * significara a la vez «muchos» y «graves», que son dos cosas distintas.
 *
 * El color no viaja solo (CLAUDE.md §14.1): el anillo engorda cuando hay al menos un reporte
 * crítico —color + forma— y el resumen en texto debajo del mapa dice cuántos puntos hay y que
 * están agrupados. La severidad con su nombre escrito aparece al acercarse, en cada pastilla.
 */
function anilloPorSeveridad(): maplibregl.ExpressionSpecification {
  return [
    'case',
    ['>', ['get', 'criticas'], 0],
    colorSeveridad('critica').relleno,
    ['>', ['get', 'altas'], 0],
    colorSeveridad('alta').relleno,
    ['>', ['get', 'medias'], 0],
    colorSeveridad('media').relleno,
    colorSeveridad('baja').relleno,
  ] as unknown as maplibregl.ExpressionSpecification;
}

export function Mapa({
  reportes = [],
  capas = [],
  agregados = [],
  capaVisible = 'auto',
  seleccionado,
  destacado,
  onSeleccionar,
  onMover,
  seleccionUbicacion,
  onUbicacion,
  seguirCentro = false,
  centro = CENTRO_INICIAL,
  zoom = 13,
  className = '',
  ariaLabel = 'Mapa de puntos de inundación',
  fijo = false,
  encuadrarACapas = false,
  onResumen,
  alListo,
}: PropsMapa) {
  const contenedor = useRef<HTMLElement>(null);
  /**
   * ¿El mapa terminó de dibujar lo que pidió?
   *
   * MapLibre pinta el color de fondo en cuanto arranca, así que un mapa que todavía no tiene ni
   * una tesela se ve exactamente igual que un mapa vacío: un rectángulo gris verdoso. En el paso
   * 1 del reporte, que abre a zoom 17, eso son varios segundos en los que la pantalla parece
   * rota y nada indica que está trabajando. `idle` es el evento exacto: MapLibre lo lanza cuando
   * no le queda nada pendiente de cargar ni de pintar.
   */
  const [pintando, setPintando] = useState(true);
  const mapa = useRef<MapaGl | null>(null);
  /** El encuadre automático se hace una vez y nunca por encima de un gesto del usuario. */
  const encuadrado = useRef(false);
  const movidoPorUsuario = useRef(false);
  const encuadrar = (m: MapaGl, lista: CapaInfo[]) => {
    if (!encuadrarACapas || encuadrado.current || movidoPorUsuario.current) return;
    encuadrado.current = encuadrarEnCapas(m, lista);
  };
  const marcador = useRef<maplibregl.Marker | null>(null);
  const pines = useRef(new Map<string, maplibregl.Marker>());
  const listo = useRef(false);
  /** Último valor escrito en el estilo, para no reescribirlo y provocar otro repintado. */
  const visibilidadPuntos = useRef<boolean | null>(null);
  const filtroElegido = useRef<string>(SIN_SELECCION);

  // Los callbacks y los datos se leen por ref para que el mapa se inicialice una sola vez.
  const reportesRef = useRef(reportes);
  const capasRef = useRef(capas);
  const agregadosRef = useRef(agregados);
  const capaVisibleRef = useRef(capaVisible);
  const seleccionRef = useRef(seleccionado);
  const destacadoRef = useRef(destacado);
  const seleccionUbicacionRef = useRef(seleccionUbicacion);
  const seguirCentroRef = useRef(seguirCentro);
  const onSeleccionarRef = useRef(onSeleccionar);
  const onMoverRef = useRef(onMover);
  const onUbicacionRef = useRef(onUbicacion);
  const onResumenRef = useRef(onResumen);
  onResumenRef.current = onResumen;
  reportesRef.current = reportes;
  capasRef.current = capas;
  agregadosRef.current = agregados;
  capaVisibleRef.current = capaVisible;
  seleccionRef.current = seleccionado;
  destacadoRef.current = destacado;
  seleccionUbicacionRef.current = seleccionUbicacion;
  seguirCentroRef.current = seguirCentro;
  onSeleccionarRef.current = onSeleccionar;
  onMoverRef.current = onMover;
  onUbicacionRef.current = onUbicacion;

  /**
   * Los marcadores en pastilla son HTML, como en el prototipo, porque la pastilla lleva punto de
   * color, nombre de severidad y sombra: eso en WebGL saldría borroso o pediría un sprite por
   * severidad y por estado.
   *
   * Que sean HTML obliga a acotar cuántos hay: un nodo por reporte de la ciudad entera es
   * justamente lo que no se debe hacer. Por eso se dibujan pastillas **solo cuando la vista trae
   * pocos puntos**; por encima de ese tope manda el agrupamiento de MapLibre, que los resuelve en
   * la GPU con un círculo y un número.
   *
   * La decisión se toma con los datos que ya tiene el componente, no consultando lo que está
   * pintado: `queryRenderedFeatures` solo responde después de un fotograma, y eso convierte la
   * presencia de los marcadores en algo que depende de si la pestaña llegó a dibujar.
   */
  const sincronizarPines = useRef<() => void>(() => {});

  // biome-ignore lint/correctness/useExhaustiveDependencies: el mapa se crea una sola vez
  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    configurarWorkerDeMapLibre();
    const m = new maplibregl.Map({
      container: contenedor.current,
      style: ESTILO_BASE,
      center: centro,
      zoom,
      attributionControl: { compact: true },
      interactive: !fijo,
    });
    // Los controles de zoom y de ubicación los pone la pantalla (`.bico` del prototipo), no
    // MapLibre: así quedan donde el diseño los sitúa y con los textos en español. Lo que sí
    // sigue siendo de MapLibre es el botón de atribución, y ese llega sin nombre accesible
    // (WCAG 4.1.2), así que se etiqueta igual.
    etiquetarControlesDelMapa(m);

    const vivos = new Map<string, maplibregl.Marker>();
    pines.current = vivos;

    sincronizarPines.current = () => {
      if (!m.getLayer('puntos-ancla')) return;
      /**
       * Se pregunta a MapLibre qué reportes está dibujando SUELTOS, en vez de deducirlo del
       * tamaño del listado.
       *
       * Antes se comparaba el listado entero con el tope: con más de sesenta reportes en la vista
       * se apagaban las pastillas Y la capa de puntos, así que por encima del zoom de agrupación
       * —donde ya no hay círculos que dibujar— el mapa se quedaba literalmente sin nada pintado.
       * Lo que decide si caben las pastillas no es cuántos reportes hay en la ciudad, sino
       * cuántos quedaron fuera de una agrupación en esta pantalla.
       */
      const sueltos = new Map<string, { sev: Severidad; coords: [number, number] }>();
      for (const f of m.queryRenderedFeatures({ layers: ['puntos-ancla'] })) {
        const id = String(f.id ?? (f.properties as { id?: string } | undefined)?.id ?? '');
        // Una feature puede venir repetida por cada tesela que la toca.
        if (!id || sueltos.has(id)) continue;
        const p = (f.properties ?? {}) as { severidad?: Severidad };
        sueltos.set(id, {
          sev: p.severidad ?? 'baja',
          coords: (f.geometry as GeoJSON.Point).coordinates as [number, number],
        });
      }
      const conPastillas = sueltos.size > 0 && sueltos.size <= MAX_PASTILLAS;
      /**
       * Los dos cambios de estilo se aplican SOLO si cambió el valor.
       *
       * `setFilter` y `setLayoutProperty` marcan la capa como sucia y piden un repintado, y este
       * método corre en `idle`, que es justamente el evento que MapLibre lanza al terminar de
       * pintar. Escribir el mismo valor otra vez encadenaba repintado → `idle` → repintado: un
       * bucle a la velocidad de la pantalla que no se ve pero se nota en la batería y en tareas
       * largas de más de 100 ms mientras se mueve el mapa.
       */
      if (m.getLayer('puntos') && visibilidadPuntos.current !== conPastillas) {
        visibilidadPuntos.current = conPastillas;
        m.setLayoutProperty('puntos', 'visibility', conPastillas ? 'none' : 'visible');
      }
      const elegidoAhora = seleccionRef.current ?? SIN_SELECCION;
      if (m.getLayer('punto-elegido') && filtroElegido.current !== elegidoAhora) {
        filtroElegido.current = elegidoAhora;
        m.setFilter('punto-elegido', ['==', ['get', 'id'], elegidoAhora]);
      }
      onResumenRef.current?.(resumenDelMapa(m, sueltos.size));

      const vistos = new Set<string>();
      if (conPastillas)
        for (const [id, { sev, coords }] of sueltos) {
          vistos.add(id);
          let marca = vivos.get(id);
          if (!marca) {
            const el = document.createElement('button');
            el.type = 'button';
            el.className = 'pin';
            el.addEventListener('click', (ev) => {
              ev.stopPropagation();
              onSeleccionarRef.current?.(id);
            });
            // `left`: la pastilla nace en el punto y crece hacia la derecha, como en el prototipo
            // (`iconAnchor:[0,12]`), en vez de flotar encima y tapar la calle.
            marca = new maplibregl.Marker({ element: el, anchor: 'left' })
              .setLngLat(coords)
              .addTo(m);
            vivos.set(id, marca);
          } else marca.setLngLat(coords);
          const el = marca.getElement();
          const activo = seleccionRef.current === id;
          el.className = `pin${activo ? ' on' : ''}${destacadoRef.current === id ? ' nuevo' : ''}`;
          el.setAttribute('aria-pressed', String(activo));
          const etiqueta = etiquetaSeveridad(sev);
          el.setAttribute('aria-label', `Punto de severidad ${etiqueta.toLowerCase()}`);
          el.innerHTML = '';
          const dot = document.createElement('span');
          dot.className = 'd';
          dot.style.background = colorSeveridad(sev).relleno;
          el.append(dot, document.createTextNode(etiqueta));
        }
      for (const [id, marca] of vivos) {
        if (!vistos.has(id)) {
          marca.remove();
          vivos.delete(id);
        }
      }
    };

    m.on('load', () => {
      m.addSource('reportes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterRadius: RADIO_CLUSTER,
        clusterMaxZoom: ZOOM_MAX_CLUSTER,
        promoteId: 'id',
        /**
         * Cuántos reportes de cada severidad hay dentro de cada agrupación. MapLibre los suma
         * mientras agrupa, así que no cuesta una pasada aparte, y es lo único que permite pintar
         * el anillo por la severidad más grave sin abrir el grupo.
         *
         * No expone nada nuevo: son conteos del mismo conjunto de features que el navegador ya
         * tiene, y las coordenadas de ese conjunto son las públicas, ya desplazadas por el
         * servidor (CLAUDE.md §13).
         */
        clusterProperties: {
          criticas: ['+', ['case', ['==', ['get', 'severidad'], 'critica'], 1, 0]],
          altas: ['+', ['case', ['==', ['get', 'severidad'], 'alta'], 1, 0]],
          medias: ['+', ['case', ['==', ['get', 'severidad'], 'media'], 1, 0]],
        },
      });
      m.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'reportes',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#0F2D43',
          'circle-radius': escalonPorCantidad((b) => b.radio),
          'circle-stroke-color': anilloPorSeveridad(),
          // Más grueso cuando hay al menos un reporte crítico dentro: la severidad se lee por
          // color y por forma, no solo por color.
          'circle-stroke-width': [
            'case',
            ['>', ['get', 'criticas'], 0],
            4.5,
            3,
          ] as unknown as maplibregl.ExpressionSpecification,
          'circle-opacity': 0.94,
        },
      });
      m.addLayer({
        id: 'clusters-n',
        type: 'symbol',
        source: 'reportes',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': expresionNumeroCompacto(),
          'text-font': ['NotoSans-Bold'],
          'text-size': escalonPorCantidad((b) => b.texto),
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: { 'text-color': '#fff' },
      });
      // Punto suelto: el reporte que no quedó dentro de ninguna agrupación. Se dibuja en su
      // color de severidad y se tapa con la pastilla cuando hay pocas en pantalla.
      m.addLayer({
        id: 'puntos',
        type: 'circle',
        source: 'reportes',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 7,
          'circle-color': coloresPorSeveridad(),
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
        },
      });
      // Anillo del reporte elegido: lo mantiene localizable aunque haya dejado de estar en el
      // resultado de la vista y aunque no se estén dibujando pastillas.
      m.addLayer({
        id: 'punto-elegido',
        type: 'circle',
        source: 'reportes',
        filter: ['==', ['get', 'id'], SIN_SELECCION],
        paint: {
          'circle-radius': 13,
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': '#0F2D43',
          'circle-stroke-width': 3,
        },
      });
      // Círculo invisible pero consultable bajo cada punto: es lo que `queryRenderedFeatures`
      // usa para saber qué reportes están dibujados sueltos, y sirve de área de clic —más ancha
      // que el punto— tanto bajo la pastilla como sin ella.
      m.addLayer({
        id: 'puntos-ancla',
        type: 'circle',
        source: 'reportes',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 14,
          'circle-color': coloresPorSeveridad(),
          'circle-opacity': 0,
        },
      });

      m.on('click', 'clusters', (e: MapMouseEvent) => {
        const f = m.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0];
        if (!f) return;
        const centro = (f.geometry as GeoJSON.Point).coordinates as [number, number];
        const src = m.getSource('reportes') as maplibregl.GeoJSONSource;
        src
          .getClusterExpansionZoom(f.properties?.cluster_id as number)
          .then((z: number) => {
            /**
             * El zoom que devuelve MapLibre es aquel en el que la agrupación se rompe. Si los
             * reportes están prácticamente encimados puede ser el zoom actual o menor, y
             * entonces el clic no haría nada: al vecino le parecería que el mapa no responde.
             * En ese caso se acerca igual, hasta pasar el zoom de agrupación, que es donde los
             * puntos se separan siempre.
             */
            const destino = z > m.getZoom() ? z : Math.max(m.getZoom() + 2, ZOOM_MAX_CLUSTER + 1);
            m.easeTo({ center: centro, zoom: Math.min(destino, m.getMaxZoom()) });
          })
          .catch(() => {
            // La agrupación puede haber dejado de existir entre el clic y la respuesta.
            m.easeTo({ center: centro, zoom: Math.min(m.getZoom() + 2, m.getMaxZoom()) });
          });
      });
      m.on('click', 'puntos-ancla', (e: MapMouseEvent) => {
        const f = m.queryRenderedFeatures(e.point, { layers: ['puntos-ancla'] })[0];
        if (f) onSeleccionarRef.current?.(String(f.id ?? f.properties?.id));
      });
      for (const capa of ['puntos-ancla', 'clusters']) {
        m.on('mouseenter', capa, () => {
          m.getCanvas().style.cursor = 'pointer';
        });
        m.on('mouseleave', capa, () => {
          m.getCanvas().style.cursor = '';
        });
      }
      m.on('click', (e: MapMouseEvent) => {
        if (onUbicacionRef.current && seleccionUbicacionRef.current !== undefined)
          onUbicacionRef.current(e.lngLat.lat, e.lngLat.lng);
        else if (!m.queryRenderedFeatures(e.point, { layers: ['puntos-ancla', 'clusters'] }).length)
          onSeleccionarRef.current?.(null);
      });

      const avisar = () => {
        const b = m.getBounds();
        onMoverRef.current?.(
          `${b.getWest().toFixed(5)},${b.getSouth().toFixed(5)},${b.getEast().toFixed(5)},${b.getNorth().toFixed(5)}`,
          m.getZoom(),
        );
        if (seguirCentroRef.current) {
          const c = m.getCenter();
          onUbicacionRef.current?.(c.lat, c.lng);
        }
      };
      m.on('moveend', avisar);
      // Tres disparadores porque los tres momentos cambian qué puntos están dibujados: el mapa se
      // queda quieto, termina de cargar un origen de datos, o simplemente acaba de pintar.
      m.on('idle', () => {
        // Solo el primer `idle` apaga el aviso, y no se vuelve a encender al mover el mapa:
        // `dataloading` se dispara por cada tesela, así que reaccionar a él pondría una pastilla
        // parpadeando durante todo el arrastre. Lo que hay que resolver es el arranque en vacío.
        setPintando(false);
        sincronizarPines.current();
      });
      m.on('moveend', () => sincronizarPines.current());
      m.on('sourcedata', (e) => {
        if (e.sourceId === 'reportes' && e.isSourceLoaded) sincronizarPines.current();
      });
      m.on('zoom', () => ajustarVisibilidadCapas(m, capaVisibleRef.current));
      // `originalEvent` solo viene cuando el movimiento nace de un gesto (rueda, arrastre,
      // teclado); los `flyTo` del propio código no lo traen.
      m.on('movestart', (e) => {
        if ((e as { originalEvent?: unknown }).originalEvent) movidoPorUsuario.current = true;
      });
      listo.current = true;
      avisar();
      encuadrar(m, capasRef.current);
      aplicarCapas(m, capasRef.current, agregadosRef.current);
      ajustarVisibilidadCapas(m, capaVisibleRef.current);
      aplicarReportes(m, reportesRef.current);
      alListo?.(m);
    });
    mapa.current = m;
    /**
     * Tope duro del aviso de carga. Sin red, MapLibre puede no llegar nunca a `idle` —se queda
     * reintentando teselas que no van a venir— y la pastilla se quedaba puesta para siempre:
     * un «Cargando…» eterno miente igual que un mapa vacío. Comprobado con el service worker
     * sirviendo el shell y el servidor apagado.
     */
    const topeDelAviso = setTimeout(() => setPintando(false), 12_000);
    return () => {
      clearTimeout(topeDelAviso);
      for (const marca of vivos.values()) marca.remove();
      vivos.clear();
      m.remove();
      mapa.current = null;
      listo.current = false;
    };
  }, []);

  useEffect(() => {
    if (mapa.current && listo.current) {
      aplicarReportes(mapa.current, reportes);
      sincronizarPines.current();
    }
  }, [reportes]);

  // `encuadrar` y las banderas que deciden si toca encuadrar son refs y una función de
  // módulo, así que el efecto no depende de nada más que de las capas.
  // biome-ignore lint/correctness/useExhaustiveDependencies: ver arriba
  useEffect(() => {
    if (mapa.current && listo.current) {
      encuadrar(mapa.current, capas);
      aplicarCapas(mapa.current, capas, agregados);
      ajustarVisibilidadCapas(mapa.current, capaVisible);
    }
  }, [capas, agregados, capaVisible]);

  // `seleccionado` y `destacado` se leen por ref dentro de `sincronizarPines`, así que Biome no
  // ve la lectura; son justo los cambios que tienen que repintar la pastilla (oscura al elegirla,
  // latiendo si es la recién enviada).
  // biome-ignore lint/correctness/useExhaustiveDependencies: se leen por ref, ver arriba
  useEffect(() => {
    if (mapa.current && listo.current) sincronizarPines.current();
  }, [seleccionado, destacado]);

  // Marcador de selección de ubicación (arrastrable). En modo `seguirCentro` no se usa: ahí el
  // marcador lo dibuja la pantalla, clavado en el centro.
  // biome-ignore lint/correctness/useExhaustiveDependencies: onUbicacion se lee al arrastrar
  useEffect(() => {
    const m = mapa.current;
    if (!m || seguirCentro) return;
    if (!seleccionUbicacion) {
      marcador.current?.remove();
      marcador.current = null;
      return;
    }
    if (!marcador.current) {
      const el = document.createElement('div');
      el.style.cssText =
        'width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#1B6B38;border:3px solid #fff;box-shadow:0 2px 8px rgba(15,45,67,.4)';
      marcador.current = new maplibregl.Marker({ element: el, draggable: true, anchor: 'bottom' })
        .setLngLat([seleccionUbicacion.lon, seleccionUbicacion.lat])
        .addTo(m);
      marcador.current.on('dragend', () => {
        const p = marcador.current?.getLngLat();
        if (p) onUbicacion?.(p.lat, p.lng);
      });
    } else marcador.current.setLngLat([seleccionUbicacion.lon, seleccionUbicacion.lat]);
    m.easeTo({
      center: [seleccionUbicacion.lon, seleccionUbicacion.lat],
      zoom: Math.max(m.getZoom(), 16),
    });
  }, [seleccionUbicacion, seguirCentro]);

  return (
    <section ref={contenedor} className={className} aria-label={ariaLabel}>
      {pintando ? (
        <span className="cargando-mapa" role="status">
          Cargando el mapa…
        </span>
      ) : null}
    </section>
  );
}

/**
 * Cuenta lo que hay dibujado ahora mismo. Las agrupaciones se deduplican por `cluster_id`
 * porque una misma agrupación aparece en cada tesela que la toca.
 */
function resumenDelMapa(m: MapaGl, sueltos: number): ResumenMapa {
  const vistas = new Map<number, number>();
  if (m.getLayer('clusters'))
    for (const f of m.queryRenderedFeatures({ layers: ['clusters'] })) {
      const p = (f.properties ?? {}) as { cluster_id?: number; point_count?: number };
      if (typeof p.cluster_id === 'number') vistas.set(p.cluster_id, p.point_count ?? 0);
    }
  let agrupados = 0;
  for (const n of vistas.values()) agrupados += n;
  return { sueltos, agrupaciones: vistas.size, agrupados };
}

function aplicarReportes(m: MapaGl, reportes: ReporteFeature[]) {
  const src = m.getSource('reportes') as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  src.setData({
    type: 'FeatureCollection',
    features: reportes.map((f) => ({
      ...f,
      properties: { ...f.properties, etiqueta: etiquetaSeveridad(f.properties.severidad) },
    })),
  });
}

/**
 * Encuadra el mapa sobre el bbox de la capa administrativa vigente. Los distritos primero: son
 * la capa que cubre todo el municipio; si no estuviera, sirve cualquiera de las otras, que
 * están dentro. Devuelve si llegó a encuadrar, para no volver a intentarlo.
 */
function encuadrarEnCapas(m: MapaGl, lista: CapaInfo[]): boolean {
  const conBbox =
    lista.find((c) => c.capa === 'distrito_municipal' && c.bbox) ?? lista.find((c) => c.bbox);
  const b = conBbox?.bbox;
  if (!b) return false;
  m.fitBounds(
    [
      [b[0], b[1]],
      [b[2], b[3]],
    ],
    { padding: 24, duration: 0 },
  );
  return true;
}

/** Ids de las capas administrativas, en el orden en que se dibujan. */
const CAPAS_ADMIN = ['capa-distrito_municipal', 'capa-unidad_vecinal', 'capa-manzana'] as const;

/**
 * Distritos y unidades vecinales, con el relleno graduado por número de reportes: la ciudad se
 * lee de un vistazo, igual que en el prototipo. El conteo se toma de los agregados de
 * geo-service, que ya vienen por unidad vecinal y con su distrito.
 */
function aplicarCapas(m: MapaGl, capas: CapaInfo[], agregados: AgregadoUv[]) {
  const porUv = new Map(agregados.map((a) => [a.unidad_vecinal_id, a.n_reportes]));
  const porDistrito = new Map<string, number>();
  for (const a of agregados) {
    if (!a.distrito_id) continue;
    porDistrito.set(a.distrito_id, (porDistrito.get(a.distrito_id) ?? 0) + a.n_reportes);
  }

  const POR_DEFECTO = { color: '#3e5468', ancho: 0.6, minzoom: 14 };
  const estilos: Record<string, { color: string; ancho: number; minzoom: number }> = {
    distrito_municipal: { color: '#0A4A69', ancho: 2.5, minzoom: 0 },
    unidad_vecinal: { color: '#0D6189', ancho: 1.5, minzoom: 11 },
    manzana: POR_DEFECTO,
  };

  for (const c of capas) {
    const id = `capa-${c.capa}`;
    if (m.getSource(id)) {
      actualizarConteos(m, c, porUv, porDistrito);
      continue;
    }
    const e = estilos[c.capa] ?? POR_DEFECTO;
    const origen = typeof window !== 'undefined' ? window.location.origin : '';
    if (c.modo === 'teselas')
      // `minzoom` del ORIGEN, no solo de la capa: sin él MapLibre puede pedir la tesela z0 de
      // las manzanas, que son 27 434 polígonos metidos en un solo .mvt. Medido contra el
      // servicio con los datos reales: 2,0 MB en z10 y 515 KB en z12, frente a 42 KB en z14,
      // que es donde de verdad se dibujan. Una capa que no se pinta por debajo de cierto zoom
      // tampoco tiene nada que servir por debajo de ese zoom.
      m.addSource(id, {
        type: 'vector',
        tiles: [`${origen}${c.url}`],
        minzoom: e.minzoom,
        maxzoom: 16,
        promoteId: 'id',
      });
    else m.addSource(id, { type: 'geojson', data: `${origen}${c.url}`, promoteId: 'id' });
    const base = c.modo === 'teselas' ? { source: id, 'source-layer': c.capa } : { source: id };

    if (c.capa === 'manzana') {
      m.addLayer(
        {
          id: `${id}-relleno`,
          type: 'fill',
          ...base,
          minzoom: e.minzoom,
          paint: { 'fill-color': '#C9D6CE', 'fill-opacity': 0.55 },
        } as maplibregl.LayerSpecification,
        'clusters',
      );
    } else {
      // El relleno sube con la cantidad de reportes, del 0,14 al 0,46 de opacidad: mismo salto
      // que en el prototipo, donde un distrito con puntos se distingue de uno vacío.
      m.addLayer(
        {
          id: `${id}-relleno`,
          type: 'fill',
          ...base,
          minzoom: e.minzoom,
          paint: {
            // `color` lo escribe `fusionarConteosEnLaCapa` para que cada distrito tenga el suyo,
            // como en el prototipo; si no se pudo fusionar, todos comparten el color de la capa.
            'fill-color': ['coalesce', ['get', 'color'], e.color],
            'fill-opacity': [
              'case',
              ['>', ['coalesce', ['feature-state', 'n'], 0], 0],
              ['min', 0.46, ['+', 0.26, ['*', 0.045, ['coalesce', ['feature-state', 'n'], 0]]]],
              0.14,
            ],
          },
        } as maplibregl.LayerSpecification,
        'clusters',
      );
    }
    m.addLayer(
      {
        id: `${id}-linea`,
        type: 'line',
        ...base,
        minzoom: e.minzoom,
        paint: {
          'line-color': ['coalesce', ['get', 'color'], e.color],
          'line-width': e.ancho,
          'line-opacity': 0.85,
          ...(c.capa === 'unidad_vecinal' ? { 'line-dasharray': [5, 4] } : {}),
        },
      } as maplibregl.LayerSpecification,
      'clusters',
    );
    if (c.capa !== 'manzana') {
      m.addLayer(
        {
          id: `${id}-nombre`,
          type: 'symbol',
          ...base,
          minzoom: c.capa === 'distrito_municipal' ? 10 : 13,
          layout: {
            // `etiqueta` lleva el conteo («Distrito Centro · 3 reportes») y la escribe
            // `fusionarConteosEnLaCapa`; si esa fusión no se hace, queda el nombre a secas.
            'text-field': ['coalesce', ['get', 'etiqueta'], ['get', 'nombre']],
            'text-font': ['NotoSans-Bold'],
            'text-size': c.capa === 'distrito_municipal' ? 13 : 11,
            'symbol-placement': 'point',
          },
          paint: {
            'text-color': '#0F2D43',
            'text-halo-color': 'rgba(255,255,255,.92)',
            'text-halo-width': 2,
          },
        } as maplibregl.LayerSpecification,
        'clusters',
      );
    }
    actualizarConteos(m, c, porUv, porDistrito);
    void fusionarConteosEnLaCapa(m, c, porUv, porDistrito);
  }
}

/**
 * Tope para leer una capa entera en el navegador solo por poder escribir el conteo dentro de su
 * etiqueta. Medido con la entrega real del municipio: distritos 34 KB y unidades vecinales
 * 378 KB, las dos por debajo del tope, así que las dos llevan su conteo escrito. La de manzanas
 * son 15,5 MB y ni se plantea: se sirve por teselas y no lleva etiqueta.
 */
const MAX_BYTES_ETIQUETA = 600_000;
const yaFusionadas = new Set<string>();

/**
 * Colores de distrito del prototipo. Se reparten por el código de la capa, de forma estable, para
 * que dos distritos vecinos no queden del mismo color y la ciudad se lea como un mosaico y no
 * como una mancha. Una unidad vecinal hereda el color de su distrito.
 */
const COLORES_CAPA = ['#0F2D43', '#0D6189', '#28934D', '#1B6B38', '#0A4A69'] as const;

function colorDeUnidad(clave: string): string {
  let h = 0;
  for (let i = 0; i < clave.length; i++) h = (h * 31 + clave.charCodeAt(i)) >>> 0;
  return COLORES_CAPA[h % COLORES_CAPA.length] as string;
}

/**
 * Escribe «Distrito Centro · 3 reportes» dentro de la capa. El relleno graduado puede leer el
 * conteo con `feature-state`, pero el texto de un símbolo no: `text-field` es una propiedad de
 * layout y esas no admiten estado de feature. La única forma de tener el número escrito —que es
 * lo que hace el prototipo con sus tooltips permanentes— es meterlo en los datos.
 */
async function fusionarConteosEnLaCapa(
  m: MapaGl,
  c: CapaInfo,
  porUv: Map<string, number>,
  porDistrito: Map<string, number>,
) {
  if (c.capa === 'manzana' || c.modo !== 'geojson') return;
  if ((c.bytes_web ?? Number.POSITIVE_INFINITY) > MAX_BYTES_ETIQUETA) return;
  const tabla = c.capa === 'unidad_vecinal' ? porUv : porDistrito;
  if (tabla.size === 0) return;
  const clave = `capa-${c.capa}|${c.version}|${[...tabla.values()].reduce((a, b) => a + b, 0)}`;
  if (yaFusionadas.has(clave)) return;
  yaFusionadas.add(clave);
  const fuente = m.getSource(`capa-${c.capa}`) as maplibregl.GeoJSONSource | undefined;
  if (!fuente) return;
  try {
    // El mapa ya pidió esta misma URL, así que sale de la caché del navegador.
    const datos = (await fetch(c.url).then((r) => r.json())) as GeoJSON.FeatureCollection;
    for (const f of datos.features ?? []) {
      const p = (f.properties ?? {}) as Record<string, unknown>;
      const n = tabla.get(String(p.id ?? '')) ?? 0;
      p.n = n;
      p.etiqueta = n > 0 ? `${p.nombre} · ${n} ${n === 1 ? 'reporte' : 'reportes'}` : p.nombre;
      p.color = colorDeUnidad(String(p.distrito_id || p.id || ''));
      f.properties = p;
    }
    fuente.setData(datos);
  } catch {
    // Sin conteo en la etiqueta: la capa sigue dibujándose con su nombre y su relleno.
  }
}

/**
 * Los conteos viajan por `feature-state` y no dentro del GeoJSON: así la capa se descarga una
 * sola vez (es la respuesta más pesada del mapa) y los reportes nuevos solo repintan el relleno.
 */
function actualizarConteos(
  m: MapaGl,
  c: CapaInfo,
  porUv: Map<string, number>,
  porDistrito: Map<string, number>,
) {
  if (c.capa === 'manzana') return;
  const tabla = c.capa === 'unidad_vecinal' ? porUv : porDistrito;
  if (tabla.size === 0) return;
  const fuente = `capa-${c.capa}`;
  for (const [id, n] of tabla) {
    try {
      m.setFeatureState(
        c.modo === 'teselas' ? { source: fuente, sourceLayer: c.capa, id } : { source: fuente, id },
        { n },
      );
    } catch {
      // Una capa que todavía no terminó de cargar rechaza el estado; se reintenta en el
      // siguiente repintado, cuando `aplicarCapas` vuelve a pasar por acá.
    }
  }
}

/** Distritos siempre; unidades vecinales al acercar, como hace el prototipo a partir de z14. */
function ajustarVisibilidadCapas(m: MapaGl, capaVisible: 'auto' | 'distritos' | 'ninguna') {
  const uvVisible = capaVisible === 'auto' && m.getZoom() >= ZOOM_UV;
  const adminVisible = capaVisible !== 'ninguna';
  for (const base of CAPAS_ADMIN) {
    for (const sufijo of ['-relleno', '-linea', '-nombre']) {
      const id = `${base}${sufijo}`;
      if (!m.getLayer(id)) continue;
      const esUv = base !== 'capa-distrito_municipal';
      const visible = adminVisible && (esUv ? uvVisible : true);
      m.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }
  }
}
