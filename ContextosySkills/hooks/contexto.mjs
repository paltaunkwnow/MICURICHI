#!/usr/bin/env node
// Hooks de continuidad de contexto para Claude Code (ContextosySkills).
//
// POLÍTICA (vigente desde el 2026-10-07, pedida por el usuario):
//   - Un snapshot VentanaContextoSesionN.md se crea SOLO cuando el contexto estimado SUPERA el 70 %.
//   - Uno por ciclo de contexto (un ciclo termina con una compactación). Nunca uno por tool call.
//   - No al cerrar una fase, no por debajo del 70 %, no por un /compact manual por debajo del 70 %.
//
// Modos (primer argumento):
//   uso             PostToolUse — estima el % de contexto con el transcript. Al superar el 70 % crea
//                                 el ESQUELETO del snapshot (datos mecánicos ya cargados) y le pide a
//                                 Claude que complete sus 28 secciones. Una vez por ciclo.
//   precompact      PreCompact  — registra la compactación. Si el contexto supera el 70 % y el ciclo
//                                 todavía no tiene snapshot, crea el esqueleto como respaldo.
//                                 Por debajo del 70 % (p. ej. /compact manual) no crea nada.
//   sesion-compact  SessionStart (matcher "compact") — abre un ciclo nuevo y le indica a Claude qué
//                                 snapshot leer (y completar si quedó como esqueleto). No crea snapshots.
//   estado          Manual      — imprime el uso estimado, el ciclo y la numeración.
//
// Reglas: solo escribe en ContextosySkills/.estado/ y crea VentanaContextoSesionN.md nuevos (nunca
// sobrescribe uno existente: 'wx'). No toca código, base ni git (git con --no-optional-locks, solo
// lectura). Nunca termina con código distinto de 0.

import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// CONTEXTO_CARPETA solo para probar el script contra una carpeta temporal.
const CARPETA = process.env.CONTEXTO_CARPETA
  ? resolve(process.env.CONTEXTO_CARPETA)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAIZ = process.env.CLAUDE_PROJECT_DIR ? resolve(process.env.CLAUDE_PROJECT_DIR) : resolve(CARPETA, '..');
const ESTADO = join(CARPETA, '.estado');
// Ventana en tokens. 1 000 000 es una INFERENCIA: la compactación automática del 2026-10-07 ocurrió con
// preTokens = 977 626 (claude-opus-5-5). Con otro modelo hay que cambiar CONTEXTO_VENTANA_TOKENS.
const VENTANA = Number(process.env.CONTEXTO_VENTANA_TOKENS) || 1_000_000;
const UMBRAL = 70; // estrictamente mayor
const RECORDATORIO = 85; // un único recordatorio si el esqueleto sigue sin completar
const REARME = 50; // por debajo, el ciclo anterior terminó (solo pasa después de compactar)
const COLA_BYTES = 768 * 1024;
const MARCA_ESQUELETO = '<!-- ContextosySkills:esqueleto — Claude borra esta línea al completar el snapshot -->';

const SECCIONES = [
  'Objetivo actual de la sesión',
  'Estado actual del proyecto',
  'Repositorio Git analizado',
  'Branch actual',
  'Commit exacto',
  'Branches investigadas',
  'PRs investigadas',
  'Cambios recientes relevantes',
  'Estado de sincronización',
  'Arquitectura comprendida',
  'Estructura comprendida',
  'Componentes importantes',
  'Flujos importantes',
  'Hallazgos',
  'Problemas encontrados',
  'Problemas que NO deben corregirse todavía',
  'Decisiones tomadas',
  'Suposiciones',
  'Información pendiente de confirmar',
  'Skills / técnicas aprendidas',
  'Herramientas utilizadas',
  'Archivos importantes',
  'Documentación generada',
  'Trabajo completado',
  'Trabajo pendiente',
  'Próximo paso exacto',
  'Instrucciones importantes para continuar después de /compact',
  'Resumen ejecutivo de continuidad',
];

