#!/usr/bin/env node
/**
 * Prueba sostenida (soak): tráfico mezclado durante un rato largo, vigilando si algo crece.
 *
 * El banco de carga mide picos; esto mide lo otro: qué pasa cuando el servicio lleva horas
 * funcionando. Los fallos que busca no se ven en una ráfaga de treinta segundos —memoria que no
 * se libera, cachés sin tope, conexiones que no vuelven al pool, errores que se acumulan— sino en
 * la pendiente de esas curvas.
 *
 *   node scripts/banco-sostenido.mjs [minutos] [concurrencia]
 *
 * Muestrea la memoria de los contenedores con `docker stats` y el estado del pool y las cachés
 * desde `/metrics`. Al final dice cuánto creció cada cosa; lo que importa es la PENDIENTE, no el
 * valor absoluto.
 */
const API = process.env.API_CORE_URL ?? 'http://127.0.0.1:3001';
const GEO = process.env.GEO_SERVICE_URL ?? 'http://127.0.0.1:3002';
const TOKEN = process.env.METRICAS_TOKEN ?? '';

const MINUTOS = Number(process.argv[2] ?? 5);
const CONCURRENCIA = Number(process.argv[3] ?? 8);
const MUESTREO_MS = 15_000;

const PUNTO = { lat: -17.7833, lon: -63.1821 };
const b = 0.01;

/** Mezcla parecida a la real: sobre todo lecturas del mapa, alguna escritura. */
const PESOS = [
  [6, () => fetch(`${API}/api/v1/reportes?limite=50`)],
  [
    4,
    () =>
      fetch(
        `${API}/api/v1/reportes?limite=100&bbox=${PUNTO.lon - b},${PUNTO.lat - b},${PUNTO.lon + b},${PUNTO.lat + b}`,
      ),
  ],
  [3, () => fetch(`${GEO}/geo/v1/agregados/unidades-vecinales`)],
  [
    3,
    () =>
      fetch(
        `${GEO}/geo/v1/puntos-criticos?bbox=${PUNTO.lon - 0.05},${PUNTO.lat - 0.05},${PUNTO.lon + 0.05},${PUNTO.lat + 0.05}`,
      ),
  ],
  // Teselas variadas a propósito: es lo que hace crecer una caché sin tope.
  [
    4,
    () => {
      const x = 4900 + Math.floor(Math.random() * 40);
      const y = 9200 + Math.floor(Math.random() * 40);
      return fetch(`${GEO}/geo/v1/teselas/manzana/14/${x}/${y}.mvt`);
    },
  ],
  [
    1,
    () =>
      fetch(`${GEO}/geo/v1/resolver`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(PUNTO),
      }),
  ],
];
const TOTAL_PESO = PESOS.reduce((s, [p]) => s + p, 0);

function elegir() {
  let r = Math.random() * TOTAL_PESO;
  for (const [peso, fn] of PESOS) {
    r -= peso;
    if (r <= 0) return fn;
  }
  return PESOS[0][1];
}

async function memoriaContenedores() {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  try {
    const { stdout } = await promisify(execFile)('docker', [
      'stats',
      '--no-stream',
      '--format',
      '{{.Name}}|{{.MemUsage}}|{{.CPUPerc}}',
    ]);
    const out = {};
    for (const linea of stdout.trim().split('\n')) {
      const [nombre, mem, cpu] = linea.split('|');
      if (!nombre?.startsWith('curichi')) continue;
      const mb = Number.parseFloat(mem);
      const unidad = /GiB/.test(mem.split('/')[0]) ? 1024 : 1;
      out[nombre.replace('curichi-', '')] = { mb: Math.round(mb * unidad), cpu };
    }
    return out;
  } catch {
    return {};
  }
}

async function metricas(url) {
  if (!TOKEN) return {};
  try {
    const r = await fetch(`${url}/metrics`, { headers: { 'x-token-metricas': TOKEN } });
    if (!r.ok) return {};
    const texto = await r.text();
    const leer = (re) => {
      const m = re.exec(texto);
      return m ? Number(m[1]) : null;
    };
    return {
      poolEspera: leer(/curichi(?:_geo)?_db_pool_esperando\{\} (\d+)/),
      poolTotal: leer(/curichi(?:_geo)?_db_pool_conexiones\{estado="total"\} (\d+)/),
      cacheBytes: leer(/curichi_geo_cache_capas_bytes\{\} (\d+)/),
      errores5xx: leer(/curichi(?:_geo)?_errores_5xx_total\{[^}]*\} (\d+)/),
    };
  } catch {
    return {};
  }
}

