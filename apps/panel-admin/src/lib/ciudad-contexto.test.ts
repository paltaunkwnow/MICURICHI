import { type Ciudad, CONFIG_DOMINIO } from 'contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProveedorCiudad, useCiudad, useFormato } from './ciudad-contexto';

const MEDELLIN: Ciudad = {
  nombre: 'Medellín',
  pais: 'CO',
  zona_horaria: 'America/Bogota',
  locale: 'es-CO',
  centro: { lon: -75.5636, lat: 6.2518 },
  zoom_inicial: 12,
};

/** Muestra lo que un componente del panel lee de la ciudad. */
function Sonda() {
  const ciudad = useCiudad();
  const f = useFormato();
  return createElement(
    'p',
    null,
    `${ciudad.nombre}|${f.fechaHora('2026-03-02T03:30:00Z')}|${f.numero(61_234)}`,
  );
}

describe('ciudad del despliegue en el panel', () => {
  it('los componentes leen la ciudad y formatean con su zona horaria y su locale', () => {
    const html = renderToStaticMarkup(
      createElement(ProveedorCiudad, { ciudad: MEDELLIN }, createElement(Sonda)),
    );
    // 03:30 UTC = 22:30 del día anterior en Bogotá; es-CO separa miles con punto.
    expect(html).toMatch(/Medellín\|01 de mar\.? de 2026, 22:30\|61\.234/);
  });

  it('con la ciudad por defecto queda como estaba (Santa Cruz, America/La_Paz, es-BO)', () => {
    const html = renderToStaticMarkup(
      createElement(
        ProveedorCiudad,
        { ciudad: CONFIG_DOMINIO.CIUDAD_POR_DEFECTO },
        createElement(Sonda),
      ),
    );
    expect(html).toMatch(/Santa Cruz de la Sierra\|01 mar\.? 2026, 23:30\|61\.234/);
  });

  it('sin proveedor falla en el acto en vez de usar una ciudad inventada', () => {
    expect(() => renderToStaticMarkup(createElement(Sonda))).toThrow(/ProveedorCiudad/);
  });
});
