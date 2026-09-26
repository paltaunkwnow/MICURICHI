import type pg from 'pg';

export interface ConsultaVista {
  sql: string;
  params: unknown[];
}

/**
 * Espía un pool de `pg`: registra cada consulta (venga de `pool.query` o de un cliente tomado con
 * `pool.connect()`) y cuántas conexiones hubo tomadas a la vez. Se engancha a los eventos
 * `acquire` y `release` del pool, así que ve lo mismo que vería la base.
 */
export function espiarPool(pool: pg.Pool) {
  const consultas: ConsultaVista[] = [];
  const envueltos = new WeakSet<object>();
  let enUso = 0;
  let maxEnUso = 0;

  pool.on('acquire', (cliente) => {
    enUso++;
    maxEnUso = Math.max(maxEnUso, enUso);
    if (envueltos.has(cliente)) return;
    envueltos.add(cliente);
    const original = cliente.query.bind(cliente) as (...a: unknown[]) => unknown;
    (cliente as { query: unknown }).query = (...args: unknown[]) => {
      const [primero, segundo] = args;
      const config = primero as { text?: string; values?: unknown[] } | undefined;
      consultas.push({
        sql: typeof primero === 'string' ? primero : (config?.text ?? ''),
        params: Array.isArray(segundo) ? segundo : (config?.values ?? []),
      });
      return original(...args);
    };
  });
  pool.on('release', () => {
    enUso--;
  });

  return {
    consultas,
    /** Máximo de conexiones tomadas a la vez desde el último `reiniciar()`. */
    get maxEnUso() {
      return maxEnUso;
    },
    reiniciar() {
      consultas.length = 0;
      maxEnUso = enUso;
    },
    /** Consultas registradas cuyo SQL casa con el patrón. */
    contar(patron: RegExp) {
      return consultas.filter((c) => patron.test(c.sql)).length;
    },
  };
}
