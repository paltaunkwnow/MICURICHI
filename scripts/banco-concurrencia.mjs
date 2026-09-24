#!/usr/bin/env node
/**
 * Pruebas de concurrencia contra la pila REAL (§29).
 *
 * Por qué no son tests normales: la suite corre sobre PGlite, que es de conexión única y
 * serializa todo. Es decir, el entorno donde se prueban las carreras es justamente un entorno
 * donde no puede haber carreras. Todo lo que hay aquí —`SELECT ... FOR UPDATE`,
 * `INSERT ... ON CONFLICT`, los advisory locks— solo se puede ejercitar contra PostgreSQL de
 * verdad, con varias conexiones a la vez.
 *
 *   docker compose --profile servicios up -d
 *   node scripts/banco-concurrencia.mjs
 *
 * Necesita que `RATE_LIMIT_REPORTES_POR_HORA` esté alto: si no, lo que se mide es el rate limit.
 */
const API = process.env.API_CORE_URL ?? 'http://127.0.0.1:3001';

/** Punto dentro de la cobertura cargada por los seeds. */
const PUNTO = { lat: -17.7833, lon: -63.1821 };

function reporte(sufijo, desplazamiento = 0) {
  return {
    lat: PUNTO.lat + desplazamiento,
    lon: PUNTO.lon + desplazamiento,
    ubicacion_metodo: 'manual',
    ubicacion_tipo: 'via_publica',
    descripcion: `[concurrencia] prueba automática ${sufijo} con descripción suficientemente larga`,
    tirante_estimado: 'rodilla',
    duracion_estimada: '30min_2h',
    frecuencia: 'ocasional',
    afectacion: 'vehicular',
    causa_presunta: 'desconocida',
    fotos: [],
  };
}

async function crear(cuerpo, clave) {
  const r = await fetch(`${API}/api/v1/reportes`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(clave ? { 'idempotency-key': clave } : {}),
    },
    body: JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch {
    /* respuesta no JSON */
  }
  return { estado: r.status, id: json?.properties?.id ?? json?.id ?? null, codigo: json?.codigo };
}

const resultados = [];
function comprobar(nombre, ok, detalle) {
  resultados.push({ prueba: nombre, resultado: ok ? 'PASA' : 'FALLA', detalle });
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}\n      ${detalle}`);
}

const salud = await fetch(`${API}/health`).catch(() => null);
if (!salud?.ok) {
  console.error(`No responde ${API}. Levantá la pila con docker compose --profile servicios up -d`);
  process.exit(1);
}

console.log('CONCURRENCIA CONTRA POSTGRESQL REAL\n');

// ── 1) Misma clave de idempotencia, N peticiones a la vez ───────────────────────────────────
// Es el caso real: el vecino toca "Enviar", la red tarda, vuelve a tocar. O la app reintenta.
// Tiene que crearse UN reporte, no N.
{
  const clave = `conc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const cuerpo = reporte('misma-clave');
  const rs = await Promise.all(Array.from({ length: 12 }, () => crear(cuerpo, clave)));
  const creados = new Set(rs.filter((r) => r.id).map((r) => r.id));
  const enCurso = rs.filter((r) => r.codigo === 'ENVIO_EN_CURSO').length;
  comprobar(
    '12 envíos simultáneos con la MISMA clave crean un solo reporte',
    creados.size === 1,
    `reportes distintos: ${creados.size} · códigos: ${rs
      .map((r) => r.estado)
      .sort()
      .join(',')} · "envío en curso": ${enCurso}`,
  );
}

// ── 2) Claves distintas ─────────────────────────────────────────────────────────────────────
{
  const rs = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      crear(reporte(`distinta-${i}`, i * 0.0001), `conc-d-${Date.now()}-${i}`),
    ),
  );
  const creados = new Set(rs.filter((r) => r.id).map((r) => r.id));
  comprobar(
    '12 envíos simultáneos con claves DISTINTAS crean 12 reportes',
    creados.size === 12,
    `reportes distintos: ${creados.size} · códigos: ${rs
      .map((r) => r.estado)
      .sort()
      .join(',')}`,
  );
}

// ── 3) Sin clave de idempotencia ────────────────────────────────────────────────────────────
// Sin clave no hay nada que deduplicar: doce envíos son doce reportes. Se comprueba para que
// quede claro que la deduplicación viene de la clave y no de un parecido entre payloads.
{
  const cuerpo = reporte('sin-clave');
  const rs = await Promise.all(Array.from({ length: 6 }, () => crear(cuerpo)));
  const creados = new Set(rs.filter((r) => r.id).map((r) => r.id));
  comprobar(
    '6 envíos idénticos SIN clave crean 6 reportes (no hay deduplicación mágica)',
    creados.size === 6,
    `reportes distintos: ${creados.size}`,
  );
}

// ── 4) Reutilizar una clave con OTRO contenido ──────────────────────────────────────────────
// La clave identifica un envío, no "cualquier cosa que mande este cliente": si el contenido
// cambia, la respuesta correcta es un conflicto, no sobrescribir en silencio.
{
  const clave = `conc-r-${Date.now()}`;
  const primera = await crear(reporte('original'), clave);
  const segunda = await crear(reporte('distinto-contenido', 0.002), clave);
  comprobar(
    'reutilizar una clave con otro contenido da 409, no crea nada',
    primera.id !== null && segunda.estado === 409,
    `primera: ${primera.estado} · segunda: ${segunda.estado} ${segunda.codigo ?? ''}`,
  );
}

// ── 5) Repetir la clave DESPUÉS, ya no simultáneo ───────────────────────────────────────────
{
  const clave = `conc-rep-${Date.now()}`;
  const cuerpo = reporte('repetida');
  const a = await crear(cuerpo, clave);
  const b = await crear(cuerpo, clave);
  comprobar(
    'repetir el mismo envío devuelve el reporte ya creado (200), no otro',
    a.id !== null && b.id === a.id && b.estado === 200,
    `primera: ${a.estado} id=${a.id?.slice(0, 8)} · segunda: ${b.estado} id=${b.id?.slice(0, 8)}`,
  );
}

console.log('');
console.table(resultados);
const fallos = resultados.filter((r) => r.resultado === 'FALLA').length;
if (fallos) {
  console.error(`\n${fallos} prueba(s) de concurrencia fallaron.`);
  process.exitCode = 1;
} else {
  console.log('\nTodas las pruebas de concurrencia pasaron.');
}
