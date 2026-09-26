/**
 * Lo que ata una instalación a su ciudad o a su operación va a variables de entorno con un valor
 * por defecto seguro, y un valor mal escrito se rechaza en vez de caer en silencio al defecto: un
 * CRS equivocado agrupa mal todos los reportes, y un plazo de bloqueo ilegible dejaría la
 * migración esperando detrás del tráfico, que es lo que el plazo existe para impedir.
 */
import { CONFIG_DOMINIO } from 'contracts';
import { describe, expect, it } from 'vitest';
import {
  crsMetricoEpsg,
  LOCK_TIMEOUT_MIGRACION_MS_POR_DEFECTO,
  lockTimeoutMigracionMs,
} from '../src/configuracion.js';

describe('CRS_METRICO_EPSG', () => {
  it('sin definir, o vacía, vale el de contracts (UTM 20S, Santa Cruz)', () => {
    expect(crsMetricoEpsg(undefined)).toBe(CONFIG_DOMINIO.CRS_METRICO_EPSG);
    expect(crsMetricoEpsg('')).toBe(CONFIG_DOMINIO.CRS_METRICO_EPSG);
    expect(crsMetricoEpsg('  ')).toBe(CONFIG_DOMINIO.CRS_METRICO_EPSG);
    expect(CONFIG_DOMINIO.CRS_METRICO_EPSG).toBe(32720);
  });

  it('acepta el código EPSG de otra ciudad', () => {
    expect(crsMetricoEpsg('32719')).toBe(32719);
    expect(crsMetricoEpsg(' 32721 ')).toBe(32721);
  });

  it.each(['abc', '0', '-32720', '3272.5', '32720x', 'EPSG:32720'])(
    'rechaza «%s» con un mensaje que nombra la variable',
    (valor) => {
      expect(() => crsMetricoEpsg(valor)).toThrow(/CRS_METRICO_EPSG/);
    },
  );
});

describe('MIGRAR_LOCK_TIMEOUT_MS', () => {
  it('sin definir, o vacía, vale 10 000 ms', () => {
    expect(LOCK_TIMEOUT_MIGRACION_MS_POR_DEFECTO).toBe(10_000);
    expect(lockTimeoutMigracionMs(undefined)).toBe(10_000);
    expect(lockTimeoutMigracionMs('')).toBe(10_000);
  });

  it('acepta un entero de milisegundos, y 0 (sin límite) si se pide expresamente', () => {
    expect(lockTimeoutMigracionMs('2500')).toBe(2500);
    expect(lockTimeoutMigracionMs('0')).toBe(0);
  });

  it.each(['-1', '1.5', 'diez', '10s'])('rechaza «%s»', (valor) => {
    expect(() => lockTimeoutMigracionMs(valor)).toThrow(/MIGRAR_LOCK_TIMEOUT_MS/);
  });
});