const modo = process.argv[2] ?? 'estado';

function leerEntrada() {
  if (process.stdin.isTTY) return {};
  try {
    const texto = readFileSync(0, 'utf8');
    return texto.trim() ? JSON.parse(texto) : {};
  } catch {
    return {};
  }
}

function asegurarEstado() {
  mkdirSync(ESTADO, { recursive: true });
  const ignorar = join(ESTADO, '.gitignore');
  if (!existsSync(ignorar)) writeFileSync(ignorar, '*\n!.gitignore\n');
}

function snapshots() {
  if (!existsSync(CARPETA)) return [];
  return readdirSync(CARPETA)
    .map((f) => /^VentanaContextoSesion(\d+)\.md$/.exec(f))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
}

function numeracion() {
  const lista = snapshots();
  const ultimo = lista.length ? lista[lista.length - 1] : null;
  return { ultimo, proximo: (ultimo ?? 0) + 1 };
}

const rutaSnapshot = (n) => join(CARPETA, `VentanaContextoSesion${n}.md`);
const esEsqueleto = (n) => {
  try {
    return readFileSync(rutaSnapshot(n), 'utf8').includes(MARCA_ESQUELETO);
  } catch {
    return false;
  }
};

// Solo el transcript del hilo principal (<session_id>.jsonl). Los de subagentes no cuentan.
const esTranscriptPrincipal = (e) =>
  Boolean(e.transcript_path && e.session_id && basename(e.transcript_path) === `${e.session_id}.jsonl`);

function colaTranscript(ruta) {
  if (!ruta || !existsSync(ruta)) return [];
  const fd = openSync(ruta, 'r');
  try {
    const tam = fstatSync(fd).size;
    const desde = Math.max(0, tam - COLA_BYTES);
    const buf = Buffer.alloc(tam - desde);
    readSync(fd, buf, 0, buf.length, desde);
    const lineas = buf.toString('utf8').split('\n');
    if (desde > 0) lineas.shift();
    return lineas.filter(Boolean);
  } finally {
    closeSync(fd);
  }
}

// Tokens de contexto del último mensaje del asistente del hilo principal:
// input_tokens + cache_read_input_tokens + cache_creation_input_tokens.
function usoContexto(ruta) {
  const lineas = colaTranscript(ruta);
  for (let i = lineas.length - 1; i >= 0; i--) {
    let o;
    try {
      o = JSON.parse(lineas[i]);
    } catch {
      continue;
    }
    if (o.type === 'system' && o.subtype === 'compact_boundary') {
      return { tokens: o.compactMetadata?.postTokens ?? 0 };
    }
    const u = o.message?.usage;
    if (o.type === 'assistant' && u && !o.isSidechain) {
      return {
        tokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
      };
    }
  }
  return null;
}

const porcentaje = (tokens) => Math.round((tokens / VENTANA) * 1000) / 10;

