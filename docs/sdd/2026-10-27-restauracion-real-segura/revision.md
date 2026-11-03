> Informe original del subagente, con vínculos relativos adaptados a su evidencia local ignorada en `.turbo/`. Resultados y texto conservados. SHA-256 del original: `8ec304f165e4545fc8707d034947b64f591ce5fd403432090a1828e6344cf8fa`.

# Revisión nativa independiente M10.3 — preparación del ensayo

**Dictamen: sin bloqueantes concretos detectados dentro del alcance estático. Preparado estáticamente para el ensayo acotado aprobado.** Esta revisión no habilita por sí sola la ejecución: el principal debe consolidarla con la verificación independiente de Meitner. No hay que esperar a Turing ni volver a pedir la aprobación M10.3 ya vigente.

Parte 5. Revisor: Codex, revisión nativa funcional/seguridad, sin invocar skill/roles SDD ni subagentes. Ownership: solo este archivo y `resultado.json`. Se leyó AGENTS completo, plan aprobado, protocolo, línea base e inventario. Comparación exclusiva contra `f0/manifest.json` y `f0/antes/`, **nunca contra HEAD**. Las seis copias verificaron SHA-256 del manifest; los dos archivos nuevos constan ausentes en F0. Los cambios ajenos y la documentación del principal quedan fuera del dictamen.

## Bloqueantes

Ninguno identificado para estos ocho archivos y estos cuatro bancos sintéticos. No se detectó una regresión estática sobre los 46 casos conservados. Las pruebas no fueron ejecutadas por este revisor.

## Criterios → fuente y evidencia

Referencias relativas al workspace `C:/Users/HP/Desktop/MICURICHI`; los números señalan líneas iniciales verificadas. “Conforme” aquí siempre significa lectura estática, salvo evidencia expresamente atribuida.

| Criterio del plan/protocolo | Fuente | Evaluación |
|---|---|---|
| CA1 — Destino existente conservado; sin DROP en Node/CLI | scripts/respaldo.mjs:220,237,262,485 | Rechazo de ausencia distinta de 0 antes de CREATE/migrar/cargar; prueba :247. Delta F0 elimina también la limpieza del simulacro. |
| CA2 — Semillas exactas y vacío de tablas, operación atómica | scripts/respaldo.mjs:186; infra/respaldo/respaldo.sh:232 | DO único con locks; public/geo r,p, excepciones public._migraciones y public.spatial_ref_sys; catálogo completo incluye actor/fecha nulos; DELETE solo cuatro semillas, sin CASCADE. PGlite literal Node/Shell en prueba Node :296. |
| CA3 — SQL fallido u operadores ausentes cierran la carga | scripts/respaldo.mjs:85,220; infra/respaldo/respaldo.sh:162,547 | ON_ERROR_STOP; inyección obligatoria; errores abortan antes de cargar; pg_restore transaccional. Pruebas Node :261,272 y Bash :145. |
| CA4 — Conservar 46 casos anteriores | scripts/respaldo.test.mjs; infra/respaldo/respaldo.test.sh | Bloques previos íntegros frente a copias F0, normalizando CRLF. Añadidos 6 Node, 15 runner y 10 Bash; ejecuciones atribuidas a Turing. |
| CA5 — Importación/estado herméticos y operación explícita | scripts/ensayar-respaldo-multitematico.mjs:945,958,1007; scripts/ensayar-respaldo-multitematico.test.mjs:10 | Estado sale antes de leer credenciales o construir operadores; --operar exigido en rama operativa; tests bloquean procesos/red/.env antes de import/source y no tienen fallback. |
| CA6 — Cuatro bancos y template1 limitado; identidad | scripts/ensayar-respaldo-multitematico.mjs:28,68,647,765,801 | Nombres fijos, URL 127.0.0.1:5432/curichi/template1 sin options; SQL administrativo acotado; preflight cruza system_identifier TCP/contenedor; OID/dueño/servidor propios y ausencia de nombres ajenos. |
| CA7 — Migrador explícito sin cambios globales de roles | scripts/ensayar-respaldo-multitematico.mjs:380; packages/db/src/cli/migrar-comando.ts:104,118; packages/db/src/migrar.ts:155; packages/db/migraciones/0008_privilegios_minimos.sql:25 | CLI dist existente recibe URL derivada y NODE_ENV=production; ejecuta SQL de migraciones en base aprobada. 0008 consulta existencia de roles y concede permisos sobre objetos locales; sin ALTER ROLE/USER, CREATE ROLE o cambio de contraseñas en recorrido revisado. |
| CA8 — Rutas, freeze y checkpoints sin replay | scripts/ensayar-respaldo-multitematico.mjs:87,110,164,198,211,966 | Allowlist, comprobación realpath/symlinks en operación, archivos exclusivos, freeze8, diario ordenado, identidad guardada tras CREATE, etapas iniciadas/inciertas bloqueadas y locks conservados. |
| CA9 — Secretos y GPG efímero aislado | scripts/ensayar-respaldo-multitematico.mjs:231,284,491 | Entorno reducido; contraseña de PG por entorno, clave aleatoria por stdin/--passphrase-fd 0; --no-options y homedir propio; hash/tamaño cifrado antes de descifrar; evidencia antes de próxima guarda; finally cierra solo agente de ese homedir. |
| CA10 — Restore real reutiliza rutas operativas y M10.2 | scripts/ensayar-respaldo-multitematico.mjs:823,852; infra/respaldo/respaldo.sh:547,614,672; scripts/respaldo.mjs:337,433 | Actual usa respaldarNode/restaurarNode; histórico usa restaurarNode + cargar_shell/cargar_datos_local y migra 0019→0021. Snapshot/verificar M10.2 se invocan de verdad en el diseño; sin comparación sustituta. |
| CA11 — Conservación de auxiliares/claves y negativos con rollback | scripts/ensayar-respaldo-multitematico.mjs:307,587,677,699,712,883 | Client persistente por base para BEGIN/mutación/verificador/ROLLBACK, incluido finally con error. Hashes completos de auxiliares, defs PK/FK/UNIQUE/CHECK del origen presentes y cero convalidated=false; ocupado comparado antes/después. Límites históricos detallados en informe. |
| CA12 — Fixtures 0019/0021 y CI | scripts/ensayar-respaldo-multitematico.mjs:920; .github/workflows/ci.yml:469; docs/operaciones/respaldo-y-restauracion.md:307 | Columnas, defaults, enums, FK y CHECK de fixture compatibles por lectura de migraciones. Único delta CI en infra: dependencias frozen para PGlite y nuevos controles; otros seis jobs íntegros F0. ShellCheck NO_VERIFICADO y CI remoto NO_EJECUTADO. |

