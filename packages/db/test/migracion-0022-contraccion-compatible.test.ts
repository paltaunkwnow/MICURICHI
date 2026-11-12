/** Contracción física compatible: solo fixtures PGlite, nunca instalaciones ni operadores reales. */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Ejecutor, ejecutorPglite } from '../src/ejecutor.js';
import { ejecutarMantenimiento } from '../src/mantenimiento.js';
import { aplicarMigraciones, DIRECTORIO_MIGRACIONES } from '../src/migrar.js';

const ARCHIVO = '0022_contraccion_compatible.sql';
const PLANOS = [
  'profundidad_estimada',
  'frecuencia',
  'causa_presunta',
  'sumidero_cercano',
  'sumidero_estado',
  'agua_brota_sumidero',
];
const TIPOS = [
  'profundidad_estimada',
  'frecuencia',
  'causa_presunta',
  'sumidero_cercano',
  'sumidero_estado',
];
async function base21(fn: (ex: Ejecutor) => Promise<void>, filas = true, desdeCero = false) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { postgis } = await import('@electric-sql/pglite-postgis');
  const db = await PGlite.create({ dataDir: 'memory://', extensions: { postgis } });
  const ex = ejecutorPglite(db);
  try {
    await ex.ejecutar('CREATE ROLE curichi_api NOLOGIN; CREATE ROLE curichi_geo NOLOGIN;');
    await aplicarMigraciones(
      ex,
      desdeCero ? { autorizarContraccionCompatible: true } : { hasta: '0021' },
    );
    if (filas) {
      await ex.ejecutar(`INSERT INTO usuario (id,email,nombre,password_hash) VALUES
        ('00000000-0000-4000-8000-000000000022','fixture22@test.local','Fixture22','fixture');
        UPDATE categoria SET activa = true;
        INSERT INTO cuota_reporte_diaria (usuario_id,dia,reportes_n,fotos_n,actualizado_en) VALUES
        ('00000000-0000-4000-8000-000000000022','2026-01-01',3,12,'2026-01-01T12:34:56.123456Z');
        INSERT INTO cupo_contador (usuario_id,clave,ventana_inicio,n) VALUES
        ('00000000-0000-4000-8000-000000000022','reportes:inundacion',now(),2),
        ('00000000-0000-4000-8000-000000000022','fotos:cuenta',now(),7);`);
      await ex.ejecutar(`INSERT INTO sesion(id,usuario_id,expira_en) VALUES('sesion-fixture22','00000000-0000-4000-8000-000000000022',now()+interval '1 day');
        INSERT INTO intento_login(clave,exito) VALUES('fixture22',false);`);
      for (const [i, categoria] of ['inundacion', 'bache', 'area_verde', 'basura'].entries()) {
        const [r] = await ex.consultar<{ id: string }>(
          `INSERT INTO reporte
          (categoria,geom,geom_publico,autor_id,distrito_id,unidad_vecinal_id,ubicacion_metodo,ubicacion_tipo,
           descripcion,profundidad_estimada,frecuencia,causa_presunta,agua_brota_sumidero,
           detalle,detalle_version,severidad_calculada,severidad_puntaje,estado,publicar_en)
          VALUES ($1,ST_SetSRID(ST_MakePoint(-63.18,-17.78),4326),ST_SetSRID(ST_MakePoint(-63.18,-17.78),4326),
           '00000000-0000-4000-8000-000000000022','d','u','manual','via_publica','Fixture íntegra multicategoría',
           CASE WHEN $1='inundacion' THEN 'rodilla'::profundidad_estimada END,
           CASE WHEN $1='inundacion' THEN 'agua_estancada'::frecuencia END,
           CASE WHEN $1='inundacion' THEN 'desconocida'::causa_presunta END,
           CASE WHEN $1='inundacion' THEN false END,$2::jsonb,1,'media',6,$3::estado_reporte,now()) RETURNING id::text`,
          [
            categoria,
            JSON.stringify({
              sintetico: true,
              categoria,
              opcional: null,
              falso: false,
              valores: [0, 1],
            }),
            i % 2 ? 'resuelto' : 'validado',
          ],
        );
        await ex.consultar(
          `INSERT INTO reporte_foto(reporte_id,objeto_key,mime,bytes,ancho,alto,exif_sanitizado,subido_por)
          VALUES($1,$2,'image/webp',12,1,1,true,'00000000-0000-4000-8000-000000000022')`,
          [r!.id, `${categoria}-22.webp`],
        );
        await ex.consultar(
          `INSERT INTO auditoria(entidad,entidad_id,accion,antes,despues)
          VALUES('reporte',$1,'fixture',NULL,$2::jsonb)`,
          [r!.id, JSON.stringify({ categoria, falso: false })],
        );
        await ex.consultar(`INSERT INTO idempotencia(clave,huella,reporte_id) VALUES($1,$2,$3)`, [
          `${categoria}-fixture22`,
          `${categoria}-huella22`,
          r!.id,
        ]);
        const [pc] = await ex.consultar<{ id: string }>(
          `INSERT INTO punto_critico(geom,n_reportes,primer_reporte_en,ultimo_reporte_en,severidad_max,radio_m,categoria)
          VALUES(ST_SetSRID(ST_MakePoint(-63.18,-17.78),4326),1,now(),now(),'media',25,$1) RETURNING id::text`,
          [categoria],
        );
        await ex.consultar('UPDATE reporte SET punto_critico_id=$1 WHERE id=$2', [pc!.id, r!.id]);
      }
    }
    await fn(ex);
  } finally {
    await db.close();
  }
}
const contraer = (ex: Ejecutor) => aplicarMigraciones(ex, { autorizarContraccionCompatible: true });
const reversa = (ex: Ejecutor) =>
  ex.ejecutar(
    readFileSync(
      resolve(DIRECTORIO_MIGRACIONES, 'reversas/0022_contraccion_compatible_reversa.sql'),
      'utf8',
    ),
  );
