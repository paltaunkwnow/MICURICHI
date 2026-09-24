/**
 * Freno de fuerza bruta y caducidad de sesión (CLAUDE.md §13). Antes el login solo tenía el
 * límite por IP del plugin: un ataque distribuido podía probar contraseñas contra una cuenta
 * concreta sin tope, y una cookie robada valía siete días aunque nadie la usara.
 */
import { ejecutorPg } from 'db';
import { type BaseEfimera, cargarCapasDePrueba, levantarBaseEfimera } from 'db/test-utils';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AlmacenMemoria } from '../src/almacen.js';
import { crearApp } from '../src/app.js';
import { type ConfigApi, leerConfig } from '../src/config.js';
import { hashIp, ipHashDiario } from '../src/privacidad.js';
import { crearUsuarios, resolverDePrueba } from './ayudas.js';

let base: BaseEfimera;
let pool: pg.Pool;

const PASSWORD = 'contrasena-test-123';

async function app(extra: Partial<ConfigApi> = {}): Promise<FastifyInstance> {
  return crearApp({
    pool,
    cfg: {
      ...leerConfig({ DATABASE_URL: base.url }),
      rutaOpenApi: '/no-existe.yaml',
      rateLimitMax: 1000,
      ...extra,
    },
    resolver: resolverDePrueba,
    almacen: new AlmacenMemoria(),
  });
}

function login(a: FastifyInstance, email: string, password: string) {
  return a.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
}

beforeAll(async () => {
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 3 });
  const ex = ejecutorPg(pool);
  await cargarCapasDePrueba(ex);
  await crearUsuarios(ex);
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await base?.cerrar();
});

beforeEach(async () => {
  await pool.query('DELETE FROM intento_login');
  await pool.query('DELETE FROM sesion');
});

describe('freno de fuerza bruta por cuenta', () => {
  it('corta tras N fallos contra el mismo email y responde 429 con Retry-After', async () => {
    const a = await app({ limitesLogin: { maxPorEmail: 3, maxPorIp: 100, ventanaMinutos: 15 } });
    for (let i = 0; i < 3; i++) {
      const r = await login(a, 'tecnico@test.local', 'incorrecta-xyz');
      expect(r.statusCode).toBe(401);
    }
    const frenado = await login(a, 'tecnico@test.local', 'incorrecta-xyz');
    expect(frenado.statusCode).toBe(429);
    expect(frenado.json().codigo).toBe('DEMASIADOS_INTENTOS');
    expect(Number(frenado.headers['retry-after'])).toBeGreaterThan(0);

    // Y no se puede saltar acertando la contraseña: el freno actúa ANTES de comprobarla.
    const conBuena = await login(a, 'tecnico@test.local', PASSWORD);
    expect(conBuena.statusCode).toBe(429);
    await a.close();
  });

  it('el freno de una cuenta no afecta a otra', async () => {
    const a = await app({ limitesLogin: { maxPorEmail: 2, maxPorIp: 100, ventanaMinutos: 15 } });
    for (let i = 0; i < 3; i++) await login(a, 'tecnico@test.local', 'incorrecta-xyz');
    expect((await login(a, 'tecnico@test.local', PASSWORD)).statusCode).toBe(429);
    // El admin entra con normalidad: el contador es por cuenta, no global.
    expect((await login(a, 'admin@test.local', PASSWORD)).statusCode).toBe(200);
    await a.close();
  });

  it('un login correcto limpia los fallos previos de esa cuenta', async () => {
    const a = await app({ limitesLogin: { maxPorEmail: 3, maxPorIp: 100, ventanaMinutos: 15 } });
    await login(a, 'tecnico@test.local', 'incorrecta-xyz');
    await login(a, 'tecnico@test.local', 'incorrecta-xyz');
    expect((await login(a, 'tecnico@test.local', PASSWORD)).statusCode).toBe(200);
    // Quien recordó su contraseña al tercer intento no queda penalizado.
    await login(a, 'tecnico@test.local', 'incorrecta-xyz');
    await login(a, 'tecnico@test.local', 'incorrecta-xyz');
    expect((await login(a, 'tecnico@test.local', PASSWORD)).statusCode).toBe(200);
    await a.close();
  });

  it('el límite por IP corta aunque cada intento use un email distinto', async () => {
    const a = await app({ limitesLogin: { maxPorEmail: 100, maxPorIp: 3, ventanaMinutos: 15 } });
    for (let i = 0; i < 3; i++) await login(a, `desconocido${i}@test.local`, 'incorrecta-xyz');
    const r = await login(a, 'otro@test.local', 'incorrecta-xyz');
    expect(r.statusCode).toBe(429);
    await a.close();
  });

  it('no guarda el email ni la IP en claro en la tabla de intentos', async () => {
    const a = await app({ limitesLogin: { maxPorEmail: 5, maxPorIp: 100, ventanaMinutos: 15 } });
    await login(a, 'tecnico@test.local', 'incorrecta-xyz');
    const filas = await pool.query<{ clave: string }>('SELECT clave FROM intento_login');
    expect(filas.rows.length).toBeGreaterThan(0);
    for (const f of filas.rows) {
      expect(f.clave).not.toContain('tecnico@test.local');
      expect(f.clave).toMatch(/^(email|ip):[a-f0-9]{64}$/);
    }
    await a.close();
  });
});

