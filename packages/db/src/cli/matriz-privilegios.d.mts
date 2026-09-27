/** Tipos de `matriz-privilegios.mjs`, para importarla desde las pruebas en TypeScript. */
export type RolAplicacion = 'curichi_api' | 'curichi_geo';
export type Operacion = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';

/** Tabla (`esquema.tabla`) → operaciones de tabla que el rol tiene que tener, exactamente. */
export declare const ESPERADO: Record<RolAplicacion, Record<string, Operacion[]>>;

/** Tabla → operación → columnas en las que el rol tiene ese privilegio, exactamente. */
export declare const COLUMNAS_ESPERADAS: Record<
  RolAplicacion,
  Record<string, Partial<Record<Operacion, string[]>>>
>;