async function foto(ex: Ejecutor) {
  const tablas = await ex.consultar<{
    s: string;
    t: string;
  }>(`SELECT schemaname AS s,tablename AS t FROM pg_tables
    WHERE schemaname IN ('public','geo','resguardo_m10') AND tablename NOT IN ('spatial_ref_sys','cuota_reporte_diaria') ORDER BY 1,2`);
  const datos: Record<string, unknown> = {};
  for (const { s, t } of tablas) {
    const quitar = t === 'reporte' ? `- ARRAY[${PLANOS.map((k) => `'${k}'`).join(',')}]` : '';
    const filtro = t === '_migraciones' ? `WHERE nombre <> '${ARCHIVO}'` : '';
    const [r] = await ex.consultar<{
      filas: unknown;
    }>(`SELECT coalesce(jsonb_agg(fila ORDER BY fila::text),'[]'::jsonb) AS filas
      FROM (SELECT to_jsonb(t) ${quitar} AS fila FROM ${s}.${t} t ${filtro}) filas`);
    datos[`${s}.${t}`] = r!.filas;
  }
  const [tabla] = await ex.consultar<{ nombre: string | null }>(
    `SELECT to_regclass('public.cuota_reporte_diaria')::text AS nombre`,
  );
  const nombre = tabla!.nombre ?? 'resguardo_m10.cuota_reporte_diaria';
  datos.cuota = await ex.consultar(`SELECT * FROM ${nombre} ORDER BY usuario_id,dia`);
  return datos;
}
async function planosPresentes(ex: Ejecutor) {
  return ex.consultar<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='reporte' AND column_name=ANY($1::text[]) ORDER BY 1`,
    [PLANOS],
  );
}

describe('0022: negativos de catálogo DDL-03-R y DDL-05', () => {
  it(
    'DDL-03-R: reversa rechaza CHECK homónimo true y detalle con clave extra antes de DDL',
    async () =>
      base21(async (ex) => {
        await contraer(ex);
        await ex.ejecutar(`ALTER TABLE public.reporte DROP CONSTRAINT m10_0022_inundacion_detalle_v1;
          ALTER TABLE public.reporte ADD CONSTRAINT m10_0022_inundacion_detalle_v1 CHECK (true);
          UPDATE public.reporte SET detalle=detalle||'{"dato_extra":true}' WHERE categoria='inundacion';`);
        expect(await ex.consultar('SELECT * FROM public.estado_esquema_m10()')).toEqual([
          { version: 22, integro: false },
        ]);
        const antes = await foto(ex);
        const historial = await ex.consultar(
          'SELECT nombre FROM public._migraciones ORDER BY nombre',
        );
        const catalogo = () =>
          ex.consultar(`SELECT conname,contype,convalidated,pg_get_constraintdef(oid,false) AS definicion
          FROM pg_constraint WHERE conrelid IN ('public.reporte'::regclass,'resguardo_m10.cuota_reporte_diaria'::regclass)
          ORDER BY conrelid,conname`);
        const restricciones = await catalogo();
        await expect(reversa(ex)).rejects.toThrow(/integridad|reversib/);
        await ex.ejecutar('ROLLBACK');
        expect(await foto(ex)).toStrictEqual(antes);
        expect(await catalogo()).toStrictEqual(restricciones);
        expect(await planosPresentes(ex)).toEqual([]);
        expect(
          await ex.consultar('SELECT nombre FROM public._migraciones ORDER BY nombre'),
        ).toStrictEqual(historial);
        expect(await ex.consultar('SELECT * FROM public.estado_esquema_m10()')).toEqual([
          { version: 22, integro: false },
        ]);
      }),
    120_000,
  );
  it.each(['curichi_geo', 'PUBLIC'])(
    'DDL-05: preflight rechaza archivo idéntico con ACL de columna a %s',
    async (rol) =>
      base21(async (ex) => {
        await ex.ejecutar(`CREATE SCHEMA resguardo_m10;
          CREATE TABLE resguardo_m10.cuota_reporte_diaria (LIKE public.cuota_reporte_diaria INCLUDING ALL);
          INSERT INTO resguardo_m10.cuota_reporte_diaria SELECT * FROM public.cuota_reporte_diaria;
          GRANT SELECT(usuario_id) ON resguardo_m10.cuota_reporte_diaria TO ${rol};`);
        expect(
          await ex.consultar(`SELECT has_column_privilege('curichi_geo','resguardo_m10.cuota_reporte_diaria','usuario_id','SELECT') AS columna,
          has_table_privilege('curichi_geo','resguardo_m10.cuota_reporte_diaria','SELECT') AS tabla,
          has_schema_privilege('curichi_geo','resguardo_m10','USAGE') AS esquema`),
        ).toEqual([{ columna: true, tabla: false, esquema: false }]);
        const antes = await foto(ex);
        const acl = await ex.consultar(`SELECT attname,attacl::text FROM pg_attribute
          WHERE attrelid='resguardo_m10.cuota_reporte_diaria'::regclass AND attnum>0 ORDER BY attnum`);
        await expect(contraer(ex)).rejects.toThrow(/archivo.*permisos|columna/);
        expect(await foto(ex)).toStrictEqual(antes);
        expect(await planosPresentes(ex)).toHaveLength(6);
        expect(
          await ex.consultar(`SELECT attname,attacl::text FROM pg_attribute
          WHERE attrelid='resguardo_m10.cuota_reporte_diaria'::regclass AND attnum>0 ORDER BY attnum`),
        ).toStrictEqual(acl);
        expect(
          await ex.consultar('SELECT nombre FROM public._migraciones WHERE nombre=$1', [ARCHIVO]),
        ).toEqual([]);
      }),
    120_000,
  );
  it.each(['curichi_geo', 'PUBLIC'])(
    'DDL-05: interfaz detecta ACL de columna de archivo a %s aunque no haya USAGE',
    async (rol) =>
      base21(async (ex) => {
        await contraer(ex);
        expect(await ex.consultar('SELECT * FROM public.estado_esquema_m10()')).toEqual([
          { version: 22, integro: true },
        ]);
        await ex.ejecutar(
          `GRANT SELECT(usuario_id) ON resguardo_m10.cuota_reporte_diaria TO ${rol}`,
        );
        expect(
          await ex.consultar(
            `SELECT has_schema_privilege('curichi_geo','resguardo_m10','USAGE') AS uso`,
          ),
        ).toEqual([{ uso: false }]);
        await ex.ejecutar('SET ROLE curichi_api');
        try {
          expect(await ex.consultar('SELECT * FROM public.estado_esquema_m10()')).toEqual([
            { version: 22, integro: false },
          ]);
        } finally {
          await ex.ejecutar('RESET ROLE');
        }
      }),
    120_000,
  );
});

describe('0022: negativos de revisión DDL-01 a DDL-04', () => {
  it(
    'DDL-01 ampliación: reversa conserva ACL de vista y funciones invoker ante defaults ajenos',
    async () =>
      base21(async (ex) => {
        const acl = () =>
          ex.consultar(`SELECT 'funcion:'||p.proname AS objeto,a.grantee::regrole::text AS rol,
            a.privilege_type,a.is_grantable FROM pg_proc p
            CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
            WHERE p.pronamespace='public'::regnamespace
              AND p.proname IN ('detalle_inundacion','reporte_sincronizar_detalle')
            UNION ALL
            SELECT 'relacion:'||c.relname,a.grantee::regrole::text,a.privilege_type,a.is_grantable
            FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
            WHERE c.oid IN ('public.reporte_inundacion'::regclass,'public.cuota_reporte_diaria'::regclass)
            ORDER BY 1,2,3`);
        const permisos = await acl();
        const antes = await foto(ex);
        await ex.ejecutar(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO curichi_geo;
          ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT INSERT ON TABLES TO curichi_geo, PUBLIC;`);
        const defaults = await ex.consultar('SELECT * FROM pg_default_acl ORDER BY oid');
        await contraer(ex);
        await reversa(ex);
        expect(await foto(ex)).toStrictEqual(antes);
        expect(await ex.consultar('SELECT * FROM pg_default_acl ORDER BY oid')).toStrictEqual(
          defaults,
        );
        expect(await acl()).toStrictEqual(permisos);
        expect(
          await ex.consultar(`SELECT proname,prosecdef FROM pg_proc WHERE pronamespace='public'::regnamespace
            AND proname IN ('detalle_inundacion','reporte_sincronizar_detalle') ORDER BY proname`),
        ).toEqual([
          { proname: 'detalle_inundacion', prosecdef: false },
          { proname: 'reporte_sincronizar_detalle', prosecdef: false },
        ]);
        await ex.ejecutar(`CREATE FUNCTION public.fixture_default_ajeno() RETURNS integer LANGUAGE sql AS 'SELECT 1';
          CREATE TABLE public.fixture_default_ajeno(id integer);`);
        expect(
          await ex.consultar(`SELECT has_function_privilege('curichi_geo','public.fixture_default_ajeno()','EXECUTE') AS ejecutar,
            has_table_privilege('curichi_geo','public.fixture_default_ajeno','INSERT') AS insertar`),
        ).toEqual([{ ejecutar: true, insertar: true }]);
      }),
    120_000,
  );
  it.each(['curichi_geo', 'PUBLIC'])(
    'DDL-01: reversa no hereda grants de cuota a %s y conserva defaults ajenos',
    async (rol) =>
      base21(async (ex) => {
        expect(
          await ex.consultar(
            `SELECT has_table_privilege('curichi_geo','public.cuota_reporte_diaria','SELECT') AS lectura`,
          ),
        ).toEqual([{ lectura: false }]);
        await ex.ejecutar(
          `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${rol}`,
        );
        const defaults = await ex.consultar('SELECT * FROM pg_default_acl ORDER BY oid');
        const antes = await foto(ex);
        await contraer(ex);
        await reversa(ex);
        expect(await foto(ex)).toStrictEqual(antes);
        expect(await ex.consultar('SELECT * FROM pg_default_acl ORDER BY oid')).toStrictEqual(
          defaults,
        );
        expect(
          await ex.consultar(
            `SELECT has_table_privilege('curichi_geo','public.cuota_reporte_diaria','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS lectura`,
          ),
        ).toEqual([{ lectura: false }]);
        expect(
          await ex.consultar(`SELECT a.grantee FROM pg_class c CROSS JOIN LATERAL
            aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
            WHERE c.oid='public.cuota_reporte_diaria'::regclass AND a.grantee=0`),
        ).toEqual([]);
        for (const privilegio of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
          expect(
            await ex.consultar(
              `SELECT has_table_privilege('curichi_api','public.cuota_reporte_diaria',$1) AS permitido`,
              [privilegio],
            ),
          ).toEqual([{ permitido: true }]);
        }
        // El default ajeno sigue vigente para objetos que no son la cuota restaurada.
        await ex.ejecutar('CREATE TABLE public.fixture_default_ajeno(id integer)');
        expect(
          await ex.consultar(
            `SELECT has_table_privilege('curichi_geo','public.fixture_default_ajeno','SELECT') AS lectura`,
          ),
        ).toEqual([{ lectura: true }]);
      }),
    120_000,
  );
  it(
    'DDL-02: archivo idéntico sin PK se rechaza antes de retirar cuota o planos',
    async () =>
      base21(async (ex) => {
        await ex.ejecutar(`CREATE SCHEMA resguardo_m10;
          CREATE TABLE resguardo_m10.cuota_reporte_diaria (LIKE public.cuota_reporte_diaria INCLUDING ALL);
          INSERT INTO resguardo_m10.cuota_reporte_diaria SELECT * FROM public.cuota_reporte_diaria;
          ALTER TABLE resguardo_m10.cuota_reporte_diaria DROP CONSTRAINT cuota_reporte_diaria_pkey;`);
        const antes = await foto(ex);
        const archivo = await ex.consultar('SELECT * FROM resguardo_m10.cuota_reporte_diaria');
        await expect(contraer(ex)).rejects.toThrow(/archivo.*estructura/);
        expect(await foto(ex)).toStrictEqual(antes);
        expect(await planosPresentes(ex)).toHaveLength(6);
        expect(
          await ex.consultar('SELECT * FROM resguardo_m10.cuota_reporte_diaria'),
        ).toStrictEqual(archivo);
        expect(
          await ex.consultar(`SELECT conname FROM pg_constraint
            WHERE conrelid='resguardo_m10.cuota_reporte_diaria'::regclass AND contype='p'`),
        ).toEqual([]);
        expect(
          await ex.consultar('SELECT nombre FROM _migraciones WHERE nombre=$1', [ARCHIVO]),
        ).toEqual([]);
      }),
    120_000,
  );
  it.each([
    [
      'm10_0022_inundacion_detalle_v1',
      `UPDATE reporte SET detalle='{}' WHERE categoria='inundacion'`,
    ],
    [
      'detalle_tope',
      `UPDATE reporte SET detalle=jsonb_build_object('x',repeat('x',8192)) WHERE categoria='bache'`,
    ],
    [
      'm10_0022_detalle_version_v1',
      `UPDATE reporte SET detalle_version=2 WHERE categoria='basura'`,
    ],
    ['detalle_es_objeto', `UPDATE reporte SET detalle='[]' WHERE categoria='bache'`],
  ])(
    'DDL-03: interfaz detecta CHECK homónimo true: %s',
    async (nombre, escrituraInvalida) =>
      base21(async (ex) => {
        await contraer(ex);
        expect(await ex.consultar('SELECT * FROM public.estado_esquema_m10()')).toEqual([
          { version: 22, integro: true },
        ]);
        await ex.ejecutar(`ALTER TABLE public.reporte DROP CONSTRAINT ${nombre};
          ALTER TABLE public.reporte ADD CONSTRAINT ${nombre} CHECK (true);`);
        if (nombre === 'm10_0022_detalle_version_v1') {
          await ex.ejecutar(`COMMENT ON CONSTRAINT ${nombre} ON public.reporte IS
            'mi_curichi:esquema=0022;almacenamiento=json;detalle_version=1'`);
        }
        await ex.ejecutar(escrituraInvalida);
        await ex.ejecutar('SET ROLE curichi_api');
        try {
          expect(await ex.consultar('SELECT * FROM public.estado_esquema_m10()')).toEqual([
            { version: 22, integro: false },
          ]);
        } finally {
          await ex.ejecutar('RESET ROLE');
        }
      }),
    120_000,
  );
  it(
    'DDL-04: esquema nuevo queda owner-only pese a defaults de esquema geo/PUBLIC intactos',
    async () =>
      base21(async (ex) => {
        await ex.ejecutar(
          'ALTER DEFAULT PRIVILEGES GRANT USAGE,CREATE ON SCHEMAS TO curichi_geo, PUBLIC',
        );
        const defaults = await ex.consultar('SELECT * FROM pg_default_acl ORDER BY oid');
        const antes = await foto(ex);
        await contraer(ex);
        expect(await foto(ex)).toStrictEqual(antes);
        expect(await ex.consultar('SELECT * FROM pg_default_acl ORDER BY oid')).toStrictEqual(
          defaults,
        );
        expect(
          await ex.consultar(`SELECT has_schema_privilege('curichi_geo','resguardo_m10','USAGE') AS uso,
            has_schema_privilege('curichi_geo','resguardo_m10','CREATE') AS crear`),
        ).toEqual([{ uso: false, crear: false }]);
        expect(
          await ex.consultar(`SELECT a.grantee FROM pg_namespace n CROSS JOIN LATERAL
            aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
            WHERE n.nspname='resguardo_m10' AND a.grantee<>n.nspowner`),
        ).toEqual([]);
        expect(await ex.consultar('SELECT * FROM public.estado_esquema_m10()')).toEqual([
          { version: 22, integro: true },
        ]);
        await ex.ejecutar('CREATE SCHEMA fixture_default_ajeno');
        expect(
          await ex.consultar(`SELECT has_schema_privilege('curichi_geo','fixture_default_ajeno','USAGE') AS uso,
            has_schema_privilege('curichi_geo','fixture_default_ajeno','CREATE') AS crear`),
        ).toEqual([{ uso: true, crear: true }]);
      }),
    120_000,
  );
});

