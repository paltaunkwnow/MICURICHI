import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi } from './api';
import { esCancelado, esPlazoAgotado, mensajeDeEnvio, mensajeDeError } from './errores';
import { motivoDeRechazoDeFoto } from './foto';

/** Lo que lanza `AbortSignal.timeout` cuando vence: no es un Error corriente. */
const plazoAgotado = () => new DOMException('signal timed out', 'TimeoutError');
const cancelado = () => new DOMException('aborted', 'AbortError');

describe('mensajes de error para el vecino', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('traduce el plazo agotado en vez de dar el mensaje genérico', () => {
    expect(esPlazoAgotado(plazoAgotado())).toBe(true);
    expect(mensajeDeError(plazoAgotado())).toMatch(/tardó demasiado/i);
    expect(mensajeDeError(plazoAgotado())).not.toMatch(/inesperado/i);
  });

  it('distingue una cancelación deliberada de un fallo', () => {
    expect(esCancelado(cancelado())).toBe(true);
    expect(esPlazoAgotado(cancelado())).toBe(false);
  });

  it('dice «sin conexión» cuando el navegador lo declara', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(mensajeDeError(new TypeError('Failed to fetch'))).toMatch(/sin conexión/i);
    vi.stubGlobal('navigator', { onLine: true });
    expect(mensajeDeError(new TypeError('Failed to fetch'))).toMatch(/conectar con el servidor/i);
  });

  it('separa saturación (503) de fallo del servidor (500)', () => {
    expect(mensajeDeError(new ErrorApi('NO_DISPONIBLE', 'x', 503))).toMatch(/saturado/i);
    expect(mensajeDeError(new ErrorApi('ERROR_INTERNO', 'x', 500))).toMatch(/problema/i);
  });

  it('el punto fuera del municipio se explica, no se recita', () => {
    expect(mensajeDeError(new ErrorApi('FUERA_DE_COBERTURA', 'x', 422))).toMatch(/fuera del muni/i);
  });

  it('nunca deja escapar el texto crudo de la plataforma', () => {
    expect(mensajeDeError(new TypeError('Failed to fetch'))).not.toContain('Failed to fetch');
    expect(mensajeDeError(plazoAgotado())).not.toContain('signal timed out');
  });
});

describe('mensaje del envío del reporte', () => {
  it('cuando no se sabe si llegó, dice que reintentar es seguro', () => {
    for (const e of [plazoAgotado(), new TypeError('x'), new ErrorApi('X', 'y', 503)]) {
      expect(mensajeDeEnvio(e)).toMatch(/no se va a duplicar/i);
    }
  });

  it('cuando el servidor dijo que no, no promete nada: no hay nada que reintentar igual', () => {
    const e = new ErrorApi('PAYLOAD_INVALIDO', 'x', 400);
    expect(mensajeDeEnvio(e)).not.toMatch(/duplicar/i);
    expect(mensajeDeEnvio(e)).toBe(mensajeDeError(e));
  });
});

/** `File` no existe en el entorno `node` de Vitest, pero solo se miran `size` y `type`. */
const archivo = (size: number, type: string) => ({ size, type }) as File;

describe('comprobación de la foto antes de subirla', () => {
  it('acepta una foto normal', () => {
    expect(motivoDeRechazoDeFoto(archivo(2_000_000, 'image/jpeg'))).toBeNull();
  });

  it('rechaza por tamaño diciendo cuánto pesa y cuánto cabe', () => {
    const m = motivoDeRechazoDeFoto(archivo(9 * 1024 * 1024, 'image/jpeg'));
    expect(m).toMatch(/9,0 MB/);
    expect(m).toMatch(/máximo es 8 MB/);
  });

  it('rechaza lo que no es imagen', () => {
    expect(motivoDeRechazoDeFoto(archivo(1000, 'application/pdf'))).toMatch(/JPEG, PNG o WebP/);
  });

  it('rechaza un archivo vacío', () => {
    expect(motivoDeRechazoDeFoto(archivo(0, 'image/jpeg'))).toMatch(/vacío/);
  });

  it('deja pasar el tipo vacío: lo decide el servidor mirando los bytes', () => {
    expect(motivoDeRechazoDeFoto(archivo(1000, ''))).toBeNull();
  });
});
