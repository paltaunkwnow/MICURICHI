#!/usr/bin/env node
/**
 * Banco de carga de los endpoints críticos. No usa ninguna dependencia nueva: con `fetch` y
 * `Promise` alcanza para el orden de magnitud que interesa aquí (decenas o cientos de peticiones
 * concurrentes contra la pila local), y evita meter una herramienta más al repositorio.
 *
 * Requiere la pila levantada (pnpm db:local + pnpm db:seed:samples + pnpm dev).
 *
 *   node scripts/banco-carga.mjs                  # perfil por defecto
 *   node scripts/banco-carga.mjs 10,100,500       # concurrencias a probar
 *
 * Mide latencia (p50/p95/p99), throughput y reparto de códigos de estado. Un 429 NO es un fallo:
 * es el rate limit haciendo su trabajo, y se cuenta aparte.
 *
 * OJO: el escenario de login deja cientos de intentos fallidos en la tabla `intento_login`, que
 * es el freno de fuerza bruta y vive en la base. Durante los minutos siguientes, cualquier login
 * desde esa misma IP (incluidos los E2E) recibirá 429. Para limpiarlo:
 *   DELETE FROM intento_login;
 */
const API = process.env.API_CORE_URL ?? 'http://127.0.0.1:3001';
const GEO = process.env.GEO_SERVICE_URL ?? 'http://127.0.0.1:3002';

const concurrencias = (process.argv[2] ?? '10,100,500').split(',').map(Number);
const PETICIONES_POR_NIVEL = Number(process.env.PETICIONES ?? 1000);

/** Punto dentro de la cobertura sintética del seed. */
const PUNTO = { lat: -17.7833, lon: -63.1821 };

const escenarios = [
  {
    nombre: 'GET /api/v1/reportes (listado público)',
    pedir: () => fetch(`${API}/api/v1/reportes?limite=50`),
  },
  {
    // El listado que pide el mapa al moverse: bbox + límite alto. Es distinto del anterior
    // porque el filtro espacial cambia el plan que elige Postgres, y es la petición que más se
    // repite en la app pública (una por movimiento de mapa).
    nombre: 'GET /api/v1/reportes?bbox= (lo que pide el mapa)',
    pedir: () =>
      fetch(
        `${API}/api/v1/reportes?limite=300&bbox=${PUNTO.lon - 0.01},${PUNTO.lat - 0.01},${PUNTO.lon + 0.01},${PUNTO.lat + 0.01}`,
      ),
  },
  {
    nombre: 'GET /geo/v1/puntos-criticos?bbox= (mapa público)',
    pedir: () =>
      fetch(
        `${GEO}/geo/v1/puntos-criticos?bbox=${PUNTO.lon - 0.05},${PUNTO.lat - 0.05},${PUNTO.lon + 0.05},${PUNTO.lat + 0.05}`,
      ),
  },
  {
    nombre: 'POST /geo/v1/resolver (point-in-polygon)',
    pedir: () =>
      fetch(`${GEO}/geo/v1/resolver`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(PUNTO),
      }),
  },
  {
    nombre: 'GET /geo/v1/agregados/unidades-vecinales (con caché)',
    pedir: () => fetch(`${GEO}/geo/v1/agregados/unidades-vecinales`),
  },
  {
    nombre: 'GET /geo/v1/teselas/manzana/14/... (desde caché en memoria)',
    pedir: () => fetch(`${GEO}/geo/v1/teselas/manzana/14/4908/9207.mvt`),
  },
  {
    nombre: 'POST /api/v1/auth/login (credenciales incorrectas)',
    // Ejercita el camino caro: Argon2id + el freno de fuerza bruta.
    pedir: () =>
      fetch(`${API}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Contraseña equivocada a propósito: se mide el rechazo, no el acceso.
        body: JSON.stringify({
          email: 'carga@curichi.local',
          password: 'contrasena-incorrecta-123',
        }),
      }),
  },
];

function percentil(ordenadas, p) {
  if (!ordenadas.length) return 0;
  const i = Math.min(ordenadas.length - 1, Math.floor((p / 100) * ordenadas.length));
  return ordenadas[i];
}

async function medir(escenario, concurrencia, total) {
  const latencias = [];
  const codigos = new Map();
  let fallos = 0;
  let pendientes = total;

  const inicio = performance.now();
  const trabajador = async () => {
    while (pendientes-- > 0) {
      const t0 = performance.now();
      try {
        const r = await escenario.pedir();
        // Hay que consumir el cuerpo o la conexión no se libera y la medición miente.
        await r.arrayBuffer();
        latencias.push(performance.now() - t0);
        codigos.set(r.status, (codigos.get(r.status) ?? 0) + 1);
      } catch {
        fallos++;
        latencias.push(performance.now() - t0);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrencia }, trabajador));
  const segundos = (performance.now() - inicio) / 1000;

  latencias.sort((a, b) => a - b);
  return {
    rps: total / segundos,
    p50: percentil(latencias, 50),
    p95: percentil(latencias, 95),
    p99: percentil(latencias, 99),
    max: latencias[latencias.length - 1] ?? 0,
    codigos: [...codigos.entries()]
      .sort()
      .map(([c, n]) => `${c}:${n}`)
      .join(' '),
    fallos,
  };
}

const salud = await fetch(`${API}/health`).catch(() => null);
if (!salud?.ok) {
  console.error(
    `No responde ${API}. Levantá la pila: pnpm db:local, pnpm db:seed:samples, pnpm dev`,
  );
  process.exit(1);
}
console.log(
  `Memoria del proceso de medición al empezar: ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`,
);

for (const escenario of escenarios) {
  console.log(`\n### ${escenario.nombre}`);
  console.log('conc\treq\trps\tp50 ms\tp95 ms\tp99 ms\tmax ms\tcódigos\tfallos');
  for (const c of concurrencias) {
    const r = await medir(escenario, c, PETICIONES_POR_NIVEL);
    console.log(
      [
        c,
        PETICIONES_POR_NIVEL,
        r.rps.toFixed(0),
        r.p50.toFixed(1),
        r.p95.toFixed(1),
        r.p99.toFixed(1),
        r.max.toFixed(0),
        r.codigos,
        r.fallos,
      ].join('\t'),
    );
  }
}
console.log(`\nMemoria al terminar: ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`);
