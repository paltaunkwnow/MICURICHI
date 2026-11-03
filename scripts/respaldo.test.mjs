import assert from 'node:assert/strict';
import * as procesos from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import * as net from 'node:net';
import test from 'node:test';
import * as tls from 'node:tls';

// Se bloquean los operadores ANTES de importar incluso el módulo anterior sin guarda CLI.
const bloqueado = () => {
  throw new Error('OPERADOR REAL BLOQUEADO');
};
for (const nombre of [
  'exec',
  'execFile',
  'spawn',
  'fork',
  'execSync',
  'execFileSync',
  'spawnSync',
]) {
  procesos.default[nombre] = bloqueado;
}
net.default.connect =
  net.default.createConnection =
  net.default.Socket.prototype.connect =
    bloqueado;
tls.default.connect = bloqueado;
globalThis.fetch = bloqueado;
const leerOriginal = fs.default.readFileSync;
fs.default.readFileSync = (ruta, ...args) => {
  assert.doesNotMatch(String(ruta), /(?:^|[/\\])\.env$/);
  return leerOriginal(ruta, ...args);
};
syncBuiltinESMExports();
const argvAnterior = process.argv;
const codigoAnterior = process.exitCode;
const logAnterior = console.log;
const salidaImport = [];
process.argv = [process.execPath, 'prueba', '__import_sin_accion__'];
console.log = (...args) => salidaImport.push(args);
const modulo = await import('./respaldo.mjs');
const codigoImport = process.exitCode;
process.argv = argvAnterior;
process.exitCode = codigoAnterior;
console.log = logAnterior;

const columnas = ['id', 'categoria', 'detalle', 'detalle_version', 'descripcion', 'geom'];
const datos = ['inundacion', 'bache', 'basura', 'area_verde'].map((categoria, i) => ({
  id: `sintetico-${i}`,
  categoria,
  detalle: { respuesta: i },
  detalle_version: 1,
  descripcion: null,
  geom: `0101-${i}`,
}));
const clonar = (valor) => structuredClone(valor);
// Oráculo de fixtures: deriva la evidencia de las filas, no de la respuesta esperada del SUT.
function evidencia(filas, proyeccion) {
  return [...new Set(filas.map((r) => r.categoria ?? 'inundacion'))].sort().map((categoria) => {
    const grupo = filas.filter((r) => (r.categoria ?? 'inundacion') === categoria);
    const contenido = grupo.map((r) => JSON.stringify(proyeccion.map((c) => [c, r[c]]))).sort();
    return {
      categoria,
      filas: String(grupo.length),
      huella: createHash('sha256').update(JSON.stringify(contenido)).digest('hex'),
    };
  });
}
function banco({
  migracion = '0021_sintetica.sql',
  filas = datos,
  cols = columnas,
  tipo = 'r',
  error = false,
  catalogo = createHash('sha256').update('catalogo-sintetico').digest('hex'),
  evidenciaIncompleta = false,
  conteos = {},
} = {}) {
  const consultas = [];
  return {
    consultas,
    sql: async (_base, consulta) => {
      consultas.push(consulta);
      assert.doesNotMatch(consulta, /\b(?:INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)\b/i);
      if (error) throw new Error('SQL MOCK FALLÓ');
      if (consulta.includes("to_regclass('public._migraciones')")) return 't';
      if (consulta.includes('max(nombre)')) return migracion;
      if (consulta.includes('pg_class')) return tipo;
      if (consulta.includes('information_schema.columns')) return JSON.stringify(cols);
      if (consulta.includes('AS huella')) {
        const tabla = Number(migracion.slice(0, 4)) >= 20 ? 'reporte' : 'reporte_inundacion';
        assert.match(consulta, new RegExp(`FROM public\\.${tabla} r\\b`));
        assert.doesNotMatch(consulta, /WHERE\s+categoria\s*=/i);
        const proyeccion = consulta
          .match(/WHERE key IN \((.*?)\)/)[1]
          .split(',')
          .map((s) => s.trim().slice(1, -1));
        for (const c of proyeccion) assert.ok(consulta.includes(`'${c}'`), `falta columna ${c}`);
        return JSON.stringify(evidencia(evidenciaIncompleta ? filas.slice(1) : filas, proyeccion));
      }
      if (consulta.includes('catalogo_categorias')) return catalogo;
      for (const [fragmento, valor] of Object.entries(conteos))
        if (consulta.includes(fragmento)) return valor;
      if (consulta.includes('NOT ST_IsValid')) return '0';
      if (consulta.includes('pg_indexes') || consulta.includes('FROM _migraciones'))
        return String(Number(migracion.slice(0, 4)));
      if (/FROM public\.reporte(?:_inundacion)?\b/.test(consulta)) return String(filas.length);
      if (/SELECT count\(\*\)/.test(consulta)) return '4';
      throw new Error(`SQL SIN MOCK: ${consulta}`);
    },
  };
}
async function comparar(a = {}, b = {}) {
  const original = banco(a);
  const copia = banco(b);
  const sql = (base, consulta) => (base === 'origen_mock' ? original : copia).sql(base, consulta);
  const resultado = await modulo.verificar('origen_mock', 'copia_mock', { sql });
  return { resultado, original, copia };
}

