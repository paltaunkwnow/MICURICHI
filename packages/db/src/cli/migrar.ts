import { crearPool, esperarBaseDeDatos, urlBaseDeDatos } from '../cliente.js';
import { ejecutorPg } from '../ejecutor.js';
import { aplicarMigraciones } from '../migrar.js';

const pool = crearPool(urlBaseDeDatos(), 1);
try {
  await esperarBaseDeDatos(pool, 10, 500);
  const r = await aplicarMigraciones(ejecutorPg(pool));
  console.log(
    `[db] migraciones aplicadas: ${r.aplicadas.length ? r.aplicadas.join(', ') : 'ninguna (al día)'}`,
  );
} finally {
  await pool.end();
}