describe('0022: consentimiento explícito y transaccional', () => {
  it('runner general rechaza antes de crear _migraciones o ejecutar cualquier DDL', async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const db = await PGlite.create();
    const ex = ejecutorPglite(db);
    const dir = mkdtempSync(join(tmpdir(), 'm10-22-guarda-'));
    writeFileSync(join(dir, '0001_fixture.sql'), 'CREATE TABLE mutacion_no_autorizada(id int);');
    writeFileSync(join(dir, ARCHIVO), 'CREATE TABLE contraccion_no_autorizada(id int);');
    try {
      await expect(aplicarMigraciones(ex, { directorio: dir })).rejects.toThrow(
        /autorizar-contraccion-compatible/,
      );
      expect(
        await ex.consultar(`SELECT tablename FROM pg_tables WHERE schemaname='public'`),
      ).toEqual([]);
    } finally {
      await db.close();
    }
  }, 120_000);
  it(
    'runner sobre21 rechaza sin consentimiento, conserva íntegros datos y catálogo',
    async () =>
      base21(async (ex) => {
        const antes = await foto(ex);
        await expect(aplicarMigraciones(ex)).rejects.toThrow(/autorizar-contraccion-compatible/);
        expect(await foto(ex)).toStrictEqual(antes);
        expect(await planosPresentes(ex)).toHaveLength(6);
      }),
    120_000,
  );
  it(
    'SQL directo rechaza sin señal y también señal de sesión heredada de otra transacción',
    async () =>
      base21(async (ex) => {
        const sql = readFileSync(join(DIRECTORIO_MIGRACIONES, ARCHIVO), 'utf8'),
          antes = await foto(ex);
        await expect(ex.transaccion((tx) => tx.ejecutar(sql))).rejects.toThrow(/consentimiento/);
        await ex.ejecutar(`SET curichi.autorizar_contraccion_compatible='si'`);
        await ex.consultar(
          `SELECT set_config('curichi.autorizar_contraccion_compatible_tx',txid_current()::text,false)`,
        );
        await expect(ex.transaccion((tx) => tx.ejecutar(sql))).rejects.toThrow(/consentimiento/);
        expect(await foto(ex)).toStrictEqual(antes);
      }),
    120_000,
  );
});

