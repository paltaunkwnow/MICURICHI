/**
 * Configuración de `db` que depende de la instalación y no del código.
 *
 * Mi Curichi se replica con UNA instalación por ciudad: lo que ata el paquete a Santa Cruz (el CRS
 * métrico) o a la operación de un despliegue (cuánto espera una migración por un lock) se lee de
 * variables de entorno con un valor por defecto seguro. Un valor mal escrito NO cae en silencio al
 * defecto: se rechaza con un mensaje que nombra la variable, porque un CRS equivocado agrupa mal
 * todos los reportes sin dar ningún error visible.
 */
import { CONFIG_DOMINIO } from 'contracts';

const ENTERO = /^\d+$/;

/**
 * CRS métrico con el que se miden los metros de la recurrencia (§9.2): `ST_ClusterDBSCAN` y el
 * recálculo incremental agrupan sobre `ST_Transform(geom, <este CRS>)`. Tiene que ser una
 * proyección en metros que cubra la ciudad (UTM de su zona); por defecto, el de contracts
 * (EPSG:32720, WGS 84 / UTM 20S, Santa Cruz).
 */
export function crsMetricoEpsg(valor = process.env.CRS_METRICO_EPSG): number {
  const texto = valor?.trim() ?? '';
  if (texto === '') return CONFIG_DOMINIO.CRS_METRICO_EPSG;
  const n = Number(texto);
  if (!ENTERO.test(texto) || n <= 0)
    throw new Error(
      `CRS_METRICO_EPSG inválido («${valor}»): tiene que ser un código EPSG entero de una proyección en metros, p. ej. 32720 (UTM 20S).`,
    );
  return n;
}

/** Plazo por defecto para conseguir los locks de una migración (ver `lockTimeoutMigracionMs`). */
export const LOCK_TIMEOUT_MIGRACION_MS_POR_DEFECTO = 10_000;

/**
 * `lock_timeout` de cada migración, en ms. Un ALTER TABLE que espera su lock exclusivo detrás de
 * una lectura larga deja en cola, detrás de él, a todas las consultas de esa tabla: sin plazo, una
 * migración en hora de tráfico es una caída. Con plazo, la migración falla (SQLSTATE 55P03) y se
 * reintenta más tarde. `0` quita el límite, y solo debe usarse a propósito.
 */
export function lockTimeoutMigracionMs(valor = process.env.MIGRAR_LOCK_TIMEOUT_MS): number {
  const texto = valor?.trim() ?? '';
  if (texto === '') return LOCK_TIMEOUT_MIGRACION_MS_POR_DEFECTO;
  // PostgreSQL guarda los plazos en un int de milisegundos: más allá, `SET` falla a mitad.
  if (!ENTERO.test(texto) || Number(texto) > 2_147_483_647)
    throw new Error(
      `MIGRAR_LOCK_TIMEOUT_MS inválido («${valor}»): tiene que ser un entero de milisegundos (0 = sin límite).`,
    );
  return Number(texto);
}
