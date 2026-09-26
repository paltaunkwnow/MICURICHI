import { describe, expect, it } from 'vitest';
import { leerConfig, opcionesPool } from '../src/config.js';

describe('GEO_DB_STATEMENT_TIMEOUT_MS (hallazgo 2: timeout de consultas)', () => {
  it('por defecto es 5000 ms, muy por debajo de los 30 s del pool compartido de packages/db', () => {
    const cfg = leerConfig({ DATABASE_URL: 'postgresql://x/y' });
    expect(cfg.dbStatementTimeoutMs).toBe(5000);
  });

  it('se puede configurar con GEO_DB_STATEMENT_TIMEOUT_MS', () => {
    const cfg = leerConfig({
      DATABASE_URL: 'postgresql://x/y',
      GEO_DB_STATEMENT_TIMEOUT_MS: '2500',
    });
    expect(cfg.dbStatementTimeoutMs).toBe(2500);
  });

  it('opcionesPool() pasa el statement_timeout propio del servicio, no el de packages/db', () => {
    const cfg = leerConfig({
      DATABASE_URL: 'postgresql://x/y',
      DB_POOL_MAX: '11',
      GEO_DB_STATEMENT_TIMEOUT_MS: '3000',
    });
    expect(opcionesPool(cfg)).toEqual({ max: 11, statementTimeoutMs: 3000 });
  });
});

describe('GEO_DATABASE_URL (rol propio por servicio)', () => {
  it('con GEO_DATABASE_URL y DATABASE_URL presentes, usa GEO_DATABASE_URL (rol curichi_geo, no el dueño)', () => {
    const cfg = leerConfig({
      DATABASE_URL: 'postgresql://curichi:x@127.0.0.1:5433/curichi',
      GEO_DATABASE_URL: 'postgresql://curichi_geo:y@127.0.0.1:5433/curichi',
    });
    expect(cfg.databaseUrl).toBe('postgresql://curichi_geo:y@127.0.0.1:5433/curichi');
  });

  it('sin GEO_DATABASE_URL, sigue aceptando DATABASE_URL (compatibilidad)', () => {
    const cfg = leerConfig({ DATABASE_URL: 'postgresql://curichi:x@127.0.0.1:5433/curichi' });
    expect(cfg.databaseUrl).toBe('postgresql://curichi:x@127.0.0.1:5433/curichi');
  });

  it('sin ninguna de las dos, cae al valor local por defecto', () => {
    const cfg = leerConfig({});
    expect(cfg.databaseUrl).toBe('postgresql://curichi:curichi@127.0.0.1:5433/curichi');
  });

  it('GEO_DATABASE_URL="" (tal cual la deja .env.example) se trata como ausente, no gana sobre DATABASE_URL', () => {
    const cfg = leerConfig({
      DATABASE_URL: 'postgresql://curichi:x@127.0.0.1:5432/curichi',
      GEO_DATABASE_URL: '',
    });
    expect(cfg.databaseUrl).toBe('postgresql://curichi:x@127.0.0.1:5432/curichi');
  });
});
