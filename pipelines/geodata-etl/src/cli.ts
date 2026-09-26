/**
 * CLI del ETL (Parte 5):
 *   pnpm etl:inspect -- --version DM_UV_MZ_2025
 *   pnpm etl:run     -- --version DM_UV_MZ_2025 [--forzar]
 *   pnpm etl:load    -- --version DM_UV_MZ_2025
 *   pnpm etl:all                                  (run + load de todas las versiones cuya carpeta exista)
 *
 * `etl:load` no activa versiones: eso se hace desde el panel (Capas → Activar). Solo activa una
 * capa que no tiene ninguna versión vigente, y lo registra en auditoría (ver pasos/cargar.ts).
 */
import { existsSync } from 'node:fs';
import { crearPool, ejecutorPg, esperarBaseDeDatos, urlBaseDeDatos } from 'db';
import { leerArgumentos } from './argumentos.js';
import { cargarConfig, rutaAbsoluta } from './config.js';
import { cargarVersion } from './pasos/cargar.js';
import { ErrorEtl, inspeccionar, procesarVersion, resolverCapas } from './pipeline.js';

async function main() {
  const argumentos = leerArgumentos(process.argv.slice(2));
  const comando = argumentos.comando;
  const cfg = cargarConfig();

  const versionesElegidas = () => {
    if (argumentos.version) {
      const v = cfg.versiones.find((x) => x.version === argumentos.version);
      if (!v)
        throw new ErrorEtl(
          `Versión ${argumentos.version} no está en config/capas.yaml. Disponibles: ${cfg.versiones.map((x) => x.version).join(', ')}`,
        );
      return [v];
    }
    return cfg.versiones.filter((v) => existsSync(rutaAbsoluta(v.carpeta)));
  };

  const versiones = versionesElegidas();
  if (!versiones.length)
    throw new ErrorEtl(
      'Ninguna versión tiene su carpeta en disco. Copiá los shapefiles a data/raw/<version>/ o generá la muestra: pnpm --filter geodata-etl samples:generar',
    );

  if (comando === 'inspect') {
    for (const v of versiones) {
      console.log(`\n=== ${v.version} (${rutaAbsoluta(v.carpeta)})`);
      for (const cr of resolverCapas(v)) {
        if (argumentos.capa && cr.capa !== argumentos.capa) continue;
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
      const r = await procesarVersion(cfg, v, { forzar: argumentos.forzar });
      console.log(`\n[${v.version}] procesadas ${r.length} capas`);
      // Se repiten al final: en la corrida de manzanas quedan cientos de líneas por encima.
      for (const c of r) for (const a of c.avisos) console.log(`!! AVISO [${c.capa}] ${a}`);
    }
  }
  if (comando === 'load' || comando === 'all') {
    // Una conexión basta: cada versión se carga en una transacción sobre una conexión dedicada.
    const pool = crearPool(urlBaseDeDatos(), 1);
    try {
      await esperarBaseDeDatos(pool, 10, 500);
      const ex = ejecutorPg(pool);
      for (const v of versiones) {
        const capas = resolverCapas(v)
          .map((cr) => cr.capa)
          .filter((capa) => !argumentos.capa || capa === argumentos.capa);
        const resultados = await cargarVersion(ex, v.version, capas, {
          fuente: v.fuente,
          fechaVigencia: v.fecha_vigencia,
        });
        for (const r of resultados)
          console.log(
            `[${v.version}/${r.capa}] cargadas ${r.n} features → geo.${r.capa} (vigente: ${r.vigente}${r.activadaEnArranque ? ', activada en el arranque: la capa no tenía versión vigente; queda en auditoría' : ''}${r.reparadas ? `, ${r.reparadas} reparadas con ST_MakeValid` : ''})`,
          );
        if (resultados.some((r) => !r.vigente))
          console.log(
            `La versión ${v.version} quedó cargada SIN activar: la activa un administrador desde el panel (Capas → Activar).`,
          );
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
