/**
 * La página pública no hace tráfico automático: los datos se piden al abrir una pantalla, al
 * mover el mapa o cuando la propia app sabe que cambiaron (invalidación tras enviar un reporte),
 * nunca porque la pestaña recuperó el foco, volvió la red o pasó un rato.
 *
 * Se conduce el QueryClient real con un `QueryObserver`, que es lo que hace `useQuery` por dentro,
 * sin montar React.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  focusManager,
  onlineManager,
  type QueryClient,
  type QueryKey,
  QueryObserver,
} from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearClienteDeConsultas } from './consultas';

let cliente: QueryClient;

beforeEach(() => {
  vi.useFakeTimers();
  cliente = crearClienteDeConsultas();
  // Lo que hace `QueryClientProvider` al montarse: escuchar el foco y la red.
  cliente.mount();
});

afterEach(() => {
  cliente.unmount();
  cliente.clear();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
  vi.useRealTimers();
});

/** Una pantalla que usa la consulta: se suscribe y la dispara si hace falta. */
function montar(queryKey: QueryKey, queryFn: () => Promise<unknown>) {
  const observador = new QueryObserver(cliente, { queryKey, queryFn });
  return observador.subscribe(() => {});
}

const CLAVES_PUBLICAS: Array<[string, QueryKey]> = [
  ['reportes del mapa', ['reportes', { bbox: '-63.3,-17.9,-63.0,-17.7' }]],
  ['reportes de la portada', ['reportes', { limite: '60' }]],
  ['agregados por unidad vecinal', ['agregados']],
  ['detalle de un reporte', ['reporte', 'b3c0a0de-0000-4000-8000-000000000001']],
];

describe('sin tráfico automático en la app pública', () => {
  it.each(CLAVES_PUBLICAS)(
    '%s: volver a la pestaña a los 60 s no dispara otro GET',
    async (_, clave) => {
      const pedir = vi.fn(async () => ({ ok: true }));
      const desmontar = montar(clave, pedir);
      await vi.advanceTimersByTimeAsync(0);
      expect(pedir).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(60_000);
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(pedir).toHaveBeenCalledTimes(1);
      desmontar();
    },
  );

  it('volver la red no dispara otro GET', async () => {
    const pedir = vi.fn(async () => ({ ok: true }));
    const desmontar = montar(['reportes', { limite: '60' }], pedir);
    await vi.advanceTimersByTimeAsync(60_000);
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(pedir).toHaveBeenCalledTimes(1);
    desmontar();
  });

  it('no hay refresco por intervalo: en 30 minutos abiertos se pide una sola vez', async () => {
    const pedir = vi.fn(async () => ({ ok: true }));
    const desmontar = montar(['agregados'], pedir);
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(pedir).toHaveBeenCalledTimes(1);
    desmontar();
  });

  it.each(CLAVES_PUBLICAS)(
    '%s: volver a la pantalla al minuto usa lo que ya había',
    async (_, clave) => {
      const pedir = vi.fn(async () => ({ ok: true }));
      montar(clave, pedir)();
      await vi.advanceTimersByTimeAsync(60_000);
      // gcTime es de 5 minutos: al minuto la consulta sigue en memoria, y con staleTime Infinity no
      // está vieja, así que no se vuelve a pedir.
      const desmontar = montar(clave, pedir);
      await vi.advanceTimersByTimeAsync(0);
      expect(pedir).toHaveBeenCalledTimes(1);
      desmontar();
    },
  );

  it('una invalidación explícita sí vuelve a pedir (así se ve el reporte recién enviado)', async () => {
    const pedir = vi.fn(async () => ({ ok: true }));
    const desmontar = montar(['reportes', { limite: '60' }], pedir);
    await vi.advanceTimersByTimeAsync(0);
    await cliente.invalidateQueries({ queryKey: ['reportes'] });
    expect(pedir).toHaveBeenCalledTimes(2);
    desmontar();
  });

  it('las opciones por defecto no reintroducen foco, reconexión ni intervalo', () => {
    const q = cliente.getDefaultOptions().queries ?? {};
    expect(q.refetchOnWindowFocus).toBe(false);
    expect(q.refetchOnReconnect).toBe(false);
    expect(q.refetchInterval).toBe(false);
    for (const [, clave] of CLAVES_PUBLICAS)
      expect(cliente.getQueryDefaults(clave).staleTime, JSON.stringify(clave)).toBe(
        Number.POSITIVE_INFINITY,
      );
  });
});

/** Todos los .ts y .tsx de `src/` salvo las pruebas. */
function fuentes(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return fuentes(ruta);
    return /\.tsx?$/.test(nombre) && !/\.test\.tsx?$/.test(nombre) ? [ruta] : [];
  });
}

describe('ninguna pantalla vuelve a encender el tráfico automático', () => {
  it('ningún useQuery pide refresco por intervalo, por foco ni por reconexión', () => {
    const src = resolve(import.meta.dirname, '..');
    const culpables = fuentes(src).filter((ruta) =>
      /refetchInterval\s*:(?!\s*false\b)|refetchOnWindowFocus\s*:\s*true|refetchOnReconnect\s*:\s*true/.test(
        readFileSync(ruta, 'utf8'),
      ),
    );
    expect(culpables).toEqual([]);
  });
});

