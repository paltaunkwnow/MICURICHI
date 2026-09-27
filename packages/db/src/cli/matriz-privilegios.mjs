/**
 * Matriz de privilegios de los roles de aplicación: lo que `pnpm privilegios`
 * (`verificar-privilegios.mjs`) exige encontrar en una base real, ni uno más ni uno menos.
 *
 * Está aparte del script para que `test/matriz-privilegios.test.ts` compruebe, sobre una base
 * migrada desde cero, que cada tabla tiene una decisión escrita para los dos roles: una tabla nueva
 * sin decisión falla en las pruebas y no recién al verificar contra Docker.
 *
 * Es la misma matriz que documentan las migraciones 0008, 0009, 0014 y 0016 y el informe de seguridad.
 */

export const ESPERADO = {
  curichi_api: {
    'public.reporte_inundacion': ['SELECT', 'INSERT', 'UPDATE'],
    'public.reporte_foto': ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
    'public.auditoria': ['INSERT'],
    // Solo SELECT a nivel de TABLA. El INSERT y el UPDATE existen, pero acotados a unas pocas
    // columnas (migración 0009), y `has_table_privilege` no los cuenta: distingue el privilegio
    // de tabla del de columna. Que aquí aparecieran sería justamente el fallo —significaría que
    // api-core puede escribir `rol` y fabricarse un administrador—, así que esta línea es una
    // aserción en negativo. Las columnas concretas se comprueban en COLUMNAS_ESPERADAS.
    'public.usuario': ['SELECT'],
    'public.sesion': ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
    'public.intento_login': ['SELECT', 'INSERT', 'DELETE'],
    'public.idempotencia': ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
    // Cupo diario (0014): cuenta y reserva (INSERT/UPDATE), libera el turno de una foto que no se
    // pudo procesar (UPDATE) y el mantenimiento borra los días anteriores (DELETE).
    'public.cuota_reporte_diaria': ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
    'public.punto_critico': ['SELECT', 'INSERT', 'DELETE'],
    'public.spatial_ref_sys': ['SELECT'],
    'public._migraciones': [],
    'geo.distrito_municipal': ['SELECT'],
    'geo.unidad_vecinal': ['SELECT'],
    'geo.manzana': ['SELECT'],
    'geo.capa_version': ['SELECT', 'UPDATE'],
  },
  curichi_geo: {
    'public.reporte_inundacion': ['SELECT'],
    'public.punto_critico': ['SELECT'],
    'public.spatial_ref_sys': ['SELECT'],
    'public.reporte_foto': [],
    'public.auditoria': [],
    'public.usuario': [],
    'public.sesion': [],
    'public.intento_login': [],
    'public.idempotencia': [],
    'public.cuota_reporte_diaria': [],
    'public._migraciones': [],
    'geo.distrito_municipal': ['SELECT'],
    'geo.unidad_vecinal': ['SELECT'],
    'geo.manzana': ['SELECT'],
    'geo.capa_version': ['SELECT'],
  },
};

/**
 * Privilegios por COLUMNA. Sin esto, la matriz de arriba no distinguiría «puede escribir tres
 * columnas» de «puede escribir la tabla entera», y en `usuario` esa diferencia es exactamente la
 * que impide que el registro público pueda fabricar un administrador: si `rol` apareciera en
 * estas listas, un INSERT con `rol: 'admin'` dejaría de ser imposible para pasar a ser una
 * cuestión de que el código no se equivoque.
 */
export const COLUMNAS_ESPERADAS = {
  curichi_api: {
    'public.usuario': {
      INSERT: ['email', 'nombre', 'password_hash'],
      // `ultimo_reporte_en` (0009) se revocó y se borró en la 0016.
      UPDATE: ['password_hash'],
    },
  },
  curichi_geo: {},
};
