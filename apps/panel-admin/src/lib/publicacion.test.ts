import { ESTADOS_REPORTE } from 'contracts';
import { describe, expect, it } from 'vitest';
import { AVISO_BANDEJA_PUBLICOS, visibilidadPublica } from './publicacion';

describe('cómo se ve un reporte en el mapa público (sin moderación previa, contracts 0.11.0)', () => {
  it('un nuevo ya es público, con la etiqueta exacta', () => {
    expect(visibilidadPublica('nuevo')).toEqual({
      publico: true,
      texto: 'Visible en el mapa público como NO SE HA VERIFICADO',
    });
  });

  it('validado y resuelto se ven con su etiqueta pública', () => {
    expect(visibilidadPublica('validado')).toEqual({
      publico: true,
      texto: 'Visible en el mapa público como Verificado',
    });
    expect(visibilidadPublica('resuelto')).toEqual({
      publico: true,
      texto: 'Visible en el mapa público como Resuelto',
    });
  });

  it('rechazado y duplicado no se ven, y dice por qué', () => {
    expect(visibilidadPublica('rechazado')).toEqual({
      publico: false,
      texto: 'No se ve en el mapa público: está rechazado',
    });
    expect(visibilidadPublica('duplicado')).toEqual({
      publico: false,
      texto: 'No se ve en el mapa público: se sumó a otro reporte como duplicado',
    });
  });

  it('cubre todos los estados del contrato', () => {
    for (const e of ESTADOS_REPORTE) expect(visibilidadPublica(e).texto, e).not.toBe('');
  });

  it('la bandeja avisa que los nuevos ya son públicos y qué los retira', () => {
    expect(AVISO_BANDEJA_PUBLICOS).toContain('NO SE HA VERIFICADO');
    expect(AVISO_BANDEJA_PUBLICOS).toMatch(/nuevos ya se ven en el mapa público/);
    // «Los reportes nuevos… Validarlo»: el pronombre no tenía a qué singular referirse.
    expect(AVISO_BANDEJA_PUBLICOS).toContain(
      'Validar uno lo muestra como «Verificado»; rechazarlo o fusionarlo lo retira del mapa.',
    );
    // Ningún texto del panel promete una moderación previa que ya no existe.
    expect(AVISO_BANDEJA_PUBLICOS).not.toMatch(/antes de publicar/i);
  });
});
