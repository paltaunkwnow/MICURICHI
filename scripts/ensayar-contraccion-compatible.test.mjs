import assert from 'node:assert/strict';
import * as procesos from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import * as net from 'node:net';
import test from 'node:test';
import * as tls from 'node:tls';

// Barreras anteriores al import. Ningún test usa un adaptador PostgreSQL/Docker/HTTP real.
const bloqueado = () => {
  throw Error('OPERADOR_REAL_BLOQUEADO');
};
for (const nombre of ['exec', 'execFile', 'spawn', 'fork', 'execSync', 'execFileSync', 'spawnSync'])
  procesos.default[nombre] = bloqueado;
net.default.connect =
  net.default.createConnection =
  net.default.Socket.prototype.connect =
    bloqueado;
tls.default.connect = bloqueado;
globalThis.fetch = bloqueado;
const leer = fs.default.readFileSync;
fs.default.readFileSync = (ruta, ...args) => {
  assert.doesNotMatch(String(ruta), /(?:^|[/\\])(?:\.env|secret\.env)$/);
  return leer(ruta, ...args);
};
syncBuiltinESMExports();

// El módulo de producción se crea DESPUÉS del rojo. Su ausencia también queda como FAIL.
const modulo = () => import('./ensayar-contraccion-compatible.mjs');
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const planFixture = () => ({
  version: 1,
  corrida: 'fixture_20261029',
  bancos: ['origen19', 'origen21', 'copia19', 'copia21', 'origen22', 'copia22'].map(
    (sufijo) => `curichi_sdd_m10c_fixture_20261029_${sufijo}`,
  ),
  release21: {
    version: 21,
    manifiestoSha256: sha('release21'),
    dependenciasSha256: sha('grafo21'),
  },
  release22: {
    version: 22,
    manifiestoSha256: sha('release22'),
    dependenciasSha256: sha('grafo22'),
  },
});
function fixture(adicional = {}) {
  const llamadas = [];
  let guardados = 0;
  const plan = planFixture();
  const identidades = new Map(
    plan.bancos.map((nombre, i) => [
      nombre,
      {
        nombre,
        oid: String(7000 + i),
        servidor: 'servidor-fixture',
        propietario: 'fixture_owner',
        marca: plan.corrida,
      },
    ]),
  );
  return {
    plan,
    llamadas,
    identidades,
    guardados: () => guardados,
    opciones: {
      plan,
      guardar: async () => {
        guardados++;
      },
      adaptador: {
        ocupada: async (nombre) => {
          llamadas.push(['ocupada', nombre]);
          return false;
        },
        identidad: async (nombre) => structuredClone(identidades.get(nombre)),
        ejecutar: async (operacion, datos) => {
          llamadas.push([operacion, structuredClone(datos)]);
          return { verificado: true, sha256: sha([operacion, datos]) };
        },
        verificarRelease: async (version) => ({
          version,
          dependenciasVerificadas: true,
          sha256: sha(`grafo${version}`),
        }),
        ...adicional,
      },
    },
  };
}
test('M10 ensayo: importación no imprime, opera ni cambia exitCode', async () => {
  const anterior = process.exitCode;
  const imprimir = console.log;
  const salida = [];
  console.log = (...args) => salida.push(args);
  try {
    await modulo();
  } finally {
    console.log = imprimir;
  }
  assert.equal(process.exitCode, anterior);
  assert.deepEqual(salida, []);
});
test('M10 ensayo: sin adaptador nunca cae a un operador real', async () => {
  const m = await modulo();
  assert.throws(
    () => m.crearEnsayo({ plan: planFixture(), guardar: async () => {} }),
    /inyect|adaptador/,
  );
});
test('M10 ensayo: nombres protegidos y bancos históricos se rechazan antes de cualquier operador', async () => {
  const m = await modulo();
  for (const nombre of [
    'curichi',
    'curichi_revision',
    'postgres',
    'template1',
    'curichi_e2e',
    'curichi_multitematica',
    'curichi_sdd_m9_20261025',
    'curichi_sdd_m10_20261027_actual',
  ]) {
    const f = fixture();
    f.plan.bancos[0] = nombre;
    assert.throws(() => m.crearEnsayo(f.opciones), /nombre|banco|proteg|plan/);
    assert.deepEqual(f.llamadas, []);
  }
});
test('M10 ensayo: corrida, duplicados y traversal no permiten elegir otro destino', async () => {
  const m = await modulo();
  for (const mutar of [
    (p) => {
      p.corrida = '../ajeno';
    },
    (p) => {
      p.bancos[1] = p.bancos[0];
    },
    (p) => {
      p.bancos[0] += ';CREATE';
    },
    (p) => {
      p.bancos[0] = 'curichi_sdd_m10c_otra_corrida_origen21';
    },
  ]) {
    const f = fixture();
    mutar(f.plan);
    assert.throws(() => m.crearEnsayo(f.opciones), /nombre|banco|corrida|plan|duplic/);
    assert.deepEqual(f.llamadas, []);
  }
});
test('M10 ensayo: destino ocupado no se adopta, borra ni reemplaza', async () => {
  const m = await modulo();
  const f = fixture({ ocupada: async () => true });
  await assert.rejects(() => m.crearEnsayo(f.opciones).ejecutarEtapa('preflight'), /ocupad|existe/);
  assert.ok(!f.llamadas.some(([tipo]) => /crear|migrar|borrar|DROP/i.test(tipo)));
});
test('M10 ensayo: consentimiento ausente o heredado no permite0022', async () => {
  const m = await modulo();
  for (const permiso of [undefined, false, 'si']) {
    const f = fixture();
    const ensayo = m.crearEnsayo({
      ...f.opciones,
      autorizarContraccionCompatible: permiso,
      entornoHeredado: { PGOPTIONS: '-c curichi.autorizar_contraccion_compatible=si' },
    });
    await assert.rejects(() => ensayo.ejecutarEtapa('migrar22'), /consent|autorizar|etapa/);
    assert.ok(!f.llamadas.some(([tipo]) => tipo === 'migrar22'));
  }
});
test('M10 ensayo: diario alterado no se reanuda ni se resella silenciosamente', async () => {
  const m = await modulo();
  const f = fixture();
  const diario = m.nuevoDiario(f.plan);
  diario.planSha256 = '0'.repeat(64);
  assert.throws(() => m.crearEnsayo({ ...f.opciones, diario }), /sello|hash|alterad|plan/);
  assert.deepEqual(f.llamadas, []);
});
test('M10 ensayo: etapa incierta requiere reconciliación, nunca repetición automática', async () => {
  const m = await modulo();
  const f = fixture();
  const diario = m.nuevoDiario(f.plan);
  diario.etapas.migrar22 = { estado: 'incierta' };
  const ensayo = m.crearEnsayo({ ...f.opciones, diario, autorizarContraccionCompatible: true });
  await assert.rejects(() => ensayo.ejecutarEtapa('migrar22'), /inciert|reconcili|revisi/);
  assert.deepEqual(f.llamadas, []);
});
test('M10 ensayo: reporta release21 sin grafo aislado como NO_VERIFICADO_REAL', async () => {
  const m = await modulo();
  const f = fixture({
    verificarRelease: async () => ({ version: 21, dependenciasVerificadas: false }),
  });
  await assert.rejects(
    () => m.crearEnsayo(f.opciones).ejecutarEtapa('verificarRelease21'),
    /dependenc|release|NO_VERIFICADO_REAL/,
  );
  assert.ok(!f.llamadas.some(([tipo]) => /arrancar|POST|replay/i.test(tipo)));
});
test('M10 ensayo: bare import que resuelve DB22 invalida recuperación de código21', async () => {
  const m = await modulo();
  const f = fixture({
    verificarRelease: async () => ({
      version: 21,
      dependenciasVerificadas: true,
      dbResueltoVersion: 22,
      sha256: sha('dist21-con-db22'),
    }),
  });
  await assert.rejects(
    () => m.crearEnsayo(f.opciones).ejecutarEtapa('verificarRelease21'),
    /dependenc|release|versi/,
  );
  assert.ok(!f.llamadas.some(([tipo]) => /arrancar/i.test(tipo)));
});
test('M10 ensayo: huella canónica es estable por orden de claves y distingue NULL, ausencia y false', async () => {
  const m = await modulo();
  assert.equal(m.huellaCanonica({ a: 1, b: false }), m.huellaCanonica({ b: false, a: 1 }));
  assert.notEqual(m.huellaCanonica({ b: false }), m.huellaCanonica({ b: null }));
  assert.notEqual(m.huellaCanonica({}), m.huellaCanonica({ b: null }));
});
test('M10 ensayo: errores intermedios se conservan sin DROP ni limpieza de evidencia', async () => {
  const m = await modulo();
  const f = fixture({
    ejecutar: async () => {
      throw Error('FALLO_SINTETICO');
    },
  });
  const diario = m.nuevoDiario(f.plan);
  const ensayo = m.crearEnsayo({ ...f.opciones, diario, autorizarContraccionCompatible: true });
  await assert.rejects(() => ensayo.ejecutarEtapa('preflight'), /FALLO_SINTETICO/);
  assert.ok(f.guardados() > 0);
  assert.ok(!f.llamadas.some(([tipo]) => /DROP|limpiar|borrar/i.test(tipo)));
});

