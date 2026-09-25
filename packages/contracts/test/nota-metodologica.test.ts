import { describe, expect, it } from 'vitest';
import { NOTA_METODOLOGICA } from '../src/dominio/config.js';

describe('nota metodológica', () => {
  it('P-3: la nota metodológica ya no dice que la duración es recordada', () => {
    expect(NOTA_METODOLOGICA.toLowerCase()).not.toContain('duración');
    expect(NOTA_METODOLOGICA.toLowerCase()).not.toContain('duracion');
    expect(NOTA_METODOLOGICA.toLowerCase()).toContain('percepción');
  });
});