## Límites relevantes para interpretar el resultado

- **Migraciones/roles:** se siguió el CLI compilado existente hacia migrar-comando, cliente/ejecutor y lector de migraciones, contrastado con src. La URL explícita evita el fallback local del cliente. 0008 contiene GRANT sobre tablas, secuencias y esquemas de la base nueva, sin GRANT de membresía ni cambios de atributos/contraseñas de roles. No se consultaron roles reales. Los callees y migraciones fueron solo leídos, sin ampliación de inventario.
- **Fixture real futura:** cuatro reportes en 0021 y uno de inundación en 0019, cuenta ficticia, foto referida en DB, auditoría, idempotencia y cupos. El SQL corresponde estáticamente a columnas/enums/CHECK/FK existentes. `detalle={sintetico:true}` de otras categorías y contraseña inutilizable son datos de conservación, no payloads validados por la API. Distrito/UV son identificadores ficticios sin capas; no se acredita PIP, autenticación, cámaras ni objetos fotográficos.
- **Histórico:** snapshot proyecta las columnas antiguas de reportes; renombre de tabla y nuevas columnas/índices legítimos no se confunden con pérdida. Auxiliares se comparan por JSON completo, admitiendo tablas nuevas solo vacías. En esta fixture `punto_critico` está vacío, por lo que su nueva columna `categoria` no cambia la huella. **No extender el resultado a históricos con auxiliares no vacíos que ganen columnas**: esa comparación no proyecta sus columnas antiguas. Claves compara definiciones PK/FK/UNIQUE/CHECK, además del estado de validación; no certifica todos los índices únicos independientes, ACL, secuencias o disparadores.
- **Evidencia previa atribuida:** Turing, `implementador/green-{node,runner,bash}.{json,log}`: 29 Node + 15 runner + 33 Bash, 77 PASS, cero fallos/skip. Leídos resúmenes y metadata; no son ejecuciones propias. Los bloques antiguos se comprobaron íntegros frente a F0. Los rojos iniciales incluyen helpers ausentes; no demuestran por sí mismos detección real de pérdida.
- **Mocks/PGlite:** mocks ejercitan orquestación/errores; PGlite en memoria ejecuta el DO literal Node y el extraído de Shell sobre esquema mínimo. Eso no prueba PostGIS, pg_restore ni GPG reales, ni toda la ruta del adaptador real. Las pruebas del runner no ejecutan su CLI operativo.
- **CI:** solo cambió infra; comparación textual con CRLF normalizado conserva `secretos-historial`, `verificar`, `e2e`, `postgres-real`, `imagenes-docker` y `publicar-imagenes`. La instalación frozen añadida ocurre en ese job futuro; aquí no se instaló nada. ShellCheck local **NO_VERIFICADO** (ausente según evidencia); CI remoto **NO_EJECUTADO**.
- Sin suites, imports del producto, PostgreSQL, Docker, GPG, HTTP/red, S3, lectura de .env, instalaciones, Git writes, cambios de roles, limpieza o operadores reales. No se crearon hijos/agentes delegados; las consultas de archivos finalizaron. La demo parada del 28/10 es contexto comunicado por el principal y no fue comprobada ni operada aquí.

