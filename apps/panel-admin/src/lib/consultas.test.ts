import {
  environmentManager,
  focusManager,
  QueryClient,
  QueryObserver,
  type QueryObserverOptions,
} from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CABECERA_SONDEO } from './api';
import {
  consultaCapasMapa,
  consultaDistritos,
  consultaIndicadores,
  consultaReporte,
  consultaReportes,
  consultaResumenEjecutivo,
  consultaUnidadesVecinales,
  INTERVALO_SONDEO_MS,
  invalidarTrasActivarCapa,
} from './consultas';

/** Cuerpo mínimo de cada ruta: acá no importa qué trae, sino cuándo y con qué cabeceras se pide. */
function cuerpoPara(url: string): unknown {
  if (url.includes('/geo/v1/capas/')) return { type: 'FeatureCollection', features: [] };
  // Los distritos se piden por la `url` con huella de esta lista (S32).
  if (url === '/geo/v1/capas')
    return [
      {
        capa: 'distrito_municipal',
        version: 'v',
        n_features: 0,
        bytes_web: 0,
        modo: 'geojson',
        url: `/geo/v1/capas/distrito_municipal/v/${'a'.repeat(16)}`,
        bbox: null,
      },
    ];
  if (url.includes('/geo/v1/')) return [];
  if (url.includes('/tecnico/reportes?'))
    return { type: 'FeatureCollection', features: [], total: 0 };
  return {};
}

let llamadas: Array<{ url: string; cabeceras: Headers }> = [];