function git(args) {
  try {
    return execFileSync('git', ['--no-optional-locks', ...args], {
      cwd: RAIZ,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function estadoGit() {
  const cambios = git(['status', '--porcelain']);
  return {
    remoto: git(['remote', 'get-url', 'origin']),
    rama: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    head: git(['rev-parse', 'HEAD']),
    ultimoCommit: git(['log', '-1', '--format=%ci %s']),
    cambios: cambios === null ? null : cambios.split('\n').filter(Boolean),
  };
}

function registrar(evento) {
  asegurarEstado();
  appendFileSync(join(ESTADO, 'registro.jsonl'), `${JSON.stringify({ fecha: new Date().toISOString(), ...evento })}\n`);
}

const archivoEstado = (sesion) => join(ESTADO, `uso-${String(sesion ?? 'sin-sesion').slice(0, 64)}.json`);
function leerCiclo(sesion) {
  try {
    const e = JSON.parse(readFileSync(archivoEstado(sesion), 'utf8'));
    return { generacion: e.generacion ?? 0, snapshot: e.snapshot ?? null, recordado: Boolean(e.recordado) };
  } catch {
    return { generacion: 0, snapshot: null, recordado: false };
  }
}
function guardarCiclo(sesion, ciclo, extra) {
  asegurarEstado();
  writeFileSync(archivoEstado(sesion), JSON.stringify({ fecha: new Date().toISOString(), ventana: VENTANA, ...extra, ...ciclo }));
}

// Crea el esqueleto del snapshot del ciclo. La marca del ciclo se crea con 'wx': si dos hooks corren
// a la vez (herramientas en paralelo), solo uno crea el archivo y el otro lee el número de la marca.
function snapshotDelCiclo(sesion, ciclo, datos) {
  asegurarEstado();
  const marca = join(ESTADO, `ciclo-${String(sesion).slice(0, 64)}-g${ciclo.generacion}.marca`);
  let fd;
  try {
    fd = openSync(marca, 'wx');
  } catch {
    const n = Number(readFileSync(marca, 'utf8').trim());
    return { n: Number.isFinite(n) && n > 0 ? n : null, creado: false };
  }
  try {
    let n = numeracion().proximo;
    for (let intento = 0; intento < 5; intento++, n++) {
      try {
        const f = openSync(rutaSnapshot(n), 'wx');
        writeSync(f, esqueleto(n, datos));
        closeSync(f);
        writeSync(fd, String(n));
        registrar({ evento: 'snapshot-esqueleto', n, motivo: datos.motivo, pct: datos.pct, session_id: sesion });
        return { n, creado: true };
      } catch (e) {
        if (e?.code !== 'EEXIST') throw e;
      }
    }
    return { n: null, creado: false };
  } finally {
    closeSync(fd);
  }
}

function esqueleto(n, d) {
  const g = estadoGit();
  const previo = n > 1 ? `VentanaContextoSesion${n - 1}.md` : 'ninguno';
  const automatico = {
    'Repositorio Git analizado': g.remoto ? `\`${g.remoto}\` (dato automático)` : null,
    'Branch actual': g.rama ? `\`${g.rama}\` (dato automático)` : null,
    'Commit exacto': g.head ? `\`${g.head}\` — ${g.ultimoCommit ?? ''} (dato automático)` : null,
    'Estado de sincronización':
      g.cambios === null
        ? null
        : `Archivos con cambios al crear el esqueleto (dato automático, \`git status --porcelain\`):\n\n${
            g.cambios.length ? g.cambios.map((c) => `- \`${c}\``).join('\n') : '- ninguno'
          }`,
  };
  const cuerpo = SECCIONES.map((s, i) => {
    const auto = automatico[s];
    return `## ${i + 1}. ${s}\n\n${auto ? `${auto}\n\n_Completar si hace falta._` : '_Pendiente: lo completa Claude._'}\n`;
  }).join('\n');
  return `${MARCA_ESQUELETO}
# Ventana de Contexto — Sesión ${n}

> Esqueleto creado **automáticamente** por \`ContextosySkills/hooks/contexto.mjs\` (${d.motivo}) el
> ${new Date().toISOString()}, con el contexto estimado en **${d.pct} %** (${d.tokens.toLocaleString('es')} de
> ~${VENTANA.toLocaleString('es')} tokens; umbral: > ${UMBRAL} %).
> Snapshot anterior: ${previo}. Transcript completo: \`${d.transcript ?? 'desconocido'}\`.
> Claude completa las 28 secciones con la plantilla de \`ContextosySkills/README.md\` y borra la primera línea.

${cuerpo}`;
}

function salidaJson(obj) {
  process.stdout.write(JSON.stringify(obj));
}

function modoUso(e) {
  if (!esTranscriptPrincipal(e)) return;
  const uso = usoContexto(e.transcript_path);
  if (!uso) return;
  const pct = porcentaje(uso.tokens);
  const ciclo = leerCiclo(e.session_id);
  if (pct < REARME && ciclo.snapshot !== null) {
    ciclo.generacion += 1;
    ciclo.snapshot = null;
    ciclo.recordado = false;
  }
  let salida = null;
  if (pct > UMBRAL && ciclo.snapshot === null) {
    const r = snapshotDelCiclo(e.session_id, ciclo, { motivo: 'PostToolUse', pct, tokens: uso.tokens, transcript: e.transcript_path });
    ciclo.snapshot = r.n;
    if (r.creado) {
      const texto =
        `[ContextosySkills] El contexto estimado superó el ${UMBRAL} % (${pct} %). Se creó automáticamente ` +
        `ContextosySkills/VentanaContextoSesion${r.n}.md como esqueleto (git ya cargado). ANTES de seguir con la tarea, ` +
        `completá sus 28 secciones con el estado real de la sesión (plantilla en ContextosySkills/README.md), borrá la ` +
        'primera línea (marca de esqueleto) y retomá donde estabas. Es el único snapshot de este ciclo: no crees otro. ' +
        'Solo documentación: no toques código, base ni git.';
      salida = {
        systemMessage: `Contexto ≈ ${pct} % (> ${UMBRAL} %): se creó VentanaContextoSesion${r.n}.md para que Claude lo complete`,
        hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: texto },
      };
    }
  } else if (pct > RECORDATORIO && ciclo.snapshot && !ciclo.recordado && esEsqueleto(ciclo.snapshot)) {
    ciclo.recordado = true;
    registrar({ evento: 'recordatorio', n: ciclo.snapshot, pct });
    salida = {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext:
          `[ContextosySkills] Contexto ≈ ${pct} %. ContextosySkills/VentanaContextoSesion${ciclo.snapshot}.md sigue como ` +
          'esqueleto: completalo ahora (es el mismo archivo; no crees otro).',
      },
    };
  }
  guardarCiclo(e.session_id, ciclo, { tokens: uso.tokens, pct });
  if (salida) salidaJson(salida);
}

