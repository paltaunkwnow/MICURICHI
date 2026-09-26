/** Argumentos del CLI del ETL, aparte de cli.ts para poder probarlos sin tocar ninguna base. */
import { parseArgs } from 'node:util';
import { ErrorEtl } from './pipeline.js';

export interface Argumentos {
  comando: string;
  version: string | undefined;
  capa: string | undefined;
  forzar: boolean;
}

export function leerArgumentos(argv: string[]): Argumentos {
  // pnpm reenvía los argumentos con un `--` separador (a veces dos, por el filtro anidado); parseArgs lo trataría como fin de opciones.
  const args = argv.filter((a) => a !== '--');
  // `--activar` activaba versiones fuera del panel y sin auditoría. Se retiró (§6.9); se dice por
  // qué en vez de dejar que parseArgs lo rechace como una opción desconocida cualquiera.
  if (args.some((a) => a === '--activar' || a.startsWith('--activar=')))
    throw new ErrorEtl(
      '--activar ya no existe. Activar una versión de capas es acción del administrador desde el panel (Capas → Activar), que la deja en auditoría. El ETL solo activa una capa que no tiene ninguna versión vigente (arranque de una base nueva).',
    );
  try {
    const { positionals, values } = parseArgs({
      args,
      allowPositionals: true,
      options: {
        version: { type: 'string' },
        capa: { type: 'string' },
        forzar: { type: 'boolean', default: false },
      },
    });
    return {
      comando: positionals[0] ?? 'all',
      version: values.version,
      capa: values.capa,
      forzar: values.forzar ?? false,
    };
  } catch (e) {
    throw new ErrorEtl(`Argumentos inválidos: ${(e as Error).message}`);
  }
}