const salud = await fetch(`${API}/health`).catch(() => null);
if (!salud?.ok) {
  console.error(`No responde ${API}. Levantá la pila.`);
  process.exit(1);
}

console.log(`Prueba sostenida: ${MINUTOS} min · concurrencia ${CONCURRENCIA}\n`);
const fin = Date.now() + MINUTOS * 60_000;
let peticiones = 0;
let errores = 0;
const codigos = new Map();
const muestras = [];

const muestreador = setInterval(async () => {
  const [mem, mApi, mGeo] = await Promise.all([
    memoriaContenedores(),
    metricas(API),
    metricas(GEO),
  ]);
  const t = Math.round((MINUTOS * 60_000 - (fin - Date.now())) / 1000);
  muestras.push({ t, mem, mApi, mGeo, peticiones, errores });
  console.log(
    `  t=${String(t).padStart(4)}s  peticiones=${String(peticiones).padStart(6)}  errores=${errores}  ` +
      `api=${mem['api-core']?.mb ?? '?'}MB  geo=${mem['geo-service']?.mb ?? '?'}MB  ` +
      `postgis=${mem.postgis?.mb ?? '?'}MB  poolEspera=${mApi.poolEspera ?? '?'}  ` +
      `cacheCapas=${mGeo.cacheBytes != null ? `${Math.round(mGeo.cacheBytes / 1e6)}MB` : '?'}`,
  );
}, MUESTREO_MS);

await Promise.all(
  Array.from({ length: CONCURRENCIA }, async () => {
    while (Date.now() < fin) {
      try {
        const r = await elegir()();
        await r.arrayBuffer();
        codigos.set(r.status, (codigos.get(r.status) ?? 0) + 1);
        if (r.status >= 500) errores++;
      } catch {
        errores++;
      }
      peticiones++;
    }
  }),
);
clearInterval(muestreador);

console.log('');
const primera = muestras[0];
const ultima = muestras[muestras.length - 1];
console.table([
  {
    qué: 'peticiones',
    inicio: 0,
    final: peticiones,
    delta: peticiones,
  },
  {
    qué: 'memoria api-core (MB)',
    inicio: primera?.mem['api-core']?.mb ?? '?',
    final: ultima?.mem['api-core']?.mb ?? '?',
    delta: (ultima?.mem['api-core']?.mb ?? 0) - (primera?.mem['api-core']?.mb ?? 0),
  },
  {
    qué: 'memoria geo-service (MB)',
    inicio: primera?.mem['geo-service']?.mb ?? '?',
    final: ultima?.mem['geo-service']?.mb ?? '?',
    delta: (ultima?.mem['geo-service']?.mb ?? 0) - (primera?.mem['geo-service']?.mb ?? 0),
  },
  {
    qué: 'memoria postgis (MB)',
    inicio: primera?.mem.postgis?.mb ?? '?',
    final: ultima?.mem.postgis?.mb ?? '?',
    delta: (ultima?.mem.postgis?.mb ?? 0) - (primera?.mem.postgis?.mb ?? 0),
  },
  {
    qué: 'caché de capas (MB)',
    inicio: primera?.mGeo.cacheBytes != null ? Math.round(primera.mGeo.cacheBytes / 1e6) : '?',
    final: ultima?.mGeo.cacheBytes != null ? Math.round(ultima.mGeo.cacheBytes / 1e6) : '?',
    delta:
      Math.round((ultima?.mGeo.cacheBytes ?? 0) / 1e6) -
      Math.round((primera?.mGeo.cacheBytes ?? 0) / 1e6),
  },
]);
console.log(
  `\ncódigos: ${[...codigos.entries()]
    .sort()
    .map(([c, n]) => `${c}:${n}`)
    .join(' ')}  ·  errores de red o 5xx: ${errores}`,
);
console.log(
  'Lo que importa es la PENDIENTE de la memoria, no el valor. Una subida de los primeros minutos' +
    ' que luego se aplana es la caché llenándose; una que no para de subir es una fuga.',
);