beforeEach(() => {
  // Vitest corre en Node y TanStack no arma intervalos del lado del servidor: acá es el navegador.
  environmentManager.setIsServer(() => false);
  vi.useFakeTimers();
  llamadas = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      llamadas.push({ url, cabeceras: new Headers(init?.headers) });
      return new Response(JSON.stringify(cuerpoPara(url)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
});

const suscripciones: Array<() => void> = [];
let cliente: QueryClient | null = null;

afterEach(() => {
  for (const baja of suscripciones.splice(0)) baja();
  cliente?.unmount();
  cliente?.clear();
  cliente = null;
  focusManager.setFocused(undefined);
  environmentManager.setIsServer(() => typeof window === 'undefined');
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Monta la consulta como la montaría un componente y deja salir la primera petición. */
/** TanStack tipa cada consulta con sus datos; acá solo importa cuándo y cómo se pide. */
const suelta = (o: object) => o as QueryObserverOptions;

async function montar(opciones: QueryObserverOptions) {
  if (!cliente) {
    cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Lo que hace QueryClientProvider: escuchar el foco de la pestaña.
    cliente.mount();
  }
  const observador = new QueryObserver(cliente, opciones);
  suscripciones.push(observador.subscribe(() => {}));
  await vi.advanceTimersByTimeAsync(0);
  return observador;
}

/** Monta varias consultas en el mismo instante, como una pantalla que las usa todas. */
async function montarJuntas(...lista: QueryObserverOptions[]) {
  if (!cliente) {
    cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    cliente.mount();
  }
  for (const o of lista) suscripciones.push(new QueryObserver(cliente, o).subscribe(() => {}));
  await vi.advanceTimersByTimeAsync(0);
}

const sondeo = (i: number) => llamadas[i]?.cabeceras.get(CABECERA_SONDEO) ?? null;

/** Hace que toda petición responda 500 (api-core caído), anotándola igual. */
function responderSiempre500() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      llamadas.push({ url, cabeceras: new Headers(init?.headers) });
      return new Response(JSON.stringify({ codigo: 'ERROR', mensaje: 'caído' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
}

const PANTALLAS_DE_TRABAJO = [
  { nombre: 'la bandeja', opciones: () => suelta(consultaReportes({ pagina: '1', limite: '50' })) },
  {
    nombre: 'el conteo de la bandeja',
    opciones: () => suelta(consultaReportes({ estado: 'nuevo', limite: '1' })),
  },
  {
    nombre: 'el detalle',
    opciones: () => suelta(consultaReporte('0b6c5f0e-6a55-4d0e-9d8f-1c8f2a7b3c4d')),
  },
  { nombre: 'los indicadores', opciones: () => suelta(consultaIndicadores()) },
  { nombre: 'el panel ejecutivo', opciones: () => suelta(consultaResumenEjecutivo()) },
] as const;

describe('sondeo de las pantallas de trabajo', () => {
  it('se refrescan cada 10 s, nunca con la pestaña oculta, y sin datos frescos que esperar', () => {
    expect(INTERVALO_SONDEO_MS).toBe(10_000);
    for (const { nombre, opciones } of PANTALLAS_DE_TRABAJO) {
      const o = opciones();
      expect(o.refetchInterval, nombre).toBe(10_000);
      expect(o.refetchIntervalInBackground, nombre).toBe(false);
      expect(o.staleTime, nombre).toBe(0);
    }
  });

  it.each(PANTALLAS_DE_TRABAJO)(
    '$nombre: la carga la pide la persona y a los 10 s vuelve a pedir marcada como sondeo',
    async ({ opciones }) => {
      await montar(opciones());
      expect(llamadas).toHaveLength(1);
      // La primera la pide la persona al abrir la pantalla: esa sí renueva la inactividad.
      expect(sondeo(0)).toBeNull();

      await vi.advanceTimersByTimeAsync(INTERVALO_SONDEO_MS - 1);
      expect(llamadas).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(llamadas).toHaveLength(2);
      expect(llamadas[1]?.url).toBe(llamadas[0]?.url);
      expect(sondeo(1)).toBe('1');

      await vi.advanceTimersByTimeAsync(INTERVALO_SONDEO_MS);
      expect(llamadas).toHaveLength(3);
      expect(sondeo(2)).toBe('1');
    },
  );

  it.each(PANTALLAS_DE_TRABAJO)(
    '$nombre: con la pestaña oculta no pide; al volver pide una vez, como sondeo',
    async ({ opciones }) => {
      await montar(opciones());
      expect(llamadas).toHaveLength(1);

      focusManager.setFocused(false);
      await vi.advanceTimersByTimeAsync(6 * INTERVALO_SONDEO_MS);
      expect(llamadas).toHaveLength(1);

      focusManager.setFocused(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(llamadas).toHaveLength(2);
      expect(sondeo(1)).toBe('1');
    },
  );

  it.each(PANTALLAS_DE_TRABAJO)(
    '$nombre: si la primera carga falla, los refrescos siguientes salen igual como sondeo',
    async ({ opciones }) => {
      // Sin esto, con api-core devolviendo errores cada refresco contaba como un pedido de la
      // persona y renovaba la inactividad de la sesión mientras la pantalla siguiera abierta.
      responderSiempre500();
      await montar(opciones());
      expect(llamadas).toHaveLength(1);
      expect(sondeo(0)).toBeNull();

      await vi.advanceTimersByTimeAsync(INTERVALO_SONDEO_MS);
      expect(llamadas).toHaveLength(2);
      expect(sondeo(1)).toBe('1');
      await vi.advanceTimersByTimeAsync(INTERVALO_SONDEO_MS);
      expect(llamadas).toHaveLength(3);
      expect(sondeo(2)).toBe('1');
    },
  );

  it('cambiar un filtro de la bandeja es un pedido de la persona, no un sondeo', async () => {
    await montar(suelta(consultaReportes({ pagina: '1', limite: '50' })));
    await montar(suelta(consultaReportes({ pagina: '1', limite: '50', estado: 'validado' })));
    expect(llamadas).toHaveLength(2);
    expect(llamadas[1]?.url).toContain('estado=validado');
    expect(sondeo(1)).toBeNull();
  });

  it('el panel ejecutivo pide siempre el histórico completo', async () => {
    await montar(suelta(consultaResumenEjecutivo()));
    expect(llamadas[0]?.url).toBe('/api/v1/ejecutivo/resumen?ventana=todo');
  });
});

describe('geometría', () => {
  // Los distritos son dos peticiones: la lista de capas y su `url` con huella (S32).
  const GEOMETRIA = [
    { nombre: 'los distritos', opciones: () => suelta(consultaDistritos()), peticiones: 2 },
    {
      nombre: 'las unidades vecinales',
      opciones: () => suelta(consultaUnidadesVecinales()),
      peticiones: 1,
    },
  ] as const;

  it.each(GEOMETRIA)(
    '$nombre: se piden una vez y no se vuelven a pedir, ni con el tiempo ni en otra pantalla',
    async ({ opciones, peticiones }) => {
      const o = opciones();
      expect(o.staleTime).toBe(Number.POSITIVE_INFINITY);
      expect(o.refetchInterval).toBeUndefined();

      await montar(o);
      expect(llamadas).toHaveLength(peticiones);
      await vi.advanceTimersByTimeAsync(10 * INTERVALO_SONDEO_MS);
      expect(llamadas).toHaveLength(peticiones);

      // Otra pantalla que monta la misma consulta, y la vuelta a la pestaña.
      await montar(opciones());
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(llamadas).toHaveLength(peticiones);
      expect(sondeo(0)).toBeNull();
    },
  );

  it('los distritos reusan la lista de capas del mapa: /geo/v1/capas sale una sola vez', async () => {
    // La bandeja monta las dos consultas a la vez.
    await montarJuntas(suelta(consultaDistritos()), suelta(consultaCapasMapa()));
    expect(llamadas.filter((l) => l.url === '/geo/v1/capas')).toHaveLength(1);
    expect(
      llamadas.filter((l) => l.url.startsWith('/geo/v1/capas/distrito_municipal/v/')),
    ).toHaveLength(1);
  });
});

describe('lista de capas del mapa', () => {
  it('vence: al volver a la pestaña pasado su plazo se vuelve a pedir, y antes no', async () => {
    // `/geo/v1/capas` es liviana y `no-cache`: con staleTime infinito, una capa activada desde
    // otra sesión no llegaba nunca al mapa de una pestaña abierta.
    const o = suelta(consultaCapasMapa());
    const plazo = o.staleTime as number;
    expect(Number.isFinite(plazo)).toBe(true);
    expect(plazo).toBeGreaterThan(0);
    expect(o.refetchInterval).toBeUndefined();

    await montar(o);
    expect(llamadas).toHaveLength(1);
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(llamadas).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(plazo);
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(llamadas.map((l) => l.url)).toEqual(['/geo/v1/capas', '/geo/v1/capas']);
    // No es un sondeo de api-core: geo-service no tiene sesión que renovar.
    expect(sondeo(1)).toBeNull();
  });
});

describe('activar una versión de capa', () => {
  it('invalida la geometría del mapa, además de las versiones y los indicadores', async () => {
    const qc = new QueryClient();
    const claves = [
      ['geo', 'capas'],
      ['geo', 'distritos'],
      ['geo', 'unidades-vecinales'],
      ['capas-versiones'],
      ['indicadores'],
      ['reportes', { pagina: '1' }],
    ];
    for (const k of claves) qc.setQueryData(k, 1);
    await invalidarTrasActivarCapa(qc);
    const invalidada = (k: unknown[]) => qc.getQueryState(k)?.isInvalidated;
    expect(invalidada(['geo', 'capas'])).toBe(true);
    expect(invalidada(['geo', 'distritos'])).toBe(true);
    expect(invalidada(['geo', 'unidades-vecinales'])).toBe(true);
    expect(invalidada(['capas-versiones'])).toBe(true);
    expect(invalidada(['indicadores'])).toBe(true);
    // La bandeja no depende de la capa: no se vuelve a pedir por esto.
    expect(invalidada(['reportes', { pagina: '1' }])).toBe(false);
    qc.clear();
  });
});
