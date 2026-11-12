import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const cli = resolve(
  process.env.CURICHI_SECRETOS_CLI ??
    fileURLToPath(new URL('./buscar-secretos.mjs', import.meta.url)),
);
const padreTemporal = resolve(process.env.CURICHI_SECRETOS_TEST_TMP ?? tmpdir());
mkdirSync(padreTemporal, { recursive: true });
const temporal = mkdtempSync(join(padreTemporal, 'curichi-secretos-'));
const variablesOS = new Set(['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP']);
const entornoHijo = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([clave]) => variablesOS.has(clave.toUpperCase())),
  ),
  NODE_ENV: 'test',
  CI: 'true',
};

after(() => {
  assert.equal(dirname(temporal), padreTemporal);
  rmSync(temporal, { recursive: true, force: true });
});

// Se importa el CLI intacto. Solo se sustituye la respuesta de sus dos consultas Git;
// el motor, las reglas, los archivos leídos, los límites y los códigos de salida son suyos.
const selector = `
import childProcess from 'node:child_process';
import { readFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { pathToFileURL } from 'node:url';
const listas = JSON.parse(readFileSync(process.argv[2], 'utf8'));
childProcess.execFileSync = (comando, args, opciones) => {
  if (comando !== 'git' || opciones?.encoding !== 'utf8') {
    throw new Error('Invocación fuera del selector Git de prueba');
  }
  const consulta = JSON.stringify(args);
  if (consulta === JSON.stringify(['ls-files'])) return listas.todos.join(String.fromCharCode(10));
  if (consulta === JSON.stringify(['diff', '--cached', '--name-only', '--diff-filter=ACM'])) {
    return listas.indice.join(String.fromCharCode(10));
  }
  throw new Error('Consulta Git inesperada');
};
syncBuiltinESMExports();
await import(pathToFileURL(process.argv[1]).href);
`;

function escanear(entradas, { todos = false, indice, versionados } = {}) {
  const carpeta = mkdtempSync(join(temporal, 'caso-'));
  for (const { archivo, texto } of entradas) {
    const destino = resolve(carpeta, archivo);
    assert.ok(!isAbsolute(archivo) && destino.startsWith(`${carpeta}${sep}`));
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, texto);
  }
  const rutas = entradas.map(({ archivo }) => archivo);
  const manifiesto = join(carpeta, 'selector-git.json');
  writeFileSync(
    manifiesto,
    JSON.stringify({ indice: indice ?? rutas, todos: versionados ?? rutas }),
  );
  const resultado = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', selector, cli, manifiesto, ...(todos ? ['--todos'] : [])],
    { cwd: carpeta, env: entornoHijo, encoding: 'utf8', timeout: 10_000, windowsHide: true },
  );
  // Nunca se incorpora stdout/stderr crudo a un mensaje de aserción: el CLI incluye valores.
  assert.ok(!resultado.error, 'El proceso del CLI debe finalizar sin error de ejecución');
  assert.equal(resultado.signal, null, 'El proceso del CLI debe terminar por sí mismo');
  const hallazgos = [...resultado.stderr.matchAll(/^\s+(.+):(\d+) {2}\(([^)]+)\)\r?$/gm)].map(
    ([, archivo, linea, regla]) => ({ archivo, linea: Number(linea), regla }),
  );
  assert.ok(resultado.status === 0 || resultado.status === 1, 'Salida válida del CLI');
  assert.equal(resultado.status, hallazgos.length ? 1 : 0, 'Código coherente con los hallazgos');
  return hallazgos;
}

const reglaAsignacion = 'secreto asignado en línea';
const reglaConexion = 'cadena de conexión con contraseña';
const calculada = 'const password = decodeURIComponent(url.password);';
const literal = ['R7', 'n4Q8'.repeat(6)].join('');

function asignar(valor, comilla = "'", clave = 'password') {
  return `${clave} = ${comilla}${valor}${comilla};`;
}

function conexion(valor, host = '127.0.0.1', esquema = 'postgresql') {
  return `${esquema}:${'//'}operador:${valor}@${host}:5432/banco_sintetico`;
}

