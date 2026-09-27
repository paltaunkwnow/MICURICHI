/**
 * La demora de publicación (plan 2026-09-26, pedido C): el reporte llega al servidor al tocar
 * «Enviar» y se ve 1 minuto después (el 1.º del día) o 4 (el 2.º y el 3.º). Antes de enviar se
 * avisa cuánto va a tardar, y la confirmación cuenta hacia atrás con los segundos que calculó el
 * servidor, no con el reloj del teléfono.
 */
import { CONFIG_DOMINIO, type SesionActual } from 'contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CuentaRegresiva, TextoTrasEnviar } from '@/componentes/CuentaRegresiva';
import { leerFuente } from './fuente-para-pruebas';
import {
  demoraDelProximo,
  formatoCuenta,
  segundosQueFaltan,
  TEXTO_YA_PUBLICADO,
  textoCuentaRegresiva,
  textoDemora,
} from './publicacion';

/** La de un api-core anterior a contracts 0.10.0, sin los campos del cupo: la app la sigue tolerando. */
const SESION_ANTERIOR = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'vecina@ejemplo.test',
  nombre: 'Vecina',
  rol: 'ciudadano',
  puede_reportar_desde: null,
} as SesionActual;

const PERSONA: SesionActual = {
  ...SESION_ANTERIOR,
  reportes_restantes_hoy: CONFIG_DOMINIO.REPORTES_POR_DIA_POR_CUENTA,
  demora_proximo_s: CONFIG_DOMINIO.DEMORA_PUBLICACION_PRIMERO_S,
};

describe('el aviso antes de enviar', () => {
  it('dice 1 minuto para el primero del día y 4 para los siguientes', () => {
    expect(textoDemora(60)).toBe('Se publica 1 minuto después de enviarlo');
    expect(textoDemora(240)).toBe('Se publica 4 minutos después de enviarlo');
  });

  it('lee demora_proximo_s de /auth/yo', () => {
    expect(demoraDelProximo({ ...PERSONA, demora_proximo_s: 240 })).toBe(240);
    expect(textoDemora(demoraDelProximo({ ...PERSONA, demora_proximo_s: 240 }))).toBe(
      'Se publica 4 minutos después de enviarlo',
    );
    expect(demoraDelProximo({ ...PERSONA, demora_proximo_s: 60 })).toBe(60);
  });

  it('sin demora_proximo_s la deduce del cupo, y si tampoco hay cupo no inventa minutos', () => {
    expect(demoraDelProximo({ ...SESION_ANTERIOR, reportes_restantes_hoy: 3 })).toBe(
      CONFIG_DOMINIO.DEMORA_PUBLICACION_PRIMERO_S,
    );
    expect(demoraDelProximo({ ...SESION_ANTERIOR, reportes_restantes_hoy: 1 })).toBe(
      CONFIG_DOMINIO.DEMORA_PUBLICACION_SIGUIENTES_S,
    );
    expect(demoraDelProximo(SESION_ANTERIOR)).toBeNull();
    expect(textoDemora(null)).toBe('Se publica unos minutos después de enviarlo');
  });

  it('con demora 0 (pruebas) no promete una espera', () => {
    expect(textoDemora(0)).toBe('Se publica apenas lo envíes');
  });

  it('el formulario lo muestra en la revisión, con la demora de la sesión', () => {
    const fuente = leerFuente('componentes/FormularioReporte.tsx');
    expect(fuente).toMatch(/textoDemora\(demoraProximoS\)/);
    expect(fuente).toMatch(/data-testid="aviso-demora"/);
  });
});