describe('migración de hashes scrypt a Argon2id', () => {
  it('un usuario con hash viejo entra igual y su hash queda migrado', async () => {
    const { randomBytes, scryptSync } = await import('node:crypto');
    const sal = randomBytes(16).toString('hex');
    const legado = `scrypt$${sal}$${scryptSync(PASSWORD, sal, 64, { N: 16384, r: 8, p: 1 }).toString('hex')}`;
    await pool.query(`UPDATE usuario SET password_hash = $1 WHERE email = 'tecnico@test.local'`, [
      legado,
    ]);

    const a = await app();
    const r = await login(a, 'tecnico@test.local', PASSWORD);
    expect(r.statusCode).toBe(200);

    const despues = await pool.query<{ password_hash: string }>(
      `SELECT password_hash FROM usuario WHERE email = 'tecnico@test.local'`,
    );
    expect(despues.rows[0]?.password_hash).toMatch(/^\$argon2id\$/);

    // Y con el hash ya migrado se sigue entrando con la misma contraseña.
    expect((await login(a, 'tecnico@test.local', PASSWORD)).statusCode).toBe(200);
    await a.close();
  });
});

describe('caducidad de sesión', () => {
  it('una sesión sin usar más que el idle deja de valer', async () => {
    const a = await app({ sesionIdleHoras: 12 });
    const r = await login(a, 'tecnico@test.local', PASSWORD);
    const cookie = r.cookies.find((c) => c.name === 'curichi_sesion')!.value;
    expect(
      (
        await a.inject({
          method: 'GET',
          url: '/api/v1/auth/yo',
          cookies: { curichi_sesion: cookie },
        })
      ).statusCode,
    ).toBe(200);

    await pool.query(
      `UPDATE sesion SET ultimo_uso_en = now() - interval '13 hours' WHERE id = $1`,
      [cookie],
    );
    const caducada = await a.inject({
      method: 'GET',
      url: '/api/v1/auth/yo',
      cookies: { curichi_sesion: cookie },
    });
    expect(caducada.statusCode).toBe(401);
    await a.close();
  });

  it('usarla la mantiene viva: el uso es deslizante', async () => {
    const a = await app({ sesionIdleHoras: 12 });
    const r = await login(a, 'tecnico@test.local', PASSWORD);
    const cookie = r.cookies.find((c) => c.name === 'curichi_sesion')!.value;
    // A 11 h de inactividad sigue valiendo y, al usarla, se refresca la marca.
    await pool.query(
      `UPDATE sesion SET ultimo_uso_en = now() - interval '11 hours' WHERE id = $1`,
      [cookie],
    );
    expect(
      (
        await a.inject({
          method: 'GET',
          url: '/api/v1/auth/yo',
          cookies: { curichi_sesion: cookie },
        })
      ).statusCode,
    ).toBe(200);
    await new Promise((r2) => setTimeout(r2, 250)); // el refresco va sin await
    const s = await pool.query<{ viejo: boolean }>(
      `SELECT (ultimo_uso_en < now() - interval '1 hour') AS viejo FROM sesion WHERE id = $1`,
      [cookie],
    );
    expect(s.rows[0]?.viejo).toBe(false);
    await a.close();
  });

  it('el tope absoluto sigue cortando aunque la sesión se use', async () => {
    const a = await app({ sesionIdleHoras: 12 });
    const r = await login(a, 'tecnico@test.local', PASSWORD);
    const cookie = r.cookies.find((c) => c.name === 'curichi_sesion')!.value;
    await pool.query(`UPDATE sesion SET expira_en = now() - interval '1 minute' WHERE id = $1`, [
      cookie,
    ]);
    expect(
      (
        await a.inject({
          method: 'GET',
          url: '/api/v1/auth/yo',
          cookies: { curichi_sesion: cookie },
        })
      ).statusCode,
    ).toBe(401);
    await a.close();
  });

  it('logout borra la sesión de la base, no solo la cookie', async () => {
    const a = await app();
    const r = await login(a, 'tecnico@test.local', PASSWORD);
    const cookie = r.cookies.find((c) => c.name === 'curichi_sesion')!.value;
    await a.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: { curichi_sesion: cookie },
    });
    const n = await pool.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM sesion WHERE id = $1',
      [cookie],
    );
    expect(n.rows[0]?.n).toBe('0');
    // Y reutilizar la cookie robada ya no sirve.
    expect(
      (
        await a.inject({
          method: 'GET',
          url: '/api/v1/auth/yo',
          cookies: { curichi_sesion: cookie },
        })
      ).statusCode,
    ).toBe(401);
    await a.close();
  });

  it('desactivar al usuario invalida sus sesiones al instante', async () => {
    const a = await app();
    const r = await login(a, 'tecnico@test.local', PASSWORD);
    const cookie = r.cookies.find((c) => c.name === 'curichi_sesion')!.value;
    await pool.query(`UPDATE usuario SET activo = false WHERE email = 'tecnico@test.local'`);
    expect(
      (
        await a.inject({
          method: 'GET',
          url: '/api/v1/auth/yo',
          cookies: { curichi_sesion: cookie },
        })
      ).statusCode,
    ).toBe(401);
    await pool.query(`UPDATE usuario SET activo = true WHERE email = 'tecnico@test.local'`);
    await a.close();
  });
});

describe('privacidad de la IP', () => {
  it('el hash de log no permite recuperar la IP y depende de la sal', () => {
    const h = hashIp('203.0.113.7', 'sal-a');
    expect(h).not.toContain('203.0.113');
    expect(h).toHaveLength(16);
    expect(hashIp('203.0.113.7', 'sal-b')).not.toBe(h);
    expect(hashIp('203.0.113.7', 'sal-a')).toBe(h);
  });

  it('el hash de antispam rota cada día', () => {
    const a = ipHashDiario('203.0.113.7', 'sal', new Date('2026-09-15T10:00:00Z'));
    const mismoDia = ipHashDiario('203.0.113.7', 'sal', new Date('2026-09-15T23:00:00Z'));
    const otroDia = ipHashDiario('203.0.113.7', 'sal', new Date('2026-09-16T10:00:00Z'));
    expect(mismoDia).toBe(a);
    expect(otroDia).not.toBe(a);
  });
});
