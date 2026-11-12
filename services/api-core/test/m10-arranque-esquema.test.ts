/** M10: importación/entry y barrera de esquema, solo dobles y PGlite propio. */
import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BaseEfimera, levantarBaseEfimera } from 'db/test-utils';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const importacion = vi.hoisted(() => {
  const prohibir = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`efecto al importar: ${nombre}`);
    });
  return {
    leerConfig: prohibir('leerConfig'),
    crearPool: prohibir('crearPool'),
    crearApp: prohibir('crearApp'),
    leerConfigS3: prohibir('leerConfigS3'),
    almacen: prohibir('almacen'),
    resolver: prohibir('resolver'),
    mantenimiento: prohibir('mantenimiento'),
  };
});

// Se instalan antes del import dinámico: el runtime F0 no puede leer env ni abrir conexiones
// accidentalmente durante el rojo. Los fixtures PGlite usan su módulo explícito por separado.
vi.mock('db', () => ({
  crearPool: importacion.crearPool,
  esperarBaseDeDatos: vi.fn(),
  verificarPrivilegios: vi.fn(),
  cerrarWorkersDePassword: vi.fn(),
}));
vi.mock('../src/config.js', () => ({
  leerConfig: importacion.leerConfig,
  avisosDeConfiguracion: vi.fn(() => []),
}));
vi.mock('../src/app.js', () => ({ crearApp: importacion.crearApp }));
vi.mock('../src/almacen.js', () => ({
  AlmacenDisco: class {
    constructor() {
      importacion.almacen();
    }
  },
}));
vi.mock('../src/almacen-s3.js', () => ({
  leerConfigS3: importacion.leerConfigS3,
  AlmacenS3: class {
    constructor() {
      importacion.almacen();
    }
  },
}));
vi.mock('../src/resolver.js', () => ({
  ResolverHttp: class {
    constructor() {
      importacion.resolver();
    }
  },
}));
vi.mock('../src/categorias.js', () => ({ verificarReglasDeCupoActivas: vi.fn() }));
vi.mock('../src/mantenimiento.js', () => ({ programarMantenimiento: importacion.mantenimiento }));
vi.mock('../src/registro.js', () => ({ opcionesLogger: vi.fn(() => ({})) }));

const cargarServidor = () => import('../src/servidor.js');
const urlModulo = new URL('../src/servidor.ts', import.meta.url).href;
const rutaModulo = fileURLToPath(urlModulo);

describe('M10: entry compatible con Node24 y módulo sin efectos', () => {
  it('importar no lee configuración/env, no crea recursos ni registra señales', async () => {
    const señales = {
      SIGINT: process.listenerCount('SIGINT'),
      SIGTERM: process.listenerCount('SIGTERM'),
    };
    const servidor = await cargarServidor();
    expect(typeof servidor.verificarEsquemaCompatible).toBe('function');
    expect(typeof servidor.habilitarServidor).toBe('function');
    expect(typeof servidor.esEntradaPrincipal).toBe('function');
    for (const doble of Object.values(importacion)) expect(doble).not.toHaveBeenCalled();
    expect(process.listenerCount('SIGINT')).toBe(señales.SIGINT);
    expect(process.listenerCount('SIGTERM')).toBe(señales.SIGTERM);
  });

  it('reconoce el archivo invocado directamente y su ruta relativa real', async () => {
    const { esEntradaPrincipal } = await cargarServidor();
    expect(esEntradaPrincipal(urlModulo, rutaModulo)).toBe(true);
    expect(esEntradaPrincipal(urlModulo, relative(process.cwd(), rutaModulo))).toBe(true);
  });

  it('Windows admite otra capitalización sin silenciar el arranque CLI', async () => {
    const { esEntradaPrincipal } = await cargarServidor();
    expect(
      esEntradaPrincipal(urlModulo, rutaModulo.toUpperCase(), {
        plataforma: 'win32',
        resolverRuta: (ruta: string) => ruta,
      }),
    ).toBe(true);
  });

  it('en un sistema sensible a mayúsculas conserva la distinción de archivos', async () => {
    const { esEntradaPrincipal } = await cargarServidor();
    expect(
      esEntradaPrincipal(urlModulo, rutaModulo.toUpperCase(), {
        plataforma: 'linux',
        resolverRuta: (ruta: string) => ruta,
      }),
    ).toBe(false);
  });

  it('resuelve un alias al mismo archivo y distingue al importador', async () => {
    const { esEntradaPrincipal } = await cargarServidor();
    const alias = resolve('alias-servidor.ts');
    const resolverRuta = (ruta: string) => (ruta === alias ? rutaModulo : ruta);
    expect(esEntradaPrincipal(urlModulo, alias, { resolverRuta })).toBe(true);
    expect(esEntradaPrincipal(urlModulo, fileURLToPath(import.meta.url))).toBe(false);
  });

  it('sin argumento o con una entrada inexistente no ejecuta el servidor', async () => {
    const { esEntradaPrincipal } = await cargarServidor();
    expect(esEntradaPrincipal(urlModulo, undefined)).toBe(false);
    expect(esEntradaPrincipal(urlModulo, resolve('entrada-m10-inexistente.ts'))).toBe(false);
  });
});