describe('la cuenta regresiva de la confirmación', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('formatea minutos y segundos', () => {
    expect(formatoCuenta(240)).toBe('4:00');
    expect(formatoCuenta(59)).toBe('0:59');
    expect(formatoCuenta(61)).toBe('1:01');
    expect(textoCuentaRegresiva(240)).toBe('Se publica en 4:00');
    expect(textoCuentaRegresiva(0)).toBe(TEXTO_YA_PUBLICADO);
    expect(TEXTO_YA_PUBLICADO).toBe('Ya está publicado · recargá el mapa para verlo');
  });

  it('con el reloj del teléfono 10 min adelantado, 240 s del servidor son 4:00', () => {
    // El servidor dice «faltan 240 s». Si la cuenta saliera de publicar_en contra el reloj del
    // teléfono, con 10 min de adelanto ya diría «publicado» al recibirlo.
    const servidor = new Date('2026-09-27T14:00:00Z').getTime();
    vi.setSystemTime(servidor + 10 * 60_000);
    const recibido = Date.now();
    expect(segundosQueFaltan(240, recibido, Date.now())).toBe(240);
    expect(textoCuentaRegresiva(segundosQueFaltan(240, recibido, Date.now()))).toBe(
      'Se publica en 4:00',
    );
    vi.advanceTimersByTime(1_000);
    expect(segundosQueFaltan(240, recibido, Date.now())).toBe(239);
    vi.advanceTimersByTime(239_000);
    expect(segundosQueFaltan(240, recibido, Date.now())).toBe(0);
    expect(textoCuentaRegresiva(segundosQueFaltan(240, recibido, Date.now()))).toBe(
      'Ya está publicado · recargá el mapa para verlo',
    );
    vi.advanceTimersByTime(60_000);
    expect(segundosQueFaltan(240, recibido, Date.now())).toBe(0);
  });

  it('el componente dibuja lo mismo', () => {
    vi.setSystemTime(new Date('2026-09-27T14:10:00Z'));
    const recibidoEn = Date.now();
    const antes = renderToStaticMarkup(
      createElement(CuentaRegresiva, { segundos: 240, recibidoEn }),
    );
    expect(antes).toContain('Se publica en 4:00');
    expect(antes).toMatch(/role="timer"|aria-live/);
    vi.advanceTimersByTime(240_000);
    const despues = renderToStaticMarkup(
      createElement(CuentaRegresiva, { segundos: 240, recibidoEn }),
    );
    expect(despues).toContain('Ya está publicado · recargá el mapa para verlo');
  });

  it('la confirmación parte de segundos_para_publicar de la respuesta del servidor', () => {
    const fuente = leerFuente('componentes/FormularioReporte.tsx');
    expect(fuente).toMatch(/segundos_para_publicar/);
    expect(fuente).toMatch(/<CuentaRegresiva/);
  });
});

describe('lo que dice la confirmación debajo de la cuenta', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const dibujar = (segundos: number | null, recibidoEn: number) =>
    renderToStaticMarkup(createElement(TextoTrasEnviar, { segundos, recibidoEn }));

  it('con 0 segundos no dice «Hasta entonces no aparece»: ya está publicado', () => {
    vi.setSystemTime(new Date('2026-09-27T14:10:00Z'));
    const texto = dibujar(0, Date.now());
    expect(texto).not.toContain('Hasta entonces');
    expect(texto).toContain('Se ve con la marca');
    expect(texto).toContain('NO SE HA VERIFICADO');
  });

  it('mientras falta algo lo dice, y al terminar la cuenta deja de decirlo', () => {
    vi.setSystemTime(new Date('2026-09-27T14:10:00Z'));
    const recibidoEn = Date.now();
    expect(dibujar(240, recibidoEn)).toContain('Hasta entonces no aparece en el mapa');
    vi.advanceTimersByTime(240_000);
    const despues = dibujar(240, recibidoEn);
    expect(despues).not.toContain('Hasta entonces');
    expect(despues).toContain('Se ve con la marca');
  });

  it('sin los segundos del servidor avisa la espera sin inventar minutos', () => {
    const texto = dibujar(null, Date.now());
    expect(texto).toContain('Se publica en el mapa en unos minutos.');
    expect(texto).toContain('Hasta entonces no aparece en el mapa');
  });

  it('la confirmación usa ese texto y no escribe la frase por su cuenta', () => {
    const fuente = leerFuente('componentes/FormularioReporte.tsx');
    expect(fuente).toMatch(/<TextoTrasEnviar\b/);
    expect(fuente).not.toContain('Hasta entonces');
  });
});
