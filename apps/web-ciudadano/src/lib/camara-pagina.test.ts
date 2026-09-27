/**
 * La foto del reporte sale solo de la cámara, dentro de la página (plan 2026-09-26, pedido D), y
 * la cámara se pide solo al tocar «Sacar foto» (pedido F).
 *
 * Vitest corre acá sin DOM, así que el componente se prueba de dos maneras: su marcado, con
 * `renderToStaticMarkup` en cada estado, y el código fuente, para lo que tiene que valer en
 * CUALQUIER pantalla (ningún input de archivo, nadie más pide la cámara) y para lo que corre al
 * montar (los efectos, que `renderToStaticMarkup` no ejecuta).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CamaraReporte, VistaCamara } from '@/componentes/CamaraReporte';
import { type EstadoCamara, MENSAJES_CAMARA } from './camara';
import { archivosDeLaApp, cuerposDeEfectos, leerFuente } from './fuente-para-pruebas';

const nada = () => {};

function vista(estado: EstadoCamara, deshabilitada = false, conImagen = true) {
  return renderToStaticMarkup(
    createElement(VistaCamara, {
      estado,
      deshabilitada,
      conImagen,
      alSacarFoto: nada,
      alDisparar: nada,
      alRepetir: nada,
      alUsar: nada,
      alCerrar: nada,
    }),
  );
}

const FLUJO = {} as MediaStream;

describe('sin galería: ningún input de archivo en la app', () => {
  it('ningún archivo de src/ declara un input[type=file] ni el atributo capture', () => {
    const conArchivo = archivosDeLaApp()
      .filter(({ texto }) =>
        /type\s*=\s*\{?\s*["'`]file["'`]|type:\s*["'`]file["'`]|\bcapture\s*=/.test(texto),
      )
      .map(({ ruta }) => ruta);
    expect(conArchivo).toEqual([]);
  });

  it('el componente de la cámara no tiene input de archivo en ningún estado', () => {
    const estados: EstadoCamara[] = [
      { fase: 'inactiva' },
      { fase: 'abriendo' },
      { fase: 'en-vivo', flujo: FLUJO },
      { fase: 'capturando', flujo: FLUJO },
      { fase: 'capturada', flujo: FLUJO, foto: new Blob(), vista: 'blob:x' },
      { fase: 'error', problema: 'sin-soporte' },
    ];
    for (const e of estados) {
      const html = vista(e);
      expect(html, e.fase).not.toMatch(/<input/i);
    }
  });
});

describe('la cámara se pide solo al tocar «Sacar foto»', () => {
  it('getUserMedia aparece en un único archivo: src/lib/camara.ts', () => {
    const usan = archivosDeLaApp()
      .filter(({ texto }) => texto.includes('getUserMedia'))
      .map(({ ruta }) => ruta);
    expect(usan).toEqual(['lib/camara.ts']);
  });

  it('solo CamaraReporte abre la cámara, y lo hace desde el botón', () => {
    const abren = archivosDeLaApp()
      .filter(({ texto }) => /\.abrir\(/.test(texto))
      .map(({ ruta }) => ruta);
    expect(abren).toEqual(['componentes/CamaraReporte.tsx']);
    const fuente = leerFuente('componentes/CamaraReporte.tsx');
    // La única llamada está en el manejador del botón, no en un efecto.
    expect(fuente.match(/\.abrir\(/g)).toHaveLength(1);
    expect(fuente).toMatch(/alSacarFoto=\{\(\)\s*=>\s*void\s+controlador\.abrir\(\)\}/);
  });

  /*
   * Montar de verdad exige un DOM (happy-dom o jsdom), que este paquete no tiene. Lo que corre al
   * montar son los efectos, así que se lee cada efecto del componente de la cámara y del
   * formulario: ninguno puede abrir la cámara. `renderToStaticMarkup` no servía para esto porque
   * nunca ejecuta los efectos.
   */
  it('ningún efecto de la cámara ni del formulario abre la cámara al montar', () => {
    for (const archivo of ['componentes/CamaraReporte.tsx', 'componentes/FormularioReporte.tsx']) {
      const efectos = cuerposDeEfectos(leerFuente(archivo));
      expect(efectos.length, `${archivo} tiene efectos`).toBeGreaterThan(0);
      expect(
        efectos.filter((e) => PIDE_CAMARA.test(e)),
        archivo,
      ).toEqual([]);
    }
  });

  it('el detector encuentra un efecto que pediría la cámara (para que la prueba anterior no pase sola)', () => {
    const fuente = `
      useEffect(() => { window.addEventListener('pagehide', apagar); }, []);
      // un comentario con un paréntesis suelto (
      useLayoutEffect(() => {
        const texto = ') no cierra';
        void controlador.abrir();
      }, [controlador]);
      useEffect(() => navigator.mediaDevices.getUserMedia({ video: true }), []);
    `;
    const efectos = cuerposDeEfectos(fuente);
    expect(efectos).toHaveLength(3);
    expect(efectos.map((e) => PIDE_CAMARA.test(e))).toEqual([false, true, true]);
  });

  it('el render inicial muestra «Sacar foto» usable y el diálogo de la cámara cerrado', () => {
    const html = renderToStaticMarkup(
      createElement(CamaraReporte, { deshabilitada: false, alUsarFoto: nada }),
    );
    expect(html).not.toMatch(/data-testid="boton-sacar-foto"[^>]*disabled/);
    expect(html).toMatch(/<dialog\b/);
    expect(html).not.toMatch(/<dialog[^>]*\sopen/i);
  });
});