test('importar no imprime, cambia exitCode ni inicia CLI/procesos', () => {
  assert.deepEqual(salidaImport, []);
  assert.equal(codigoImport, codigoAnterior);
});
test('sin SQL inyectado falla cerrado', async () => {
  await assert.rejects(() => modulo.verificar('origen_mock', 'copia_mock'), /SQL inyectado/);
});
test('actual compara tabla física y las cuatro categorías con contenido', async () => {
  const { resultado, original } = await comparar();
  assert.equal(resultado, true);
  assert.ok(original.consultas.some((s) => s.includes('FROM public.reporte r')));
});
for (const categoria of ['bache', 'basura', 'area_verde']) {
  test(`rechaza pérdida de ${categoria} aunque Inundaciones siga intacta`, async () => {
    assert.equal(
      (await comparar({}, { filas: datos.filter((r) => r.categoria !== categoria) })).resultado,
      false,
    );
  });
}
for (const campo of ['categoria', 'detalle', 'detalle_version', 'geom', 'descripcion']) {
  test(`rechaza cambio en ${campo} con igual cantidad total`, async () => {
    const filas = clonar(datos);
    filas[1][campo] =
      campo === 'detalle' ? { respuesta: 999 } : campo === 'detalle_version' ? 2 : 'otro';
    assert.equal(filas.length, datos.length);
    assert.equal((await comparar({}, { filas })).resultado, false);
  });
}
test('NULL no se confunde con cadena vacía', async () => {
  const filas = clonar(datos);
  filas[2].descripcion = '';
  assert.equal((await comparar({}, { filas })).resultado, false);
});
test('orden de filas no afecta evidencia', async () => {
  assert.equal((await comparar({}, { filas: [...datos].reverse() })).resultado, true);
});
test('previo 0020 conserva tabla antigua; columnas nuevas e índices no implican pérdidas', async () => {
  const cols = ['id', 'descripcion', 'geom'];
  const filas = [{ id: 'sintetico', descripcion: null, geom: '0101' }];
  const { resultado, original } = await comparar(
    { migracion: '0019_anterior.sql', cols, filas },
    { filas: [{ ...filas[0], categoria: 'inundacion', detalle: {}, detalle_version: 1 }] },
  );
  assert.equal(resultado, true);
  assert.ok(original.consultas.some((s) => s.includes('FROM public.reporte_inundacion r')));
});
test('columna actual perdida no se oculta como compatibilidad', async () => {
  await assert.rejects(
    () => comparar({}, { cols: columnas.filter((c) => c !== 'detalle') }),
    /columnas/,
  );
});
test('rechaza vista usada como tabla física', async () => {
  await assert.rejects(() => comparar({ tipo: 'v' }), /física/);
});
test('rechaza migración ausente o inconsistente y error SQL', async () => {
  await assert.rejects(() => comparar({ migracion: '' }), /migración/);
  await assert.rejects(() => comparar({ migracion: 'sin_version' }), /migración/);
  await assert.rejects(() => comparar({}, { migracion: '0019_anterior.sql' }), /migración/);
  await assert.rejects(() => comparar({ error: true }), /SQL MOCK FALLÓ/);
});
test('mock no previsto y operadores reales permanecen bloqueados', () => {
  assert.throws(() => procesos.execFile('docker', []), /BLOQUEADO/);
});
test('pérdida o cambio de catálogo de categorías falla', async () => {
  assert.equal(
    (
      await comparar(
        {},
        { catalogo: createHash('sha256').update('catalogo-alterado').digest('hex') },
      )
    ).resultado,
    false,
  );
});
test('evidencia parcial de categorías no puede pasar por completa', async () => {
  await assert.rejects(() => comparar({}, { evidenciaIncompleta: true }), /incompleta/);
});
test('conteos inválidos, geometría inválida e índices perdidos fallan', async () => {
  await assert.rejects(
    () => comparar({}, { conteos: { 'FROM public.reporte': 'NaN' } }),
    /conteo SQL/,
  );
  assert.equal((await comparar({}, { conteos: { 'NOT ST_IsValid': '1' } })).resultado, false);
  assert.equal((await comparar({}, { conteos: { pg_indexes: '0' } })).resultado, false);
});
test('mismas columnas actuales en versión posterior admite columna nueva', async () => {
  // El fixture anterior era un22 expansivo inventado. El blob legado sigue estable;
  // 22 solo entra por el sobre íntegro, nunca por proyectar el subconjunto viejo.
  await assert.rejects(
    () =>
      comparar(
        {},
        {
          migracion: '0022_sintetica.sql',
          cols: [...columnas, 'columna_nueva'],
        },
      ),
    /legado|evidencia22/,
  );
  const a = sobreCriterio(21);
  const b = sobreCriterio(22);
  b.esquema.columnas.push('columna_nueva');
  assert.equal(modulo.compararSnapshotsContraccion(a, b), false);
});
test('oráculos de fixtures discriminan pérdida, cambio de igual conteo y NULL', () => {
  const base = evidencia(datos, columnas);
  assert.notDeepEqual(base, evidencia(datos.slice(1), columnas));
  const distintas = clonar(datos);
  distintas[2].detalle.respuesta = 88;
  assert.notDeepEqual(base, evidencia(distintas, columnas));
  distintas[2].detalle.respuesta = 2;
  distintas[2].descripcion = '';
  assert.notDeepEqual(base, evidencia(distintas, columnas));
});