function etapas(fallar?: string) {
  const llamadas: string[] = [];
  const ejecutar = (nombre: string) =>
    vi.fn(async () => {
      llamadas.push(nombre);
      if (fallar === nombre) throw new Error('esquema 0022 incompatible');
    });
  const detener = vi.fn();
  const programarMantenimiento = vi.fn(() => {
    llamadas.push('mantenimiento');
    return { detener };
  });
  return {
    llamadas,
    dependencias: {
      esperarBase: ejecutar('base'),
      verificarEsquema: ejecutar('esquema'),
      verificarPrivilegios: ejecutar('privilegios'),
      verificarCupos: ejecutar('cupos'),
      comprobarAlmacen: ejecutar('almacen'),
      escuchar: ejecutar('escuchar'),
      programarMantenimiento,
    },
  };
}

describe('M10: barrera anterior a escritores y mantenimiento', () => {
  it('habilita escuchar/mantenimiento después de comprobar esquema, rol, cupos y almacén', async () => {
    const { habilitarServidor } = await cargarServidor();
    const prueba = etapas();
    const mantenimiento = await habilitarServidor(prueba.dependencias);
    expect(prueba.llamadas).toEqual([
      'base',
      'esquema',
      'privilegios',
      'cupos',
      'almacen',
      'escuchar',
      'mantenimiento',
    ]);
    expect(mantenimiento.detener).toBeTypeOf('function');
  });

  it('si falla el esquema no abre escritores ni programa mantenimiento', async () => {
    const { habilitarServidor } = await cargarServidor();
    const prueba = etapas('esquema');
    await expect(habilitarServidor(prueba.dependencias)).rejects.toThrow(/esquema/);
    expect(prueba.llamadas).toEqual(['base', 'esquema']);
    expect(prueba.dependencias.escuchar).not.toHaveBeenCalled();
    expect(prueba.dependencias.programarMantenimiento).not.toHaveBeenCalled();
  });

  it.each(['base', 'privilegios', 'cupos', 'almacen', 'escuchar'])(
    'un fallo en %s tampoco inicia mantenimiento',
    async (fallar) => {
      const { habilitarServidor } = await cargarServidor();
      const prueba = etapas(fallar);
      await expect(habilitarServidor(prueba.dependencias)).rejects.toThrow();
      expect(prueba.dependencias.programarMantenimiento).not.toHaveBeenCalled();
      if (fallar !== 'escuchar') expect(prueba.dependencias.escuchar).not.toHaveBeenCalled();
    },
  );
});

describe('M10: forma de la respuesta de estado_esquema_m10', () => {
  it('consulta una vez la interfaz controlada y admite una única fila22 íntegra', async () => {
    const { verificarEsquemaCompatible } = await cargarServidor();
    const query = vi.fn(async (_sql: string) => ({ rows: [{ version: 22, integro: true }] }));
    await expect(verificarEsquemaCompatible({ query })).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]![0]).toMatch(
      /^\s*SELECT\s+version\s*,\s*integro\s+FROM\s+public\.estado_esquema_m10\(\)\s*;?\s*$/i,
    );
  });

  it.each([
    { nombre: 'cero filas', respuesta: { rows: [] } },
    {
      nombre: 'dos filas',
      respuesta: {
        rows: [
          { version: 22, integro: true },
          { version: 22, integro: true },
        ],
      },
    },
    { nombre: 'versión anterior', respuesta: { rows: [{ version: 21, integro: true }] } },
    { nombre: 'versión futura', respuesta: { rows: [{ version: 9999, integro: true }] } },
    { nombre: 'incompleto', respuesta: { rows: [{ version: 22, integro: false }] } },
    { nombre: 'versión texto', respuesta: { rows: [{ version: '22', integro: true }] } },
    { nombre: 'íntegro texto', respuesta: { rows: [{ version: 22, integro: 'true' }] } },
    { nombre: 'íntegro numérico', respuesta: { rows: [{ version: 22, integro: 1 }] } },
    { nombre: 'versión ausente', respuesta: { rows: [{ integro: true }] } },
    { nombre: 'íntegro ausente', respuesta: { rows: [{ version: 22 }] } },
    { nombre: 'fila NULL', respuesta: { rows: [null] } },
    { nombre: 'filas NULL', respuesta: { rows: null } },
    { nombre: 'sin filas', respuesta: {} },
    { nombre: 'resultado NULL', respuesta: null },
  ])('rechaza $nombre sin escuchar ni programar mantenimiento', async ({ respuesta }) => {
    const { verificarEsquemaCompatible, habilitarServidor } = await cargarServidor();
    const prueba = etapas();
    const query = vi.fn(async () => respuesta);
    await expect(
      habilitarServidor({
        ...prueba.dependencias,
        verificarEsquema: () => verificarEsquemaCompatible({ query }),
      }),
    ).rejects.toThrow(/esquema|0022/i);
    expect(query).toHaveBeenCalledTimes(1);
    expect(prueba.dependencias.escuchar).not.toHaveBeenCalled();
    expect(prueba.dependencias.programarMantenimiento).not.toHaveBeenCalled();
  });

  it.each(['42501', '42883'])(
    'rechaza SQLSTATE %s (permiso/función ausente) antes de habilitar escritores',
    async (code) => {
      const { verificarEsquemaCompatible, habilitarServidor } = await cargarServidor();
      const prueba = etapas();
      const query = vi.fn(async () => {
        throw Object.assign(new Error('detalle sensible sintético'), { code });
      });
      await expect(
        habilitarServidor({
          ...prueba.dependencias,
          verificarEsquema: () => verificarEsquemaCompatible({ query }),
        }),
      ).rejects.toThrow(/esquema|0022/i);
      expect(prueba.dependencias.escuchar).not.toHaveBeenCalled();
      expect(prueba.dependencias.programarMantenimiento).not.toHaveBeenCalled();
    },
  );
});

