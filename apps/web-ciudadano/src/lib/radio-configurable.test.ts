/**
 * El radio del dispositivo es una constante del contrato: otra instalación lo ajusta sin tocar
 * código (plan 2026-09-26). Con otro radio, ningún texto visible puede seguir diciendo 60 m.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CONFIG_DOMINIO } from 'contracts';
import { type ComponentProps, createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ComoFunciona } from '@/componentes/ComoFunciona';
import { VistaPedirUbicacion } from '@/componentes/PedirUbicacion';
import { Portada } from '@/componentes/Portada';
import { ProveedorCiudad } from './ciudad-contexto';

const OTRO_RADIO_M = 75;

vi.mock('contracts', async (importOriginal) => {
  const real = await importOriginal<typeof import('contracts')>();
  return {
    ...real,
    CONFIG_DOMINIO: { ...real.CONFIG_DOMINIO, REPORTE_RADIO_DISPOSITIVO_M: 75 },
  };
});

// Fuera de Next no hay ruta: la barra inferior la necesita para marcar la sección.
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

function conProveedores(hijo: ReactNode) {
  return createElement(
    QueryClientProvider,
    { client: new QueryClient() },
    createElement(
      ProveedorCiudad,
      { ciudad: CONFIG_DOMINIO.CIUDAD_POR_DEFECTO } as ComponentProps<typeof ProveedorCiudad>,
      hijo,
    ),
  );
}

/** Texto visible, sin etiquetas ni los espacios de más que deja el marcado. */
function texto(html: string) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

describe(`con un radio de ${OTRO_RADIO_M} m`, () => {
  it('la simulación cambió el radio del contrato', () => {
    expect(CONFIG_DOMINIO.REPORTE_RADIO_DISPOSITIVO_M).toBe(OTRO_RADIO_M);
  });

  const pantallas: Array<[string, () => string]> = [
    ['la portada', () => renderToStaticMarkup(conProveedores(createElement(Portada)))],
    [
      'el paso 1 antes de compartir la ubicación',
      () =>
        renderToStaticMarkup(
          createElement(VistaPedirUbicacion, {
            estado: { fase: 'inactiva' },
            alCompartir: () => {},
          }),
        ),
    ],
    ['«Cómo funciona»', () => renderToStaticMarkup(createElement(ComoFunciona))],
  ];

  for (const [nombre, dibujar] of pantallas)
    it(`${nombre} dice el radio configurado y no 60 m`, () => {
      const visible = texto(dibujar());
      expect(visible).toMatch(new RegExp(`\\b${OTRO_RADIO_M} (m|metros)\\b`));
      expect(visible).not.toMatch(/\b60 (m|metros)\b/);
    });
});
