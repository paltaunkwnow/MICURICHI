/**
 * Permisos solo al reportar (plan 2026-09-26, pedido F) y paso 1 anclado a la posición del
 * teléfono (pedido E).
 *
 * Como en `camara-pagina.test.ts`, sin DOM: el marcado de cada estado con `renderToStaticMarkup`,
 * y el código fuente para lo que corre al montar (los efectos) y para lo que tiene que valer en
 * cualquier pantalla (nadie más lee la ubicación).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CONFIG_DOMINIO, ETIQUETAS } from 'contracts';
import { type ComponentProps, createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AvisoUbicacionAlReportar } from '@/componentes/AvisoUbicacionAlReportar';
import { ComoFunciona } from '@/componentes/ComoFunciona';
import { VistaPedirUbicacion } from '@/componentes/PedirUbicacion';
import { Portada } from '@/componentes/Portada';
import { VistaMapa } from '@/componentes/VistaMapa';
import { ProveedorCiudad } from './ciudad-contexto';
import { archivosDeLaApp, cuerposDeEfectos, leerFuente } from './fuente-para-pruebas';
import type { EstadoUbicacionDispositivo } from './ubicacion-dispositivo';

// Fuera de Next no hay ruta: la barra inferior del mapa la necesita para marcar la sección.
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

const nada = () => {};

function vista(estado: EstadoUbicacionDispositivo) {
  return renderToStaticMarkup(createElement(VistaPedirUbicacion, { estado, alCompartir: nada }));
}

/** Lo que dentro de un efecto pediría o leería la ubicación. */
const PIDE_UBICACION =
  /geolocation|permissions|\.compartir\(|\.releer\(|ubicacionSiHayPermiso\(|entornoDelNavegador\(|centrarSiHayPermiso\(/;

describe('nada se pide ni se lee al cargar', () => {
  it('la geolocalización y la consulta del permiso viven en un único archivo', () => {
    const usan = archivosDeLaApp()
      .filter(({ texto }) =>
        /navigator\.geolocation|navigator\.permissions|\.watchPosition\(|\.getCurrentPosition\(|permissions\.query\(/.test(
          texto,
        ),
      )
      .map(({ ruta }) => ruta);
    expect(usan).toEqual(['lib/ubicacion-dispositivo.ts']);
  });

  it('ningún efecto de la app pide ni lee la ubicación', () => {
    const conEfectos = new Set<string>();
    const culpables: string[] = [];
    for (const { ruta, texto } of archivosDeLaApp()) {
      for (const efecto of cuerposDeEfectos(texto)) {
        conEfectos.add(ruta);
        if (PIDE_UBICACION.test(efecto)) culpables.push(ruta);
      }
    }
    expect(culpables).toEqual([]);
    // La prueba no pasa sola: las pantallas con ubicación tienen efectos que se revisaron.
    for (const ruta of ['componentes/FormularioReporte.tsx', 'componentes/VistaMapa.tsx'])
      expect(conEfectos.has(ruta), ruta).toBe(true);
  });

  it('el detector encuentra un efecto que la pediría', () => {
    const fuente = `
      useEffect(() => { window.addEventListener('pagehide', () => ubicador.detener()); }, []);
      useEffect(() => { if (p) ubicador.compartir(); }, [p]);
      useEffect(() => { navigator.permissions.query({ name: 'geolocation' }); }, []);
    `;
    expect(cuerposDeEfectos(fuente).map((e) => PIDE_UBICACION.test(e))).toEqual([
      false,
      true,
      true,
    ]);
  });

  it('el formulario pide la ubicación solo desde el botón', () => {
    const fuente = leerFuente('componentes/FormularioReporte.tsx');
    expect(fuente.match(/\.compartir\(/g)).toHaveLength(1);
    expect(fuente).toMatch(/alCompartir=\{\(\)\s*=>\s*ubicador\.compartir\(\)\}/);
  });

  it('el hook del mapa ya no consulta nada por su cuenta', () => {
    const fuente = leerFuente('lib/useUbicacionUsuario.ts');
    expect(fuente).not.toMatch(/automatica/);
    expect(cuerposDeEfectos(fuente)).toEqual([]);
  });

  describe('con el navegador espiado', () => {
    afterEach(() => vi.unstubAllGlobals());

    function espiar() {
      const geo = {
        getCurrentPosition: vi.fn(),
        watchPosition: vi.fn(),
        clearWatch: vi.fn(),
      };
      const query = vi.fn(async () => ({ state: 'granted' }));
      vi.stubGlobal('navigator', {
        geolocation: geo,
        permissions: { query },
        onLine: true,
        userAgent: 'vitest',
      });
      return { geo, query };
    }

    function conProveedores(hijo: ReactNode) {
      const cliente = new QueryClient();
      return createElement(
        QueryClientProvider,
        { client: cliente },
        createElement(
          ProveedorCiudad,
          // Los hijos van como tercer argumento; el tipo del proveedor los pide en las props.
          { ciudad: CONFIG_DOMINIO.CIUDAD_POR_DEFECTO } as ComponentProps<typeof ProveedorCiudad>,
          hijo,
        ),
      );
    }

    // Solo el render: `renderToStaticMarkup` no corre efectos, y sin DOM no hay cómo correrlos.
    // Lo que pasa al montar (los efectos) lo cubren el escaneo de `cuerposDeEfectos` de arriba y,
    // en un navegador de verdad, el E2E `ubicacion-obligatoria.spec.ts` con `vigilarSensores`.
    it('renderizar la portada y el mapa no llama a la geolocalización ni al permiso', () => {
      const { geo, query } = espiar();
      renderToStaticMarkup(conProveedores(createElement(Portada)));
      renderToStaticMarkup(conProveedores(createElement(VistaMapa)));
      expect(geo.getCurrentPosition).not.toHaveBeenCalled();
      expect(geo.watchPosition).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
    });
  });
});

describe('«Cómo funciona» dice qué se guarda de la ubicación', () => {
  it('la posición del teléfono no se guarda aparte, pero el punto marcado sí', () => {
    const html = renderToStaticMarkup(createElement(ComoFunciona));
    expect(html).not.toContain('del reporte solo queda');
    expect(html).toContain('La posición de tu teléfono no la guardamos aparte');
    expect(html).toContain('queda el punto que marcaste, que arranca donde estás');
    expect(html).toContain('Los técnicos ven ese punto exacto');
  });
});

describe('«Ir a mi ubicación» sin permiso', () => {
  it('dice que la ubicación se pide al reportar, junto a «Reportar un punto»', () => {
    const html = renderToStaticMarkup(createElement(AvisoUbicacionAlReportar, { alCerrar: nada }));
    expect(html).toContain('Tu ubicación se pide solo al reportar un punto');
    expect(html).toMatch(/<a[^>]*href="\/reportar"[^>]*>[^<]*Reportar un punto/);
    expect(html).toMatch(/data-testid="aviso-ubicacion-al-reportar"/);
  });
});

describe('paso 1: pedir la ubicación', () => {
  it('antes de tocar nada explica por qué y ofrece «Compartir mi ubicación»', () => {
    const html = vista({ fase: 'inactiva' });
    expect(html).toContain('Para reportar necesitamos tu ubicación');
    expect(html).toMatch(
      /<button[^>]*data-testid="boton-compartir-ubicacion"[^>]*>.*Compartir mi ubicación/,
    );
    expect(html).toContain('60 m');
  });

  it('dice qué se guarda: la posición del teléfono no, el punto del reporte sí', () => {
    const html = vista({ fase: 'inactiva' });
    // Si nadie lo mueve, el punto es donde está el teléfono: prometer que «no la ve nadie» es falso.
    expect(html).not.toContain('ni la ve nadie');
    expect(html).toContain('que no guardamos aparte');
    expect(html).toContain('el punto arranca donde estás y es lo que se guarda en el reporte');
    expect(html).toContain('Lo ven los técnicos');
    expect(html).toContain(`«${ETIQUETAS.ubicacion_tipo.vivienda_o_predio}»`);
    expect(html).toContain(`${CONFIG_DOMINIO.JITTER_PUBLICO_M} m`);
  });

  it('mientras busca, muestra la precisión actual y la que hace falta', () => {
    const html = vista({
      fase: 'buscando',
      ultima: { lat: 1, lon: 2, precisionM: 123.4, tomadaEn: 0 },
    });
    expect(html).toMatch(/role="status"/);
    expect(html).toContain('Precisión actual: 123 m');
    expect(html).toContain('50 m o menos');
    expect(vista({ fase: 'buscando', ultima: null })).toContain('Buscando tu ubicación');
  });

  it('si no llega a la precisión, «Salí a un lugar abierto» con «Reintentar»', () => {
    const html = vista({
      fase: 'imprecisa',
      ultima: { lat: 1, lon: 2, precisionM: 180, tomadaEn: 0 },
    });
    expect(html).toContain('Salí a un lugar abierto');
    expect(html).toContain('180 m');
    expect(html).toMatch(/data-testid="boton-reintentar-ubicacion"[^>]*>.*Reintentar/);
  });

  it('con el permiso negado aparece el bloqueo con instrucciones', () => {
    const html = vista({ fase: 'denegada' });
    expect(html).toMatch(
      /data-testid="ubicacion-bloqueada"[^>]*role="alert"|role="alert"[^>]*data-testid="ubicacion-bloqueada"/,
    );
    expect(html).toContain('No diste permiso para usar tu ubicación');
    expect(html).toContain('Permitir');
    expect(html).toContain('seguimos solos');
    expect(html).not.toContain('data-testid="boton-compartir-ubicacion"');
  });

  it('sin https o sin geolocalización lo dice con su texto', () => {
    expect(vista({ fase: 'error', problema: 'inseguro' })).toContain('https');
    expect(vista({ fase: 'error', problema: 'sin-soporte' })).toContain('Chrome o Safari');
  });

  it('con el ancla puesta no dibuja nada: el paso 1 muestra el mapa', () => {
    expect(
      vista({ fase: 'lista', ancla: { lat: 1, lon: 2, precisionM: 5, tomadaEn: 0 }, vez: 1 }),
    ).toBe('');
  });
});