function releaseFixture(version) {
  const hashBytes = (b) => createHash('sha256').update(b).digest('hex');
  const contenido = new Map(
    ['db/index.js', 'api/index.js', 'runtime/node', 'runner/migrar.js'].map((ruta) => [
      ruta,
      Buffer.from(`sintético ${version} ${ruta}`),
    ]),
  );
  const archivos = [...contenido].map(([ruta, b]) => ({
    ruta,
    bytes: b.length,
    sha256: hashBytes(b),
  }));
  const modulo = (hacia, clase) => ({
    desde: 'api/index.js',
    hacia,
    clase,
    specifier: clase,
    sha256: archivos.find((f) => f.ruta === hacia).sha256,
  });
  const manifiesto = Buffer.from(JSON.stringify({ version: 1, release: version, archivos }));
  const grafo = Buffer.from(
    JSON.stringify({
      version: 1,
      release: version,
      modulos: [modulo('db/index.js', 'db')],
      runtime: modulo('runtime/node', 'runtime'),
      runner: modulo('runner/migrar.js', 'runner'),
    }),
  );
  contenido.set('manifiesto.json', manifiesto);
  contenido.set('dependencias.json', grafo);
  return {
    esperado: {
      version,
      manifiestoSha256: hashBytes(manifiesto),
      dependenciasSha256: hashBytes(grafo),
    },
    contenido,
    operadores: {
      leer: async (ruta) => contenido.get(ruta),
      resolver: async (m) => ({
        ruta: m.hacia,
        sha256: m.sha256,
        releaseAislado: version,
        versionEsquema: version,
      }),
    },
  };
}
test('M10 ensayo: acredita bytes de ambos manifiestos, archivos y resolución efectiva del grafo', async () => {
  const m = await modulo(),
    r = releaseFixture(21);
  const prueba = await m.acreditarRelease(21, r.esperado, r.operadores);
  assert.equal(prueba.manifiestoSha256, r.esperado.manifiestoSha256);
  assert.equal(prueba.sha256, r.esperado.dependenciasSha256);
  assert.equal(prueba.dbResueltoVersion, 21);
  assert.equal(prueba.comprobacion.archivosVerificados, 4);
});
for (const campo of [
  'manifiesto.json',
  'dependencias.json',
  'db/index.js',
  'runtime/node',
  'runner/migrar.js',
]) {
  test(`M10 ensayo: cambio de bytes en ${campo} impide acreditar release`, async () => {
    const m = await modulo(),
      r = releaseFixture(21);
    r.contenido.set(campo, Buffer.from('alterado'));
    await assert.rejects(() => m.acreditarRelease(21, r.esperado, r.operadores), /SHA|alterado/);
  });
}
test('M10 ensayo: omitir resolución DB/runner o resolver hacia checkout22 rechaza código21', async () => {
  const m = await modulo();
  for (const resolver of [
    async (x) => ({ ruta: x.hacia, sha256: x.sha256, releaseAislado: 21 }),
    async (x) => ({ ruta: x.hacia, sha256: x.sha256, releaseAislado: 22, versionEsquema: 22 }),
  ]) {
    const r = releaseFixture(21);
    await assert.rejects(
      () => m.acreditarRelease(21, r.esperado, { ...r.operadores, resolver }),
      /resolución|versión/,
    );
  }
});

