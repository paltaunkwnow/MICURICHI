import { crearPool, esperarBaseDeDatos, urlBaseDeDatos } from '../cliente.js';
import { ejecutorPg } from '../ejecutor.js';
import { recalcularPuntosCriticos } from '../puntos-criticos.js';

const pool = crearPool(urlBaseDeDatos(), 1);
try {
  await esperarBaseDeDatos(pool, 10, 500);
  console.log(
    '[db] puntos críticos:',
    JSON.stringify(await recalcularPuntosCriticos(ejecutorPg(pool))),
  );
} finally {
  await pool.end();
}
