/**
 * Migraciones al arrancar `pnpm db:local`, separadas de `servidor.ts` (que arranca al importarse)
 * para poder probarlas.
 */
import type { Ejecutor } from '../ejecutor.js';
import { aplicarMigraciones, type ResultadoMigracion } from '../migrar.js';

const BANDERA = '--publicar-nuevos-existentes';

/**
 * Lo mismo que `--publicar-nuevos-existentes` del CLI de migraciones: deja que la 0015 publique los
 * reportes en «nuevo» anteriores. Sin esto, una base persistida con alguno no arrancaría nunca.
 * Solo `1` lo activa: un valor mal escrito no puede publicar nada.
 */
export function publicarNuevosExistentesLocal(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): boolean {
  return argv.includes(BANDERA) || env.PGLITE_PUBLICAR_NUEVOS_EXISTENTES === '1';
}

export async function migrarBaseLocal(
  ex: Ejecutor,
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<ResultadoMigracion & { publicarNuevosExistentes: boolean }> {
  const publicarNuevosExistentes = publicarNuevosExistentesLocal(argv, env);
  try {
    const r = await aplicarMigraciones(ex, { publicarNuevosExistentes });
    return { ...r, publicarNuevosExistentes };
  } catch (e) {
    const mensaje = (e as Error).message;
    // El mensaje de la 0015 habla del CLI de migraciones; con db:local la opción es otra.
    if (!publicarNuevosExistentes && mensaje.includes(BANDERA))
      throw new Error(
        `${mensaje}\nCon db:local: PGLITE_PUBLICAR_NUEVOS_EXISTENTES=1 pnpm db:local (solo si publicarlos es a sabiendas; en local suelen ser datos de ejemplo).`,
        { cause: e },
      );
    throw e;
  }
}