function rechazar(nombre, texto, regla = reglaAsignacion, archivo = 'scripts/aislado.test.mjs') {
  test(nombre, () => {
    assert.deepEqual(escanear([{ archivo, texto }]), [{ archivo, linea: 1, regla }]);
  });
}

function aceptar(nombre, texto, archivo = 'scripts/aislado.test.mjs') {
  test(nombre, () => {
    assert.deepEqual(escanear([{ archivo, texto }]), []);
  });
}

// Los marcadores de las nueve alertas se reconstruyen en memoria, sin nuevos secretos
// literales en este archivo. Las rutas y líneas corresponden al informe sanitizado.
const baseline = [
  {
    id: 1,
    archivo: 'docs/sdd/2026-10-22-cuatro-categorias/verificacion.md',
    linea: 234,
    urls: [],
  },
  {
    id: 2,
    archivo: 'infra/respaldo/respaldo.test.sh',
    linea: 31,
    urls: [
      {
        esquema: 'postgresql',
        usuario: 'sentinel',
        marcador: [115, 101, 110, 116, 105, 110, 101, 108],
        destino: 'invalid.example',
      },
    ],
  },
  {
    id: 3,
    archivo: 'scripts/ensayar-respaldo-multitematico.mjs',
    linea: 753,
    urls: [],
  },
  {
    id: 4,
    archivo: 'scripts/ensayar-respaldo-multitematico.test.mjs',
    linea: 72,
    urls: [
      {
        esquema: 'postgresql',
        usuario: 'curichi',
        marcador: [115, 101, 110, 116, 105, 110, 101, 108],
        destino: '127.0.0.1:5432',
      },
    ],
  },
  {
    id: 5,
    archivo: 'scripts/ensayar-respaldo-multitematico.test.mjs',
    linea: 186,
    urls: [
      {
        esquema: 'postgresql',
        usuario: 'curichi',
        marcador: [115, 101, 110, 116, 105, 110, 101, 108],
        destino: '127.0.0.1:5432',
      },
    ],
  },
  {
    id: 6,
    archivo: 'scripts/ensayar-respaldo-multitematico.test.mjs',
    linea: 550,
    urls: [
      {
        esquema: 'postgresql',
        usuario: 'curichi',
        marcador: [115, 101, 110, 116, 105, 110, 101, 108],
        destino: '127.0.0.1:5432',
      },
    ],
  },
  {
    id: 7,
    archivo: 'scripts/medir-cuatro-categorias.mjs',
    linea: 2155,
    urls: [],
  },
  {
    id: 8,
    archivo: 'scripts/medir-cuatro-categorias.test.mjs',
    linea: 14,
    urls: [
      {
        esquema: 'postgresql',
        usuario: 'curichi',
        marcador: [115, 111, 108, 111, 45, 112, 114, 117, 101, 98, 97],
        destino: '127.0.0.1:5432',
      },
    ],
  },
  {
    id: 9,
    archivo: 'scripts/multitematica-local.mjs',
    linea: 1049,
    urls: [],
  },
];

function urlsDelCaso(caso) {
  return caso.urls
    .map(
      ({ esquema, usuario, marcador, destino }) =>
        `${esquema}:${'//'}${usuario}:${String.fromCodePoint(...marcador)}@${destino}`,
    )
    .join(' ');
}

for (const caso of baseline) {
  test(`baseline ${caso.id}: ${caso.archivo}:${caso.linea}`, () => {
    const texto = '\n'.repeat(caso.linea - 1) + (caso.urls.length ? urlsDelCaso(caso) : calculada);
    assert.deepEqual(escanear([{ archivo: caso.archivo, texto }]), []);
  });
}

aceptar('lectura calculada en código', calculada, 'scripts/operador.mjs');
aceptar('lectura calculada en Markdown', `\`${calculada}\``, 'docs/operador.md');

for (const comilla of ["'", '"', '']) {
  rechazar(`literal largo con delimitador ${comilla || 'ausente'}`, asignar(literal, comilla));
  rechazar(
    `nombre de función usado como valor literal ${comilla || 'sin llamada'}`,
    asignar('decodeURIComponent', comilla),
  );
}
rechazar(
  'otra llamada no obtiene permiso por compartir prefijo',
  asignar('decodeURIComponentAjeno(valor)', ''),
);
rechazar(
  'literal dentro de la llamada de decodificación',
  asignar(`decodeURIComponent(${JSON.stringify(literal)})`, ''),
);
rechazar(
  'literal dentro de una expresión calculada mixta',
  asignar(`decodeURIComponent(url.password || ${JSON.stringify(literal)})`, ''),
);

