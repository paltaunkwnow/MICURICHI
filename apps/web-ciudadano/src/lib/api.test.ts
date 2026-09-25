import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  crearCuenta,
  crearReporte,
  iniciarSesion,
  obtenerReporte,
  obtenerReportes,
  obtenerYo,
  subirFoto,
} from './api';

function fingirRespuesta(cuerpo: unknown = {}) {
  const llamadas: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    llamadas.push({ url, init });
    return Promise.resolve({ ok: true, json: () => Promise.resolve(cuerpo) } as Response);
  });
  return llamadas;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cliente de la API pública', () => {
  /**
   * LAS LECTURAS PÚBLICAS NO LLEVAN COOKIES. Nunca.
   *
   * No es un detalle de implementación: es la diferencia entre publicar la coordenada desplazada
   * y publicar la exacta. Antes, `GET /api/v1/reportes` devolvía la vista TÉCNICA —ubicación sin
   * degradar y reportes todavía en revisión— si la petición traía sesión de técnico, y como las
   * cookies no distinguen puertos, el panel y el mapa público en el mismo host compartían la
   * suya: comprobado en local, el mapa público le mostraba al técnico 44 reportes sin desplazar
   * en vez de los 32 publicados (hallazgo A-01).
   *
   * Hoy el servidor ya no puede hacer eso: la vista técnica vive en `/api/v1/tecnico/*` y el
   * manejador público no mira la sesión. Pero el `omit` se mantiene, y ahora que la app SÍ tiene
   * cuentas importa más que antes: significa que la respuesta del mapa no depende de quién la
   * pida y no puede acabar en una caché con la clave equivocada, por mucho que alguien toque el
   * servidor en el futuro.
   */
  it('las lecturas del mapa no mandan cookies', async () => {
    const llamadas = fingirRespuesta({ features: [] });
    await obtenerReportes({ limite: '10' });
    await obtenerReporte('abc');
    expect(llamadas).toHaveLength(2);
    for (const l of llamadas) expect(l.init.credentials, `${l.url}`).toBe('omit');
  });

  /**
   * Las que SÍ necesitan saber quién está detrás piden la cookie, y solo esas. Desde la Fase 5
   * crear un reporte y subir una foto exigen cuenta: sin credenciales, api-core responde 401 y
   * el vecino no podría enviar nada.
   *
   * `same-origin` y no `include`: el origen es el mismo porque Next reenvía `/api/*` al
   * servicio, así que no hace falta relajarlo, y no relajarlo evita que la cookie viaje a ningún
   * sitio de terceros si alguna de estas funciones se llamara con una URL absoluta por error.
   */
  it('reportar, subir foto y las de cuenta sí mandan la cookie de sesión', async () => {
    const llamadas = fingirRespuesta({});
    await crearReporte({ descripcion: 'x' } as never, 'clave');
    await subirFoto(new File([new Uint8Array([1])], 'f.jpg', { type: 'image/jpeg' }));
    await obtenerYo();
    await iniciarSesion({ email: 'a@b.test', password: 'x'.repeat(10) });
    await crearCuenta({ email: 'a@b.test', nombre: 'A', password: 'x'.repeat(10) });
    expect(llamadas).toHaveLength(5);
    for (const l of llamadas) expect(l.init.credentials, `${l.url}`).toBe('same-origin');
  });

  /** Ningún token en almacenamiento del navegador ni en la URL: la sesión es una cookie HttpOnly. */
  it('no guarda nada de la sesión en localStorage ni en la URL', async () => {
    const llamadas = fingirRespuesta({});
    await iniciarSesion({ email: 'a@b.test', password: 'x'.repeat(10) });
    await obtenerYo();
    for (const l of llamadas) {
      expect(l.url).not.toMatch(/token|password|sesion=/i);
      expect(String(l.init.headers ?? '')).not.toMatch(/authorization/i);
    }
    expect(Object.keys(globalThis.localStorage ?? {}).join(',')).not.toMatch(/token|sesion/i);
  });

  it('pone content-type JSON solo cuando el cuerpo es JSON', async () => {
    // Con FormData lo tiene que poner el navegador: el `boundary` lo genera él y escribirlo a
    // mano rompe la subida.
    const llamadas = fingirRespuesta();
    await crearReporte({ descripcion: 'x' } as never);
    await subirFoto(new File([new Uint8Array([1])], 'f.jpg', { type: 'image/jpeg' }));
    const cabeceras = llamadas.map((l) => l.init.headers as Record<string, string>);
    expect(cabeceras[0]?.['content-type']).toBe('application/json');
    expect(cabeceras[1]?.['content-type']).toBeUndefined();
  });

  it('manda la clave de idempotencia solo si se le da una', async () => {
    const llamadas = fingirRespuesta();
    await crearReporte({ descripcion: 'x' } as never, 'clave-1');
    await crearReporte({ descripcion: 'x' } as never);
    const cabeceras = llamadas.map((l) => l.init.headers as Record<string, string>);
    expect(cabeceras[0]?.['idempotency-key']).toBe('clave-1');
    expect(cabeceras[1]?.['idempotency-key']).toBeUndefined();
  });
});
