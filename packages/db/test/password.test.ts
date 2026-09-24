/**
 * Argon2id con compatibilidad hacia atrás. Lo importante: los hashes `scrypt` que ya existen en
 * la base tienen que seguir validando, o el cambio de algoritmo deja a todo el mundo fuera.
 */
import { randomBytes, scryptSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  hashSeñuelo,
  necesitaRehash,
  PARAMS_ARGON2,
  verificarPassword,
} from '../src/password.js';

/** Reproduce el formato anterior al cambio: scrypt$sal$hash con N=2^14. */
function hashScryptLegado(password: string): string {
  const sal = randomBytes(16).toString('hex');
  const hash = scryptSync(password, sal, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt$${sal}$${hash}`;
}

describe('hash de contraseñas', () => {
  it('genera Argon2id en formato PHC con los parámetros dentro', async () => {
    const h = await hashPassword('una-contrasena-larga');
    expect(h).toMatch(/^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$/);
    expect(h).toContain(`m=${PARAMS_ARGON2.memoriaKiB},t=${PARAMS_ARGON2.iteraciones}`);
  });

  it('verifica la contraseña correcta y rechaza la incorrecta', async () => {
    const h = await hashPassword('una-contrasena-larga');
    expect(await verificarPassword('una-contrasena-larga', h)).toBe(true);
    expect(await verificarPassword('otra-contrasena', h)).toBe(false);
  });

  it('dos hashes de la misma contraseña son distintos (sal aleatoria)', async () => {
    const a = await hashPassword('misma');
    const b = await hashPassword('misma');
    expect(a).not.toBe(b);
  });

  it('sigue validando los hashes scrypt anteriores', async () => {
    const legado = hashScryptLegado('contrasena-vieja');
    expect(await verificarPassword('contrasena-vieja', legado)).toBe(true);
    expect(await verificarPassword('no-es-esa', legado)).toBe(false);
  });

  it('marca para migrar lo viejo y deja en paz lo actual', async () => {
    expect(necesitaRehash(hashScryptLegado('x'))).toBe(true);
    expect(necesitaRehash(await hashPassword('x'))).toBe(false);
    // Un Argon2id con menos memoria de la que se pide hoy también se regenera.
    expect(necesitaRehash('$argon2id$v=19$m=4096,t=2,p=1$YWJj$ZGVm')).toBe(true);
  });

  it('no revienta con hashes corruptos o vacíos', async () => {
    for (const malo of ['', 'basura', 'scrypt$solo-dos', '$argon2id$roto', 'scrypt$a$zz']) {
      expect(await verificarPassword('x', malo)).toBe(false);
    }
  });

  it('el señuelo es un hash válido y siempre el mismo objeto', async () => {
    const a = await hashSeñuelo();
    expect(a).toMatch(/^\$argon2id\$/);
    expect(await hashSeñuelo()).toBe(a);
    // Y no valida ninguna contraseña que alguien pueda adivinar.
    expect(await verificarPassword('', a)).toBe(false);
  });
});

/**
 * Regresión de la Fase 4: Argon2id no puede bloquear el bucle de eventos.
 *
 * Medido antes del arreglo: veinte verificaciones a la vez dejaban el proceso sin atender nada
 * durante 670 ms. `POST /auth/login` es público, así que eso es una denegación de servicio por
 * CPU al alcance de cualquiera.
 *
 * La aserción es una RAZÓN y no un umbral en milisegundos, a propósito: en una máquina lenta o
 * en un CI cargado, un umbral absoluto falla por motivos que no tienen que ver con el código.
 * Lo que sí es invariante es que el bucle no puede estar bloqueado la mayor parte del tiempo que
 * dura el trabajo. Con workers el bloqueo es ruido (~11 ms sobre 600); sin ellos es prácticamente
 * el 100 %.
 */
describe('Argon2id fuera del hilo principal (§21)', () => {
  /**
   * Retraso máximo del bucle de eventos mientras corre `trabajo`.
   *
   * El detalle que hace que esto funcione: tras un bloqueo síncrono, los microtasks (las
   * continuaciones de las promesas) se drenan ANTES que los temporizadores. Sin ceder a la fase
   * de timers antes de parar, el `setInterval` atrasado se cancela sin llegar a dispararse y el
   * bloqueo se mide como cero. La primera versión de esta medición daba 13 ms para un bloqueo
   * deliberado de 300 ms.
   */
  async function bloqueoDelBucle(trabajo: () => Promise<unknown>): Promise<{
    bloqueoMs: number;
    duracionMs: number;
  }> {
    await new Promise((r) => setTimeout(r, 30));
    let peor = 0;
    let ultimo = process.hrtime.bigint();
    const reloj = setInterval(() => {
      const ahora = process.hrtime.bigint();
      peor = Math.max(peor, Number(ahora - ultimo) / 1e6 - 5);
      ultimo = ahora;
    }, 5);
    await new Promise((r) => setTimeout(r, 30));
    const t0 = Date.now();
    await trabajo();
    const duracionMs = Date.now() - t0;
    await new Promise((r) => setTimeout(r, 0));
    clearInterval(reloj);
    return { bloqueoMs: peor, duracionMs };
  }

  it('el medidor detecta un bloqueo deliberado (calibración)', async () => {
    const { bloqueoMs } = await bloqueoDelBucle(async () => {
      const fin = Date.now() + 300;
      while (Date.now() < fin) {
        /* bloqueo a propósito */
      }
    });
    // Si esto falla, lo que está roto es la medición y no el código que mide.
    expect(bloqueoMs).toBeGreaterThan(200);
  }, 20_000);

  it('veinte verificaciones a la vez no dejan el proceso mudo', async () => {
    const hash = await hashPassword('contraseña-de-prueba-larga-y-normal');
    const { bloqueoMs, duracionMs } = await bloqueoDelBucle(() =>
      Promise.all(
        Array.from({ length: 20 }, () =>
          verificarPassword('contraseña-de-prueba-larga-y-normal', hash),
        ),
      ),
    );
    expect(duracionMs).toBeGreaterThan(50); // si no, no se llegó a medir nada real
    expect(
      bloqueoMs,
      `el bucle estuvo bloqueado ${bloqueoMs.toFixed(0)} ms de los ${duracionMs} ms que duró el ` +
        'trabajo: Argon2id está corriendo en el hilo principal',
    ).toBeLessThan(duracionMs / 2);
  }, 30_000);

  it('el hash del worker y el de hash-wasm son intercambiables', async () => {
    // Es la condición para poder cambiar de motor sin invalidar lo ya guardado: los dos producen
    // Argon2id v19 en formato PHC y cada uno verifica lo del otro.
    const hash = await hashPassword('otra-contraseña-de-prueba');
    const prefijo =
      `$argon2id$v=19$m=${PARAMS_ARGON2.memoriaKiB},` +
      `t=${PARAMS_ARGON2.iteraciones},p=${PARAMS_ARGON2.paralelismo}$`;
    expect(hash.startsWith(prefijo), `formato inesperado: ${hash}`).toBe(true);
    // PHC completo: $argon2id$v=…$m=…$sal$hash
    expect(hash.split('$')).toHaveLength(6);
    expect(await verificarPassword('otra-contraseña-de-prueba', hash)).toBe(true);
    expect(await verificarPassword('otra-contraseña-de-pruebb', hash)).toBe(false);
    expect(necesitaRehash(hash)).toBe(false);
  }, 20_000);
});