## Integridad de las ocho fuentes

Primera lectura de las ocho fuentes: coincidente con freeze. Captura inicial consolidada UTC: 2026-10-28T14:49:12.4460760Z. Captura final UTC: 2026-10-28T14:50:19.5728411Z. SHA-256 de `implementador/freeze8.json` en ambas: `31e2e511fb44aa68caffddb2bae466e122959668d9bcd66e5fced927066d8a1f`. **8/8 inicio = final = freeze**; tamaños también coincidentes. No se escribió producto.

| Archivo | SHA-256 inicio | SHA-256 final |
|---|---|---|
| `scripts/respaldo.mjs` | `546d47ad980e1d7961d0c340bf78139ad340dc528ae9df8f9ec6c6fcb5509afa` | `546d47ad980e1d7961d0c340bf78139ad340dc528ae9df8f9ec6c6fcb5509afa` |
| `scripts/respaldo.test.mjs` | `23a53a5c95f2f84ee4597bad3fa28c7ab202f53d712b1373c42b37123d0d9e5b` | `23a53a5c95f2f84ee4597bad3fa28c7ab202f53d712b1373c42b37123d0d9e5b` |
| `infra/respaldo/respaldo.sh` | `58c793facdf7476f6d2d8a3af6d265aa43bb203209aca7c2513cd89c7968a1c8` | `58c793facdf7476f6d2d8a3af6d265aa43bb203209aca7c2513cd89c7968a1c8` |
| `infra/respaldo/respaldo.test.sh` | `e9b9753c9a65faee7d895c9f3b04a8bad23a6f5afed0c0064c7a75223a7a29b8` | `e9b9753c9a65faee7d895c9f3b04a8bad23a6f5afed0c0064c7a75223a7a29b8` |
| `scripts/ensayar-respaldo-multitematico.mjs` | `8d0f84159d16a066fc77946d321f9ad09994f4a739a67e3ad584c6d77d7180b5` | `8d0f84159d16a066fc77946d321f9ad09994f4a739a67e3ad584c6d77d7180b5` |
| `scripts/ensayar-respaldo-multitematico.test.mjs` | `d7b8b685cdd9cbec6cba476e6e730ef8b6689f3c418c15070000645a61c2cd3f` | `d7b8b685cdd9cbec6cba476e6e730ef8b6689f3c418c15070000645a61c2cd3f` |
| `.github/workflows/ci.yml` | `3d71edf78157c03dcdb8bb71297e3ebdf8b6a22960001ae7d676432d44297aac` | `3d71edf78157c03dcdb8bb71297e3ebdf8b6a22960001ae7d676432d44297aac` |
| `docs/operaciones/respaldo-y-restauracion.md` | `9fe662583c9028a772bd92d8c86c0c6429a8fb118fba4099d125ce4bf484a766` | `9fe662583c9028a772bd92d8c86c0c6429a8fb118fba4099d125ce4bf484a766` |

El resultado cubre preparación estática para el ensayo conservado de los bancos fijos; no acredita SQL/cifrado/restauración reales, S3, producción, otros históricos, recuperación ante caída, concurrencia, contracción física/HTTP ni cierre de M10/Fase 1.

