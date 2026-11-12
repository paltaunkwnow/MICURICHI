import assert from 'node:assert/strict';
import * as procesos from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { readFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import * as net from 'node:net';
import test from 'node:test';
import * as tls from 'node:tls';

// PREIMPORT: ningún test, aun en rojo, puede ejecutar un operador del host.
for (const nombre of [
  'exec',
  'execFile',
  'spawn',
  'fork',
  'execSync',
  'execFileSync',
  'spawnSync',
]) {
  procesos.default[nombre] = () => {
    throw new Error('OPERADOR REAL BLOQUEADO');
  };
}
const denegar = () => {
  throw new Error('RED REAL BLOQUEADA');
};
net.default.connect = net.default.createConnection = net.default.Socket.prototype.connect = denegar;
tls.default.connect = denegar;
globalThis.fetch = denegar;
const leerOriginal = fs.default.readFileSync;
fs.default.readFileSync = (ruta, ...args) => {
  assert.doesNotMatch(String(ruta), /(?:^|[/\\])\.env$/);
  return leerOriginal(ruta, ...args);
};
syncBuiltinESMExports();
let sut;
let errorImport;
try {
  sut = await import('./ensayar-respaldo-multitematico.mjs');
} catch (error) {
  errorImport = error;
}
const modulo = () => {
  assert.ifError(errorImport);
  return sut;
};
const huella = 'a'.repeat(64);
test('M10.3 runner importable sin ejecutar procesos ni SQL', () => {
  assert.equal(typeof modulo().ejecutarEtapa, 'function');
  assert.throws(() => procesos.spawn('docker'), /BLOQUEADO/);
});
test('M10.3 solo los cuatro nombres fijos; protegidas y nombres parecidos se rechazan', () => {
  const m = modulo();
  assert.equal(m.BASES.length, 4);
  for (const base of m.BASES) assert.equal(m.validarNombre(base), base);
  for (const base of [
    'curichi',
    'curichi_revision',
    'postgres',
    'curichi_e2e',
    'curichi_multitematica',
    'curichi_m9',
    'curichi_sdd_m10_20261027_otro',
    `${m.BASES[0]};SQL`,
  ])
    assert.throws(() => m.validarNombre(base));
});
test('M10.3 conexión estrictamente loopback y rol dueño permitido, sin query options', () => {
  const m = modulo();
  assert.doesNotThrow(() =>
    m.validarConexion('postgresql://curichi:sentinel@127.0.0.1:5432/template1'),
  );
  for (const url of [
    'postgresql://curichi:p@remote:5432/template1',
    'postgresql://curichi:p@127.0.0.1:5432/postgres',
    'postgresql://curichi_api:p@127.0.0.1:5432/template1',
    'postgresql://curichi:p@127.0.0.1:5432/template1?host=remote',
    'postgresql://curichi:p@127.0.0.1:5433/template1',
  ])
    assert.throws(() => m.validarConexion(url));
});
test('M10.3 rutas fijas rechazan traversal, absolutos y artefactos ajenos', () => {
  const m = modulo();
  assert.match(m.rutaArtefacto('actual.dump'), /implementador/);
  for (const ruta of ['../actual.dump', 'C:/fuera.dump', '.env', 'pre0020/otro', 'gpg/../../foo'])
    assert.throws(() => m.rutaArtefacto(ruta));
});
test('M10.3 estado puro no requiere SQL/credenciales ni crea diario', () => {
  const m = modulo();
  assert.equal(m.estado(null).estado, 'sin_iniciar');
  const d = m.nuevoDiario(huella);
  assert.equal(m.estado(d).siguiente, 'preflight');
  assert.deepEqual(d.etapas, {});
});
test('M10.3 etapas desconocidas, fuera de orden e inciertas nunca operan', async () => {
  const m = modulo();
  let llamadas = 0;
  const opciones = {
    diario: m.nuevoDiario(huella),
    guardar: async () => {},
    operar: async () => {
      llamadas++;
    },
    recursos: async () => {},
  };
  await assert.rejects(() => m.ejecutarEtapa('desconocida', opciones));
  await assert.rejects(() => m.ejecutarEtapa('sembrar_actual', opciones));
  opciones.diario.etapas.preflight = { estado: 'incierta' };
  await assert.rejects(() => m.ejecutarEtapa('preflight', opciones));
  assert.equal(llamadas, 0);
});
test('M10.3 checkpoint completo anterior a nueva guarda RAM; no repetición automática', async () => {
  const m = modulo();
  const d = m.nuevoDiario(huella);
  const secuencia = [];
  const opciones = {
    diario: d,
    guardar: async () => secuencia.push(d.etapas.preflight.estado),
    recursos: async () => secuencia.push('RAM'),
    operar: async () => {
      secuencia.push('operar');
      return { identidad: { oid: '42' }, sha256: huella };
    },
  };
  await m.ejecutarEtapa('preflight', opciones);
  assert.deepEqual(secuencia, ['iniciada', 'RAM', 'operar', 'completa']);
  assert.match(d.etapas.preflight.sha256, /^[a-f0-9]{64}$/);
  await assert.rejects(() => m.ejecutarEtapa('preflight', opciones), /repet|completa/);
});
test('M10.3 fallo deja etapa incierta durable y exige revisión manual', async () => {
  const m = modulo();
  const diario = m.nuevoDiario(huella);
  const estados = [];
  await assert.rejects(() =>
    m.ejecutarEtapa('preflight', {
      diario,
      guardar: async () => estados.push(diario.etapas.preflight.estado),
      recursos: async () => {},
      operar: async () => {
        throw new Error('credencial secreta que no debe persistir');
      },
    }),
  );
  assert.deepEqual(estados, ['iniciada', 'incierta']);
  assert.doesNotMatch(JSON.stringify(diario), /credencial secreta/);
});
test('M10.3 no hay fallback si faltan operadores/diario/freeze', async () => {
  const m = modulo();
  assert.throws(() => m.nuevoDiario('mal'));
  await assert.rejects(() => m.ejecutarEtapa('preflight', { diario: m.nuevoDiario(huella) }));
  assert.throws(() => m.estado({ version: 1, etapas: { extra: { estado: 'completa' } } }));
});
test('M10.3 banco existente exige identidad propia y OID exacto; nunca adopta por nombre', () => {
  const m = modulo();
  const nombre = m.BASES[0];
  const identidad = { nombre, oid: '42', dueno: 'curichi', servidor: '123' };
  assert.doesNotThrow(() => m.comprobarIdentidad(identidad, identidad));
  for (const otro of [
    null,
    { ...identidad, oid: '43' },
    { ...identidad, dueno: 'otro' },
    { ...identidad, servidor: '124' },
  ])
    assert.throws(() => m.comprobarIdentidad(identidad, otro));
});
test('M10.3 runner reutiliza respaldar/restaurar y verificador operativo sin shell arbitrario', () => {
  const m = modulo();
  assert.equal(typeof m.crearOperadores, 'function');
  const fuente = readFileSync(
    new URL('./ensayar-respaldo-multitematico.mjs', import.meta.url),
    'utf8',
  );
  assert.match(fuente, /restaurarNode/);
  assert.match(fuente, /respaldarNode/);
  assert.match(fuente, /verificar\(/);
  assert.doesNotMatch(fuente, /DROP DATABASE|['"]-c['"]|shell:\s*true/);
  assert.match(fuente, /passphrase-fd/);
  assert.match(fuente, /ROLLBACK/);
});

test('M10.3 fábrica sin adaptador nunca cae a operadores reales y preflight rechaza nombre ajeno', async () => {
  const m = modulo();
  const diario = m.nuevoDiario(huella);
  const opciones = {
    url: 'postgresql://curichi:sentinel@127.0.0.1:5432/template1',
    diario,
    guardar: async () => {},
  };
  assert.throws(() => m.crearOperadores(opciones), /adaptador/);
  const consultas = [];
  const operador = m.crearOperadores({
    ...opciones,
    adaptador: {
      comando: async (tipo) => {
        assert.equal(tipo, 'herramientas');
        return [];
      },
      consulta: async (base, sql) => {
        consultas.push([base, sql]);
        return { rows: [{ nombre: m.BASES[0], oid: '99' }] };
      },
      cerrar: async () => {},
    },
  });
  await assert.rejects(() => operador.ejecutar('preflight'), /existente sin diario/);
  assert.equal(consultas.length, 1);
  assert.equal(consultas[0][0], 'template1');
  assert.doesNotMatch(consultas[0][1], /CREATE|DROP|UPDATE|DELETE/);
});
test('M10.3 checkpoint alterado y diario iniciado rechazan reanudación', async () => {
  const m = modulo();
  const d = m.nuevoDiario(huella);
  await m.ejecutarEtapa('preflight', {
    diario: d,
    guardar: async () => {},
    recursos: async () => {},
    operar: async () => ({ version: 'fixture' }),
  });
  d.etapas.preflight.evidencia.version = 'alterada';
  assert.throws(() => m.estado(d), /alterado/);
  const iniciado = m.nuevoDiario(huella);
  iniciado.etapas.preflight = { estado: 'iniciada' };
  assert.equal(m.estado(iniciado).estado, 'revision_manual');
  await assert.rejects(() =>
    m.ejecutarEtapa('crear_actual', {
      diario: iniciado,
      guardar: async () => {},
      recursos: async () => {},
      operar: async () => assert.fail('no ejecutar'),
    }),
  );
});
test('M10.3 negativos verifican mutaciones dentro de la misma sesión y comparan rollback', async () => {
  const m = modulo();
  let transaccion = false;
  let mutacion = false;
  const consultas = [];
  const sql = async (base, texto) => {
    assert.equal(base, m.BASES[1]);
    consultas.push(texto);
    if (texto === 'BEGIN') {
      assert.equal(transaccion, false);
      transaccion = true;
    } else if (texto === 'ROLLBACK') {
      assert.equal(transaccion, true);
      transaccion = false;
      mutacion = false;
    } else {
      assert.equal(transaccion, true);
      if (/UPDATE|DELETE/.test(texto)) mutacion = true;
    }
    return mutacion ? 'mutado' : 'original';
  };
  let comparaciones = 0;
  const r = await m.negativosEnTransaccion('actual', {
    sql,
    comparar: async () => {
      assert.equal(transaccion, false);
      assert.equal(mutacion, false);
      comparaciones++;
      return { sha256: huella };
    },
    verificar: async (fuente, copia, opciones) => {
      assert.equal(fuente, m.BASES[0]);
      assert.equal(copia, m.BASES[1]);
      assert.equal(opciones.sql, sql);
      assert.equal(await opciones.sql(copia, 'SELECT fixture'), 'mutado');
      return false;
    },
  });
  assert.equal(comparaciones, 4);
  assert.deepEqual(
    consultas.filter((s) => ['BEGIN', 'ROLLBACK'].includes(s)),
    ['BEGIN', 'ROLLBACK', 'BEGIN', 'ROLLBACK'],
  );
  assert.ok(r.resultados.every((s) => s.detectado && s.antesSha256 === s.despuesSha256));
});
test('M10.3 negativos siempre hacen rollback si falla el verificador', async () => {
  const m = modulo();
  const consultas = [];
  await assert.rejects(
    () =>
      m.negativosEnTransaccion('pre0020', {
        sql: async (_base, s) => consultas.push(s),
        comparar: async () => ({}),
        verificar: async () => {
          throw new Error('SQL SINTETICO FALLÓ');
        },
      }),
    /SINTETICO/,
  );
  assert.equal(consultas.at(-1), 'ROLLBACK');
});

const hashFixture = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : JSON.stringify(v))
    .digest('hex');
function paqueteFixture() {
  const m = modulo();
  const freezeAnterior = '31e2e511fb44aa68caffddb2bae466e122959668d9bcd66e5fced927066d8a1f';
  const identidad = {
    nombre: m.BASES[0],
    oid: '205892',
    dueno: 'curichi',
    servidor: '7688456033622585387',
  };
  const dump = {
    bytes: 79005,
    sha256: '3794a55bc944c3bd47c2b8cfe54232ad3e8da288658ca93437395f70b2c80562',
  };
  const diarioOriginal = m.nuevoDiario(freezeAnterior);
  diarioOriginal.identidades[identidad.nombre] = identidad;
  const evidencias = [
    { rol: { servidor: identidad.servidor } },
    { identidad },
    { fixture: true },
    { ...dump },
  ];
  for (const [i, e] of m.ETAPAS.slice(0, 4).entries())
    diarioOriginal.etapas[e] = {
      estado: 'completa',
      evidencia: evidencias[i],
      sha256: hashFixture(evidencias[i]),
    };
  diarioOriginal.etapas.cifrar_actual = {
    estado: 'incierta',
    operadores: [
      { exit: 2, stderrSha256: 'a2aa5e9363fbf88f2e242492636f53d2a60d7135b33e37c1110c022e42251739' },
      { operador: 'GPG', exit: 0 },
    ],
  };
  return {
    freezeAnterior,
    freezeNuevo: 'b'.repeat(64),
    diarioSha256: '365a8a89aedb963c88ad7a119eac15589bdfe12d0c76fded16fcd62efcaa6d57',
    diarioOriginal,
    artefactos: {
      dump,
      sidecar: {
        bytes: 32,
        sha256: 'aee3709b328658f141dba6ca688f84257abb650544f068402903c1cffb3ccbb5',
      },
      cifradoFallido: {
        bytes: 79164,
        sha256: 'ebd6eb5929321d5ba0fa00240380542782d7e9c47991c304cc9762d2cb458a1d',
      },
      homeOriginal: [],
      lock: {
        bytes: 73,
        sha256: 'abfc7631a13e905838d749e697c8c6d86f4226e48291e85876f3631cda34807c',
      },
    },
    diagnosticos: [huella, huella],
  };
}
test('GPG ruta pura: Windows/POSIX, espacios y separadores; sin cambiar original', () => {
  const m = modulo();
  const nativa = 'C:\\Users\\HP\\Mi carpeta\\g';
  assert.equal(m.rutaGitGpg(nativa), '/c/Users/HP/Mi carpeta/g');
  assert.equal(m.rutaGitGpg('D:/Trabajo/g'), '/d/Trabajo/g');
  assert.equal(m.rutaGitGpg('/c/Users/HP/g'), '/c/Users/HP/g');
  assert.equal(nativa, 'C:\\Users\\HP\\Mi carpeta\\g');
});
test('GPG rechaza rutas relativas, UNC, dispositivos, traversal y controles', () => {
  assert.equal(typeof modulo().rutaGitGpg, 'function');
  for (const r of [
    'g',
    'C:g',
    '\\\\server\\g',
    '\\\\?\\C:\\g',
    'C:/g/../x',
    'C:/g\nkey',
    '/c/g/./x',
  ])
    assert.throws(() => modulo().rutaGitGpg(r));
});
test('GPG probes inyectados usan POSIX y rechazan home/socket ajenos antes de cifrar', async () => {
  const m = modulo();
  const llamadas = [];
  const ejecutar = async (_exe, args) => {
    llamadas.push(args);
    return {
      recibo: { exit: 0 },
      salida: args.at(-1) === 'homedir' ? '/c/propio/g' : '/c/propio/g/S.gpg-agent',
    };
  };
  await m.probarHomeGpg('C:\\propio\\g', { ejecutar });
  assert.ok(llamadas.every((a) => a[1] === '/c/propio/g'));
  await assert.rejects(
    () =>
      m.probarHomeGpg('C:/propio/g', {
        ejecutar: async () => ({ recibo: { exit: 0 }, salida: '/c/propio/C:\\propio\\g' }),
      }),
    /home|socket/,
  );
  await assert.rejects(() => m.probarHomeGpg('C:/propio/g'), /inyect/);
});
test('GPG diagnóstico acotado redacta secretos y URL antes de truncar', () => {
  const m = modulo();
  const secreto = 'CLAVE_SINTETICA_LARGA';
  const d = m.redactarDiagnostico(
    `error ${secreto} postgresql://u:p@host/db\n${'x'.repeat(5000)}`,
    [secreto],
  );
  assert.doesNotMatch(d, /CLAVE_SINTETICA|u:p|postgresql:/);
  assert.ok(d.length <= 2048);
});
function cifradoFixture({ falla = false, malHome = false } = {}) {
  const llamadas = [];
  const ficheros = new Map([['C:/propio/actual.dump', Buffer.from('sintetico')]]);
  const recibos = [];
  return {
    llamadas,
    ficheros,
    recibos,
    opciones: {
      home: 'C:/propio/g',
      entrada: 'C:/propio/actual.dump',
      cifrado: 'C:/propio/actual.dump.gpg',
      descifrado: 'C:/propio/actual.descifrado.dump',
      nuevaClave: () => 'CLAVE_SINTETICA_NO_LOG',
      checkpoint: async (r) => recibos.push(r),
      archivos: {
        existe: (p) => ficheros.has(p),
        crearHome: (p) => ficheros.set(p, null),
        leer: (p) => ficheros.get(p),
      },
      ejecutar: async (_exe, args, opts) => {
        llamadas.push({ args, input: opts?.input });
        const ultimo = args.at(-1);
        if (args.includes('--list-dirs'))
          return {
            recibo: { exit: 0 },
            salida: malHome
              ? '/c/ajeno'
              : ultimo === 'homedir'
                ? '/c/propio/g'
                : '/c/propio/g/S.gpg-agent',
          };
        if (args.includes('--symmetric')) {
          ficheros.set('C:/propio/actual.dump.gpg', Buffer.from('cipher'));
          if (falla) throw new Error('fallo sintético');
        }
        if (args.includes('--decrypt'))
          ficheros.set('C:/propio/actual.descifrado.dump', Buffer.from('sintetico'));
        return { recibo: { exit: 0 } };
      },
    },
  };
}
test('GPG cifrado compartido normaliza home/input/output; clave solo descriptor y byteequal', async () => {
  const m = modulo();
  const f = cifradoFixture();
  const r = await m.cifrarConGpg(f.opciones);
  assert.equal(r.byteequal, true);
  const g = f.llamadas.find((c) => c.args.includes('--symmetric'));
  assert.equal(g.input, 'CLAVE_SINTETICA_NO_LOG\n');
  assert.doesNotMatch(JSON.stringify(g.args), /CLAVE_SINTETICA|C:/);
  assert.ok(f.llamadas.at(-1).args.includes('--kill'));
  assert.ok(f.recibos.some((x) => x.sha256 === hashFixture('cipher')));
});
test('GPG exit no cero conserva hash de parcial, no descifra y cierra solo home propio', async () => {
  const f = cifradoFixture({ falla: true });
  await assert.rejects(() => modulo().cifrarConGpg(f.opciones));
  assert.ok(f.ficheros.has('C:/propio/actual.dump.gpg'));
  assert.ok(f.recibos.some((r) => r.sha256 === hashFixture('cipher')));
  assert.ok(!f.llamadas.some((c) => c.args.includes('--decrypt')));
  assert.deepEqual(f.llamadas.at(-1).args, ['--homedir', '/c/propio/g', '--kill', 'gpg-agent']);
});
test('GPG probe incorrecto o artefacto existente nunca llega a cifrar', async () => {
  const f = cifradoFixture({ malHome: true });
  await assert.rejects(() => modulo().cifrarConGpg(f.opciones));
  assert.ok(!f.llamadas.some((c) => c.args.includes('--symmetric')));
  const ocupado = cifradoFixture();
  ocupado.ficheros.set('C:/propio/actual.dump.gpg', Buffer.from('ajeno'));
  await assert.rejects(() => modulo().cifrarConGpg(ocupado.opciones));
  assert.deepEqual(ocupado.llamadas, []);
});
test('GPG continuidad hereda solo cuatro completas y preserva byte lógico del padre incierto', () => {
  const m = modulo();
  const p = paqueteFixture();
  const antes = JSON.stringify(p);
  const r = m.planificarContinuacion(p);
  assert.equal(JSON.stringify(p), antes);
  assert.equal(r.diarioHijo.freeze, p.freezeNuevo);
  assert.deepEqual(Object.keys(r.diarioHijo.etapas), m.ETAPAS.slice(0, 4));
  assert.equal(p.diarioOriginal.etapas.cifrar_actual.estado, 'incierta');
  assert.equal(r.diarioHijo.identidades[m.BASES[0]].oid, '205892');
  assert.equal(r.sello.intento, 2);
  assert.match(r.diarioHijo.continuacion.selloSha256, /^[a-f0-9]{64}$/);
});
test('GPG sello rechaza freeze/journal/artifact/identidad alterados', () => {
  const m = modulo();
  assert.equal(typeof m.planificarContinuacion, 'function');
  for (const mutar of [
    (p) => (p.freezeAnterior = huella),
    (p) => (p.freezeNuevo = p.freezeAnterior),
    (p) => (p.diarioSha256 = huella),
    (p) => (p.artefactos.dump.sha256 = huella),
    (p) => (p.artefactos.sidecar.sha256 = huella),
    (p) => (p.artefactos.cifradoFallido.sha256 = huella),
    (p) => (p.artefactos.homeOriginal = ['ajeno']),
    (p) => (p.diarioOriginal.identidades[m.BASES[0]].oid = '205893'),
    (p) => (p.diarioOriginal.identidades[m.BASES[0]].servidor = '1'),
  ]) {
    const p = paqueteFixture();
    mutar(p);
    assert.throws(() => m.planificarContinuacion(p));
  }
});
test('GPG continuidad rechaza restore/carga inciertos y otras etapas posteriores', () => {
  const m = modulo();
  assert.equal(typeof m.planificarContinuacion, 'function');
  for (const etapa of ['restaurar_actual', 'verificar_actual', 'crear_pre0020']) {
    const p = paqueteFixture();
    p.diarioOriginal.etapas[etapa] = { estado: 'incierta' };
    assert.throws(() => m.planificarContinuacion(p));
  }
  const p = paqueteFixture();
  p.diarioOriginal.etapas.cifrar_actual.estado = 'completa';
  assert.throws(() => m.planificarContinuacion(p));
});
test('GPG sello e hijo se validan sin SQL; no admite cambiar heredadas ni enlace', () => {
  const m = modulo();
  const p = paqueteFixture();
  const r = m.planificarContinuacion(p);
  m.validarContinuacion(p, r.sello, r.diarioHijo);
  const hijo = structuredClone(r.diarioHijo);
  hijo.etapas.crear_actual.evidencia = { otra: true };
  assert.throws(() => m.validarContinuacion(p, r.sello, hijo));
  assert.throws(() => m.validarContinuacion(p, { ...r.sello, intento: 3 }, r.diarioHijo));
});
test('GPG rutas de continuación no sobrescriben dump/cipher/home/journal originales', () => {
  const m = modulo();
  assert.equal(m.rutaContinuacion('actual.dump'), m.rutaArtefacto('actual.dump'));
  for (const n of ['diario.json', 'actual.dump.gpg', 'actual.descifrado.dump', 'pre0020.dump']) {
    assert.notEqual(m.rutaContinuacion(n), m.rutaArtefacto(n));
    assert.match(m.rutaContinuacion(n), /correccion-gpg/);
  }
  assert.throws(() => m.rutaContinuacion('../actual.dump.gpg'));
});
test('GPG contexto hijo prohíbe replay antes de crear conexiones/operadores', async () => {
  const m = modulo();
  const p = paqueteFixture();
  const { diarioHijo } = m.planificarContinuacion(p);
  let llamadas = 0;
  const o = m.crearOperadores({
    url: 'postgresql://curichi:sentinel@127.0.0.1:5432/template1',
    diario: diarioHijo,
    guardar: async () => {},
    continuacion: true,
    adaptador: {
      consulta: async () => {
        llamadas++;
        assert.fail('SQL prohibido');
      },
      comando: async () => {
        llamadas++;
        assert.fail('operador prohibido');
      },
    },
  });
  for (const e of m.ETAPAS.slice(0, 4)) await assert.rejects(() => o.ejecutar(e));
  assert.equal(llamadas, 0);
});
test('GPG hijo bloquea sello inválido, etapa incierta y replay antes de todo efecto', async () => {
  const m = modulo();
  const paquete = paqueteFixture();
  const p = m.planificarContinuacion(paquete);
  let efectos = 0;
  const opciones = {
    paquete,
    sello: p.sello,
    diario: p.diarioHijo,
    guardar: async () => {
      efectos++;
    },
    operar: async () => {
      efectos++;
      return { byteequal: true };
    },
    recursos: async () => {
      efectos++;
    },
  };
  await assert.rejects(() => m.ejecutarEtapaHija('crear_actual', opciones));
  await assert.rejects(() =>
    m.ejecutarEtapaHija('cifrar_actual', { ...opciones, sello: { ...p.sello, intento: 3 } }),
  );
  assert.equal(efectos, 0);
  await m.ejecutarEtapaHija('cifrar_actual', opciones);
  const despues = efectos;
  await assert.rejects(() => m.ejecutarEtapaHija('cifrar_actual', opciones));
  assert.equal(efectos, despues);
  const incierto = m.planificarContinuacion(paquete);
  incierto.diarioHijo.etapas.cifrar_actual = { estado: 'incierta' };
  await assert.rejects(() =>
    m.ejecutarEtapaHija('restaurar_actual', { ...opciones, diario: incierto.diarioHijo }),
  );
  assert.equal(efectos, despues);
});
test('GPG exit2 devuelto y descifrado alterado fallan aun si hay archivos; no hay segundo intento', async () => {
  const m = modulo();
  for (const tipo of ['exit2', 'alterado']) {
    const f = cifradoFixture();
    const ejecutar = f.opciones.ejecutar;
    f.opciones.ejecutar = async (exe, args, opts) => {
      const r = await ejecutar(exe, args, opts);
      if (tipo === 'exit2' && args.includes('--symmetric')) r.recibo.exit = 2;
      if (tipo === 'alterado' && args.includes('--decrypt'))
        f.ficheros.set('C:/propio/actual.descifrado.dump', Buffer.from('alterado'));
      return r;
    };
    await assert.rejects(() => m.cifrarConGpg(f.opciones));
    const llamadas = f.llamadas.length;
    await assert.rejects(() => m.cifrarConGpg(f.opciones));
    assert.equal(f.llamadas.length, llamadas);
    assert.ok(f.recibos.some((r) => r.archivo === 'cifrado' && r.sha256));
    assert.ok(f.llamadas.at(-1).args.includes('--kill'));
  }
});
test('GPG socket distinto o probe exit2 no habilita la operación siguiente', async () => {
  const m = modulo();
  let llamadas = 0;
  await assert.rejects(() =>
    m.probarHomeGpg('C:/propio/g', {
      ejecutar: async () => {
        llamadas++;
        return { recibo: { exit: 2 }, salida: '/c/propio/g' };
      },
    }),
  );
  assert.equal(llamadas, 1);
  await assert.rejects(
    () =>
      m.probarHomeGpg('C:/propio/g', {
        ejecutar: async (_exe, args) => ({
          recibo: { exit: 0 },
          salida: args.at(-1) === 'homedir' ? '/c/propio/g' : '/c/ajeno/S.gpg-agent',
        }),
      }),
    /socket/,
  );
});
