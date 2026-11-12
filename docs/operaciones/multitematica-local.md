# Cuatro categorías en una instalación local separada

## Estado de la demo al 11/11/2026

La demo separada está en **esquema y release 22**. La actualización terminó
después de restaurar el respaldo y cotejar la copia. Pasaron 14/14 E2E y los
cuatro servicios respondieron tras reiniciar con las mismas huellas de
ocho reportes y cuatro fotos. [Guía breve de arranque](../../ARRANCAR.md).

- `iniciar` verifica identidad, versión e integridad y no migra, carga capas ni siembra.
  Un rechazo por versión requiere resolver el relevo coordinado; no saltar la guarda.
- `preparar` es para una instalación nueva y exige consentimiento explícito para0022.
  **No ejecutarlo sobre esta instalación ya preparada.**
- `actualizar` por CLI falla cerrado sin el adaptador del protocolo aprobado. Las
  funciones `updateInstallation`/`recoverInstallation` exigen respaldo restaurado
  comprobado, parada de los procesos propios y recuperación conjunta de código/esquema.
  Una bandera de migración no sustituye esas precondiciones.
- La autorización y los controles ejecutados sobre esta demo están registrados
  en el [protocolo de M10](../sdd/2026-10-29-cierre-m10/protocolo-operacional-propuesto.md).
  Otra instalación requiere su propio protocolo.

Los datos, recuentos, comandos y resultados fechados de abajo describen la entrega21
histórica; no son instrucciones para reconstruirla con código22 ni pruebas de hoy.

Destino fijo: **curichi_multitematica** en el PostgreSQL existente, loopback, puerto 5432.
Operación aprobada en [el plan del 22 de octubre](../sdd/2026-10-22-cuatro-categorias/plan.md).
Instalación real preparada el24/10:21migraciones,capas municipales16DM/576UV/27527MZ,
4cuentas y37reportes sintéticos; cuatro categorías activas con auditoría y ACL comprobada.
Web4000/panel4100 respondieron200 y anunciaron las cuatro categorías. La validación visual
y E2E integrales continúan; no se declara cierre de producción.

**Estado del 25/10: demo iniciada después del reinicio de Windows.** API y geo compilaron
correctamente en sus rutas ordinarias, con exit 0 en ambas; evidencia en
`.turbo/cuatro-categorias-2026-10-22/operacion/post-reinicio-windows-20261025/compilacion.json`.
Web, panel y ambos servicios respondieron HTTP 200. La comparación posterior al arranque
confirmó igualdad de recuentos y huellas de las seis tablas de control: usuarios, reportes,
fotos, cupos, auditoría y categorías. Ver `operacion/despues-reinicio.json`.
No se repitió la preparación ni se modificaron permisos o protecciones. La causa del EPERM
anterior no está identificada; su evidencia se conserva. Los **14 casos de navegador
aprobaron** el25/10: siete desktop y siete móvil, sin fallos, omisiones o reintentos.
Incluyen crear/publicar/ver/validar/exportar las cuatro categorías y permisos de roles.

### Reanudar después del reinicio de Windows

La instalación ya está preparada. **No repetir `preparar`, seed, migraciones ni carga de capas.**
Desde la raíz, comprobar primero las dos compilaciones habituales, una por vez:

```powershell
node services/api-core/node_modules/typescript/bin/tsc -p services/api-core/tsconfig.build.json
node services/geo-service/node_modules/typescript/bin/tsc -p services/geo-service/tsconfig.build.json
```

Solo si ambas terminan correctamente y existen sus entradas, iniciar con el comando de
esta guía. Si persiste EPERM, conservar el error e investigar el bloqueo sin sustituir
entradas ni modificar la seguridad. Después del arranque, antes de nuevos envíos,
el coordinador comparará las seis tablas con `operacion/antes-reinicio.json` mediante
el script de evidencia `snapshot-demo.mjs despues-reinicio`.
Ese script pertenece al scratch de esta corrida, no al producto distribuido.

