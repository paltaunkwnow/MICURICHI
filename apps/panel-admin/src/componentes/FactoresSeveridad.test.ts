import type { ReporteTecnico } from 'contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FactoresSeveridad } from './FactoresSeveridad';

/**
 * El panel no tiene tests de componentes con DOM; el desglose se renderiza a HTML estático
 * (sin navegador) y se leen sus textos. Así el criterio queda en la capa unitaria sin tocar el
 * componente para extraer su lógica.
 */

/** Solo los campos que lee `FactoresSeveridad`; el resto del reporte no interviene. */
function reporteConFactores(): ReporteTecnico {
  const parcial = {
    tirante_estimado: 'muslo',
    frecuencia: 'permanente',
    severidad_calculada: 'alta',
    severidad_puntaje: 10,
    severidad_manual: null,
  };
  // El componente recibe el tipo completo; se construye parcial a propósito para que el test no
  // dependa de los demás campos del contrato (que son justamente los que cambian).
  return parcial as unknown as ReporteTecnico;
}

/** Texto visible: sin etiquetas ni los comentarios `<!-- -->` que React pone entre textos. */
function texto(html: string) {
  return html
    .replace(/<!--.*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function filas(html: string) {
  return [...html.matchAll(/<dt[^>]*>(.*?)<\/dt>/g)].map((m) => texto(m[1] ?? ''));
}

describe('FactoresSeveridad (severidad v2)', () => {
  const html = renderToStaticMarkup(
    createElement(FactoresSeveridad, { reporte: reporteConFactores() }),
  );

  it('CA-P2: con T = muslo y F = permanente hay exactamente dos filas, Tirante ×2 y Frecuencia', () => {
    const nombres = filas(html);
    expect(nombres).toHaveLength(2);
    expect(nombres[0]).toMatch(/^Tirante\s*×2$/);
    expect(nombres[1]).toBe('Frecuencia');
    // Puntos de cada variable sobre 4: muslo = 3, permanente = 4.
    const valores = [...html.matchAll(/(\d+)(?:<!--.*?-->)?\/(?:<!--.*?-->)?4/g)].map((m) => m[1]);
    expect(valores).toEqual(['3', '4']);
  });

  it('CA-P2: el título dice «Cómo se llegó a 10 de 12 puntos»', () => {
    expect(texto(html)).toContain('Cómo se llegó a 10 de 12 puntos');
  });

  it('CA-P2: la fórmula es «puntaje = 2 × tirante + frecuencia» y no nombra duración ni afectación', () => {
    const t = texto(html);
    expect(t).toContain('puntaje = 2 × tirante + frecuencia');
    expect(t.toLowerCase()).not.toContain('duración');
    expect(t.toLowerCase()).not.toContain('afectación');
  });
});
