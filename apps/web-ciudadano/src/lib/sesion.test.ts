import type { SesionActual } from 'contracts';
import { describe, expect, it } from 'vitest';
import { ErrorApi } from './api';
import { CLAVE_YO, interpretarSesion, refrescarSesion } from './sesion';

const PERSONA: SesionActual = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'vecina@ejemplo.test',
  nombre: 'Vecina',
  rol: 'ciudadano',
  puede_reportar_desde: null,
};

describe('estado de la sesión', () => {
  it('un 401 es «sin cuenta»: la respuesta normal, no un fallo', () => {
    const s = interpretarSesion({
      data: undefined,
      error: new ErrorApi('NO_AUTENTICADO', 'x', 401),
      isPending: false,
    });
    expect(s.usuario).toBeNull();
    expect(s.errorDeCarga).toBeNull();
    expect(s.cargando).toBe(false);
  });

  it('si /auth/yo no responde (plazo, API caída) NO se dice «necesitás una cuenta»', () => {
    const caida = new TypeError('Failed to fetch');
    const s = interpretarSesion({ data: undefined, error: caida, isPending: false });
    expect(s.usuario).toBeNull();
    // Es un error de carga que se muestra con su «Reintentar», no una sesión ausente.
    expect(s.errorDeCarga).toBe(caida);
    const plazo = new DOMException('tarde', 'TimeoutError');
    expect(
      interpretarSesion({ data: undefined, error: plazo, isPending: false }).errorDeCarga,
    ).toBe(plazo);
  });

  it('con la sesión ya conocida, un refresco fallido no la borra ni tapa la pantalla', () => {
    const s = interpretarSesion({
      data: PERSONA,
      error: new TypeError('Failed to fetch'),
      isPending: false,
    });
    expect(s.usuario).toEqual(PERSONA);
    expect(s.errorDeCarga).toBeNull();
  });

  it('mientras llega la primera respuesta, todavía no se sabe', () => {
    expect(interpretarSesion({ data: undefined, error: null, isPending: true }).cargando).toBe(
      true,
    );
  });

  it('mientras se hidrata dice lo mismo que el servidor, aunque /auth/yo ya haya contestado', () => {
    // Las páginas se generan al pedirlas (la ciudad llega en tiempo de ejecución), así que el
    // servidor pinta también lo que va dentro de un <Suspense>, y siempre sin sesión: la cookie es
    // HttpOnly y /auth/yo se pregunta desde el navegador. Si la respuesta llega antes de que ese
    // <Suspense> se hidrate, el formulario de /reportar se dibujaba entero donde el servidor había
    // puesto «Un momento…», y React descartaba el árbol con un error de hidratación.
    for (const consulta of [
      { data: PERSONA, error: null, isPending: false },
      { data: undefined, error: new TypeError('Failed to fetch'), isPending: false },
      { data: undefined, error: new ErrorApi('NO_AUTENTICADO', 'x', 401), isPending: false },
    ])
      expect(interpretarSesion({ ...consulta, hidratado: false })).toEqual({
        usuario: null,
        cargando: true,
        errorDeCarga: null,
      });
    expect(
      interpretarSesion({ data: PERSONA, error: null, isPending: false, hidratado: true }).usuario,
    ).toEqual(PERSONA);
  });

  it('después de enviar (o de un 429 de cuota) se vuelve a preguntar por el turno de la cuenta', async () => {
    const pedidas: unknown[] = [];
    await refrescarSesion({
      invalidateQueries: async (filtros) => {
        pedidas.push(filtros.queryKey);
      },
    });
    expect(pedidas).toEqual([CLAVE_YO]);
  });
});