/** Lo que dentro de un efecto pediría la cámara. */
const PIDE_CAMARA = /\.abrir\(|getUserMedia|mediaDevices/;

describe('marcado del diálogo de la cámara', () => {
  it('en reposo solo está el botón «Sacar foto», usable', () => {
    const html = vista({ fase: 'inactiva' });
    expect(html).toMatch(/<button[^>]*data-testid="boton-sacar-foto"[^>]*>/);
    expect(html).not.toMatch(/data-testid="boton-sacar-foto"[^>]*disabled/);
  });

  it('con las fotos completas o una subiendo, el botón se deshabilita', () => {
    expect(vista({ fase: 'inactiva' }, true)).toMatch(
      /data-testid="boton-sacar-foto"[^>]*disabled/,
    );
  });

  it('mientras espera el permiso, el botón lo dice y no se puede volver a tocar', () => {
    const html = vista({ fase: 'abriendo' });
    expect(html).toContain('Abriendo la cámara');
    expect(html).toMatch(/data-testid="boton-sacar-foto"[^>]*disabled/);
  });

  it('es un diálogo con título, video en línea y mudo, y un disparo grande con nombre', () => {
    const html = vista({ fase: 'en-vivo', flujo: FLUJO });
    expect(html).toMatch(/<dialog[^>]*aria-labelledby="titulo-camara"/);
    expect(html).toContain('id="titulo-camara"');
    const video = html.match(/<video[^>]*>/i)?.[0] ?? '';
    expect(video).toMatch(/playsinline/i);
    expect(video).toMatch(/muted/i);
    expect(video).toMatch(/autoplay/i);
    const disparo = html.match(/<button[^>]*aria-label="Sacar la foto"[^>]*>/)?.[0] ?? '';
    expect(disparo).not.toBe('');
    // El disparo es un <button>: Enter y Espacio lo accionan sin código extra.
    const lado = Number(disparo.match(/h-\[(\d+)px\]/)?.[1] ?? 0);
    expect(lado).toBeGreaterThanOrEqual(48);
    expect(html).toContain('aria-label="Cerrar la cámara"');
  });

  it('el disparo espera a que llegue la imagen: un toque apurado no saca una foto negra', () => {
    const disparo = (html: string) =>
      html.match(/<button[^>]*aria-label="Sacar la foto"[^>]*>/)?.[0] ?? '';
    const sinImagen = vista({ fase: 'en-vivo', flujo: FLUJO }, false, false);
    expect(disparo(sinImagen)).toMatch(/disabled/);
    expect(sinImagen).toContain('Encendiendo la cámara');
    expect(disparo(vista({ fase: 'en-vivo', flujo: FLUJO }, false, true))).not.toMatch(/disabled/);
  });

  it('con la foto sacada ofrece «Repetir» y «Usar esta foto», con la miniatura local', () => {
    const html = vista({
      fase: 'capturada',
      flujo: FLUJO,
      foto: new Blob(),
      vista: 'blob:mi-foto',
    });
    expect(html).toContain('Repetir');
    expect(html).toContain('Usar esta foto');
    expect(html).toMatch(/<img[^>]*src="blob:mi-foto"/);
    expect(html).not.toContain('aria-label="Sacar la foto"');
  });

  it.each([
    'sin-soporte',
    'inseguro',
    'denegada',
    'sin-camara',
    'ocupada',
    'cortada',
    'desconocido',
  ] as const)(
    'el problema «%s» se anuncia con su texto y el botón sigue disponible',
    (problema) => {
      const html = vista({ fase: 'error', problema });
      expect(html).toMatch(/role="alert"/);
      expect(html).toContain(MENSAJES_CAMARA[problema]);
      expect(html).not.toMatch(/data-testid="boton-sacar-foto"[^>]*disabled/);
    },
  );
});