La comprobación de navegador cubrió 14 casos en escritorio/móvil, incluido el marcador de
mapa pendiente de M6, con la exigencia ARIA exacta y teselas recibidas. Los intentos anteriores
y sus reportes sintéticos se conservan. Evidencia en `verificacion.md` de esta corrida,
run `demo-20261025-ae8811b2`. No sustituye una nueva ejecución completa del G1 histórico.

**Evidencia histórica del relevo del22/10; operación posterior descrita arriba.**
Se reutiliza por instrucción del usuario la baseline reciente de 29/29 casos aprobados,
cero fallos/omitidos, de `cesion-unit-antes.json` en
`.turbo/cuatro-categorias-2026-10-22/operacion/`. Sus hashes y salida originales se conservan;
ese PASS corresponde al parcial anterior, no a las correcciones posteriores.
El post exclusivo aprobó 38/38: los 29 casos originales y 9 negativos nuevos, sin fallos ni
omitidos; ambas comprobaciones de sintaxis terminaron con exit 0. El post posterior al ajuste
manual `state?.version !== 1` volvió a aprobar 38/38 y Biome con cero errores y avisos.
El aviso useOptionalChain pertenecía al borrador nuevo de esta tarea. Delta tras el dictamen
Confucius: formato/imports seguros y ese ajuste manual autorizado, conservando las guardas;
sin fixes unsafe. Salida vigente: post-unit-optionalchain.log y post-biome-optionalchain.log;
comparación por caso en post-comparacion.json
dentro del scratch. Ese corte todavía no ejecutaba PostgreSQL ni servicios. El24/10 se
corrigieron comentario compartido de base y launcher del seed:40/40PASS,rojos conservados,
Biome0 y dictamen independiente conforme en `revision/procedencia-compartida.md`.

## Requisitos

- Node 24 y las dependencias del workspace ya instaladas. El runner usa Node y Next
  locales directamente; no instala, descarga, ejecuta pnpm ni reconstruye Docker.
- PostgreSQL ya disponible. Dueño existente `curichi` y roles existentes `curichi_api` y
  `curichi_geo`, con sus credenciales en el `.env` raíz. Se leen únicamente en memoria.
  `DATABASE_URL` aporta las credenciales del dueño; `API_DATABASE_URL` y `GEO_DATABASE_URL`
  aportan las de los servicios. Si estas dos están vacías, se usan `API_DB_PASSWORD` y
  `GEO_DB_PASSWORD` con el mismo servidor. No hay contraseñas de base por defecto.
- Las URL originales de credenciales solo admiten base `curichi`, `curichi_e2e` o
  `curichi_multitematica`, usuario correspondiente, host `127.0.0.1`, `localhost` o `::1`,
  puerto explícito 5432 y ninguna query/fragmento. Nunca se conecta la URL original: se
  deriva el destino fijo. `localhost` se normaliza a `127.0.0.1`.
- `IP_HASH_SAL` y `JITTER_SAL` de al menos 32 caracteres en `.env`; se conservan para que el
  jitter no cambie entre arranques. Las variables `SEED_*_PASSWORD` existentes se pasan solo
  al seed; si faltan, se aplica el comportamiento local del seed existente.
- JS compilado de contracts, DB, API, geo y ETL actualizado por sus responsables. El preflight
  exige el registro de cuatro categorías y compara fechas de fuentes/JS emitido; aborta ante
  archivos ausentes o compilados anteriores a su fuente. Esto no sustituye sus suites/builds.
- Las tres capas municipales ya procesadas en `data/processed/DM_UV_MZ_2025/<capa>/`, cada
  una con `<capa>.full.geojson`, `<capa>.web.geojson` y `metadata.json`. El preflight coteja
  capa/versión, CRS 32720→4326, conteo positivo y hashes full/web con metadata. No regenera ETL.
- P1/P2 deben integrar `CURICHI_INSTALACION_LOCAL=1` → `distDir: '.next-multitematica'` en
  sus respectivos `next.config.ts`. Antes de arrancar Next, el hijo evalúa esa configuración
  bajo el entorno privado y aborta si la salida efectiva es otra.

### Arranque desde los builds de P1/P2

