import { QueryClient } from '@tanstack/react-query';
import type { SesionActual } from 'contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi } from './api';
import { guardarBorrador, leerBorrador } from './borrador';
import { claveMisReportes, olvidarDatosDeLaCuenta } from './misReportes';
import {
  CLAVE_YO,
  cupoDeLaSesion,
  interpretarSesion,
  limpiarTrasCerrarSesion,
  refrescarSesion,
} from './sesion';

const PERSONA: SesionActual = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'vecina@ejemplo.test',
  nombre: 'Vecina',
  rol: 'ciudadano',
  puede_reportar_desde: null,
  reportes_restantes_hoy: 3,
  demora_proximo_s: 60,
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

  it('expone cuántos reportes le quedan hoy y cuánto tardaría en publicarse el próximo', () => {
    expect(
      cupoDeLaSesion({ ...PERSONA, reportes_restantes_hoy: 1, demora_proximo_s: 240 }),
    ).toEqual({ reportesRestantesHoy: 1, demoraProximoS: 240, puedeReportarDesde: null });
    const manana = '2026-09-28T00:00:00-04:00';
    expect(
      cupoDeLaSesion({ ...PERSONA, reportes_restantes_hoy: 0, puede_reportar_desde: manana }),
    ).toEqual({
      reportesRestantesHoy: 0,
      demoraProximoS: null,
      puedeReportarDesde: new Date(manana),
    });
    expect(cupoDeLaSesion(null)).toEqual({
      reportesRestantesHoy: null,
      demoraProximoS: null,
      puedeReportarDesde: null,
    });
  });
});

describe('cerrar sesión en una pestaña compartida', () => {
  afterEach(() => vi.unstubAllGlobals());

  function instalarAlmacen() {
    const datos = new Map<string, string>();
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (k: string) => datos.get(k) ?? null,
        setItem: (k: string, v: string) => void datos.set(k, v),
        removeItem: (k: string) => void datos.delete(k),
      },
    });
  }

  function guardarUnBorrador() {
    guardarBorrador({
      paso: 3,
      ubicacion: { lat: -17.78, lon: -63.18 },
      resuelto: { dentro_cobertura: true },
      fotos: [],
      valores: { descripcion: 'Se junta el agua en la esquina' },
      clave: '11111111-1111-4111-8111-111111111111',
    });
  }

  it('el cierre explícito olvida el borrador: quien entre después no hereda lo que había a medias', () => {
    instalarAlmacen();
    guardarUnBorrador();
    expect(leerBorrador()).not.toBeNull();
    const cliente = new QueryClient();
    cliente.setQueryData(CLAVE_YO, PERSONA);
    cliente.setQueryData(claveMisReportes(PERSONA.id), { type: 'FeatureCollection', features: [] });

    limpiarTrasCerrarSesion(cliente);

    expect(leerBorrador()).toBeNull();
    expect(cliente.getQueryData(CLAVE_YO)).toBeUndefined();
    expect(cliente.getQueryData(claveMisReportes(PERSONA.id))).toBeUndefined();
  });

  it('la sesión que vence sola no toca el borrador: al volver a entrar se sigue donde estaba', () => {
    instalarAlmacen();
    guardarUnBorrador();
    olvidarDatosDeLaCuenta(new QueryClient());
    expect(leerBorrador()).not.toBeNull();
  });
});
