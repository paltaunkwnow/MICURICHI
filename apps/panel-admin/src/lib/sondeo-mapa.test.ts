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
  consultaIndicadores,
  consultaMapaEjecutivo,
  consultaReporte,
  consultaReportes,
  consultaReportesPublicos,
  consultaResumenEjecutivo,
  crearControlMovimientoMapa,
} from './consultas';
import { FILTROS_VACIOS, parametrosConsulta } from './filtros';

let visible = true;
let qc: QueryClient;
let pedidos: Array<{ url: string; marca: string | null; signal?: AbortSignal | null }>;
const bajas: Array<() => void> = [];
beforeEach(() => {
  environmentManager.setIsServer(() => false);
  vi.useFakeTimers();
  visible = true;
  vi.stubGlobal('document', {
    get visibilityState() {
      return visible ? 'visible' : 'hidden';
    },
  });
  focusManager.setFocused(true);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.mount();
  pedidos = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      pedidos.push({
        url,
        marca: new Headers(init?.headers).get(CABECERA_SONDEO),
        signal: init?.signal,
      });
      return new Response(JSON.stringify({ features: [], total: 0 }), { status: 200 });
    }),
  );
});
afterEach(() => {
  for (const baja of bajas.splice(0)) baja();
  qc.unmount();
  qc.clear();
  focusManager.setFocused(undefined);
  environmentManager.setIsServer(() => typeof window === 'undefined');
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const BBOX = '-64,-18,-63,-17';
function observar(opciones: object) {
  const observador = new QueryObserver(qc, opciones as QueryObserverOptions);
  bajas.push(observador.subscribe(() => {}));
  return observador;
}

describe('CA10: temporizador, commit oculto y primeras cargas automáticas reales', () => {
  it.each([
    { nombre: 'indicadores', opciones: () => consultaIndicadores({ categoria: 'bache' }) },
    { nombre: 'detalle', opciones: () => consultaReporte('id-sintetico') },
    { nombre: 'públicos', opciones: () => consultaReportesPublicos({ categoria: 'bache' }) },
    { nombre: 'resumen', opciones: () => consultaResumenEjecutivo('bache') },
    { nombre: 'composición pública', opciones: () => consultaMapaEjecutivo(['bache']) },
  ])('$nombre: bloquea primera clave oculta y reanuda una vez marcada', async ({ opciones }) => {
    visible = false;
    focusManager.setFocused(false);
    observar(opciones());
    await vi.advanceTimersByTimeAsync(1000);
    expect(pedidos).toHaveLength(0);
    visible = true;
    focusManager.setFocused(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]?.marca).toBe('1');
  });
  it('composición visible: primera carga manual sin marca, refresco marcado, AbortSignal conservado', async () => {
    observar(consultaMapaEjecutivo(['bache', 'inundacion']));
    await vi.advanceTimersByTimeAsync(0);
    expect(pedidos.map((p) => p.marca)).toEqual([null, null]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(pedidos.slice(2).map((p) => p.marca)).toEqual(['1', '1']);
    expect(pedidos.every((p) => p.signal instanceof AbortSignal)).toBe(true);
  });
  it('una clave nueva creada oculta no hace fetch; al volver hace uno como sondeo', async () => {
    visible = false;
    focusManager.setFocused(false);
    observar(consultaReportes({ bbox: BBOX, categoria: 'inundacion' }));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(pedidos).toHaveLength(0);
    visible = true;
    focusManager.setFocused(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]?.marca).toBe('1');
  });
  it('ocultar cancela el debounce pendiente y preserva el último bbox hasta volver', async () => {
    const navegar = vi.fn();
    const control = crearControlMovimientoMapa({
      leerFiltros: () => FILTROS_VACIOS,
      navegar,
      activo: () => true,
    });
    control.mover(BBOX);
    await vi.advanceTimersByTimeAsync(200);
    visible = false;
    focusManager.setFocused(false);
    control.cambiarVisibilidad();
    await vi.advanceTimersByTimeAsync(1000);
    expect(navegar).not.toHaveBeenCalled();
    visible = true;
    control.cambiarVisibilidad();
    expect(navegar).toHaveBeenCalledExactlyOnceWith({ ...FILTROS_VACIOS, bbox: BBOX, pagina: 1 });
    control.destruir();
  });
  it('el mapa termina de cargar oculto: guarda bbox sin temporizador y solo navega una vez al regresar', async () => {
    visible = false;
    const navegar = vi.fn();
    const control = crearControlMovimientoMapa({
      leerFiltros: () => FILTROS_VACIOS,
      navegar,
      activo: () => true,
    });
    control.mover(BBOX);
    await vi.advanceTimersByTimeAsync(800);
    expect(navegar).not.toHaveBeenCalled();
    visible = true;
    control.cambiarVisibilidad();
    control.cambiarVisibilidad();
    expect(navegar).toHaveBeenCalledTimes(1);
    control.destruir();
  });
  it('un router commit que llega oculto no dispara las claves 50/500; ambas reanudan marcadas y sin duplicado por foco', async () => {
    const control = crearControlMovimientoMapa({
      leerFiltros: () => FILTROS_VACIOS,
      navegar: vi.fn(),
      activo: () => true,
    });
    control.mover(BBOX);
    await vi.advanceTimersByTimeAsync(400);
    visible = false;
    focusManager.setFocused(false);
    control.cambiarVisibilidad();
    observar(consultaReportes({ bbox: BBOX, limite: '50' }, { controlMapa: control }));
    observar(consultaReportes({ bbox: BBOX, limite: '500' }, { controlMapa: control }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(pedidos).toHaveLength(0);
    visible = true;
    control.cambiarVisibilidad();
    focusManager.setFocused(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(pedidos).toHaveLength(2);
    expect(pedidos.map((p) => p.marca)).toEqual(['1', '1']);
    control.destruir();
  });
  it('un movimiento aplazado bloquea el refetch de claves anteriores al foco y mantiene las cargas manuales visibles sin marca', async () => {
    let filtros = { ...FILTROS_VACIOS, bbox: '-65,-19,-64,-18' };
    const control = crearControlMovimientoMapa({
      leerFiltros: () => filtros,
      navegar: (f) => {
        filtros = f;
      },
      activo: () => true,
    });
    const observador = observar(
      consultaReportes(parametrosConsulta(filtros), { controlMapa: control }),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(pedidos[0]?.marca).toBeNull();
    visible = false;
    focusManager.setFocused(false);
    control.mover(BBOX);
    control.cambiarVisibilidad();
    visible = true;
    focusManager.setFocused(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(pedidos).toHaveLength(1);
    control.cambiarVisibilidad();
    observador.setOptions(
      consultaReportes(parametrosConsulta(filtros), {
        controlMapa: control,
      }) as QueryObserverOptions,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(pedidos).toHaveLength(2);
    expect(pedidos[1]?.marca).toBe('1');
    control.cancelar();
    observador.setOptions(
      consultaReportes(
        { bbox: '-66,-20,-65,-19' },
        { controlMapa: control },
      ) as QueryObserverOptions,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(pedidos[2]?.marca).toBeNull();
    expect(pedidos[2]?.signal).toBeInstanceOf(AbortSignal);
    control.destruir();
  });
  it('atrás/adelante manual a una clave cacheada despeja el destino automático y hace una petición sin marca', async () => {
    let filtros = { ...FILTROS_VACIOS, bbox: '-65,-19,-64,-18' };
    const control = crearControlMovimientoMapa({
      leerFiltros: () => filtros,
      navegar: (f) => {
        filtros = f;
      },
      activo: () => true,
    });
    control.confirmar(filtros);
    const original = parametrosConsulta(filtros);
    const observador = observar(consultaReportes(original, { controlMapa: control }));
    await vi.advanceTimersByTimeAsync(0);
    control.mover(BBOX);
    await vi.advanceTimersByTimeAsync(400);
    control.confirmar(filtros);
    observador.setOptions(
      consultaReportes(parametrosConsulta(filtros), {
        controlMapa: control,
      }) as QueryObserverOptions,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(pedidos[1]?.marca).toBe('1');
    filtros = { ...filtros, bbox: original.bbox ?? '' };
    control.confirmar(filtros);
    observador.setOptions(
      consultaReportes(parametrosConsulta(filtros), {
        controlMapa: control,
      }) as QueryObserverOptions,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(pedidos).toHaveLength(3);
    expect(pedidos[2]?.marca).toBeNull();
    control.destruir();
  });
  it('cancelar una consulta propaga AbortSignal al transporte', async () => {
    let signal: AbortSignal | null | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        signal = init?.signal;
        return new Promise<Response>((_resolve, reject) =>
          signal?.addEventListener('abort', () => reject(signal?.reason), { once: true }),
        );
      }),
    );
    observar(consultaReportes({ categoria: 'bache' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(signal?.aborted).toBe(false);
    await qc.cancelQueries();
    expect(signal?.aborted).toBe(true);
  });
});
