/**
 * «Ya podés entrar» después del alta (plan 2026-10-04-arreglos-chicos, M-6.2 y M-6.3).
 *
 * El enlace a «Iniciar sesión» llevaba el correo en la URL (`?email=`), que queda en el historial,
 * en los registros del servidor y en el `Referer`. Ahora el correo viaja por `sessionStorage`
 * (`lib/correo-para-entrar.ts`) y la URL solo lleva a dónde volver.
 *
 * Vitest corre acá sin DOM: el marcado de la pantalla con `renderToStaticMarkup`, y el código
 * fuente para lo que corre al montar (los efectos) y para lo que tiene que valer en cualquier
 * pantalla, como en `camara-pagina.test.ts`.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { archivosDeLaApp, cuerposDeEfectos, leerFuente } from '@/lib/fuente-para-pruebas';
import { AltaHecha } from './FormularioAcceso';

function pantalla(volver = '/reportar') {
  return renderToStaticMarkup(createElement(AltaHecha, { volver }));
}

describe('«Ya podés entrar»: el enlace a «Iniciar sesión» no lleva el correo', () => {
  it('apunta a /ingresar con la ruta de vuelta y sin email', () => {
    const enlace = pantalla('/reportar').match(/<a\b[^>]*>/)?.[0] ?? '';
    expect(enlace).toContain('href="/ingresar?volver=%2Freportar"');
    expect(enlace).not.toMatch(/email/i);
  });

  it('la ruta de vuelta se codifica y sigue siendo lo único que viaja', () => {
    const enlace = pantalla('/cuenta?x=1').match(/<a\b[^>]*>/)?.[0] ?? '';
    expect(enlace).toContain('href="/ingresar?volver=%2Fcuenta%3Fx%3D1"');
    expect(enlace).not.toMatch(/email/i);
  });

  it('en toda la pantalla no aparece ningún correo', () => {
    expect(pantalla()).not.toContain('@');
  });

  it('mantiene lo que usa la E2E: un título «Ya podés entrar» y un enlace «Iniciar sesión»', () => {
    // `e2e/tests/ayudas.ts` (crearCuentaYEntrarPorUi): espera el título y hace clic en el enlace
    // con ese nombre dentro de `#contenido`.
    const html = pantalla();
    expect(html).toMatch(/<h1\b[^>]*>Ya podés entrar<\/h1>/);
    expect(html).toMatch(/<a\b[^>]*>Iniciar sesión<\/a>/);
  });

  it('dice lo mismo exista o no el correo: nada de «ya tenías cuenta» ni «cuenta creada»', () => {
    const html = pantalla();
    expect(html).toContain('Si ese correo no tenía cuenta, acaba de crearse.');
    expect(html).not.toMatch(/ya ten[ií]as cuenta|ya existe|cuenta creada|ya estás registrad/i);
    // Y se arma solo con la ruta de vuelta: no hay de dónde sacar nada que distinga los casos.
    expect(pantalla('/reportar')).toBe(pantalla('/reportar'));
  });
});

describe('el correo se guarda y se lee en el cliente, no en la URL', () => {
  const fuente = leerFuente('componentes/FormularioAcceso.tsx');
  /** La mutación del alta, de su declaración hasta la siguiente constante. */
  const bloqueAlta = fuente.slice(
    fuente.indexOf('const registrar = useMutation('),
    fuente.indexOf('const enviando'),
  );

  it('ningún archivo de la app lee `email` de la query ni arma un enlace con `email=`', () => {
    const leen = archivosDeLaApp()
      .filter(({ texto }) => /\.get\(\s*['"`]email['"`]\s*\)/.test(texto))
      .map(({ ruta }) => ruta);
    expect(leen).toEqual([]);
    const enUrl = archivosDeLaApp()
      .filter(({ texto }) => /[?&]email=/.test(texto))
      .map(({ ruta }) => ruta);
    expect(enUrl).toEqual([]);
  });

  it('al terminar el alta se guarda el correo, en la mutación del alta', () => {
    expect(bloqueAlta).not.toBe('');
    expect(fuente.match(/guardarCorreoParaEntrar\(/g)).toHaveLength(1);
    expect(bloqueAlta).toContain('guardarCorreoParaEntrar(');
  });

  it('el alta no inicia sesión sola: con un correo ya registrado eso revelaría que existe', () => {
    expect(bloqueAlta).not.toMatch(/iniciarSesion|entrar\.mutate|router\.(push|replace)/);
  });

  it('se lee una vez, ya montado (en un efecto) y solo en el formulario de entrada', () => {
    // Leerlo al renderizar desajustaría la hidratación: el servidor no tiene sessionStorage.
    expect(fuente.match(/tomarCorreoParaEntrar\(/g)).toHaveLength(1);
    const efectos = cuerposDeEfectos(fuente).filter((e) => e.includes('tomarCorreoParaEntrar('));
    expect(efectos).toHaveLength(1);
    expect(efectos[0]).toMatch(/if\s*\(\s*alta\s*\)\s*return/);
    expect(efectos[0]).toContain("form.setValue('email'");
  });
});
