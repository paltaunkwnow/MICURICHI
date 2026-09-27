import { describe, expect, it } from 'vitest';
import { MiniaturasLocales } from './foto';

/**
 * Las miniaturas del paso 3 son `blob:` de la memoria del teléfono. Una revocada ya no se puede
 * mostrar: el `<img>` queda roto. «Empezar de nuevo» las suelta todas, también la de una foto que
 * se estaba subiendo, así que cuando esa subida termina hay que preguntar si su miniatura sigue
 * viva antes de usarla (revisión de T1, hallazgo del formulario).
 */
function miniaturas() {
  const revocadas: string[] = [];
  const m = new MiniaturasLocales((url) => revocadas.push(url));
  return { m, revocadas };
}

describe('MiniaturasLocales', () => {
  it('una miniatura guardada sigue viva hasta que se suelta, y se revoca una sola vez', () => {
    const { m, revocadas } = miniaturas();
    m.guardar('blob:a');
    expect(m.sigueViva('blob:a')).toBe(true);
    m.soltar('blob:a');
    m.soltar('blob:a');
    expect(m.sigueViva('blob:a')).toBe(false);
    expect(revocadas).toEqual(['blob:a']);
  });

  it('soltar una que nunca se guardó no revoca nada', () => {
    const { m, revocadas } = miniaturas();
    m.soltar('blob:ajena');
    expect(revocadas).toEqual([]);
  });

  it('«Empezar de nuevo» con una foto subiendo: al terminar la subida, su miniatura ya no está viva', () => {
    const { m, revocadas } = miniaturas();
    m.guardar('blob:subida-lista');
    m.guardar('blob:subiendo');
    m.soltarTodas();
    expect(revocadas.sort()).toEqual(['blob:subida-lista', 'blob:subiendo']);
    // La subida responde después del reinicio: su miniatura está revocada y no se usa.
    expect(m.sigueViva('blob:subiendo')).toBe(false);
    // Lo que se saque después es de este formulario.
    m.guardar('blob:nueva');
    expect(m.sigueViva('blob:nueva')).toBe(true);
    m.soltarTodas();
    expect(revocadas.filter((u) => u === 'blob:subiendo')).toHaveLength(1);
  });
});
