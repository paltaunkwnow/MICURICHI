#!/usr/bin/env node
/**
 * Escaneo de secretos (CLAUDE.md §13, "escaneo de secretos en pre-commit y CI").
 *
 * Por qué un script propio y no una herramienta externa en el pre-commit: el gancho lo ejecuta
 * cualquiera que clone el repositorio, y exigir un binario de Go instalado a mano convierte el
 * gancho en algo que la gente termina saltándose. Esto corre con el Node que el proyecto ya
 * necesita. En CI, además, corre **gitleaks**, que sí revisa todo el historial (ver ci.yml):
 * este script es la primera barrera, no la única.
 *
 *   node scripts/buscar-secretos.mjs            # archivos en el índice (pre-commit)
 *   node scripts/buscar-secretos.mjs --todos    # todo lo versionado
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

// Marcadores exactos de pruebas locales; nunca autorizan por sí solos un host ajeno.
const CLAVES_FIXTURE_LOCAL = new Set(['sentinel', 'solo-prueba']);
// La prueba Shell histórica usa una autoridad sintética fija, fuera de loopback.
// Se admite solo esa autoridad completa y únicamente en el contexto .test.sh.
const AUTORIDAD_FIXTURE_SHELL = 'postgresql://sentinel:sentinel@invalid.example';

/** Cada regla es algo que NO debería estar escrito en el repositorio. */
const REGLAS = [
  { nombre: 'clave privada', re: /-----BEGIN (RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----/ },
  {
    nombre: 'clave de acceso AWS',
    re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/,
    // `AKIAIOSFODNN7EXAMPLE` es la clave de ejemplo que publica la propia documentación de AWS
    // y la usan las pruebas del firmado S3. Se permite ESA cadena exacta y nada más: cualquier
    // otra clave con el mismo formato sigue saltando.
    permitido: (t) => /\bAKIAIOSFODNN7EXAMPLE\b/.test(t),
  },
  { nombre: 'token de GitHub', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { nombre: 'token de Slack', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { nombre: 'clave de API de Google', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { nombre: 'JSON de cuenta de servicio', re: /"type"\s*:\s*"service_account"/ },
  {
    nombre: 'cadena de conexión con contraseña',
    re: /\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s:@/]+@/,
    // Se permite solo si TODAS las contraseñas de la línea son de mentira: el valor de ejemplo
    // del repositorio (`curichi`, `cambiar_en_local…`), un marcador de documentación (`<VAR>`,
    // `…`, `***`), una interpolación de código (`${…}`) o un valor de una o dos letras de una
    // prueba. Una contraseña real no es nada de eso, así que sigue saltando.
    permitido: (t, archivo) => {
      const conexiones = [
        ...t.matchAll(
          /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:([^\s@/]+)@(\[[^\]\s]+\]|[^\s:/'"`),;]+)?(?::[0-9]+)?/g,
        ),
      ];
      return (
        conexiones.length > 0 &&
        conexiones.every(([autoridad, clave, host]) => {
          if (
            /^(curichi|cambiar_en_local\w*|<[^>]+>|…+|\.{3}|\*+|\$\{[^}]+\}|[a-z]{1,2})$/i.test(
              clave,
            )
          )
            return true;
          if (!/\.test\.(?:mjs|sh)$/.test(archivo)) return false;
          return (
            (CLAVES_FIXTURE_LOCAL.has(clave) &&
              /^(?:localhost|127\.0\.0\.1|\[::1\])$/.test(host)) ||
            (/\.test\.sh$/.test(archivo) && autoridad === AUTORIDAD_FIXTURE_SHELL)
          );
        })
      );
    },
  },
  {
    nombre: 'secreto asignado en línea',
    // CLAVE=valor largo; se ignoran los placeholders y lo que apunte a otra variable.
    re: /\b(?:password|passwd|secret|token|api[_-]?key|private[_-]?key|access[_-]?key)\s*[:=]\s*["']?([A-Za-z0-9/+_-]{16,})["']?/i,
    permitido: (t) =>
      [
        ...t.matchAll(
          /\b(?:password|passwd|secret|token|api[_-]?key|private[_-]?key|access[_-]?key)\s*[:=]\s*(["']?)([A-Za-z0-9/+_-]{16,})["']?/gi,
        ),
      ].every(
        (m) =>
          (!m[1] &&
            m[2] === 'decodeURIComponent' &&
            /^\s*\(\s*[A-Za-z_$][\w$]*\.password\s*\)(?=\s*(?:[;,}`]|$))/.test(
              t.slice(m.index + m[0].length),
            )) ||
          /\$\{|process\.env|cambiar_en_local|<[^>]+>|xxx|placeholder|ejemplo|example|curichi-(admin|tecnico)-local|contrasena-|incorrect|tu-|your-/i.test(
            m[2],
          ),
      ),
  },
];

/** Archivos que por su naturaleza contienen cadenas con pinta de secreto y no lo son. */
const ARCHIVOS_EXENTOS = [
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)scripts\/buscar-secretos\.mjs$/,
  /(^|\/)docs\/seguridad\//,
  /\.(png|jpe?g|webp|gif|ico|pdf|zip|shp|shx|dbf|prj|cpg|woff2?)$/i,
];

const MAX_BYTES = 2 * 1024 * 1024;

function archivos() {
  const todos = process.argv.includes('--todos');
  const salida = todos
    ? execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    : execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACM'], {
        encoding: 'utf8',
      });
  return salida
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((f) => !ARCHIVOS_EXENTOS.some((re) => re.test(f)));
}

const hallazgos = [];
for (const archivo of archivos()) {
  let texto;
  try {
    if (statSync(archivo).size > MAX_BYTES) continue;
    texto = readFileSync(archivo, 'utf8');
  } catch {
    continue; // borrado, binario o sin permiso
  }
  texto.split('\n').forEach((linea, i) => {
    if (linea.length > 500) return; // líneas minificadas: ruido garantizado
    for (const regla of REGLAS) {
      if (!regla.re.test(linea)) continue;
      if (regla.permitido?.(linea, archivo)) continue;
      hallazgos.push({
        archivo,
        linea: i + 1,
        regla: regla.nombre,
        texto: linea.trim().slice(0, 120),
      });
    }
  });
}

if (!hallazgos.length) {
  console.log('[secretos] sin hallazgos');
  process.exit(0);
}
console.error(`\n[secretos] ${hallazgos.length} posible(s) secreto(s) en el repositorio:\n`);
for (const h of hallazgos) console.error(`  ${h.archivo}:${h.linea}  (${h.regla})\n    ${h.texto}`);
console.error(
  '\nSi es un falso positivo, ajustá la regla en scripts/buscar-secretos.mjs.' +
    '\nSi es un secreto de verdad: sacalo del código, ponelo en una variable de entorno y ROTALO,' +
    '\nporque si ya se hizo commit sigue estando en el historial.\n',
);
process.exit(1);
