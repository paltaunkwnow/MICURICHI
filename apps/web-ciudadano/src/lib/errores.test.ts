import { CODIGOS_UBICACION_DISPOSITIVO, CONFIG_DOMINIO } from 'contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi } from './api';
import {
  esCancelado,
  esCuotaAgotada,
  esPlazoAgotado,
  esSesionCaducada,
  esUbicacionRechazada,
  mensajeDeCuota,
  mensajeDeEnvio,
  mensajeDeError,
  mensajeDeFoto,
} from './errores';
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

  it('cada 422 de la posición del teléfono tiene su propio texto', () => {
    const texto = (codigo: string) => mensajeDeError(new ErrorApi(codigo, 'crudo', 422));
    expect(texto('PRECISION_INSUFICIENTE')).toContain(
      `${CONFIG_DOMINIO.PRECISION_DISPOSITIVO_MAX_M} m`,
    );
    expect(texto('PRECISION_INSUFICIENTE')).toMatch(/lugar abierto/);
    expect(texto('POSICION_VENCIDA')).toMatch(/10 minutos/);
    expect(texto('UBICACION_FUERA_DE_RADIO')).toContain(
      `${CONFIG_DOMINIO.REPORTE_RADIO_DISPOSITIVO_M} m`,
    );
    for (const codigo of CODIGOS_UBICACION_DISPOSITIVO) {
      expect(texto(codigo)).not.toBe('crudo');
      expect(esUbicacionRechazada(new ErrorApi(codigo, 'x', 422))).toBe(true);
    }
    expect(esUbicacionRechazada(new ErrorApi('FUERA_DE_COBERTURA', 'x', 422))).toBe(false);
    expect(esUbicacionRechazada(new TypeError('x'))).toBe(false);
  });

  it('el 422 de ubicación precisa disponible explica que hay que usar el camino normal (ADR 0007)', () => {
    const texto = mensajeDeError(new ErrorApi('UBICACION_PRECISA_DISPONIBLE', 'crudo', 422));
    expect(texto).not.toBe('crudo');
    expect(texto).toContain(`${CONFIG_DOMINIO.PRECISION_DISPOSITIVO_MAX_M} m`);
    // Es uno de los 422 de la posición: lleva al paso 1 a compartir la ubicación de nuevo.
    expect(esUbicacionRechazada(new ErrorApi('UBICACION_PRECISA_DISPONIBLE', 'x', 422))).toBe(true);
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

describe('respuestas que cambian el flujo del formulario', () => {
  it('un 401 (del envío o de la subida de una foto) es una sesión que se cerró', () => {
    expect(esSesionCaducada(new ErrorApi('NO_AUTENTICADO', 'x', 401))).toBe(true);
    expect(esSesionCaducada(new ErrorApi('PROHIBIDO', 'x', 403))).toBe(false);
    expect(esSesionCaducada(new TypeError('Failed to fetch'))).toBe(false);
  });

  it('el 429 de cuota de fotos muestra el mensaje del servidor junto a la foto', () => {
    const delServidor = 'Llegaste al máximo de 12 fotos por día. Vas a poder subir otra mañana.';
    const e = new ErrorApi('CUOTA_DE_FOTOS', delServidor, 429, {
      disponible_en: '2026-09-26T15:40:00.000Z',
    });
    expect(mensajeDeFoto(e)).toBe(delServidor);
    expect(mensajeDeFoto(e)).not.toMatch(/inesperado/i);
  });

  it('sin mensaje en el cuerpo, la cuota de fotos igual se explica (no «Error 429»)', () => {
    // `pedir` escribe «Error 429» cuando el cuerpo no trae `mensaje`.
    const m = mensajeDeFoto(new ErrorApi('CUOTA_DE_FOTOS', 'Error 429', 429));
    expect(m).toContain(`${CONFIG_DOMINIO.FOTOS_POR_DIA_POR_CUENTA} fotos por día`);
    expect(m).toContain('12 fotos por día');
    expect(m).not.toMatch(/por hora/);
    expect(m).not.toContain('Error 429');
  });

  it('cualquier otro fallo de la foto se explica como los demás', () => {
    const red = new TypeError('Failed to fetch');
    expect(mensajeDeFoto(red)).toBe(mensajeDeError(red));
    const pesada = new ErrorApi('ARCHIVO_DEMASIADO_GRANDE', 'La foto supera los 8 MB.', 413);
    expect(mensajeDeFoto(pesada)).toBe(mensajeDeError(pesada));
  });

  it('el 429 del cupo diario de reportes usa el texto del servidor o explica el cupo', () => {
    const delServidor = 'Ya enviaste los 3 reportes de hoy. Vas a poder enviar otro mañana.';
    expect(mensajeDeCuota(new ErrorApi('CUOTA_DE_REPORTES', delServidor, 429))).toBe(delServidor);
    const sinCuerpo = mensajeDeCuota(new ErrorApi('CUOTA_DE_REPORTES', 'Error 429', 429));
    expect(sinCuerpo).toBe('Ya enviaste los 3 reportes de hoy. Vas a poder enviar otro mañana.');
    expect(sinCuerpo).not.toMatch(/minutos/);
  });

  it('solo el 429 de cuota de la cuenta es «ya usaste el cupo de hoy»', () => {
    expect(esCuotaAgotada(new ErrorApi('CUOTA_DE_REPORTES', 'x', 429))).toBe(true);
    // El 429 por IP es otra cosa: no cambia el turno de la cuenta.
    expect(esCuotaAgotada(new ErrorApi('DEMASIADAS_SOLICITUDES', 'x', 429))).toBe(false);
    expect(esCuotaAgotada(new ErrorApi('CUOTA_DE_REPORTES', 'x', 400))).toBe(false);
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
    expect(motivoDeRechazoDeFoto(archivo(1000, 'application/pdf'))).toMatch(
      /formato que no admitimos/,
    );
  });

  it('rechaza una foto vacía', () => {
    expect(motivoDeRechazoDeFoto(archivo(0, 'image/jpeg'))).toMatch(/vacía/);
  });

  it('deja pasar el tipo vacío: lo decide el servidor mirando los bytes', () => {
    expect(motivoDeRechazoDeFoto(archivo(1000, ''))).toBeNull();
  });
});