/**
 * La fuente con los comentarios en blanco (misma longitud, para que las posiciones sigan valiendo)
 * y, por posición, si cae dentro de una cadena. Un comentario como «Sin `staleTime` propio» no
 * cuenta, y una llave escrita en una cadena no desarma la cuenta de llaves.
 */
function sinComentarios(fuente: string): { texto: string; enCadena: boolean[] } {
  const texto = fuente.split('');
  const enCadena = new Array<boolean>(fuente.length).fill(false);
  let i = 0;
  while (i < fuente.length) {
    const c = fuente[i];
    const sig = fuente[i + 1];
    if (c === '/' && (sig === '/' || sig === '*')) {
      const fin = sig === '/' ? fuente.indexOf('\n', i) : fuente.indexOf('*/', i + 2) + 2;
      const hasta = fin <= 1 ? fuente.length : fin;
      for (let j = i; j < hasta; j += 1) if (texto[j] !== '\n') texto[j] = ' ';
      i = hasta;
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      // Una comilla suelta (un apóstrofo en JSX, una regex) no se come el resto del archivo: las
      // cadenas con ' o " terminan con la línea.
      while (j < fuente.length && fuente[j] !== c && (c === '`' || fuente[j] !== '\n'))
        j += fuente[j] === '\\' ? 2 : 1;
      for (let k = i; k <= j && k < fuente.length; k += 1) enCadena[k] = true;
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return { texto: texto.join(''), enCadena };
}

/**
 * Las opciones de consulta (el objeto `{ queryKey: [...], ... }`) cuya clave empieza por
 * `reportes`, `agregados` o `reporte` y que ponen su propio `staleTime`, que pisaría el `Infinity`
 * del cliente. Devuelve el texto de cada objeto culpable.
 */
function consultasPublicasConStaleTime(fuente: string): string[] {
  const { texto, enCadena } = sinComentarios(fuente);
  const culpables: string[] = [];
  for (const m of texto.matchAll(/\bqueryKey\s*:\s*\[\s*(['"])(reportes|agregados|reporte)\1/g)) {
    const pos = m.index ?? 0;
    if (enCadena[pos]) continue;
    // La llave que abre el objeto de opciones: hacia atrás, la primera que queda sin cerrar.
    let abre = -1;
    for (let j = pos - 1, profundidad = 0; j >= 0; j -= 1) {
      if (enCadena[j]) continue;
      if (texto[j] === '}') profundidad += 1;
      else if (texto[j] === '{') {
        if (profundidad === 0) {
          abre = j;
          break;
        }
        profundidad -= 1;
      }
    }
    if (abre === -1) continue;
    let cierra = texto.length;
    for (let j = abre + 1, profundidad = 1; j < texto.length; j += 1) {
      if (enCadena[j]) continue;
      if (texto[j] === '{') profundidad += 1;
      else if (texto[j] === '}') {
        profundidad -= 1;
        if (profundidad === 0) {
          cierra = j + 1;
          break;
        }
      }
    }
    const opciones = texto.slice(abre, cierra);
    if (/\bstaleTime\b/.test(opciones)) culpables.push(opciones);
  }
  return culpables;
}

describe('ninguna pantalla le pone caducidad propia a los datos públicos', () => {
  it('detecta el staleTime en la consulta de reportes, agregados o detalle, y solo ahí', () => {
    const conCaducidad = [
      `useQuery({ queryKey: ['reportes', filtros], queryFn: pedir, staleTime: 30_000 });`,
      `useQuery({\n  queryKey: ["agregados"],\n  staleTime,\n  queryFn: pedir,\n});`,
      `useQuery({ queryKey: ['reporte', id], queryFn: pedir, retry: false, staleTime: 0 });`,
      `useQuery({ staleTime: 1, queryKey: ['reportes', { limite: '60' }], queryFn: pedir });`,
    ];
    for (const fuente of conCaducidad)
      expect(consultasPublicasConStaleTime(fuente), fuente).toHaveLength(1);

    const sinCaducidad = [
      // El comentario que dejan las pantallas no es una opción.
      `useQuery({\n  queryKey: ['reportes', filtros],\n  // Sin \`staleTime\` propio (S31).\n  queryFn: pedir,\n});`,
      // Otra consulta del mismo archivo sí puede ponerlo.
      `useQuery({ queryKey: ['reportes', { limite: '60' }], queryFn: pedir });\nuseQuery({ queryKey: ['capas'], queryFn: pedir, staleTime: 600_000 });`,
      `useQuery({ queryKey: ['reportes', { q: '}' }], queryFn: pedir });\nuseQuery({ queryKey: ['yo'], staleTime: 300_000 });`,
      `useQuery({ queryKey: ['reportes-viejos'], staleTime: 1 });`,
    ];
    for (const fuente of sinCaducidad)
      expect(consultasPublicasConStaleTime(fuente), fuente).toEqual([]);
  });

  it('ningún archivo de la app pone staleTime en esas consultas', () => {
    const src = resolve(import.meta.dirname, '..');
    const culpables = fuentes(src).filter(
      (ruta) => consultasPublicasConStaleTime(readFileSync(ruta, 'utf8')).length > 0,
    );
    expect(culpables).toEqual([]);
  });
});
