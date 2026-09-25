import { describe, expect, it } from 'vitest';
import * as formato from './formato';

describe('formato sin duración ni afectación', () => {
  it('CA-P3: formato.ts no exporta etiquetaAfectacion ni etiquetaDuracion y conserva tirante y frecuencia', () => {
    const exportados = Object.keys(formato);
    expect(exportados).not.toContain('etiquetaAfectacion');
    expect(exportados).not.toContain('etiquetaDuracion');
    // Tirante y frecuencia siguen en el reporte: sus etiquetas no se van con las otras.
    expect(exportados).toEqual(expect.arrayContaining(['etiquetaTirante', 'etiquetaFrecuencia']));
  });
});