function modoPrecompact(e) {
  const uso = esTranscriptPrincipal(e) ? usoContexto(e.transcript_path) : null;
  const pct = uso ? porcentaje(uso.tokens) : null;
  const ciclo = leerCiclo(e.session_id);
  let n = ciclo.snapshot;
  let creado = false;
  if (pct !== null && pct > UMBRAL && ciclo.snapshot === null) {
    const r = snapshotDelCiclo(e.session_id, ciclo, { motivo: `PreCompact ${e.trigger ?? ''}`.trim(), pct, tokens: uso.tokens, transcript: e.transcript_path });
    n = r.n;
    creado = r.creado;
    ciclo.snapshot = r.n;
    guardarCiclo(e.session_id, ciclo, { tokens: uso.tokens, pct });
  }
  const { ultimo } = numeracion();
  registrar({
    evento: 'precompact',
    disparo: e.trigger ?? null,
    session_id: e.session_id ?? null,
    pct,
    snapshot_del_ciclo: n,
    esqueleto_creado: creado,
    ultimo_snapshot: ultimo,
    git: (({ rama, head }) => ({ rama, head }))(estadoGit()),
  });
  const detalle =
    pct === null
      ? 'sin medición de uso'
      : pct > UMBRAL
        ? creado
          ? `contexto ${pct} %: se creó el esqueleto VentanaContextoSesion${n}.md (se completa al volver)`
          : `contexto ${pct} %: el ciclo ya tiene VentanaContextoSesion${n}.md`
        : `contexto ${pct} % (≤ ${UMBRAL} %): no se crea snapshot; al volver se usa el último (${ultimo ? `VentanaContextoSesion${ultimo}.md` : 'ninguno'})`;
  salidaJson({ systemMessage: `ContextosySkills: compactación ${e.trigger ?? ''} registrada; ${detalle}.` });
}