describe('0022: igualdad, archivo restringido y nueva autoridad JSON', () => {
  it.each([
    'ALTER TABLE public.reporte RENAME COLUMN geom TO geom_incompleto',
    'ALTER TABLE resguardo_m10.cuota_reporte_diaria RENAME COLUMN reportes_n TO reportes_n_roto',
  ])(
    'interfaz detecta columnas críticas incompletas: %s',
    async (sql) =>
      base21(
        async (ex) => {
          await ex.ejecutar(sql);
          await ex.ejecutar('SET ROLE curichi_api');
          try {
            expect(await ex.consultar('SELECT * FROM public.estado_esquema_m10()')).toEqual([
              { version: 22, integro: false },
            ]);
          } finally {
            await ex.ejecutar('RESET ROLE');
          }
        },
        false,
        true,
      ),
    120_000,
  );
  it(
    'interfaz mínima de esquema rechaza registros futuros reales sin conceder acceso al historial, PUBLIC ni geo',
    async () =>
      base21(
        async (ex) => {
          const [funcion] = await ex.consultar<{ oid: string | null }>(
            `SELECT to_regprocedure('public.estado_esquema_m10()')::text AS oid`,
          );
          expect(funcion!.oid).toBe('estado_esquema_m10()');
          expect(
            await ex.consultar(
              `SELECT has_table_privilege('curichi_api','public._migraciones','SELECT') AS lectura`,
            ),
          ).toEqual([{ lectura: false }]);
          const consultarComoApi = async () => {
            await ex.ejecutar('SET ROLE curichi_api');
            try {
              return await ex.consultar('SELECT * FROM public.estado_esquema_m10()');
            } finally {
              await ex.ejecutar('RESET ROLE');
            }
          };
          expect(await consultarComoApi()).toEqual([{ version: 22, integro: true }]);
          for (const version of [23, 9999]) {
            const nombre = `${String(version).padStart(4, '0')}_fixture_futuro.sql`;
            await ex.consultar('INSERT INTO public._migraciones(nombre) VALUES($1)', [nombre]);
            expect(await consultarComoApi()).toEqual([{ version, integro: false }]);
            await ex.consultar('DELETE FROM public._migraciones WHERE nombre=$1', [nombre]);
          }
          await ex.ejecutar(`CREATE ROLE lector_m10 NOLOGIN;
      CREATE TEMP TABLE _migraciones(nombre text); INSERT INTO pg_temp._migraciones VALUES('9999_sombra.sql');
      SET search_path=pg_temp,public;`);
          expect(await consultarComoApi()).toEqual([{ version: 22, integro: true }]);
          for (const rol of ['curichi_geo', 'lector_m10']) {
            await ex.ejecutar(`SET ROLE ${rol}`);
            try {
              await expect(
                ex.consultar('SELECT * FROM public.estado_esquema_m10()'),
              ).rejects.toMatchObject({ code: '42501' });
            } finally {
              await ex.ejecutar('RESET ROLE');
            }
          }
          expect(
            await ex.consultar(`SELECT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
      WHERE p.oid='public.estado_esquema_m10()'::regprocedure AND a.grantee=0`),
          ).toEqual([]);
          await ex.ejecutar('ALTER TABLE public.reporte DROP CONSTRAINT detalle_tope');
          expect(await consultarComoApi()).toEqual([{ version: 22, integro: false }]);
        },
        false,
        true,
      ),
    120_000,
  );
  it(
    '21→22 conserva100% de cuatro categorías, seis valores, fotos, usuarios, auditoría y cupos; no-op sin consentimiento',
    async () =>
      base21(async (ex) => {
        const antes = await foto(ex);
        const r = await contraer(ex);
        expect(r.aplicadas).toEqual([ARCHIVO]);
        expect(await foto(ex)).toStrictEqual(antes);
        expect(await planosPresentes(ex)).toEqual([]);
        expect(
          await ex.consultar(
            `SELECT typname FROM pg_type WHERE typnamespace='public'::regnamespace AND typname=ANY($1::text[])`,
            [TIPOS],
          ),
        ).toEqual([]);
        expect(
          await ex.consultar(
            `SELECT to_regclass('public.reporte_inundacion') AS vista,to_regclass('public.cuota_reporte_diaria') AS cuota`,
          ),
        ).toEqual([{ vista: null, cuota: null }]);
        const [f] = await ex.consultar<{ detalle: Record<string, unknown> }>(
          `SELECT detalle FROM reporte WHERE categoria='inundacion'`,
        );
        expect(f!.detalle).toEqual({
          profundidad_estimada: 'rodilla',
          frecuencia: 'agua_estancada',
          causa_presunta: 'desconocida',
          agua_brota_sumidero: false,
        });
        expect((await aplicarMigraciones(ex)).aplicadas).toEqual([]);
        expect(
          await ex.consultar(
            `SELECT current_setting('curichi.autorizar_contraccion_compatible',true) AS permiso`,
          ),
        ).toEqual([{ permiso: '' }]);
      }),
    120_000,
  );
  it(
    'desde cero aplica latest con consentimiento y expone marcador/constraints validadas de esquema22',
    async () =>
      base21(
        async (ex) => {
          await contraer(ex);
          const c = await ex.consultar<{
            conname: string;
            convalidated: boolean;
            comentario: string | null;
          }>(`SELECT conname,convalidated,obj_description(oid,'pg_constraint') AS comentario FROM pg_constraint
      WHERE conrelid='public.reporte'::regclass AND conname IN ('m10_0022_detalle_version_v1','m10_0022_inundacion_detalle_v1','detalle_es_objeto','detalle_tope') ORDER BY conname`);
          expect(c.map((x) => x.conname)).toEqual([
            'detalle_es_objeto',
            'detalle_tope',
            'm10_0022_detalle_version_v1',
            'm10_0022_inundacion_detalle_v1',
          ]);
          expect(c.every((x) => x.convalidated)).toBe(true);
          expect(c.find((x) => x.conname === 'm10_0022_detalle_version_v1')?.comentario).toBe(
            'mi_curichi:esquema=0022;almacenamiento=json;detalle_version=1',
          );
          await ex.ejecutar('SET ROLE curichi_api');
          try {
            expect(
              (
                await ex.consultar(`SELECT obj_description(oid,'pg_constraint') AS marcador FROM pg_constraint
        WHERE conrelid='public.reporte'::regclass AND conname='m10_0022_detalle_version_v1' AND convalidated`)
              )[0],
            ).toEqual({
              marcador: 'mi_curichi:esquema=0022;almacenamiento=json;detalle_version=1',
            });
            await expect(
              ex.consultar('SELECT nombre FROM public._migraciones'),
            ).rejects.toMatchObject({ code: '42501' });
            expect(
              await ex.consultar(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='resguardo_m10' AND c.relname='cuota_reporte_diaria'`),
            ).toEqual([{ relname: 'cuota_reporte_diaria' }]);
          } finally {
            await ex.ejecutar('RESET ROLE');
          }
        },
        false,
        true,
      ),
    120_000,
  );
  it(
    'archivo sinFK y acceso exclusivo del dueño; API/geo/PUBLIC sin privilegios ni USAGE/CREATE',
    async () =>
      base21(async (ex) => {
        await contraer(ex);
        expect(
          await ex.consultar(
            `SELECT conname FROM pg_constraint WHERE conrelid='resguardo_m10.cuota_reporte_diaria'::regclass AND contype='f'`,
          ),
        ).toEqual([]);
        expect(
          await ex.consultar(`SELECT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      WHERE c.oid='resguardo_m10.cuota_reporte_diaria'::regclass AND a.grantee<>c.relowner`),
        ).toEqual([]);
        for (const rol of ['curichi_api', 'curichi_geo']) {
          expect(
            await ex.consultar(
              `SELECT has_schema_privilege($1,'resguardo_m10','USAGE') AS uso,has_schema_privilege($1,'resguardo_m10','CREATE') AS crear,has_table_privilege($1,'resguardo_m10.cuota_reporte_diaria','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS tabla`,
              [rol],
            ),
          ).toEqual([{ uso: false, crear: false, tabla: false }]);
          await ex.ejecutar(`SET ROLE ${rol}`);
          try {
            await expect(
              ex.consultar('SELECT * FROM resguardo_m10.cuota_reporte_diaria'),
            ).rejects.toMatchObject({ code: '42501' });
          } finally {
            await ex.ejecutar('RESET ROLE');
          }
        }
      }),
    120_000,
  );
  it(
    'mantenimiento no limpia archivo ni consulta cuota pública; conserva contador vigente independiente',
    async () =>
      base21(async (ex) => {
        await contraer(ex);
        const archivo = await ex.consultar('SELECT * FROM resguardo_m10.cuota_reporte_diaria');
        const r = await ejecutarMantenimiento(ex, { ahora: new Date('2099-01-01T12:00:00Z') });
        expect(r.cuotasDiariasBorradas).toBe(0);
        expect(r.cupoContadorBorrado).toBe(2);
        expect(
          await ex.consultar('SELECT * FROM resguardo_m10.cuota_reporte_diaria'),
        ).toStrictEqual(archivo);
      }),
    120_000,
  );
  it.each([
    { profundidad_estimada: 'invalida', frecuencia: 'ocasional', causa_presunta: 'desconocida' },
    { profundidad_estimada: 'rodilla', frecuencia: 3, causa_presunta: 'desconocida' },
    { profundidad_estimada: 'rodilla', frecuencia: 'ocasional' },
    {
      profundidad_estimada: 'rodilla',
      frecuencia: 'ocasional',
      causa_presunta: 'desconocida',
      agua_brota_sumidero: 'false',
    },
    {
      profundidad_estimada: 'rodilla',
      frecuencia: 'ocasional',
      causa_presunta: 'desconocida',
      sumidero_cercano: null,
    },
    {
      profundidad_estimada: 'rodilla',
      frecuencia: 'ocasional',
      causa_presunta: 'desconocida',
      extra: true,
    },
  ])(
    'rechaza detalle flood no reversible %j sin alterar datos',
    async (detalle) =>
      base21(async (ex) => {
        await contraer(ex);
        const antes = await foto(ex);
        await expect(
          ex.consultar(`UPDATE reporte SET detalle=$1::jsonb WHERE categoria='inundacion'`, [
            JSON.stringify(detalle),
          ]),
        ).rejects.toMatchObject({ code: '23514' });
        expect(await foto(ex)).toStrictEqual(antes);
      }),
    120_000,
  );
  it(
    'objeto,8192bytes,versiones y categoríaFK siguen protegidos en22, sin imponer contratos literales a sintéticos',
    async () =>
      base21(async (ex) => {
        await contraer(ex);
        await ex.ejecutar(
          `UPDATE reporte SET detalle=jsonb_build_object('x',repeat('x',8183)) WHERE categoria='bache'`,
        );
        expect(
          (
            await ex.consultar(
              `SELECT octet_length(detalle::text) AS bytes FROM reporte WHERE categoria='bache'`,
            )
          )[0],
        ).toEqual({ bytes: 8192 });
        for (const detalle of [[], null, { texto: 'x'.repeat(8192) }])
          await expect(
            ex.consultar(`UPDATE reporte SET detalle=$1::jsonb WHERE categoria='bache'`, [
              JSON.stringify(detalle),
            ]),
          ).rejects.toMatchObject({ code: '23514' });
        await expect(
          ex.ejecutar(`UPDATE reporte SET detalle_version=2 WHERE categoria='basura'`),
        ).rejects.toMatchObject({ code: '23514' });
        await expect(
          ex.ejecutar(`UPDATE reporte SET categoria='no_existe' WHERE categoria='bache'`),
        ).rejects.toMatchObject({ code: '23503' });
        await ex.ejecutar(
          `UPDATE reporte SET detalle='{"sintetico":false,"opcional":null}' WHERE categoria='bache'`,
        );
        expect(
          (await ex.consultar(`SELECT detalle FROM reporte WHERE categoria='bache'`))[0],
        ).toEqual({ detalle: { sintetico: false, opcional: null } });
      }),
    120_000,
  );
});

describe('0022: precondiciones y reversa multicategoría exacta', () => {
  it(
    'roundtrip conserva todas las combinaciones de dominios y los seis valores tipados, con comparación completa de filas',
    async () =>
      base21(async (ex) => {
        await ex.ejecutar(`INSERT INTO reporte(geom,geom_publico,distrito_id,unidad_vecinal_id,ubicacion_metodo,ubicacion_tipo,descripcion,
      profundidad_estimada,frecuencia,causa_presunta,sumidero_cercano,sumidero_estado,agua_brota_sumidero,severidad_calculada,severidad_puntaje,estado,publicar_en)
      SELECT ST_SetSRID(ST_MakePoint(-63.18,-17.78),4326),ST_SetSRID(ST_MakePoint(-63.18,-17.78),4326),'d','u','manual','via_publica','Matriz sintética de dominios SQL',
      p,f,c,CASE WHEN n%3=0 THEN NULL WHEN n%3=1 THEN 'si'::sumidero_cercano ELSE 'no'::sumidero_cercano END,
      CASE WHEN n%3=0 THEN NULL WHEN n%3=1 THEN 'tapado'::sumidero_estado ELSE 'no_tapado'::sumidero_estado END,
      CASE WHEN n%3=0 THEN NULL WHEN n%3=1 THEN false ELSE true END,'media',6,'validado',now()
      FROM (SELECT p,f,c,row_number() OVER() AS n FROM unnest(enum_range(NULL::profundidad_estimada)) p
      CROSS JOIN unnest(enum_range(NULL::frecuencia)) f CROSS JOIN unnest(enum_range(NULL::causa_presunta)) c) s;
      CREATE TEMP TABLE referencia_roundtrip22 AS SELECT id,to_jsonb(r) AS fila FROM public.reporte r;`);
        expect(
          (await ex.consultar('SELECT count(*)::int AS n FROM referencia_roundtrip22'))[0],
        ).toEqual({ n: 144 });
        await contraer(ex);
        expect(
          (
            await ex.consultar(
              `SELECT count(*)::int AS n FROM referencia_roundtrip22 e FULL JOIN public.reporte r USING(id)
      WHERE e.id IS NULL OR r.id IS NULL OR (e.fila - $1::text[]) IS DISTINCT FROM to_jsonb(r)`,
              [PLANOS],
            )
          )[0],
        ).toEqual({ n: 0 });
        await reversa(ex);
        expect(
          (
            await ex.consultar(`SELECT count(*)::int AS n FROM referencia_roundtrip22 e FULL JOIN public.reporte r USING(id)
      WHERE e.id IS NULL OR r.id IS NULL OR e.fila IS DISTINCT FROM to_jsonb(r)`)
          )[0],
        ).toEqual({ n: 0 });
        await contraer(ex);
        expect(await planosPresentes(ex)).toEqual([]);
      }),
    120_000,
  );
  it(
    'divergencia planos/JSON aborta toda la contracción sin crear archivo',
    async () =>
      base21(async (ex) => {
        await ex.ejecutar(`ALTER TABLE reporte DISABLE TRIGGER reporte_sincronizar_detalle;
      UPDATE reporte SET detalle='{"inconsistente":true}' WHERE categoria='inundacion';
      ALTER TABLE reporte ENABLE TRIGGER reporte_sincronizar_detalle;`);
        const antes = await foto(ex);
        await expect(contraer(ex)).rejects.toThrow(/equivalencia/);
        expect(await foto(ex)).toStrictEqual(antes);
        expect(await planosPresentes(ex)).toHaveLength(6);
        expect(await ex.consultar(`SELECT to_regnamespace('resguardo_m10') AS archivo`)).toEqual([
          { archivo: null },
        ]);
      }),
    120_000,
  );
  it(
    'versión no soportada previa aborta antes de alterar catálogo o copiar cuota',
    async () =>
      base21(async (ex) => {
        await ex.ejecutar(`UPDATE reporte SET detalle_version=2 WHERE categoria='basura'`);
        const antes = await foto(ex);
        await expect(contraer(ex)).rejects.toThrow(/version/);
        expect(await foto(ex)).toStrictEqual(antes);
        expect(await planosPresentes(ex)).toHaveLength(6);
      }),
    120_000,
  );
  it(
    'archivo existente idéntico se reutiliza; divergente nunca se sobrescribe ni mezcla',
    async () =>
      base21(async (ex) => {
        await ex.ejecutar(`CREATE SCHEMA resguardo_m10;
      CREATE TABLE resguardo_m10.cuota_reporte_diaria (LIKE public.cuota_reporte_diaria INCLUDING ALL);
      INSERT INTO resguardo_m10.cuota_reporte_diaria SELECT * FROM public.cuota_reporte_diaria;
      UPDATE resguardo_m10.cuota_reporte_diaria SET fotos_n=11;`);
        const antes = await foto(ex),
          archivo = await ex.consultar('SELECT * FROM resguardo_m10.cuota_reporte_diaria');
        await expect(contraer(ex)).rejects.toThrow(/archivo.*divergente/);
        expect(await foto(ex)).toStrictEqual(antes);
        expect(
          await ex.consultar('SELECT * FROM resguardo_m10.cuota_reporte_diaria'),
        ).toStrictEqual(archivo);
        await ex.ejecutar('UPDATE resguardo_m10.cuota_reporte_diaria SET fotos_n=12');
        await contraer(ex);
        expect(await planosPresentes(ex)).toEqual([]);
      }),
    120_000,
  );
  it(
    '22→21→22 conserva datos aceptados en22 de las cuatro categorías, auxiliares y cuota exacta',
    async () =>
      base21(async (ex) => {
        await contraer(ex);
        await ex.ejecutar(`UPDATE reporte SET detalle=detalle||'{"agua_brota_sumidero":true,"sumidero_cercano":"no"}' WHERE categoria='inundacion';
      INSERT INTO reporte (categoria,geom,distrito_id,unidad_vecinal_id,ubicacion_metodo,ubicacion_tipo,descripcion,detalle,detalle_version,severidad_calculada,severidad_puntaje,estado,publicar_en)
      SELECT categoria,geom,distrito_id,unidad_vecinal_id,ubicacion_metodo,ubicacion_tipo,'Nuevo aceptado mientras corre22',detalle,detalle_version,severidad_calculada,severidad_puntaje,estado,now() FROM reporte;`);
        const antes = await foto(ex);
        await reversa(ex);
        expect(await planosPresentes(ex)).toHaveLength(6);
        expect(await foto(ex)).toStrictEqual(antes);
        expect(
          await ex.consultar(`SELECT nombre FROM _migraciones WHERE nombre=$1`, [ARCHIVO]),
        ).toEqual([]);
        const [f] = await ex.consultar(
          `SELECT profundidad_estimada::text,frecuencia::text,causa_presunta::text,agua_brota_sumidero,sumidero_cercano::text,sumidero_estado FROM reporte WHERE categoria='inundacion' LIMIT 1`,
        );
        expect(f).toEqual({
          profundidad_estimada: 'rodilla',
          frecuencia: 'agua_estancada',
          causa_presunta: 'desconocida',
          agua_brota_sumidero: true,
          sumidero_cercano: 'no',
          sumidero_estado: null,
        });
        expect(
          (
            await ex.consultar(
              `SELECT count(*)::int AS n FROM reporte WHERE categoria<>'inundacion' AND (profundidad_estimada IS NOT NULL OR frecuencia IS NOT NULL OR causa_presunta IS NOT NULL OR sumidero_cercano IS NOT NULL OR sumidero_estado IS NOT NULL OR agua_brota_sumidero IS NOT NULL)`,
            )
          )[0],
        ).toEqual({ n: 0 });
        await contraer(ex);
        expect(await foto(ex)).toStrictEqual(antes);
      }),
    120_000,
  );
  it(
    'usuario archivado faltante aborta reversa completa y conserva el archivo sinFK',
    async () =>
      base21(async (ex) => {
        await contraer(ex);
        await ex.ejecutar(`DELETE FROM usuario WHERE id='00000000-0000-4000-8000-000000000022'`);
        const antes = await foto(ex);
        await expect(reversa(ex)).rejects.toThrow(/usuarios/);
        await ex.ejecutar('ROLLBACK');
        expect(await foto(ex)).toStrictEqual(antes);
        expect(await planosPresentes(ex)).toEqual([]);
        expect(
          await ex.consultar('SELECT reportes_n,fotos_n FROM resguardo_m10.cuota_reporte_diaria'),
        ).toEqual([{ reportes_n: 3, fotos_n: 12 }]);
      }),
    120_000,
  );
  it(
    'cambios legítimos de cuota tras reversa bloquean recontracción, sin perder ni sobrescribir archivo',
    async () =>
      base21(async (ex) => {
        await contraer(ex);
        await reversa(ex);
        await ex.ejecutar('UPDATE public.cuota_reporte_diaria SET reportes_n=2');
        const antes = await foto(ex);
        await expect(contraer(ex)).rejects.toThrow(/archivo.*divergente/);
        expect(await foto(ex)).toStrictEqual(antes);
        expect(await planosPresentes(ex)).toHaveLength(6);
        expect(
          await ex.consultar('SELECT reportes_n FROM resguardo_m10.cuota_reporte_diaria'),
        ).toEqual([{ reportes_n: 3 }]);
      }),
    120_000,
  );
  it(
    'fallo tardío por dependencia inesperada hace rollback total sinCASCADE',
    async () =>
      base21(async (ex) => {
        await ex.ejecutar(
          'CREATE VIEW dependencia_fixture_22 AS SELECT profundidad_estimada FROM reporte',
        );
        const antes = await foto(ex);
        await expect(contraer(ex)).rejects.toThrow();
        expect(await foto(ex)).toStrictEqual(antes);
        expect(await planosPresentes(ex)).toHaveLength(6);
      }),
    120_000,
  );
});

describe('0022: ACL explícitas de columna en cuota y archivo', () => {
  it.each(['curichi_geo', 'PUBLIC'])(
    'ACL-origen: grants de columna a %s en cuota antigua no pasan al archivo nuevo',
    async (destinatario) =>
      base21(async (ex) => {
        await ex.ejecutar(`GRANT SELECT (usuario_id),INSERT (reportes_n),UPDATE (fotos_n),REFERENCES (dia)
          ON TABLE public.cuota_reporte_diaria TO ${destinatario}`);
        expect(
          await ex.consultar(`SELECT p.privilege_type FROM pg_attribute a
            CROSS JOIN LATERAL aclexplode(a.attacl) p JOIN pg_class c ON c.oid=a.attrelid
            WHERE c.oid='public.cuota_reporte_diaria'::regclass AND p.grantee<>c.relowner
            ORDER BY p.privilege_type`),
        ).toEqual(
          ['INSERT', 'REFERENCES', 'SELECT', 'UPDATE'].map((privilege_type) => ({
            privilege_type,
          })),
        );
        const antes = await foto(ex);
        const historial = await ex.consultar('SELECT * FROM public._migraciones ORDER BY nombre');
        const defaults = await ex.consultar('SELECT * FROM pg_default_acl ORDER BY oid');
        const [origen] = await ex.consultar<{ relowner: number }>(
          `SELECT relowner FROM pg_class WHERE oid='public.cuota_reporte_diaria'::regclass`,
        );
        const fk = () =>
          ex.consultar(`SELECT n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid,false) AS definicion
            FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
            JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE k.contype='f' AND n.nspname IN ('public','geo')
              AND c.relname<>'cuota_reporte_diaria' ORDER BY 1,2,3`);
        const claves = await fk();
        await contraer(ex);
        expect(await ex.consultar('SELECT * FROM public.estado_esquema_m10()')).toEqual([
          { version: 22, integro: true },
        ]);
        expect(
          await ex.consultar(`SELECT p.grantee FROM pg_attribute a
            CROSS JOIN LATERAL aclexplode(a.attacl) p JOIN pg_class c ON c.oid=a.attrelid
            WHERE c.oid='resguardo_m10.cuota_reporte_diaria'::regclass AND p.grantee<>c.relowner`),
        ).toEqual([]);
        expect(
          await ex.consultar(`SELECT c.relowner,n.nspowner=c.relowner AS mismo_dueno
            FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE c.oid='resguardo_m10.cuota_reporte_diaria'::regclass`),
        ).toEqual([{ relowner: origen!.relowner, mismo_dueno: true }]);
        expect(await foto(ex)).toStrictEqual(antes);
        expect(await fk()).toStrictEqual(claves);
        expect(await ex.consultar('SELECT * FROM pg_default_acl ORDER BY oid')).toStrictEqual(
          defaults,
        );
        expect(
          await ex.consultar('SELECT * FROM public._migraciones WHERE nombre<>$1 ORDER BY nombre', [
            ARCHIVO,
          ]),
        ).toStrictEqual(historial);
        expect(
          await ex.consultar(`SELECT conname FROM pg_constraint
            WHERE conrelid='resguardo_m10.cuota_reporte_diaria'::regclass AND contype='f'`),
        ).toEqual([]);
      }),
    120_000,
  );
});