describe('M10: verificación real del esquema sobre PGlite propio', () => {
  let base: BaseEfimera;
  let pool: pg.Pool;

  beforeAll(async () => {
    base = await levantarBaseEfimera();
    pool = new pg.Pool({ connectionString: base.url, max: 1 });
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await base?.cerrar();
  });

  async function conCambio(sql: string) {
    const { verificarEsquemaCompatible } = await cargarServidor();
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query(sql);
      await expect(verificarEsquemaCompatible(cliente)).rejects.toThrow(/esquema|0022/i);
    } finally {
      await cliente.query('ROLLBACK');
      cliente.release();
    }
  }

  it('admite la migración22 completa ejecutando el SQL de comprobación real', async () => {
    const { verificarEsquemaCompatible } = await cargarServidor();
    await expect(verificarEsquemaCompatible(pool)).resolves.toBeUndefined();
  });

  it.each(['0023_futura.sql', '9999_desconocida.sql'])(
    'rechaza %s aun conservando íntegros los catálogos/constraints22',
    async (nombre) => {
      // Registro real de la fixture propia: no se inventa una variable «version=23» en un mock.
      await conCambio(`INSERT INTO public._migraciones(nombre) VALUES ('${nombre}')`);
    },
  );

  it.each([
    'ALTER TABLE public.reporte DROP CONSTRAINT m10_0022_inundacion_detalle_v1',
    'ALTER TABLE public.reporte DROP CONSTRAINT m10_0022_detalle_version_v1',
    "COMMENT ON CONSTRAINT m10_0022_detalle_version_v1 ON public.reporte IS 'marcador incompatible'",
    'ALTER TABLE public.reporte ADD COLUMN profundidad_estimada text',
    'ALTER TABLE public.reporte ALTER COLUMN detalle DROP NOT NULL',
    'CREATE VIEW public.reporte_inundacion AS SELECT * FROM public.reporte',
  ])('rechaza estructura22 incompleta: %s', async (sql) => conCambio(sql));

  it('rechaza21 completo después de la reversa real de la fixture, sin automigrarlo', async () => {
    const { verificarEsquemaCompatible } = await cargarServidor();
    const anterior = await levantarBaseEfimera();
    const conexiones = new pg.Pool({ connectionString: anterior.url, max: 1 });
    try {
      const reversa = await readFile(
        new URL(
          '../../../packages/db/migraciones/reversas/0022_contraccion_compatible_reversa.sql',
          import.meta.url,
        ),
        'utf8',
      );
      await conexiones.query(reversa);
      const antes = await conexiones.query(
        'SELECT nombre FROM public._migraciones ORDER BY nombre',
      );
      expect(antes.rows.at(-1)?.nombre).toBe('0021_indice_categoria_creado.sql');
      await expect(verificarEsquemaCompatible(conexiones)).rejects.toThrow(/esquema|0022/i);
      expect(
        (await conexiones.query('SELECT nombre FROM public._migraciones ORDER BY nombre')).rows,
      ).toEqual(antes.rows);
    } finally {
      await conexiones.end();
      await anterior.cerrar();
    }
  }, 120_000);

  it('un fallo SQL rechaza sin revelar el detalle original de conexión', async () => {
    const { verificarEsquemaCompatible } = await cargarServidor();
    const sensible = 'conexion-sintetica-que-no-debe-aparecer';
    const query = vi.fn(async () => {
      throw new Error(sensible);
    });
    const error = await verificarEsquemaCompatible({ query }).catch((e: unknown) => e);
    expect(query).toHaveBeenCalled();
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toMatch(/esquema|0022/i);
    expect(String(error)).not.toContain(sensible);
  });
});