function restauracionMock(existente = '0') {
  const llamadas = [];
  return {
    llamadas,
    hasta: '0021',
    baseAdministrativa: 'template1',
    sql: async (base, consulta) => {
      llamadas.push([base, consulta]);
      assert.doesNotMatch(consulta, /DROP|CASCADE|TRUNCATE/i);
      if (consulta.includes('pg_database')) return existente;
      if (consulta.startsWith('CREATE DATABASE')) return '';
      if (consulta.startsWith('DO $')) return '';
      throw new Error('SQL SIN MOCK');
    },
    migrar: async (...args) => llamadas.push(['migrar', ...args]),
    cargar: async (...args) => llamadas.push(['cargar', ...args]),
  };
}
test('M10.3 destino ocupado se rechaza antes de crear/migrar/cargar', async () => {
  const ops = restauracionMock('1');
  await assert.rejects(() => modulo.restaurarNode('mock.dump', 'copia_mock', ops), /existe/);
  assert.equal(ops.llamadas.length, 1);
  assert.equal(ops.llamadas[0][0], 'template1');
});
test('M10.3 destino nuevo usa administración explícita y orden seguro', async () => {
  const ops = restauracionMock();
  await modulo.restaurarNode('mock.dump', 'copia_mock', ops);
  assert.deepEqual(
    ops.llamadas.map((c) => c[0]),
    ['template1', 'template1', 'migrar', 'copia_mock', 'cargar', 'migrar'],
  );
});
test('M10.3 sin inyección o administración no hay fallback real', async () => {
  await assert.rejects(() => modulo.restaurarNode('mock.dump', 'copia_mock'), /inyectad/);
  await assert.rejects(
    () =>
      modulo.restaurarNode('mock.dump', 'copia_mock', {
        ...restauracionMock(),
        baseAdministrativa: undefined,
      }),
    /administrativa/,
  );
});
test('M10.3 error SQL o catálogo inesperado impide la carga', async () => {
  for (const enCatalogo of [false, true]) {
    const ops = restauracionMock();
    const sqlOriginal = ops.sql;
    ops.sql = async (base, consulta) => {
      if (!enCatalogo || consulta.startsWith('DO $')) throw new Error('GUARDA MOCK FALLÓ');
      return sqlOriginal(base, consulta);
    };
    await assert.rejects(() => modulo.restaurarNode('mock.dump', 'copia_mock', ops), /GUARDA MOCK/);
    assert.ok(!ops.llamadas.some((c) => c[0] === 'cargar'));
  }
});
test('M10.3 preparación requiere base recién creada, semillas exactas y cero otros datos', () => {
  const sql = modulo.sqlPrepararDestino('0021');
  assert.match(sql, /activada_en/);
  assert.match(sql, /activada_por/);
  assert.match(sql, /IS DISTINCT FROM/);
  assert.match(sql, /pg_class/);
  assert.match(sql, /LOCK TABLE/);
  assert.match(sql, /DELETE FROM public.categoria/);
  assert.doesNotMatch(sql, /CASCADE|TRUNCATE|DROP/i);
  assert.doesNotMatch(modulo.sqlPrepararDestino('0019'), /DELETE FROM/);
});