const retirados = [
  'profundidad_estimada',
  'frecuencia',
  'causa_presunta',
  'sumidero_cercano',
  'sumidero_estado',
  'agua_brota_sumidero',
];
function sobre(version, categorias = ['inundacion', 'bache', 'basura', 'area_verde']) {
  const reportes = categorias.map((categoria, i) => ({
    id: `id-${i}`,
    categoria,
    huella: sha({ categoria, contenido: 'original completo' }),
  }));
  const cuota = { filas: '0', huella: sha([]) };
  const s = {
    perfil: 'm10-contraccion-v1',
    version,
    migracion: version === 22 ? '0022_contraccion_compatible.sql' : '0021_fixture.sql',
    esquema: {
      tabla: 'public.reporte',
      columnas: [
        'id',
        'descripcion',
        'categoria',
        'subtipo',
        'detalle',
        'detalle_version',
        ...(version < 22 ? retirados : []),
      ],
      indices: [
        {
          tabla: 'public.reporte',
          metodo: 'btree',
          columnas: ['id'],
          predicado: null,
          unico: true,
          valido: true,
        },
      ],
      fks: [],
      garantias:
        version === 22 ? ['m10_0022_detalle_version_v1', 'm10_0022_inundacion_detalle_v1'] : [],
      archivo:
        version === 22
          ? {
              propietario: 'fixture_owner',
              privilegiosAjenos: [],
              columnas: ['usuario_id', 'dia', 'reportes_n', 'fotos_n', 'actualizado_en'],
              pk: ['usuario_id', 'dia'],
              fks: [],
            }
          : null,
    },
    crudo: {
      reportes: sha([version, reportes]),
      cuota,
      cuotaArchivada: version === 22 ? cuota : null,
    },
    logico: {
      reportes,
      categorias: [],
      catalogo: sha('catálogo'),
      cuota,
      auxiliares: [{ tabla: 'public.usuario', filas: '1', huella: sha('fila completa') }],
    },
    integridad: { fkHuerfanas: [], geometriasInvalidas: '0' },
  };
  refrescar(s);
  if (version === 19) {
    s.migracion = '0019_fixture.sql';
    s.esquema.tabla = 'public.reporte_inundacion';
    s.esquema.columnas = s.esquema.columnas.filter(
      (c) => !['categoria', 'subtipo', 'detalle', 'detalle_version'].includes(c),
    );
  }
  return s;
}
function refrescar(s) {
  s.logico.categorias = [...new Set(s.logico.reportes.map((r) => r.categoria))]
    .sort()
    .map((categoria) => {
      const rows = s.logico.reportes.filter((r) => r.categoria === categoria);
      return { categoria, filas: String(rows.length), huella: sha(rows) };
    });
  s.crudo.reportes = sha([s.version, s.logico.reportes]);
}
function cambiarVersion(s, version) {
  const n = sobre(
    version,
    s.logico.reportes.map((r) => r.categoria),
  );
  n.logico = structuredClone(s.logico);
  n.esquema.archivo = structuredClone(s.esquema.archivo ?? sobre(22).esquema.archivo);
  n.crudo.cuotaArchivada = structuredClone(s.crudo.cuota);
  refrescar(n);
  return n;
}
async function ensayoCompleto(mutacion) {
  const m = await modulo(),
    f = fixture();
  const releases = new Map([21, 22].map((v) => [v, releaseFixture(v)]));
  for (const [v, r] of releases) f.plan[`release${v}`] = r.esperado;
  const existentes = new Set(),
    datos = new Map();
  let ultima;
  const control = { checkpointVigente: true, fallaEtapa: null };
  const nombre = (v, copia = false) =>
    `curichi_sdd_m10c_${f.plan.corrida}_${copia ? 'copia' : 'origen'}${v}`;
  const actuales = () =>
    Object.fromEntries(
      [19, 21, 22].map((v) => [nombre(v, true), structuredClone(datos.get(nombre(v, true)))]),
    );
  const ops = {
    ...f.opciones,
    autorizarContraccionCompatible: true,
    adaptador: {
      ocupada: async (n) => existentes.has(n),
      identidad: async (n) => {
        if (!existentes.has(n)) throw Error('OID_INEXISTENTE');
        return structuredClone(f.identidades.get(n));
      },
      verificarRelease: async (v) => {
        const r = releases.get(v);
        return m.acreditarRelease(v, r.esperado, r.operadores);
      },
      verificarCheckpoint: async (nombre) =>
        nombre !== 'verificarRelease21' || control.checkpointVigente,
      ejecutar: async (paso) => {
        ultima = paso;
        if (control.fallaEtapa === paso) throw Error('FALLO_PREVIO');
        const version = Number(paso.slice(-2));
        let extra = {};
        if (paso.startsWith('preparar')) {
          existentes.add(nombre(version));
          datos.set(nombre(version), sobre(version, version === 19 ? ['inundacion'] : undefined));
        }
        if (paso.startsWith('respaldar'))
          extra = {
            evidencia: structuredClone(datos.get(nombre(version))),
            dumpSha256: sha(`dump${version}`),
          };
        if (paso.startsWith('cargar')) {
          existentes.add(nombre(version, true));
          datos.set(nombre(version, true), structuredClone(datos.get(nombre(version))));
          extra = {
            evidencia: structuredClone(datos.get(nombre(version, true))),
            dumpSha256: sha(`dump${version}`),
          };
        }
        if (paso === 'migrar22')
          for (const v of [19, 21])
            datos.set(nombre(v, true), cambiarVersion(datos.get(nombre(v, true)), 22));
        if (paso.startsWith('probarPostReplay')) {
          const actual = datos.get(nombre(22, true));
          const nuevos = ['plano', 'categoria'].map((forma, i) => ({
            id: `nuevo-${version}-${i}`,
            categoria: 'inundacion',
            huella: sha([forma, version]),
            forma,
            postSha256: sha(['post', forma, version]),
            replaySha256: sha(['replay', forma, version]),
          }));
          actual.logico.reportes.push(
            ...nuevos.map(({ id, categoria, huella }) => ({ id, categoria, huella })),
          );
          refrescar(actual);
          extra = { [`esperado${version}`]: actuales(), [`aceptados${version}`]: nuevos };
        }
        if (paso === 'pausar22' && mutacion === 'perderPrevio') {
          const s = datos.get(nombre(22, true));
          s.logico.reportes[0].huella = sha('perdido');
          refrescar(s);
        }
        if (paso === 'reversa21') {
          datos.set(nombre(22, true), cambiarVersion(datos.get(nombre(22, true)), 21));
          if (mutacion === 'tocarOtra')
            datos.get(nombre(19, true)).logico.auxiliares[0].huella = sha('ajeno');
        }
        if (paso === 'reaplicar22')
          datos.set(nombre(22, true), cambiarVersion(datos.get(nombre(22, true)), 22));
        if (['verificar22', 'pausar22', 'verificar21', 'verificarReaplicacion22'].includes(paso))
          extra = { evidencias: actuales() };
        return { verificado: true, sha256: sha(paso), ...extra };
      },
    },
  };
  const ensayo = m.crearEnsayo(ops);
  const secuencia = [
    'preflight',
    'verificarRelease21',
    'verificarRelease22',
    'preparar19',
    'respaldar19',
    'cargar19',
    'preparar21',
    'respaldar21',
    'cargar21',
    'preparar22',
    'respaldar22',
    'cargar22',
    'verificarCarga',
    'migrar22',
    'verificar22',
    'probarPostReplay22',
    'pausar22',
    'reversa21',
    'verificar21',
    'seleccionarRelease21',
    'reconciliarEstado21',
    'probarPostReplay21',
    'reaplicar22',
    'verificarReaplicacion22',
  ];
  return {
    ensayo,
    secuencia,
    datos,
    nombre,
    ultima: () => ultima,
    existentes,
    control,
    opciones: ops,
  };
}
test('M10 ensayo: ciclo por fase no pide OID de copias inexistentes y recupera SOLOcopia22', async () => {
  const f = await ensayoCompleto();
  await f.ensayo.ejecutarEtapa('preflight');
  assert.equal(f.existentes.size, 0);
  // Reanudar preflight tampoco necesita OID de bancos todavía ausentes.
  await f.ensayo.ejecutarEtapa('preflight');
  for (const paso of f.secuencia.slice(1)) await f.ensayo.ejecutarEtapa(paso);
  const diario = f.ensayo.diario();
  assert.equal(diario.etapas.verificar21.evidencias[f.nombre(22, true)].version, 21);
  for (const v of [19, 21])
    assert.deepEqual(
      diario.etapas.verificar21.evidencias[f.nombre(v, true)],
      diario.etapas.verificar22.evidencias[f.nombre(v, true)],
    );
  assert.equal(f.datos.get(f.nombre(22, true)).version, 22);
  assert.equal(
    f.datos.get(f.nombre(22, true)).logico.reportes.length,
    8,
    '4 originales +2POST22 +2POST21',
  );
});
for (const mutacion of ['perderPrevio', 'tocarOtra']) {
  test(`M10 ensayo: oráculo independiente rechaza ${mutacion} durante pausa/recuperación`, async () => {
    const f = await ensayoCompleto(mutacion);
    await assert.rejects(async () => {
      for (const paso of f.secuencia) await f.ensayo.ejecutarEtapa(paso);
    }, /pérdida|quieta/);
    assert.ok(['pausar22', 'verificar21'].includes(f.ultima()));
    assert.equal(f.ensayo.diario().etapas[f.ultima()].estado, 'incierta');
  });
}
test('M10 ensayo: copia ocupada después de preflight sigue rechazada sin adoptar ni DROP', async () => {
  const f = await ensayoCompleto();
  for (const paso of ['preflight', 'verificarRelease21', 'preparar19', 'respaldar19'])
    await f.ensayo.ejecutarEtapa(paso);
  f.existentes.add(f.nombre(19, true));
  await assert.rejects(() => f.ensayo.ejecutarEtapa('cargar19'), /ocupada/);
  assert.equal(f.ultima(), 'respaldar19');
});
test('P5-02: release21 obsoleto bloquea reversa nueva antes de llamar al operador', async () => {
  const f = await ensayoCompleto();
  for (const paso of f.secuencia) {
    await f.ensayo.ejecutarEtapa(paso);
    if (paso === 'pausar22') break;
  }
  f.control.checkpointVigente = false;
  await assert.rejects(() => f.ensayo.ejecutarEtapa('reversa21'), /checkpoint|precondici|release/i);
  assert.equal(f.ultima(), 'pausar22', 'no se llama al operador reversa21');
});
test('P5-02: reconciliar incierta también revalida release/predecesoras antes del adaptador', async () => {
  const f = await ensayoCompleto();
  for (const paso of f.secuencia) {
    await f.ensayo.ejecutarEtapa(paso);
    if (paso === 'pausar22') break;
  }
  f.control.fallaEtapa = 'reversa21';
  await assert.rejects(() => f.ensayo.ejecutarEtapa('reversa21'), /FALLO_PREVIO/);
  f.control.checkpointVigente = false;
  let reconciliaciones = 0;
  f.opciones.adaptador.reconciliarEtapa = async () => {
    reconciliaciones++;
    return { verificado: true, sha256: sha('reconciliada') };
  };
  await assert.rejects(
    () => f.ensayo.reconciliarEtapa('reversa21'),
    /checkpoint|precondici|release/i,
  );
  assert.equal(reconciliaciones, 0);
  assert.equal(f.ensayo.diario().etapas.reversa21.estado, 'incierta');
});
