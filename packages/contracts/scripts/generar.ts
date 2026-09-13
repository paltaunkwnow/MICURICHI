/**
 * Genera openapi/openapi.yaml y dist/dominio.json desde los esquemas Zod.
 * Se ejecuta en `pnpm --filter contracts build`. No editar las salidas a mano.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { CONFIG_DOMINIO, NOTA_METODOLOGICA } from '../src/dominio/config.js';
import * as enums from '../src/dominio/enums.js';
import { BANDAS, PESOS, PUNTOS, SEVERIDAD_VERSION } from '../src/dominio/severidad.js';
import { construirOpenApi } from '../src/openapi.js';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const openapi = construirOpenApi();
mkdirSync(resolve(raiz, 'openapi'), { recursive: true });
writeFileSync(
  resolve(raiz, 'openapi/openapi.yaml'),
  `# GENERADO por packages/contracts/scripts/generar.ts — no editar a mano\n${stringify(openapi)}`,
);

const dominio = {
  generado_por: 'packages/contracts',
  enums: {
    tirante: enums.TIRANTES,
    duracion: enums.DURACIONES,
    frecuencia: enums.FRECUENCIAS,
    afectacion: enums.AFECTACIONES,
    causa_presunta: enums.CAUSAS_PRESUNTAS,
    severidad: enums.SEVERIDADES,
    estado: enums.ESTADOS_REPORTE,
    rol: enums.ROLES,
    tipo_capa: enums.TIPOS_CAPA,
  },
  etiquetas: enums.ETIQUETAS,
  colores_severidad: enums.COLORES_SEVERIDAD,
  config: CONFIG_DOMINIO,
  severidad: { version: SEVERIDAD_VERSION, puntos: PUNTOS, pesos: PESOS, bandas: BANDAS },
  campos_capa: [
    'id',
    'codigo',
    'nombre',
    'tipo',
    'distrito_id',
    'unidad_vecinal_id',
    'version_capa',
    'fuente',
    'fecha_vigencia',
  ],
  nota_metodologica: NOTA_METODOLOGICA,
};
mkdirSync(resolve(raiz, 'dist'), { recursive: true });
writeFileSync(resolve(raiz, 'dist/dominio.json'), `${JSON.stringify(dominio, null, 2)}\n`);
console.log('contracts: openapi/openapi.yaml y dist/dominio.json generados');