test('M10.3 motor aislado: catálogo exacto, cambios de configuración y errores revierten íntegros', async () => {
  const require = createRequire(new URL('../packages/db/package.json', import.meta.url));
  const { PGlite } = require('@electric-sql/pglite');
  const db = new PGlite(); // WASM en memoria; ningún PostgreSQL/Docker/red real
  try {
    await db.exec(`CREATE SCHEMA geo;
      CREATE TABLE _migraciones(nombre text); INSERT INTO _migraciones VALUES ('0021_mock.sql');
      CREATE TABLE usuario(id text); CREATE TABLE configuracion(valor text);
      CREATE TABLE geo.spatial_ref_sys(id integer);
      CREATE TABLE categoria(slug text PRIMARY KEY,activa boolean,orden smallint,activada_en timestamptz,activada_por uuid);
      INSERT INTO categoria VALUES ('inundacion',true,1,NULL,NULL),('bache',false,2,NULL,NULL),('area_verde',false,3,NULL,NULL),('basura',false,4,NULL,NULL);`);
    const semillas = (await db.query('SELECT * FROM categoria ORDER BY slug')).rows;
    // Ejecutar también el SQL literal que arma Bash: mismo oráculo sobre el motor aislado.
    const shell = readFileSync(new URL('../infra/respaldo/respaldo.sh', import.meta.url), 'utf8');
    const catalogoShell = shell.match(/catalogo=\$\(cat <<'SQL'\n([\s\S]*?)\nSQL/)[1];
    const plantillaShell = shell.match(/consulta=\$\(cat <<SQL\n([\s\S]*?)\nSQL/)[1];
    const consultaShell = plantillaShell
      .replaceAll('\\$', '$')
      .replaceAll('$version', '0021')
      .replaceAll(
        '$saltar',
        "IF t.nspname='public' AND t.relname='categoria' THEN CONTINUE; END IF;",
      )
      .replaceAll('$catalogo', catalogoShell);
    for (const consulta of [modulo.sqlPrepararDestino('0021'), consultaShell]) {
      for (const cambio of [
        "UPDATE categoria SET activa=true WHERE slug='bache'",
        "UPDATE categoria SET orden=9 WHERE slug='bache'",
        "UPDATE categoria SET activada_en=now() WHERE slug='bache'",
        "UPDATE categoria SET activada_por='00000000-0000-4000-8000-000000000001' WHERE slug='bache'",
        "DELETE FROM categoria WHERE slug='basura'",
        "INSERT INTO categoria VALUES ('extra',false,9,NULL,NULL)",
        "INSERT INTO usuario VALUES ('sintetico')",
        "INSERT INTO configuracion VALUES ('no_vaciar')",
        'INSERT INTO geo.spatial_ref_sys VALUES (1)',
      ]) {
        await db.exec('BEGIN');
        try {
          await db.exec(cambio);
          const antes = (await db.query('SELECT * FROM categoria ORDER BY slug')).rows;
          await db.exec('SAVEPOINT guarda');
          await assert.rejects(() => db.exec(consulta), /inesperado|contiene datos/);
          await db.exec('ROLLBACK TO SAVEPOINT guarda');
          assert.deepEqual((await db.query('SELECT * FROM categoria ORDER BY slug')).rows, antes);
        } finally {
          await db.exec('ROLLBACK');
        }
        assert.deepEqual((await db.query('SELECT * FROM categoria ORDER BY slug')).rows, semillas);
      }
      await db.exec('BEGIN');
      await db.exec(consulta);
      assert.deepEqual((await db.query('SELECT * FROM categoria')).rows, []);
      await assert.rejects(() => db.exec(consulta), /inesperado/);
      await db.exec('ROLLBACK');
    }
  } finally {
    await db.close();
  }
});

// Criterios0022 preparados para la próxima cesión del heavy. No son resultados ejecutados.
// El sobre nuevo no modifica el blob que sellaron los consumidores19/21.
test('M10 final: blob21 conserva claves, orden y hashes legados sin sobre añadido', async () => {
  const f = banco();
  const s = await modulo.snapshot('origen_mock', { sql: f.sql });
  const esperado = {
    migracion: '0021_sintetica.sql',
    version: 21,
    tabla: 'reporte',
    columnas,
    categorias: evidencia(datos, columnas),
    conteos: {
      unidades_vecinales: '4',
      capas_vigentes: '4',
      usuarios: '4',
      fotos: '4',
      auditoria: '4',
      migraciones: '21',
      indices_reporte: '21',
      puntos_criticos: '4',
      reportes: '4',
      publicables: '4',
      con_geom_publico: '4',
      geometrias_invalidas: '0',
    },
    catalogo: createHash('sha256').update('catalogo-sintetico').digest('hex'),
  };
  assert.equal(JSON.stringify(s), JSON.stringify(esperado));
  assert.equal(
    createHash('sha256').update(JSON.stringify(s)).digest('hex'),
    createHash('sha256').update(JSON.stringify(esperado)).digest('hex'),
  );
});

const shaCriterio = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const camposRetirados = [
  'profundidad_estimada',
  'frecuencia',
  'causa_presunta',
  'sumidero_cercano',
  'sumidero_estado',
  'agua_brota_sumidero',
];
const indiceComun = {
  tabla: 'public.reporte',
  metodo: 'btree',
  columnas: ['creado_en'],
  predicado: null,
  unico: false,
  valido: true,
};
const fkFoto = {
  tabla: 'public.reporte_foto',
  columnas: ['reporte_id'],
  referencia: 'public.reporte',
  referenciadas: ['id'],
  onDelete: 'CASCADE',
  onUpdate: 'NO ACTION',
  match: 'SIMPLE',
};
const filasLogicas = ['inundacion', 'bache', 'basura', 'area_verde'].map((categoria, i) => ({
  id: `fixture-${i}`,
  categoria,
  subtipo: null,
  detalle_version: 1,
  detalle:
    categoria === 'inundacion'
      ? {
          profundidad_estimada: 'rodilla',
          frecuencia: 'ocasional',
          causa_presunta: 'desconocida',
          agua_brota_sumidero: false,
        }
      : { respuesta: i, opcional: null, falso: false },
  descripcion: 'fixture independiente',
  geom: `0101-${i}`,
  publicar_en: '2026-10-29T00:00:00Z',
}));
const cuotaLogica = [
  {
    usuario_id: 'fixture-usuario',
    dia: '2026-10-29',
    reportes_n: 2,
    fotos_n: 4,
    actualizado_en: '2026-10-29T00:00:00Z',
  },
];
function sobreCriterio(version, filas = filasLogicas) {
  const archivo = { filas: '1', huella: shaCriterio(cuotaLogica) };
  return {
    perfil: 'm10-contraccion-v1',
    version,
    migracion: version === 22 ? '0022_contraccion_compatible.sql' : `00${version}_fixture.sql`,
    esquema: {
      tabla: version === 19 ? 'public.reporte_inundacion' : 'public.reporte',
      columnas: [
        'id',
        'descripcion',
        'geom',
        'publicar_en',
        ...(version < 22 ? camposRetirados : []),
        ...(version >= 20 ? ['categoria', 'subtipo', 'detalle', 'detalle_version'] : []),
      ],
      indices: [structuredClone(indiceComun)],
      fks: [structuredClone(fkFoto)],
      garantias:
        version === 22 ? ['m10_0022_detalle_version_v1', 'm10_0022_inundacion_detalle_v1'] : [],
      archivo:
        version === 22
          ? {
              propietario: 'fixture_owner',
              privilegiosAjenos: [],
              columnas: Object.keys(cuotaLogica[0]),
              pk: ['usuario_id', 'dia'],
              fks: [],
            }
          : null,
    },
    // El hash crudo cambia de forma legítima con el esquema. No se confunde con el lógico.
    crudo: { reportes: shaCriterio({ version, filas }), cuota: structuredClone(archivo) },
    logico: {
      categorias: evidencia(filas, Object.keys(filas[0])),
      catalogo: shaCriterio(['inundacion', 'bache', 'basura', 'area_verde']),
      cuota: archivo,
      auxiliares: [
        'public.usuario',
        'public.reporte_foto',
        'public.auditoria',
        'public.idempotencia',
        'public.sesion',
        'public.cupo_contador',
        'public.punto_critico',
        'geo.capa_version',
      ].map((tabla) => ({ tabla, filas: '1', huella: shaCriterio([tabla, 'fila-completa']) })),
    },
    integridad: { fkHuerfanas: [], geometriasInvalidas: '0' },
  };
}
test('M10 final: comparación22 exige sobre separado y admite crudo distinto con lógica íntegra', () => {
  assert.equal(typeof modulo.compararSnapshotsContraccion, 'function');
  const a = sobreCriterio(21);
  const b = sobreCriterio(22);
  assert.notEqual(a.crudo.reportes, b.crudo.reportes);
  assert.equal(modulo.compararSnapshotsContraccion(a, b), true);
  assert.equal(modulo.compararSnapshotsContraccion(b, structuredClone(b)), true);
});
test('M10 final:19→22 conserva todo el reporte lógico reconstruido desde seis campos', () => {
  const soloInundacion = filasLogicas.filter((r) => r.categoria === 'inundacion');
  assert.equal(
    modulo.compararSnapshotsContraccion(
      sobreCriterio(19, soloInundacion),
      sobreCriterio(22, soloInundacion),
    ),
    true,
  );
});
for (const categoria of ['inundacion', 'bache', 'basura', 'area_verde']) {
  test(`M10 final: sobre22 rechaza pérdida exclusiva de ${categoria}`, () => {
    const a = sobreCriterio(21);
    const b = sobreCriterio(
      22,
      filasLogicas.filter((r) => r.categoria !== categoria),
    );
    assert.equal(modulo.compararSnapshotsContraccion(a, b), false);
  });
}
for (const campo of [
  'descripcion',
  'geom',
  'publicar_en',
  'detalle',
  'detalle_version',
  'subtipo',
]) {
  test(`M10 final: sobre22 detecta cambio de ${campo} sin variar conteo`, () => {
    const filas = structuredClone(filasLogicas);
    filas[2][campo] =
      campo === 'detalle'
        ? { respuesta: 2, falso: true }
        : campo === 'detalle_version'
          ? 2
          : 'alterado';
    assert.equal(
      modulo.compararSnapshotsContraccion(sobreCriterio(21), sobreCriterio(22, filas)),
      false,
    );
  });
}
test('M10 final: opcional ausente, JSON null y false no se colapsan al comparar', () => {
  for (const valor of [null, undefined, 'false']) {
    const filas = structuredClone(filasLogicas);
    if (valor === undefined) delete filas[0].detalle.agua_brota_sumidero;
    else filas[0].detalle.agua_brota_sumidero = valor;
    assert.equal(
      modulo.compararSnapshotsContraccion(sobreCriterio(21), sobreCriterio(22, filas)),
      false,
    );
  }
});
test('M10 final: archivo requiere cinco valores, PK, dueño exclusivo y ninguna FK a usuario', () => {
  const mutaciones = [
    (s) => {
      s.logico.cuota.huella = shaCriterio('otra cuota');
    },
    (s) => {
      s.esquema.archivo = null;
    },
    (s) => {
      s.esquema.archivo.columnas.pop();
    },
    (s) => {
      s.esquema.archivo.pk = ['usuario_id'];
    },
    (s) => {
      s.esquema.archivo.privilegiosAjenos = ['curichi_api:SELECT'];
    },
    (s) => {
      s.esquema.archivo.fks = [{ referencia: 'public.usuario' }];
    },
  ];
  for (const mutar of mutaciones) {
    const b = sobreCriterio(22);
    mutar(b);
    assert.equal(modulo.compararSnapshotsContraccion(sobreCriterio(21), b), false);
  }
});
test('M10 final: perder o cambiar una fila auxiliar con igual total global se rechaza', () => {
  for (const [i] of sobreCriterio(22).logico.auxiliares.entries()) {
    const b = sobreCriterio(22);
    b.logico.auxiliares[i].huella = shaCriterio('fila ajena sustituida');
    assert.equal(modulo.compararSnapshotsContraccion(sobreCriterio(21), b), false);
  }
});
test('M10 final: FK efectivas y definición de índices; mismo conteo no demuestra integridad', () => {
  for (const mutar of [
    (s) => {
      s.integridad.fkHuerfanas = ['public.reporte_foto.reporte_id'];
    },
    (s) => {
      s.esquema.fks[0].onDelete = 'SET NULL';
    },
    (s) => {
      s.esquema.indices[0].columnas = ['actualizado_en'];
    },
    (s) => {
      s.esquema.indices[0].valido = false;
    },
    (s) => {
      s.integridad.geometriasInvalidas = '1';
    },
    (s) => {
      s.esquema.garantias.pop();
    },
  ]) {
    const b = sobreCriterio(22);
    mutar(b);
    assert.equal(modulo.compararSnapshotsContraccion(sobreCriterio(21), b), false);
  }
});
test('M10 final: índice de campo retirado no obliga a conservar un conteo expansivo', () => {
  const a = sobreCriterio(21);
  a.esquema.indices.push({ ...indiceComun, columnas: ['profundidad_estimada'] });
  assert.equal(modulo.compararSnapshotsContraccion(a, sobreCriterio(22)), true);
});
test('P5-01: PK con tercera clave y PK con INCLUDE no son equivalentes con las mismas filas', () => {
  const a = sobreCriterio(22);
  a.esquema.indices.push({
    tabla: 'public.cupo_contador',
    metodo: 'btree',
    columnas: ['usuario_id', 'clave', 'ventana_inicio'],
    claves: 3,
    orden: [0, 0, 0],
    nullsNoDistintos: false,
    predicado: null,
    unico: true,
    valido: true,
    definicion: 'USING btree (usuario_id, clave, ventana_inicio)',
  });
  const b = structuredClone(a);
  Object.assign(b.esquema.indices[1], {
    claves: 2,
    orden: [0, 0],
    definicion: 'USING btree (usuario_id, clave) INCLUDE (ventana_inicio)',
  });
  assert.deepEqual(a.logico, b.logico, 'mismas filas, cuota, categorías y auxiliares');
  assert.deepEqual(a.esquema.indices[1].columnas, b.esquema.indices[1].columnas);
  assert.equal(modulo.compararSnapshotsContraccion(a, b), false);
  assert.equal(modulo.compararSnapshotsContraccion(a, b, { exacta: true }), false);
});
test('M10 final: perder columna común, perfil o versión soportada no se oculta por intersección', () => {
  for (const mutar of [
    (s) => {
      s.esquema.columnas = s.esquema.columnas.filter((c) => c !== 'descripcion');
    },
    (s) => {
      s.esquema.columnas.push('columna_inesperada');
    },
    (s) => {
      s.perfil = 'desconocido';
    },
    (s) => {
      s.version = 23;
    },
  ]) {
    const b = sobreCriterio(22);
    mutar(b);
    assert.equal(modulo.compararSnapshotsContraccion(sobreCriterio(21), b), false);
  }
});
test('M10 final: preparación22 inspecciona también archivo restringido aun vacío', () => {
  assert.match(modulo.sqlPrepararDestino('0022'), /resguardo_m10/);
  assert.match(modulo.sqlPrepararDestino('0022'), /cuota_reporte_diaria/);
  assert.doesNotMatch(modulo.sqlPrepararDestino('0022'), /DROP|TRUNCATE|CASCADE/i);
});
test('M10 final: upgrade22 exige consentimiento explícito sin tocar el destino', async () => {
  const ops = { ...restauracionMock(), objetivo: '0022', validarCarga: async () => {} };
  await assert.rejects(
    () => modulo.restaurarNode('mock.dump', 'copia_mock', ops),
    /consentimiento|autorizar-contraccion/,
  );
  assert.deepEqual(ops.llamadas, []);
});
test('M10 final: datos y FK se validan en versión del dump ANTES del upgrade', async () => {
  const ops = {
    ...restauracionMock(),
    objetivo: '0022',
    autorizarContraccionCompatible: true,
    validarCarga: async (_archivo, _destino, version) => {
      assert.equal(version, '0021');
      throw Error('FK_DUMP_INVALIDA');
    },
  };
  await assert.rejects(
    () => modulo.restaurarNode('mock.dump', 'copia_mock', ops),
    /FK_DUMP_INVALIDA/,
  );
  assert.equal(ops.llamadas.filter((c) => c[0] === 'migrar').length, 1);
  assert.ok(ops.llamadas.some((c) => c[0] === 'cargar'));
});

// El oráculo SQL usa las migraciones literales, no blobs simulados que inventen un22 expansivo.
for (const origen of [19, 21]) {
  test(`M10 captura: SQL real en memoria ${origen}→22 y recuperación conserva dominio/auxiliares`, {
    timeout: 120000,
  }, async () => {
    const require = createRequire(new URL('../packages/db/package.json', import.meta.url));
    const { PGlite } = require('@electric-sql/pglite');
    const { postgis } = require('@electric-sql/pglite-postgis');
    const db = await PGlite.create({ dataDir: 'memory://', extensions: { postgis } });
    const dir = new URL('../packages/db/migraciones/', import.meta.url);
    const migraciones = readdirSync(dir)
      .filter((n) => /^\d{4}_.+\.sql$/.test(n))
      .sort();
    const aplicar = async (desde, hasta) => {
      for (const n of migraciones.filter(
        (n) => Number(n.slice(0, 4)) > desde && Number(n.slice(0, 4)) <= hasta,
      )) {
        await db.exec('BEGIN');
        if (n.startsWith('0022_')) {
          await db.exec("SET LOCAL curichi.autorizar_contraccion_compatible='si'");
          await db.query(
            "SELECT set_config('curichi.autorizar_contraccion_compatible_tx',txid_current()::text,true)",
          );
        }
        await db.exec(readFileSync(new URL(n, dir), 'utf8'));
        await db.query('INSERT INTO _migraciones(nombre) VALUES ($1)', [n]);
        await db.exec('COMMIT');
      }
    };
    const sql = async (_base, q) => {
      const lexico = q.replace(/'(?:''|[^'])*'|--[^\r\n]*|\/\*[\s\S]*?\*\//g, ' ');
      assert.match(lexico, /^\s*SELECT\b/i);
      assert.doesNotMatch(lexico, /\b(?:INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)\b/i);
      const r = await db.query(q);
      assert.equal(r.rows.length, 1);
      const v = Object.values(r.rows[0])[0];
      return v === true ? 't' : v === false ? 'f' : String(v ?? '');
    };
    try {
      await db.exec(
        'CREATE TABLE _migraciones(nombre text PRIMARY KEY,aplicada_en timestamptz NOT NULL DEFAULT now())',
      );
      await aplicar(0, origen);
      await db.exec(
        "INSERT INTO usuario(id,email,nombre,rol,password_hash) VALUES ('10000000-0000-4000-8000-000000000001','fixture@invalid.test','Sintética','ciudadano','sin-uso')",
      );
      await db.exec(`INSERT INTO geo.capa_version(capa,version,vigente) VALUES
        ('distrito_municipal','fixture_p5',true),('unidad_vecinal','fixture_p5',true);
        INSERT INTO geo.distrito_municipal(id,codigo,nombre,geom,version_capa) VALUES
        ('distrito_municipal:1','1','Distrito sintético',ST_Multi(ST_MakeEnvelope(-63.18,-17.79,-63.16,-17.77,4326)),'fixture_p5');
        INSERT INTO geo.unidad_vecinal(id,codigo,nombre,geom,version_capa,distrito_id) VALUES
        ('unidad_vecinal:1','1','UV sintética',ST_Multi(ST_MakeEnvelope(-63.18,-17.79,-63.16,-17.77,4326)),'fixture_p5','distrito_municipal:1');`);
      const tabla = origen === 19 ? 'reporte_inundacion' : 'reporte';
      const agua = {
        profundidad_estimada: 'rodilla',
        frecuencia: 'ocasional',
        causa_presunta: 'desconocida',
        agua_brota_sumidero: false,
      };
      for (const categoria of origen === 19
        ? ['inundacion']
        : ['inundacion', 'bache', 'basura', 'area_verde']) {
        const detalle =
          categoria === 'inundacion'
            ? agua
            : { falso: false, opcional: null, extra: { contenido: 'íntegro' } };
        await db.query(
          `INSERT INTO ${tabla}(geom,geom_publico,descripcion,ubicacion_metodo,ubicacion_tipo,distrito_id,unidad_vecinal_id,version_capa,creado_en,actualizado_en,publicar_en,
          profundidad_estimada,frecuencia,causa_presunta,agua_brota_sumidero,
          severidad_calculada,severidad_puntaje,severidad_version,autor_id${origen === 21 ? ',categoria,detalle,detalle_version,subtipo' : ''})
          VALUES (ST_SetSRID(ST_MakePoint(-63.17,-17.78),4326),ST_SetSRID(ST_MakePoint(-63.17,-17.78),4326),
          'Descripción sintética íntegra','manual','via_publica','distrito_municipal:1','unidad_vecinal:1','fixture_p5',
          '2026-10-29T00:00:00Z','2026-10-29T00:00:00Z','2026-10-29T00:00:00Z',$1,$2,$3,$4,'media',6,$5,
          '10000000-0000-4000-8000-000000000001'${origen === 21 ? ',$6,$7::jsonb,1,$8' : ''})`,
          [
            ...(categoria === 'inundacion'
              ? ['rodilla', 'ocasional', 'desconocida', false, 2]
              : [null, null, null, null, 1]),
            ...(origen === 21
              ? [categoria, JSON.stringify(detalle), categoria === 'inundacion' ? null : 'fixture']
              : []),
          ],
        );
      }
      await db.exec(
        "INSERT INTO cuota_reporte_diaria(usuario_id,dia,reportes_n,fotos_n) VALUES ('10000000-0000-4000-8000-000000000001','2026-10-29',2,4)",
      );
      const antes = await modulo.snapshotContraccion('fixture', { sql });
      await aplicar(origen, 22);
      const despues = await modulo.snapshotContraccion('fixture', { sql });
      const conserva = modulo.compararSnapshotsContraccion(antes, despues);
      if (!conserva)
        fs.writeFileSync(
          `${process.env.TMPDIR}/captura-${origen}-comparacion.json`,
          JSON.stringify({ antes, despues }, null, 2),
        );
      assert.equal(conserva, true);
      assert.notEqual(antes.crudo.reportes, despues.crudo.reportes);
      // Roles predefinidos NOLOGIN sin miembros no son ACL concedidas al archivo. Una
      // cuenta que los hereda sí tiene acceso efectivo y debe hacer fallar el certificado.
      for (const concesion of [
        'CREATE ROLE curichi_api; GRANT USAGE ON SCHEMA resguardo_m10 TO curichi_api; GRANT SELECT ON resguardo_m10.cuota_reporte_diaria TO curichi_api',
        'CREATE ROLE curichi_geo; GRANT SELECT(usuario_id) ON resguardo_m10.cuota_reporte_diaria TO curichi_geo',
        'GRANT SELECT ON resguardo_m10.cuota_reporte_diaria TO PUBLIC',
        'GRANT USAGE ON SCHEMA resguardo_m10 TO PUBLIC',
        'CREATE ROLE lector_fixture LOGIN; GRANT pg_read_all_data TO lector_fixture',
      ]) {
        await db.exec('BEGIN');
        try {
          await db.exec(concesion);
          await assert.rejects(
            () => modulo.snapshotContraccion('fixture', { sql }),
            /exclusivo|evidencia incompleta|integridad|esquema22 incompleto/,
          );
        } finally {
          await db.exec('ROLLBACK');
        }
      }
      for (const cambio of [
        "UPDATE reporte SET descripcion='Alterada sin cambiar conteos'",
        "UPDATE reporte SET detalle=detalle||'{\"agua_brota_sumidero\":true}'::jsonb WHERE categoria='inundacion'",
        'UPDATE resguardo_m10.cuota_reporte_diaria SET fotos_n=fotos_n+1',
        "UPDATE usuario SET nombre='Auxiliar cambiado'",
      ]) {
        await db.exec('BEGIN');
        try {
          await db.exec(cambio);
          assert.equal(
            modulo.compararSnapshotsContraccion(
              antes,
              await modulo.snapshotContraccion('fixture', { sql }),
            ),
            false,
          );
        } finally {
          await db.exec('ROLLBACK');
        }
      }
      await db.exec(
        readFileSync(new URL('reversas/0022_contraccion_compatible_reversa.sql', dir), 'utf8'),
      );
      const reexpandida = await modulo.snapshotContraccion('fixture', { sql });
      assert.ok(reexpandida.esquema.archivo, 'el dump21 reexpandido conserva archivo por separado');
      assert.equal(
        modulo.compararSnapshotsContraccion(despues, reexpandida, { recuperacion: true }),
        true,
      );
      await aplicar(21, 22);
      assert.equal(
        modulo.compararSnapshotsContraccion(
          despues,
          await modulo.snapshotContraccion('fixture', { sql }),
        ),
        true,
      );
    } finally {
      await db.close();
    }
  });
}

test('M10 captura:22 no se respalda sin evidencia/bytes inyectados ni admite versión futura', async () => {
  for (const version of ['0022_contraccion_compatible.sql', '0023_futura.sql']) {
    const llamadas = [];
    await assert.rejects(
      () =>
        modulo.respaldarNode('fixture', 'fixture.dump', {
          sql: async () => version,
          volcar: async () => llamadas.push('volcar'),
          anotar: async () => llamadas.push('anotar'),
        }),
      /inyect|soportad/,
    );
    assert.deepEqual(llamadas, []);
  }
});