for (const clave of [
  'password',
  'passwd',
  'secret',
  'token',
  'api_key',
  'private_key',
  'access-key',
]) {
  rechazar(`asignación literal conserva la regla para ${clave}`, asignar(literal, "'", clave));
}

for (const segura of [
  calculada,
  'const password = process.env.PASSWORD;',
  'const nota = "example";',
]) {
  rechazar('literal posterior en una línea mixta', `${segura} ${asignar(literal)}`);
  rechazar('literal anterior en una línea mixta', `${asignar(literal)} ${segura}`);
  rechazar(
    'URL real posterior en una línea mixta',
    `${segura} ${conexion(literal)}`,
    reglaConexion,
  );
  rechazar('URL real anterior en una línea mixta', `${conexion(literal)} ${segura}`, reglaConexion);
}

for (const caso of baseline.filter(({ urls }) => urls.length)) {
  const marcador = String.fromCodePoint(...caso.urls[0].marcador);
  rechazar(
    `marcador ${caso.id} en servidor externo`,
    conexion(marcador, 'db.invalid'),
    reglaConexion,
    caso.archivo,
  );
  rechazar(
    `marcador ${caso.id} en falso sufijo localhost`,
    conexion(marcador, 'localhost.db.invalid'),
    reglaConexion,
    caso.archivo,
  );
  rechazar(
    `marcador ${caso.id} en otra IPv4`,
    conexion(marcador, '192.0.2.8'),
    reglaConexion,
    caso.archivo,
  );
  rechazar(
    `valor diferente al marcador ${caso.id}`,
    conexion(`${marcador}Z`),
    reglaConexion,
    caso.archivo,
  );
  rechazar(`URL local con valor real ${caso.id}`, conexion(literal), reglaConexion, caso.archivo);
  rechazar(
    `marcador ${caso.id} fuera de pruebas`,
    conexion(marcador),
    reglaConexion,
    'scripts/operador.mjs',
  );
  rechazar(
    `marcador ${caso.id} en documentación`,
    conexion(marcador),
    reglaConexion,
    'docs/operador.md',
  );
  rechazar(
    `fixture ${caso.id} y URL real`,
    `${urlsDelCaso(caso)} ${conexion(literal)}`,
    reglaConexion,
    caso.archivo,
  );
  rechazar(
    `URL real y fixture ${caso.id}`,
    `${conexion(literal)} ${urlsDelCaso(caso)}`,
    reglaConexion,
    caso.archivo,
  );
  rechazar(
    `fixture ${caso.id} y literal real`,
    `${urlsDelCaso(caso)} ${asignar(literal)}`,
    reglaAsignacion,
    caso.archivo,
  );
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    aceptar(`marcador ${caso.id} en loopback ${host}`, conexion(marcador, host), caso.archivo);
  }
}

const fixtureLoopback = baseline.find(({ id }) => id === 4);
rechazar(
  'URL truncada posterior no queda oculta por un fixture seguro',
  `${urlsDelCaso(fixtureLoopback)} ${conexion(literal).split('@')[0]}@`,
  reglaConexion,
  fixtureLoopback.archivo,
);
rechazar(
  'URL truncada anterior no queda oculta por un fixture seguro',
  `${conexion(literal).split('@')[0]}@ ${urlsDelCaso(fixtureLoopback)}`,
  reglaConexion,
  fixtureLoopback.archivo,
);

for (const marcador of [
  'curichi',
  'cambiar_en_local',
  '<VARIABLE>',
  '…',
  '...',
  '***',
  '${VARIABLE}',
  'a',
  'ab',
]) {
  aceptar(`placeholder de conexión existente ${marcador}`, conexion(marcador));
  rechazar(
    `placeholder de conexión y URL real ${marcador}`,
    `${conexion(marcador)} ${conexion(literal)}`,
    reglaConexion,
  );
}
for (const marcador of [
  'cambiar_en_local_1234567890',
  'placeholder_1234567890',
  'example_1234567890',
]) {
  aceptar('placeholder de asignación existente', asignar(marcador));
  rechazar(
    'placeholder de asignación no oculta otro literal',
    `${asignar(marcador)} ${asignar(literal)}`,
  );
  rechazar(
    'literal no se oculta tras un placeholder de asignación',
    `${asignar(literal)} ${asignar(marcador)}`,
  );
}