El runner reutiliza los builds de ambas apps para evitar dos compiladores residentes.
Los responsables P1/P2 deben ejecutar sus comandos de build,
uno por vez y en su turno, con `CURICHI_INSTALACION_LOCAL=1` únicamente en el entorno de ese
proceso. El runner no debe compilar, descargar ni usar `.next/` como alternativa.

Antes de abrir servicios, la guarda de cada app exige el directorio real propio
`.next-multitematica`, un `BUILD_ID` válido y el manifiesto
`required-server-files.json` del build correspondiente a esa app y a ese directorio.
Una salida ausente, ajena, desactualizada frente a `next.config.ts` o incompleta aborta.
El hijo carga además la configuración efectiva de Next y exige flag 1 y esa salida antes
de escuchar. Los frontends reciben `NODE_ENV=production`; jobs y servicios, `development`.

Ambos `next.config.ts` declaran `output: 'standalone'`. El Next instalado advierte sobre
`next start` con esa configuración, sin lanzar excepción en esa rama. Se conserva el aviso;
la compatibilidad real sigue pendiente de verificación. No se oculta con variables internas
ni se cambian configuraciones de las apps desde P5.

Se usan también `dist/servidor.js` de API y geo, el migrador
`packages/db/dist/cli/migrar.js` y el ETL `pipelines/geodata-etl/dist/cli.js`. Son entradas
existentes: su mera presencia no acredita que estén actualizadas; antes de usarlas se
necesita la evidencia de build de sus responsables y la guarda del destino de cada job.
El verificador ACL ya es JavaScript ejecutable en `packages/db/src/cli/verificar-privilegios.mjs`.
El build de DB no genera `dist/cli/seed-samples.js`: sí genera y exporta `sembrarSamples`.
Se reutiliza esa función compilada con un adaptador mínimo de apertura y cierre del pool
y sus workers de contraseñas, conservando el seed de una sola ejecución sin duplicar reglas.

La existencia de capas y roles y la capacidad real del dueño solo quedan verificadas al
ejecutar la preparación. `CREATEDB` permite intentar crear la base; no acredita por sí solo
que el rol pueda instalar PostGIS. Si el migrador falla por permisos, se conserva su etapa
pendiente y se informa, sin elevar roles ni cambiar credenciales.

## Preparar una sola vez

Desde la raíz del repositorio, cuando el coordinador autorice los jobs reales:

```powershell
node scripts/multitematica-local.mjs preparar
```

La validación de las cuatro URL sucede antes del primer Client. El único bootstrap es una
conexión del dueño a **curichi_e2e**: comprueba `current_database()`, `current_user`,
`session_user`, atributos de roles y existencia del destino. No conecta `curichi`,
`curichi_revision` ni `postgres`, ni crea roles o cambia contraseñas/membresías globales.

Si el nombre está libre, crea la base desde `template0`, conserva su OID y la identifica con
un comentario de procedencia. Si existe, exige que OID, dueño y comentario coincidan con el
diario local. Una base desconocida se conserva y la operación aborta; no hay drop/recreate.

Luego ejecuta, en orden y solo sobre el destino nuevo:

1. CLI existente de migraciones con `--hasta 0021`, y cotejo de `_migraciones`.
2. CLI ETL existente `load --version DM_UV_MZ_2025`, sin transformar los originales.
3. Comprobación de las tres capas municipales vigentes y seed local existente, que aporta
   cuentas y ejemplos etiquetados como sintéticos. Las capas reales preceden al seed.
4. Verificador existente de privilegios mínimos.
5. Activación de `bache`, `basura` y `area_verde` en una transacción, con el admin local como
   actor y tres registros de auditoría antes/después. `inundacion` permanece activa.
6. Lectura final del catálogo/capas y comprobación de conexión de ambos roles de servicio.

Antes de cada job se abre una conexión de guarda al destino fijo y se verifica su identidad
y procedencia. Se repite `current_database/current_user/session_user` inmediatamente antes
y después del job. El CLI recibe exactamente esa URL en su entorno privado; una sustitución
aborta antes del spawn. **Los CLI actuales
no incorporan esta guarda internamente**: no se afirma que utilicen la conexión de guarda.

Después del load, antes del seed, antes de activar y en la comprobación final, se comparan
las tres versiones vigentes contra metadata: versión fija, CRS, SHA-256 del manifiesto y
conteos declarados y reales por tabla. Una capa diferente o un conteo discordante aborta.

