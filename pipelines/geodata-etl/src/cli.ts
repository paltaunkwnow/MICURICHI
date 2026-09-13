/**
 * CLI del ETL (Parte 5):
 *   pnpm etl:inspect -- --version DM_UV_MZ_2025
 *   pnpm etl:run     -- --version DM_UV_MZ_2025 [--forzar]
 *   pnpm etl:load    -- --version DM_UV_MZ_2025 [--activar]
 *   pnpm etl:all                                  (run + load de todas las versiones cuya carpeta exista)
 */
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { crearPool, ejecutorPg, esperarBaseDeDatos, urlBaseDeDatos } from 'db';
import { cargarConfig, rutaAbsoluta } from './config.js';
import { cargarCapa } from './pasos/cargar.js';
import { ErrorEtl, inspeccionar, procesarVersion, resolverCapas } from './pipeline.js';

// pnpm reenvía los argumentos con un `--` separador (a veces dos, por el filtro anidado); parseArgs lo trataría como fin de opciones.
const args = process.argv.slice(2).filter((a) => a !== '--');
const { positionals, values } = parseArgs({
  args,
  allowPositionals: true,
  options: {
    version: { type: 'string' },
    capa: { type: 'string' },
    forzar: { type: 'boolean', default: false },
    activar: { type: 'boolean', default: false },
  },
});
const comando = positionals[0] ?? 'all';
const cfg = cargarConfig();

function versionesElegidas() {
  if (values.version) {
    const v = cfg.versiones.find((x) => x.version === values.version);
    if (!v)
      throw new ErrorEtl(
        `Versión ${values.version} no está en config/capas.yaml. Disponibles: ${cfg.versiones.map((x) => x.version).join(', ')}`,
      );
    return [v];
  }
  return cfg.versiones.filter((v) => existsSync(rutaAbsoluta(v.carpeta)));
}

async function main() {
  const versiones = versionesElegidas();
  if (!versiones.length)
    throw new ErrorEtl(
      'Ninguna versión tiene su carpeta en disco. Copiá los shapefiles a data/raw/<version>/ o generá la muestra: pnpm --filter geodata-etl samples:generar',
    );

  if (comando === 'inspect') {
    for (const v of versiones) {
      console.log(`\n=== ${v.version} (${rutaAbsoluta(v.carpeta)})`);
      for (const cr of resolverCapas(v)) {
        if (values.capa && cr.capa !== values.capa) continue;
        const i = await inspeccionar(v, cr);
        console.log(JSON.stringify(i, null, 2));
        if (!i.crs.wkt && !v.crs_origen)
          console.log(
            `!! ${cr.capa}: falta .prj. Confirmá el CRS de origen y declaralo en config/capas.yaml (crs_origen).`,
          );
      }
    }
    return;
  }
  if (comando === 'run' || comando === 'all') {
    for (const v of versiones) {
      const r = await procesarVersion(cfg, v, { forzar: values.forzar });
      console.log(`\n[${v.version}] procesadas ${r.length} capas`);
    }
  }
  if (comando === 'load' || comando === 'all') {
    const pool = crearPool(urlBaseDeDatos(), 1);
    try {
      await esperarBaseDeDatos(pool, 10, 500);
      const ex = ejecutorPg(pool);
      for (const v of versiones) {
        for (const cr of resolverCapas(v)) {
          if (values.capa && cr.capa !== values.capa) continue;
          const r = await cargarCapa(ex, v.version, cr.capa, {
            activar: values.activar,
            fuente: v.fuente,
            fechaVigencia: v.fecha_vigencia,
          });
          console.log(
            `[${v.version}/${cr.capa}] cargadas ${r.n} features → geo.${cr.capa} (vigente: ${r.vigente})`,
          );
        }
      }
    } finally {
      await pool.end();
    }
  }
}

main().catch((e) => {
  console.error(`\nETL detenido: ${(e as Error).message}`);
  process.exit(1);
});
