import { crearPool, esperarBaseDeDatos, urlBaseDeDatos } from '../cliente.js';
import { ejecutorPg } from '../ejecutor.js';
import { sembrarSamples } from '../seeds/samples.js';

const pool = crearPool(urlBaseDeDatos(), 1);
try {
  await esperarBaseDeDatos(pool, 10, 500);
  const r = await sembrarSamples(ejecutorPg(pool));
  console.log('[db] seeds SINTÉTICOS cargados:', JSON.stringify(r));
  console.log(
    '[db] usuarios locales: admin@curichi.local / tecnico@curichi.local (contraseñas: ver packages/db/README.md)',
  );
} finally {
  await pool.end();
}
