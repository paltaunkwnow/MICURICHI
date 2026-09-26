import { type Ciudad, CONFIG_DOMINIO } from 'contracts';
import { describe, expect, it, vi } from 'vitest';
import { crearLectorDeCiudad, REVALIDAR_MS, RUTA_CONFIGURACION } from './configuracion';

/**
 * La ciudad llega de `GET /api/v1/configuracion` en tiempo de ejecución: la misma imagen sirve a
 * cualquier ciudad. Mismas reglas que en web-ciudadano: cuándo se pregunta, qué se guarda y qué
 * pasa cuando api-core no contesta, que es el único caso en que se usa la ciudad por defecto.
 */

const LA_PAZ: Ciudad = {
  nombre: 'La Paz',
  pais: 'BO',
  zona_horaria: 'America/La_Paz',
  locale: 'es-BO',
  centro: { lon: -68.1193, lat: -16.4897 },
  zoom_inicial: 12.5,
};
const ORURO: Ciudad = { ...LA_PAZ, nombre: 'Oruro', centro: { lon: -67.11, lat: -17.97 } };

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** Deja correr las promesas pendientes (la renovación por detrás). */
const vaciarCola = () => new Promise((r) => setTimeout(r, 0));

function preparar() {
  let reloj = 0;
  let base = 'http://api-core:3001';
  const registros: string[] = [];
  const pedir = vi.fn<typeof fetch>();
  const leer = crearLectorDeCiudad({
    urlBase: () => base,
    pedir,
    ahora: () => reloj,
    registrar: (mensaje) => registros.push(mensaje),
    plazoMs: 30,
  });
  return {
    leer,
    pedir,
    registros,
    avanzar: (ms: number) => {
      reloj += ms;
    },
    cambiarBase: (nueva: string) => {
      base = nueva;
    },
  };
}