function guardarResumen(ruta) {
  const lineas = colaTranscript(ruta);
  for (let i = lineas.length - 1; i >= 0; i--) {
    let o;
    try {
      o = JSON.parse(lineas[i]);
    } catch {
      continue;
    }
    if (o.type === 'user' && o.isCompactSummary) {
      const c = o.message?.content;
      const texto = typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => x.text ?? '').join('\n') : '';
      if (!texto) return null;
      asegurarEstado();
      const nombre = `resumen-compactacion-${(o.timestamp ?? new Date().toISOString()).replace(/[:.]/g, '-')}.md`;
      writeFileSync(join(ESTADO, nombre), texto);
      return nombre;
    }
  }
  return null;
}

function modoSesionCompact(e) {
  const { ultimo } = numeracion();
  const resumen = esTranscriptPrincipal(e) ? guardarResumen(e.transcript_path) : null;
  const ciclo = leerCiclo(e.session_id);
  const pendiente = ultimo !== null && esEsqueleto(ultimo);
  // La compactación cierra el ciclo: el próximo snapshot solo se crea si el contexto vuelve a superar el 70 %.
  if (e.session_id) guardarCiclo(e.session_id, { generacion: ciclo.generacion + 1, snapshot: null, recordado: false }, {});
  const g = estadoGit();
  registrar({ evento: 'sesion-compact', ultimo_snapshot: ultimo, esqueleto_pendiente: pendiente, resumen_guardado: resumen });
  const lineas = [
    '[ContextosySkills] La conversación se acaba de compactar.',
    ultimo
      ? `1. Leé ContextosySkills/VentanaContextoSesion${ultimo}.md (el último snapshot) y ContextosySkills/README.md antes de seguir.`
      : '1. Todavía no hay snapshots: leé ContextosySkills/README.md.',
    pendiente
      ? `2. Ese snapshot quedó como ESQUELETO: completalo ahora (es el mismo archivo) con el resumen de compactación${resumen ? ` (copia en ContextosySkills/.estado/${resumen})` : ''}. No crees otro.`
      : `2. NO crees un snapshot nuevo ahora: el próximo se crea solo cuando el contexto supere el ${UMBRAL} %.`,
    `3. Git ahora: rama ${g.rama ?? '?'}, HEAD ${g.head ? g.head.slice(0, 7) : '?'}, ${g.cambios ? g.cambios.length : '?'} archivos con cambios. Verificalo si vas a depender de él.`,
    '4. Continuá desde «Próximo paso exacto» del snapshot; no empieces de cero.',
    e.transcript_path ? `Transcript completo (para buscar detalles): ${e.transcript_path}` : null,
    'Este sistema solo documenta: no modifica código, base de datos ni git.',
  ].filter(Boolean);
  process.stdout.write(`${lineas.join('\n')}\n`);
}

function modoEstado(e) {
  const ruta = e.transcript_path ?? process.argv[3];
  const sesion = e.session_id ?? (ruta ? basename(ruta).replace(/\.jsonl$/, '') : null);
  const uso = ruta ? usoContexto(ruta) : null;
  const { ultimo, proximo } = numeracion();
  const ciclo = sesion ? leerCiclo(sesion) : null;
  process.stdout.write(
    `${JSON.stringify(
      {
        ventana_tokens: VENTANA,
        umbral_pct: `> ${UMBRAL}`,
        tokens: uso?.tokens ?? null,
        pct: uso ? porcentaje(uso.tokens) : null,
        ciclo,
        ultimo_snapshot: ultimo,
        ultimo_es_esqueleto: ultimo ? esEsqueleto(ultimo) : null,
        proximo_si_supera_umbral: proximo,
      },
      null,
      2,
    )}\n`,
  );
}

try {
  const entrada = modo === 'estado' && process.argv[3] ? {} : leerEntrada();
  if (modo === 'uso') modoUso(entrada);
  else if (modo === 'precompact') modoPrecompact(entrada);
  else if (modo === 'sesion-compact') modoSesionCompact(entrada);
  else modoEstado(entrada);
} catch (error) {
  try {
    registrar({ evento: 'error', modo, mensaje: String(error?.message ?? error) });
  } catch {}
}
process.exit(0);