El diario marca la etapa en curso antes del job y la completada después. Solo se reanudan
etapas completadas y reconocidas. La preparación completa omite los jobs ya hechos; nunca
repite automáticamente el seed. Un fallo conserva base, fotos, caché y evidencia.

## Iniciar y detener

```powershell
node scripts/multitematica-local.mjs iniciar
```

Exige preparación completa, verifica de nuevo catálogo/capas/conexiones y ACL, requiere
2500 MiB de memoria libre y comprueba los cuatro puertos antes de crear servicios:

| Componente | Dirección |
|---|---|
| Web | http://127.0.0.2:4000 |
| API | http://127.0.0.2:4001 |
| Geo | http://127.0.0.2:4002 |
| Panel | http://127.0.0.2:4100 |

La instalación corre **en primer plano**. `Ctrl+C` cierra sus propios hijos y conserva la base
y `infra/.storage/multitematica/fotos`. No cambia `.env` ni el entorno global. Un puerto
ocupado detiene el arranque; no se intenta matar al ocupante. Hay una carrera posible entre
la comprobación de puertos y la escucha de cada servicio; no se promete una reserva atómica.

### Recorrido corto de la demo

1. Abrir la web y cambiar entre Inundaciones,Baches,Áreas verdes y Basura. El filtro y la
   dirección reflejan la categoría; la última queda guardada en ese dispositivo.
2. Entrar con la cuenta local `vecina` y seguir «Reportar un punto»: ubicación, datos de la
   categoría, foto opcional y revisión. En una computadora sin GPS preciso está disponible
   el camino de ubicación aproximada. Los permisos se solicitan dentro del flujo.
3. Ver el reporte en «Mis reportes». La primera publicación tarda60s por categoría y cuenta;
   durante la espera solo lo ve quien lo envió. Se publica como «NO SE HA VERIFICADO».
4. Abrir el panel con `tecnico`, filtrar por categoría, revisar el detalle y validar. Desde
   allí se puede mostrar la exportación CSV/GeoJSON y los indicadores. El rol `ejecutivo`
   permite demostrar el resumen sin funciones de moderación; `admin` incluye administración.

Son cuentas sintéticas locales, con contraseñas por defecto documentadas iguales al usuario
si no se configuró `SEED_*_PASSWORD`. El24/10 se comprobó que esta instalación usa esos
valores por defecto, sin imprimir variables privadas. No usar estas cuentas para producción.
Los37ejemplos iniciales son de Inundaciones. Tras la verificación del25/10 hay48reportes
sintéticos conservados y6fotos; las cuatro categorías tienen ejemplos validados, dos por
categoría creados por esa corrida. Se pueden mostrar desde el mapa y el panel. No son
reportes municipales reales. Los formularios admiten nuevos envíos respetando sus cupos.

El origen `127.0.0.2` separa sus cookies de las de `localhost`/`127.0.0.1`; web y panel
comparten intencionalmente ese nuevo host. API/geo escuchan en ese loopback, con las URL,
CORS y enlace al panel correspondientes. Las demoras son 60/240 segundos. Tokens internos
y de métricas se generan por ejecución y se comparten solo con los servicios que los usan.

El entorno de cada hijo se arma por allowlist. No hereda PG/libpq, S3, E2E, `NODE_OPTIONS`,
hosts, URLs ni flags contradictorios del padre; cada servicio recibe solo su URL de base.
Los frontends no reciben credenciales PostgreSQL. `TEMP` y `TMP` apuntan a `tmp/` dentro
del scratch de operación, únicamente para los hijos. No se borra la caché temporal original.

API/geo se invocan directamente con Node sobre JS compilado, evitando wrappers `dev` que leen `.env` otra
vez. Next usa el CLI instalado con hostname/puerto explícitos y la salida propia. La cámara
y geolocalización en este loopback necesitan verificación real del navegador; la configuración
no certifica su funcionamiento ni modifica CSP para forzarlo.

