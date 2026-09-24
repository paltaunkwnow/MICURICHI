/**
 * Guardas de mínimo privilegio (CLAUDE.md §13).
 *
 * La migración 0008 concede a cada servicio lo justo, pero eso no sirve de nada si `DATABASE_URL`
 * apunta al rol dueño o a un superusuario: la separación se evapora sin que nadie se entere. Antes
 * de la auditoría era exactamente así —api-core y geo-service se conectaban los dos como `curichi`,
 * que era SUPERUSER con CREATEROLE, CREATEDB y BYPASSRLS—, y por eso la comprobación se hace en el
 * arranque del servicio y no solo en la documentación.
 *
 * La matriz completa contra una base real la comprueba `pnpm privilegios`; estas pruebas fijan la
 * lógica de decisión, que es la que dice si se arranca o no.
 */
import { describe, expect, it } from 'vitest';
import { type EstadoPrivilegios, privilegiosDeMas } from '../src/privilegios.js';

const rolCorrecto: EstadoPrivilegios = {
  usuario: 'curichi_api',
  superusuario: false,
  puedeCrearRoles: false,
  puedeCrearBases: false,
  ignoraRls: false,
  dueñoDeTablas: false,
};

describe('privilegios de más', () => {
  it('un rol de aplicación acotado no tiene nada que sobre', () => {
    expect(privilegiosDeMas(rolCorrecto)).toEqual([]);
  });

  it('señala SUPERUSER y explica por qué importa', () => {
    const [motivo] = privilegiosDeMas({ ...rolCorrecto, superusuario: true });
    expect(motivo).toMatch(/SUPERUSER/);
    // El mensaje nombra la consecuencia concreta, no solo el atributo: quien lo lea en un log de
    // arranque a las tres de la mañana tiene que entender por qué no puede dejarlo pasar.
    expect(motivo).toMatch(/COPY \.\.\. PROGRAM/);
  });

  it('señala CREATEROLE: con él, el rol se fabrica otro con más permisos', () => {
    expect(privilegiosDeMas({ ...rolCorrecto, puedeCrearRoles: true })[0]).toMatch(/CREATEROLE/);
  });

  it('señala CREATEDB y BYPASSRLS', () => {
    expect(privilegiosDeMas({ ...rolCorrecto, puedeCrearBases: true })[0]).toMatch(/CREATEDB/);
    expect(privilegiosDeMas({ ...rolCorrecto, ignoraRls: true })[0]).toMatch(/BYPASSRLS/);
  });

  /**
   * Ser dueño de las tablas es el caso que se escapa a la vista: el rol puede no tener ningún
   * atributo especial y aun así hacer DROP o ALTER sobre lo suyo, porque los permisos por tabla
   * no se aplican al propietario.
   */
  it('señala la propiedad de las tablas aunque no haya atributos de administración', () => {
    const e = { ...rolCorrecto, usuario: 'curichi', dueñoDeTablas: true };
    const sobra = privilegiosDeMas(e);
    expect(sobra).toHaveLength(1);
    expect(sobra[0]).toMatch(/dueño/);
  });

  it('el rol de antes de la auditoría dispara los cinco motivos a la vez', () => {
    const antiguo: EstadoPrivilegios = {
      usuario: 'curichi',
      superusuario: true,
      puedeCrearRoles: true,
      puedeCrearBases: true,
      ignoraRls: true,
      dueñoDeTablas: true,
    };
    expect(privilegiosDeMas(antiguo)).toHaveLength(5);
  });
});
