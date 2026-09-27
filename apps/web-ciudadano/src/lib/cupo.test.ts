/**
 * Cupo diario de reportes (plan 2026-09-26, S16): «Te quedan N de 3 reportes hoy», y con el cupo
 * agotado se avisa ANTES de pedir la ubicación o la cámara.
 *
 * Sin DOM: las reglas como funciones, el aviso con `renderToStaticMarkup` y el orden de las
 * puertas del formulario leyendo su código fuente.
 */
import { CONFIG_DOMINIO, type SesionActual } from 'contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CupoAgotado } from '@/componentes/CupoAgotado';
import {
  estadoDelCupo,
  REPORTES_POR_DIA,
  reportesRestantes,
  TEXTO_CUPO_AGOTADO,
  textoCupo,
} from './cupo';
import { archivosDeLaApp, cuerposDeEfectos, leerFuente } from './fuente-para-pruebas';

vi.mock('next/navigation', () => ({
  usePathname: () => '/reportar',
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

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

describe('cuántos reportes le quedan hoy a la cuenta', () => {
  it('el tope es el del contrato: 3 por día', () => {
    expect(REPORTES_POR_DIA).toBe(CONFIG_DOMINIO.REPORTES_POR_DIA_POR_CUENTA);
    expect(REPORTES_POR_DIA).toBe(3);
  });

  it('lo dice /auth/yo en reportes_restantes_hoy', () => {
    expect(reportesRestantes({ ...PERSONA, reportes_restantes_hoy: 2 })).toBe(2);
    expect(
      reportesRestantes({
        ...PERSONA,
        reportes_restantes_hoy: 0,
        puede_reportar_desde: '2026-09-28T00:00:00-04:00',
      }),
    ).toBe(0);
  });

  it('sin el campo (api-core anterior), un turno pendiente es «ninguno ahora» y si no, no se sabe', () => {
    expect(
      reportesRestantes({ ...SESION_ANTERIOR, puede_reportar_desde: '2026-09-28T00:00:00-04:00' }),
    ).toBe(0);
    expect(reportesRestantes(SESION_ANTERIOR)).toBeNull();
    expect(reportesRestantes(null)).toBeNull();
  });

  it('«Te quedan N de 3 reportes hoy»', () => {
    expect(textoCupo(1)).toBe('Te quedan 1 de 3 reportes hoy');
    expect(textoCupo(3)).toBe('Te quedan 3 de 3 reportes hoy');
    expect(textoCupo(0)).toBe('Te quedan 0 de 3 reportes hoy');
  });
});

describe('la puerta del cupo del formulario', () => {
  it('mientras se vuelve a preguntar a /auth/yo, todavía no se sabe', () => {
    expect(estadoDelCupo({ restantes: 2, revisado: false })).toBe('comprobando');
    expect(estadoDelCupo({ restantes: 0, revisado: false })).toBe('comprobando');
  });

  it('con 0 restantes el cupo está agotado; con alguno o sin dato, se puede seguir', () => {
    expect(estadoDelCupo({ restantes: 0, revisado: true })).toBe('agotado');
    expect(estadoDelCupo({ restantes: 1, revisado: true })).toBe('disponible');
    // Sin dato decide el servidor al enviar: no se bloquea a nadie por un campo que no llegó.
    expect(estadoDelCupo({ restantes: null, revisado: true })).toBe('disponible');
  });

  describe('el aviso de cupo agotado', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('lo dice sin ofrecer la ubicación ni la cámara, y sin tocar la geolocalización', () => {
      const geo = { getCurrentPosition: vi.fn(), watchPosition: vi.fn(), clearWatch: vi.fn() };
      const getUserMedia = vi.fn();
      vi.stubGlobal('navigator', {
        geolocation: geo,
        mediaDevices: { getUserMedia },
        permissions: { query: vi.fn() },
      });
      const html = renderToStaticMarkup(createElement(CupoAgotado));
      expect(html).toContain(TEXTO_CUPO_AGOTADO);
      expect(TEXTO_CUPO_AGOTADO).toBe(
        'Ya enviaste los 3 reportes de hoy. Vas a poder enviar otro mañana.',
      );
      expect(html).toContain('Te quedan 0 de 3 reportes hoy');
      expect(html).toMatch(/data-testid="cupo-agotado"/);
      expect(html).not.toContain('boton-compartir-ubicacion');
      expect(html).not.toMatch(/Sacar foto/);
      expect(html).toMatch(/href="\/mis-reportes"/);
      expect(geo.getCurrentPosition).not.toHaveBeenCalled();
      expect(geo.watchPosition).not.toHaveBeenCalled();
      expect(getUserMedia).not.toHaveBeenCalled();
    });
  });

  it('el formulario revalida /auth/yo al abrirse, en un efecto', () => {
    const efectos = cuerposDeEfectos(leerFuente('componentes/FormularioReporte.tsx'));
    expect(
      efectos.some((e) => /refrescarSesion\(cliente\)/.test(e) && /setCupoRevisado/.test(e)),
    ).toBe(true);
  });

  it('el aviso del cupo va antes que el paso de la ubicación y que la cámara', () => {
    const fuente = leerFuente('componentes/FormularioReporte.tsx');
    const puerta = fuente.indexOf("if (cupo === 'agotado') return <CupoAgotado");
    expect(puerta).toBeGreaterThan(0);
    expect(fuente.indexOf("if (cupo === 'comprobando')")).toBeGreaterThan(0);
    expect(fuente.indexOf("if (cupo === 'comprobando')")).toBeLessThan(
      fuente.indexOf('<VistaPedirUbicacion'),
    );
    expect(puerta).toBeLessThan(fuente.indexOf('<VistaPedirUbicacion'));
    expect(puerta).toBeLessThan(fuente.indexOf('<CamaraReporte'));
  });

  it('el formulario y la cuenta muestran «Te quedan N de 3 reportes hoy»', () => {
    for (const ruta of ['componentes/FormularioReporte.tsx', 'componentes/PanelCuenta.tsx'])
      expect(leerFuente(ruta), ruta).toMatch(/textoCupo\(/);
  });
});

describe('ya no hay espera de 60 minutos ni tope de fotos por hora', () => {
  it('nadie usa las constantes deprecadas de 0.10.0', () => {
    const culpables = archivosDeLaApp()
      .filter(({ texto }) =>
        /MINUTOS_ENTRE_REPORTES_POR_CUENTA|FOTOS_POR_HORA_POR_CUENTA/.test(texto),
      )
      .map(({ ruta }) => ruta);
    expect(culpables).toEqual([]);
  });

  it('ningún texto habla de «cada 60 minutos» ni de fotos «por hora»', () => {
    const culpables = archivosDeLaApp()
      .filter(({ texto }) => /cada 60 minutos|fotos por hora|un reporte cada/i.test(texto))
      .map(({ ruta }) => ruta);
    expect(culpables).toEqual([]);
  });
});
