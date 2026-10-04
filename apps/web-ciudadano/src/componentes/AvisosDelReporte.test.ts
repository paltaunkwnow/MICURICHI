/**
 * Avisos del formulario de reporte que tienen que verse y anunciarse donde la persona está mirando
 * (plan 2026-10-04-arreglos-chicos, M-6.1).
 *
 * Vitest corre acá sin DOM: el marcado de cada pieza con `renderToStaticMarkup`, y el código fuente
 * del formulario para lo que tiene que valer en cualquier pantalla (que nadie vuelva a dibujar a
 * mano un aviso sin `role="alert"`), como en `camara-pagina.test.ts`.
 */
import { type ComponentProps, createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { leerFuente } from '@/lib/fuente-para-pruebas';
import { ErrorDeFoto, PieDeRevision } from './AvisosDelReporte';

function pie(props: Partial<ComponentProps<typeof PieDeRevision>> = {}, ...hijos: ReactNode[]) {
  return renderToStaticMarkup(
    createElement(
      PieDeRevision,
      {
        errorEnvio: null,
        textoBoton: 'Enviar reporte',
        deshabilitado: false,
        ...props,
      },
      ...hijos,
    ),
  );
}

/** La etiqueta de apertura que lleva ese `data-testid`, o '' si no está. */
function etiquetaCon(html: string, testid: string): string {
  return html.match(new RegExp(`<[a-z0-9]+[^>]*data-testid="${testid}"[^>]*>`))?.[0] ?? '';
}

describe('pie del paso de revisión: el aviso del envío va junto al botón', () => {
  it('«error-envio» está dentro de `.pie`, encima del botón de enviar y con role="alert"', () => {
    const html = pie({ errorEnvio: 'No pudimos enviar el reporte.' });
    // La raíz ES el pie fijo: lo que se dibuje acá no queda en el área con scroll.
    expect(html.startsWith('<div class="pie">')).toBe(true);
    const aviso = etiquetaCon(html, 'error-envio');
    expect(aviso).not.toBe('');
    expect(aviso).toMatch(/role="alert"/);
    expect(html.indexOf('data-testid="error-envio"')).toBeLessThan(
      html.indexOf('data-testid="boton-enviar"'),
    );
    expect(html).toContain('No pudimos enviar el reporte.');
  });

  it('conserva data-campo-con-error: tras un rechazo la vista sigue yendo hasta el mensaje', () => {
    expect(etiquetaCon(pie({ errorEnvio: 'Algo falló.' }), 'error-envio')).toMatch(
      /data-campo-con-error=""/,
    );
  });

  it('sin error de envío no dibuja el aviso, y el botón sigue ahí', () => {
    const html = pie();
    expect(html).not.toContain('error-envio');
    expect(etiquetaCon(html, 'boton-enviar')).toMatch(/type="submit"/);
  });

  it('el botón dice lo que pasa y se deshabilita cuando corresponde', () => {
    const libre = pie({ textoBoton: 'Enviar reporte' });
    expect(etiquetaCon(libre, 'boton-enviar')).not.toMatch(/disabled/);
    expect(libre).toContain('Enviar reporte');
    const ocupado = pie({ textoBoton: 'Enviando…', deshabilitado: true });
    expect(etiquetaCon(ocupado, 'boton-enviar')).toMatch(/disabled/);
    expect(ocupado).toContain('Enviando…');
  });

  it('las notas del formulario van después del botón, dentro del mismo pie', () => {
    const html = pie(
      { errorEnvio: 'Falló.' },
      createElement('p', { 'data-testid': 'nota-de-prueba' }, 'Se publica 4 minutos después'),
    );
    expect(html.startsWith('<div class="pie">')).toBe(true);
    expect(html.endsWith('</p></div>')).toBe(true);
    expect(html.indexOf('data-testid="boton-enviar"')).toBeLessThan(
      html.indexOf('data-testid="nota-de-prueba"'),
    );
    expect(html.indexOf('data-testid="error-envio"')).toBeLessThan(
      html.indexOf('data-testid="boton-enviar"'),
    );
  });
});

describe('error de foto: se anuncia y queda junto a su acción', () => {
  it('«error-foto» lleva role="alert" y el mensaje', () => {
    const html = renderToStaticMarkup(
      createElement(ErrorDeFoto, { mensaje: 'La foto pesa demasiado.', className: 'mt-3' }),
    );
    expect(etiquetaCon(html, 'error-foto')).toMatch(/role="alert"/);
    expect(html).toContain('La foto pesa demasiado.');
    expect(html).not.toContain('Foto sin subir');
  });

  it('en la revisión lleva además su título «Foto sin subir»', () => {
    const html = renderToStaticMarkup(
      createElement(ErrorDeFoto, {
        mensaje: 'No pudimos subir la foto.',
        titulo: 'Foto sin subir',
        className: 'mt-3.5',
      }),
    );
    expect(etiquetaCon(html, 'error-foto')).toMatch(/role="alert"/);
    expect(html).toContain('Foto sin subir');
    expect(html).toContain('No pudimos subir la foto.');
  });
});

describe('el formulario usa estas piezas y no vuelve a dibujar los avisos a mano', () => {
  const fuente = leerFuente('componentes/FormularioReporte.tsx');

  it('el paso 4 arma su pie con PieDeRevision (una vez)', () => {
    expect(fuente.match(/<PieDeRevision\b/g)).toHaveLength(1);
  });

  it('el aviso de la demora y la nota de la ubicación siguen en ese pie, después del botón', () => {
    const pieDelPaso4 = fuente.slice(
      fuente.indexOf('<PieDeRevision'),
      fuente.indexOf('</PieDeRevision>'),
    );
    expect(pieDelPaso4).not.toBe('');
    expect(pieDelPaso4).toContain('data-testid="aviso-demora"');
    expect(pieDelPaso4).toContain('textoDemora(demoraProximoS)');
    expect(pieDelPaso4).toContain('volvemos a leer tu ubicación');
  });

  it('el pie del paso 4 es hermano del área con scroll: no queda dentro de ella', () => {
    // Todo lo que se abre entre el comienzo del paso 4 y el pie se cierra antes del pie.
    const antes = fuente.slice(fuente.indexOf('{paso === 4 ? ('), fuente.indexOf('<PieDeRevision'));
    expect(antes).toContain('overflow-y-auto');
    expect(antes.match(/<div\b/g)?.length).toBe(antes.match(/<\/div>/g)?.length);
  });

  it('las dos pantallas con foto (3 y 4) usan ErrorDeFoto', () => {
    expect(fuente.match(/<ErrorDeFoto\b/g)).toHaveLength(2);
  });

  it('paso 3: el error de foto va debajo de «Sacar foto» y antes de la descripción', () => {
    const camara = fuente.indexOf('<CamaraReporte');
    const error = fuente.indexOf('<ErrorDeFoto');
    const descripcion = fuente.indexOf('htmlFor="descripcion"');
    expect(camara).toBeGreaterThan(-1);
    expect(error).toBeGreaterThan(camara);
    expect(descripcion).toBeGreaterThan(error);
  });

  it('revisión: el error de foto va justo después de la fila «Fotos», antes del tipo de lugar', () => {
    const fila = fuente.indexOf('etiqueta="Fotos"');
    const error = fuente.lastIndexOf('<ErrorDeFoto');
    const tipoDeLugar = fuente.indexOf('¿Qué hay en ese punto?');
    expect(fila).toBeGreaterThan(-1);
    expect(error).toBeGreaterThan(fila);
    expect(tipoDeLugar).toBeGreaterThan(error);
  });

  it('«error-envio» y «error-foto» solo se declaran en las piezas, que ya traen role="alert"', () => {
    expect(fuente).not.toContain('data-testid="error-envio"');
    expect(fuente).not.toContain('data-testid="error-foto"');
  });
});