En Windows se inicia cada Node sin shell y con consola propia oculta. Se comprueban PID,
padre, fecha de creación, ejecutable y marcador de lanzamiento; se vuelve a comprobar la
identidad antes de cerrar exclusivamente ese árbol. Un PID reutilizado o una identidad no
acreditable no recibe `taskkill`. El cierre tiene espera acotada y reporta PID sin confirmar.
Esto no garantiza atomicidad frente a carreras de procesos, cierre forzado de la consola o
pérdida de energía. No se persiguen consolas ni procesos globales.

El cierre valida también la descendencia acreditada antes de `taskkill`, cuyo plazo es 10 s;
la espera posterior es de hasta 20 s. Un servicio cuyo padre ya terminó deja cierre incierto;
los jobs directos terminados correctamente no requieren cierre adicional. Una identidad final
incompleta o descendiente sobreviviente conserva el bloqueo. Los errores al consultar CIM
fallan explícitamente; no se interpretan como PID ausente. Los handlers de señales permanecen
durante todo el cleanup y se retiran después. No se acredita un árbol solo por `close` del padre.

## Evidencia y fallos

En `.turbo/cuatro-categorias-2026-10-22/operacion/` se conservan:

- `instalacion.json`: versión de diario, base fija, UUID de instalación, OID y etapa; al
  activar, snapshots de las cuatro filas anteriores y las tres filas modificadas.
- `operacion.log`: etapas, identidades verificadas, PID propios y salida redactada de hijos.
  No compartir el `.env` ni volcar el entorno para diagnosticar.
- `runner.lock`: exclusión entre ejecuciones. Se elimina únicamente con cierre confirmado;
  si el cierre falla o es incierto, se cierra su descriptor pero se conserva el archivo.
- `tmp/`: temporales privados; y la evidencia de desarrollo antes/después de esta tarea.

Si queda un lock tras un cierre abrupto, comprobar primero que su PID y sus hijos terminaron;
no eliminarlo automáticamente ni matar procesos por el número sin verificar identidad.
Una etapa `creating` o `*:running` exige inspección del estado real y del log por el
coordinador. No cambiarla manualmente a una etapa anterior para repetir el seed. Si se pierde
el diario y la base existe, el runner aborta y la conserva. No hay recuperación destructiva.

Se reutilizan credenciales/roles del clúster existente. La separación por base, origen,
salida y storage **no constituye aislamiento absoluto de credenciales entre bases**.
S3, permisos reales, PIP municipal, cámara, cierre/reinicio y recorrido completo solo se
declaran verificados con evidencia de sus ejecuciones autorizadas.

## Controles de esta unidad

La suite no existía antes de la tarea original. La baseline del relevo es la ejecución reciente
del parcial: **29 tests, 29 pass, 0 fail, 0 skip, exit 0** en `cesion-unit-antes.json` y
`unit-antes-parciales-nodeguard.log`. Se conserva íntegra. Post: **38 tests, 38 pass, 0 fail,
0 skip, exit 0**; 29/29 originales preservados, 9 nuevos aprobados, cero regresiones.

Tras recibir turno de controles, de a uno, sin servicios vivos:

```powershell
node --test scripts/multitematica-local.test.mjs
node --check scripts/multitematica-local.mjs
node --check scripts/multitematica-local.test.mjs
node_modules/.bin/biome.cmd check scripts/multitematica-local.mjs scripts/multitematica-local.test.mjs turbo.json
```

Los unitarios inyectan clientes, jobs y procesos: no contactan PostgreSQL, no levantan
servicios y no importan el arnés E2E. Cubren destinos/identidades/roles inválidos, base
desconocida, orden de etapas, seed sin replay, rollback de activación, entorno privado,
puerto ocupado simulado, redacción, URL efectiva por job, capas/huellas/builds y cierre exclusivo
de hijos acreditados, lock conservado y señales durante cleanup. Se compara cada caso original
con la salida de baseline; el post exclusivo ya aprobó también los nueve casos nuevos.

El runner MJS no tiene un paquete/typecheck dedicado. Syntax y Biome no sustituyen los
typechecks/builds de consumidores ni la F4 independiente. Las pruebas reales y los controles
por banderas quedan sujetos a turno y autorización operativa del coordinador.
