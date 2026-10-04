import { describe, expect, it } from 'vitest';
import {
  debeMostrarEnlaceCapas,
  destinoDesdeLogin,
  enlaceInicio,
  enlacesPara,
  hayVersionCapaPendiente,
  puedeEntrarAlPanel,
  puedeVerRuta,
  rutaInicial,
} from './roles';

const CON_PLANO = { planoDeReferencia: true, capasPendientes: false };

describe('rol y navegación del panel', () => {
  it('tras el login el ejecutivo va a /ejecutivo y los demás a /reportes', () => {
    expect(rutaInicial('ejecutivo')).toBe('/ejecutivo');
    expect(rutaInicial('tecnico')).toBe('/reportes');
    expect(rutaInicial('admin')).toBe('/reportes');
  });

  it('ejecutivo, técnico y administrador entran al panel; el ciudadano no', () => {
    expect(puedeEntrarAlPanel('ejecutivo')).toBe(true);
    expect(puedeEntrarAlPanel('tecnico')).toBe(true);
    expect(puedeEntrarAlPanel('admin')).toBe(true);
    expect(puedeEntrarAlPanel('ciudadano')).toBe(false);
  });

  it('el ejecutivo no ve moderación, exportación, indicadores ni administración', () => {
    for (const ruta of ['/reportes', '/reportes/abc', '/indicadores', '/capas', '/plano']) {
      expect(puedeVerRuta('ejecutivo', ruta)).toBe(false);
    }
    expect(puedeVerRuta('ejecutivo', '/ejecutivo')).toBe(true);
    expect(puedeVerRuta('tecnico', '/ejecutivo')).toBe(true);
    expect(puedeVerRuta('admin', '/capas')).toBe(true);
  });

  it('«Ejecutivo» aparece en la navegación de los tres roles; el ejecutivo solo ve ese enlace', () => {
    expect(enlacesPara('ejecutivo', CON_PLANO).map((e) => e.texto)).toEqual(['Ejecutivo']);
    for (const rol of ['tecnico', 'admin'] as const) {
      const textos = enlacesPara(rol, CON_PLANO).map((e) => e.texto);
      expect(textos).toContain('Ejecutivo');
      expect(textos).toContain('Reportes');
    }
  });

  it('«Plano oficial» solo aparece en la instalación que tiene plano de referencia', () => {
    expect(
      enlacesPara('tecnico', { planoDeReferencia: true, capasPendientes: false }).map(
        (e) => e.href,
      ),
    ).toContain('/plano');
    const sinPlano = enlacesPara('admin', {
      planoDeReferencia: false,
      capasPendientes: true,
    }).map((e) => e.href);
    expect(sinPlano).not.toContain('/plano');
    expect(sinPlano).toEqual(['/ejecutivo', '/reportes', '/indicadores', '/capas']);
  });

  it('«Capas» es solo del admin y solo con una versión sin activar', () => {
    // El admin lo ve únicamente cuando hay algo que activar; sin versiones pendientes, no.
    expect(
      enlacesPara('admin', { planoDeReferencia: true, capasPendientes: true }).map((e) => e.href),
    ).toContain('/capas');
    expect(
      enlacesPara('admin', { planoDeReferencia: true, capasPendientes: false }).map((e) => e.href),
    ).not.toContain('/capas');
    // Técnico y ejecutivo no lo ven nunca, aunque hubiera versiones pendientes.
    for (const rol of ['tecnico', 'ejecutivo'] as const) {
      expect(
        enlacesPara(rol, { planoDeReferencia: true, capasPendientes: true }).map((e) => e.href),
      ).not.toContain('/capas');
    }
  });

  it('debeMostrarEnlaceCapas: admin con versión pendiente', () => {
    expect(debeMostrarEnlaceCapas('admin', true)).toBe(true);
    expect(debeMostrarEnlaceCapas('admin', false)).toBe(false);
    expect(debeMostrarEnlaceCapas('tecnico', true)).toBe(false);
    expect(debeMostrarEnlaceCapas('ejecutivo', true)).toBe(false);
  });

  it('hayVersionCapaPendiente: alguna versión cargada sin activar', () => {
    expect(hayVersionCapaPendiente([])).toBe(false);
    expect(hayVersionCapaPendiente([{ vigente: true }])).toBe(false);
    expect(hayVersionCapaPendiente([{ vigente: true }, { vigente: false }])).toBe(true);
  });

  it('/login solo saca de ahí a quien puede entrar al panel; una cuenta ciudadana se queda', () => {
    // Antes una cuenta ciudadana con sesión rebotaba de /login a /reportes, donde solo veía «no
    // tiene acceso» y no podía ni cerrar sesión ni entrar con otra cuenta.
    expect(destinoDesdeLogin('ciudadano')).toBeNull();
    expect(destinoDesdeLogin(undefined)).toBeNull();
    expect(destinoDesdeLogin('ejecutivo')).toBe('/ejecutivo');
    expect(destinoDesdeLogin('tecnico')).toBe('/reportes');
    expect(destinoDesdeLogin('admin')).toBe('/reportes');
  });

  it('el «volver al inicio» de las páginas de error lleva a la pantalla de cada rol', () => {
    // Antes iba siempre a /reportes: el ejecutivo rebotaba a /ejecutivo con el aviso de acceso.
    expect(enlaceInicio('ejecutivo')).toEqual({
      href: '/ejecutivo',
      texto: 'Ir al panel ejecutivo',
    });
    expect(enlaceInicio('tecnico')).toEqual({ href: '/reportes', texto: 'Ir a la bandeja' });
    expect(enlaceInicio('admin')).toEqual({ href: '/reportes', texto: 'Ir a la bandeja' });
    // Sin sesión conocida decide la raíz, que manda a cada rol a su pantalla o al login.
    expect(enlaceInicio(undefined)).toEqual({ href: '/', texto: 'Ir al inicio' });
    expect(enlaceInicio('ciudadano')).toEqual({ href: '/', texto: 'Ir al inicio' });
  });
});