for (const archivo of ['scripts/operador.mjs', 'scripts/aislado.test.mjs', 'docs/operador.md']) {
  rechazar(`ninguna exención completa para ${archivo}`, asignar(literal), reglaAsignacion, archivo);
}

for (const operador of ['||', '??', '+']) {
  rechazar(
    `SCAN01: continuación del mismo valor con ${operador}`,
    `const ${asignar(`decodeURIComponent(url.password) ${operador} ${JSON.stringify('Z'.repeat(24))}`, '')}`,
    reglaAsignacion,
    'scripts/operador.mjs',
  );
}

const otrosSecretos = [
  ['clave privada', ['-----BEGIN ', 'PRIVATE KEY-----'].join('')],
  ['clave de acceso AWS', ['AK', 'IA', 'Z'.repeat(16)].join('')],
  ['token de GitHub', ['gh', 'p_', 'Z'.repeat(36)].join('')],
  ['token de Slack', ['xo', 'xb-', 'Z'.repeat(12)].join('')],
  ['clave de API de Google', ['AI', 'za', 'Z'.repeat(35)].join('')],
  ['JSON de cuenta de servicio', JSON.stringify({ type: ['service', 'account'].join('_') })],
];
for (const [regla, texto] of otrosSecretos) {
  rechazar(`conserva detección de ${regla}`, texto, regla);
  rechazar(`lectura calculada no oculta ${regla}`, `${calculada} ${texto}`, regla);
}
aceptar('ejemplo exacto AWS existente', ['AKIA', 'IOSFODNN7EXAMPLE'].join(''));

test('selección por defecto usa solo el índice sin modificar Git', () => {
  const entradas = [
    { archivo: 'incluido.mjs', texto: asignar(literal) },
    { archivo: 'sin-seguimiento.mjs', texto: asignar(literal) },
  ];
  assert.deepEqual(escanear(entradas, { indice: ['incluido.mjs'] }), [
    { archivo: 'incluido.mjs', linea: 1, regla: reglaAsignacion },
  ]);
});
test('--todos usa el listado completo versionado', () => {
  const entradas = [
    { archivo: 'incluido.mjs', texto: asignar(literal) },
    { archivo: 'otro.mjs', texto: asignar(literal) },
    { archivo: 'sin-seguimiento.mjs', texto: asignar(literal) },
  ];
  assert.deepEqual(
    escanear(entradas, { todos: true, indice: [], versionados: ['incluido.mjs', 'otro.mjs'] }),
    [
      { archivo: 'incluido.mjs', linea: 1, regla: reglaAsignacion },
      { archivo: 'otro.mjs', linea: 1, regla: reglaAsignacion },
    ],
  );
});
test('selector controlado permite revisar candidatos sin seguimiento', () => {
  const archivo = 'nuevo.mjs';
  assert.deepEqual(escanear([{ archivo, texto: asignar(literal) }], { indice: [archivo] }), [
    { archivo, linea: 1, regla: reglaAsignacion },
  ]);
});
test('conserva exenciones anteriores y omite archivos ausentes', () => {
  const rutas = [
    'pnpm-lock.yaml',
    'scripts/buscar-secretos.mjs',
    'docs/seguridad/ejemplo.md',
    'imagen.png',
  ];
  const entradas = rutas.map((archivo) => ({ archivo, texto: asignar(literal) }));
  assert.deepEqual(escanear(entradas, { indice: [...rutas, 'borrado.mjs'] }), []);
});
test('conserva el límite de dos MiB y las líneas minificadas', () => {
  const entradas = [
    { archivo: 'grande.mjs', texto: `${asignar(literal)}\n${' '.repeat(2 * 1024 * 1024)}` },
    { archivo: 'minificado.mjs', texto: `${asignar(literal)}${' '.repeat(501)}` },
  ];
  assert.deepEqual(escanear(entradas), []);
});