describe('lector de la ciudad (GET /api/v1/configuracion)', () => {
  it('pregunta a api-core, sin la caché de datos de Next, y devuelve la ciudad validada', async () => {
    const { leer, pedir } = preparar();
    pedir.mockResolvedValue(json({ ciudad: LA_PAZ }));

    expect(RUTA_CONFIGURACION).toBe('/api/v1/configuracion');
    expect(await leer()).toEqual(LA_PAZ);
    expect(pedir).toHaveBeenCalledWith(
      'http://api-core:3001/api/v1/configuracion',
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
    );
  });

  it('guarda la ciudad cinco minutos: mientras tanto no vuelve a preguntar', async () => {
    const { leer, pedir, avanzar } = preparar();
    pedir.mockResolvedValue(json({ ciudad: LA_PAZ }));

    expect(REVALIDAR_MS).toBe(300_000);
    await leer();
    avanzar(REVALIDAR_MS - 1);
    expect(await leer()).toEqual(LA_PAZ);
    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it('vencido el plazo responde con la que tiene y la renueva por detrás', async () => {
    const { leer, pedir, avanzar } = preparar();
    pedir.mockResolvedValueOnce(json({ ciudad: LA_PAZ }));
    await leer();

    avanzar(REVALIDAR_MS);
    pedir.mockResolvedValueOnce(json({ ciudad: ORURO }));
    // Ninguna página espera por la renovación: sale con la ciudad que ya había.
    expect(await leer()).toEqual(LA_PAZ);
    await vaciarCola();
    expect(await leer()).toEqual(ORURO);
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  it('la URL de api-core se lee en cada consulta, no al cargar el módulo', async () => {
    const { leer, pedir, avanzar, cambiarBase } = preparar();
    pedir.mockResolvedValue(json({ ciudad: LA_PAZ }));
    await leer();

    cambiarBase('http://otra-api:9000/');
    avanzar(REVALIDAR_MS);
    await leer();
    await vaciarCola();
    expect(pedir).toHaveBeenLastCalledWith(
      'http://otra-api:9000/api/v1/configuracion',
      expect.anything(),
    );
  });

  it('varias páginas a la vez comparten una sola consulta', async () => {
    const { leer, pedir } = preparar();
    pedir.mockResolvedValue(json({ ciudad: LA_PAZ }));

    const ciudades = await Promise.all([leer(), leer(), leer()]);
    expect(ciudades).toEqual([LA_PAZ, LA_PAZ, LA_PAZ]);
    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it('si api-core no responde usa CIUDAD_POR_DEFECTO y lo registra', async () => {
    const { leer, pedir, registros } = preparar();
    pedir.mockRejectedValue(new TypeError('fetch failed'));

    expect(await leer()).toEqual(CONFIG_DOMINIO.CIUDAD_POR_DEFECTO);
    expect(registros).toHaveLength(1);
    expect(registros[0]).toContain('CIUDAD_POR_DEFECTO');
    expect(registros[0]).toContain('http://api-core:3001/api/v1/configuracion');
  });

  it('el respaldo no se guarda: la consulta siguiente vuelve a preguntar', async () => {
    const { leer, pedir } = preparar();
    pedir.mockRejectedValueOnce(new TypeError('fetch failed'));
    await leer();

    pedir.mockResolvedValueOnce(json({ ciudad: LA_PAZ }));
    expect(await leer()).toEqual(LA_PAZ);
  });

  it('una respuesta que no es 200, no es JSON o no cumple el esquema no se usa', async () => {
    const { leer, pedir, registros } = preparar();
    // Un api-core anterior a contracts 0.7.0 no tiene la ruta.
    pedir.mockResolvedValueOnce(json({ codigo: 'NO_ENCONTRADO' }, 404));
    expect(await leer()).toEqual(CONFIG_DOMINIO.CIUDAD_POR_DEFECTO);
    expect(registros[0]).toContain('404');

    pedir.mockResolvedValueOnce(new Response('<html>proxy</html>', { status: 200 }));
    expect(await leer()).toEqual(CONFIG_DOMINIO.CIUDAD_POR_DEFECTO);

    // `es_BO` hace que Intl lance RangeError en el navegador: la pantalla que formatea se caería.
    pedir.mockResolvedValueOnce(json({ ciudad: { ...LA_PAZ, locale: 'es_BO' } }));
    expect(await leer()).toEqual(CONFIG_DOMINIO.CIUDAD_POR_DEFECTO);
    expect(registros[2]).toContain('locale');
  });

  it('si ya tenía una ciudad y api-core falla, sigue con esa y lo registra', async () => {
    const { leer, pedir, registros, avanzar } = preparar();
    pedir.mockResolvedValueOnce(json({ ciudad: LA_PAZ }));
    await leer();

    avanzar(REVALIDAR_MS);
    pedir.mockRejectedValue(new TypeError('fetch failed'));
    expect(await leer()).toEqual(LA_PAZ);
    await vaciarCola();
    expect(await leer()).toEqual(LA_PAZ);
    expect(registros[0]).toContain('La Paz');
    expect(registros.join('\n')).not.toContain('CIUDAD_POR_DEFECTO');
  });

  it('una API_CORE_URL mal escrita se registra con su motivo; no se traga en silencio', async () => {
    const registros: string[] = [];
    const leer = crearLectorDeCiudad({
      urlBase: () => {
        throw new Error('API_CORE_URL no es una URL absoluta');
      },
      pedir: vi.fn<typeof fetch>(),
      registrar: (mensaje) => registros.push(mensaje),
    });
    expect(await leer()).toEqual(CONFIG_DOMINIO.CIUDAD_POR_DEFECTO);
    expect(registros).toHaveLength(1);
    expect(registros[0]).toContain('API_CORE_URL no es una URL absoluta');
  });

  it('una consulta colgada se corta al vencer el plazo', async () => {
    const { leer, pedir, registros } = preparar();
    pedir.mockImplementation(
      (_url, init) =>
        new Promise((_resolver, rechazar) => {
          init?.signal?.addEventListener('abort', () => rechazar(init.signal?.reason));
        }),
    );

    expect(await leer()).toEqual(CONFIG_DOMINIO.CIUDAD_POR_DEFECTO);
    expect(registros).toHaveLength(1);
  });
});
