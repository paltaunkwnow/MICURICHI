# Verificación ejecutada de M4 — 2026-10-15

**FINALIZADA, cierre local del 2026-10-15.** Principal ejecutor bajo excepción expresa del usuario;
revisión independiente del diff corregido asignada a un subagente. Los intentos del 14/10 se
cortaron por límite sin ejecutar la matriz. Foto original `48b1e40`, respaldo `09930a3`, rama
local `codex/cierre-m4`. Sin commits ni push.

## Estáticos, suites y build

Logs privados ignorados en `.turbo/cierre-m4-2026-10-14/`; se conserva el directorio para
continuar la misma corrida. Comandos en serie, fuera del sandbox con aprobación, usando Node
y pnpm 12.4.1 ya instalados. Sin instalaciones ni conexiones a bases en estas suites.

| Comando | Resultado | Evidencia |
|---|---|---|
| `pnpm --filter contracts build` | Exit 0, 7,29 s | `contracts-build.log` |
| `pnpm --filter db build` | Exit 0, 5,15 s | `db-build.log` |
| `pnpm exec turbo run typecheck --filter=...contracts --concurrency=1` | **9/9**, exit 0, 8,45 s, ocho tareas de caché | `consumidores-tipos.log` |
| `pnpm exec turbo run test --filter=...contracts --concurrency=1` | **9/9**, exit 0, 8,26 s, ocho tareas de caché | `consumidores-tests.log`; web modificada ejecutada |
| `pnpm exec turbo run build --filter=...contracts --concurrency=1` | **7/7**, exit 0, Turbo 36,535 s, seis tareas de caché | `consumidores-build.log`; web compilada |
| `biome check . --reporter=summary` | Exit 1: exactamente un error + seis avisos conocidos, ningún diagnóstico nuevo | `lint-final.log` |
| `node --check e2e/scripts/correr-local.mjs` | Exit 0 antes y después de editar | Solo consulta de existencia desde postgres |
| OpenAPI regenerado | SHA256 **idéntico** al anterior | `aaa8b71111479752058b2ca22f75bd5cc8eb674d85c992a8f81587e2de046bac` |
| Escáner de secretos incl. nuevos | **Exit 0, sin hallazgos** | `secretos-final.log`; script existente adaptado solo en memoria para incluir untracked y redactar valores |
| Auditoría actual de dependencias | Exit 1, **mismas tres high**, sin críticas | source-map-js, sharp, next; una low y diez moderate; `auditoria-final.json` |

El primer intento de builds se detuvo antes de ejecutar por RAM de 1363 MB. La siguiente
muestra permitió continuar: 2945/3081/3066/3119 MB antes de cada paso y 3331 MB antes del build.
No se forzó el mínimo de 1500 MB y no había servidores dev durante builds. La caché se identifica
expresamente; no se presenta como ejecución nueva de todos los tests.

```text
contracts:      20 archivos, 303 passed
web-ciudadano:  48 archivos, 642 passed
panel-admin:    40 archivos, 458 passed
db:             28 archivos, 294 passed
api-core:       33 archivos passed + 2 skipped; 436 passed + 12 skipped
geo-service:     6 archivos, 71 passed
geodata-etl:     3 archivos, 21 passed
Tasks: 9 successful, 9 total
Cached: 8 cached, 9 total
```

Total **2225 pruebas aprobadas, 12 omitidas conocidas**. La equivalencia semántica contra la
base original se revisa en `revision-cierre.md`; la del diff corregido sigue pendiente. Un mayor
conteo no acredita por sí solo conservación de aserciones. Correcciones y rojo→verde local en
`correcciones-cierre.md`.

**Segunda vuelta focal:** R1/R2 del revisor corregidos y reproducidos antes. Suite web
**645 pruebas / 49 archivos**, exit 0, 25,19 s; typecheck y build web repetidos y verdes.
Resultado final combinado: **2228 aprobadas + 12 omitidas conocidas**. Los otros paquetes no
cambiaron y conservan la matriz anterior. Biome de web/E2E sin diagnósticos. No se fuerza
Turbo ni se repiten paquetes ya verificados sin cambios.

## E2E aislada

Coordinador temporal `.turbo/.../ejecutar-e2e.mjs`, sin editar config productiva ni `.env`.
Deriva URLs exclusivamente a `curichi_e2e`, comprueba identidad de ambos roles y da a cada
servicio su conexión restringida. Apps y Playwright no reciben credenciales PG. No se conecta
a `curichi` ni `curichi_revision`, no migra ni resiembra y no toca contenedores.

Privilegios: **exit 0**, roles exactamente como las migraciones. Geo health y API ready con
db/geo/fotos ok, sin degradación. Fotos en directorio de corrida. Entorno de servicios conserva
tres reportes, demoras 2/4 s, cookies de prueba y límites de tráfico E2E.

**Primer intento:** las cuatro apps/servicios arrancaron correctamente. Con Next dev la RAM
quedó en 1715 MB y el coordinador detuvo la ventana **antes de ejecutar un test**. Cerró los
cuatro árboles propios, restauró bytes iniciales de next-env.d.ts y comprobó puertos libres.
No es una regresión de la aplicación ni una E2E verde.

**Segundo intento:** mismos servicios/bases/opciones Playwright; las apps usan `next start`
con los builds recién verificados y NODE_ENV production, reduciendo memoria. Los servicios
conservan NODE_ENV development para las demoras de prueba. Es una diferencia explícita de
invocación frente a la base histórica con Next dev; no se cambia el producto para obtener verde.
La configuración temporal elimina `webServer`, para impedir autoarranque sobre la base por
defecto. Chromium físico de LocalCache y variable solo de proceso. Mínimo 2500 MB por grupo.

Ese intento se detuvo antes de ejecutar tests por interoperabilidad del import de la config
temporal `.mjs` (Playwright no veía los proyectos). Se corrigió **solo el harness temporal** a
config TypeScript que importa la real y elimina webServer. `test --list` acredita 198 casos
en 27 archivos, con proyectos chromium/movil correctos. Typecheck de E2E exit 0. La ejecución
que figura abajo es el tercer arranque operativo; ningún intento previo se cuenta como verde.
Next start avisa que el despliegue recomendado para output standalone es el server generado;
las rutas respondieron y las pruebas se ejecutan contra este proceso local. No se confunde
esta ventana con una certificación de imagen Docker o despliegue VPS.

| Grupo | Base histórica | Resultado actual |
|---|---|---|
| G1 | 47 aprobadas | **47/47**, 57,01 s, 0 flaky / 0 omitidas |
| G2 | 31 aprobadas | **31/31**, 218,80 s, 0 flaky / 0 omitidas |
| G3 | 58 aprobadas + 1 omitida legítima | **57 estables + 1 aprobada tras retry**, 1 omitida, 340,26 s |
| G5 | 18 aprobadas | Producción inicial 13/18 → desarrollo 18/18 → **producción corregida 18/18**, 81,77 s, 0 flaky |
| recorrido-completo | 5 aprobadas | Desarrollo 5/5 → **producción final 5/5**, 16,10 s, 0 flaky |

**Ciclo DOM del anuncio: PASS** en Chromium, sobre el componente real compilado con ReactDOM:
mismo nodo vacío→aviso→cambio→limpieza; montaje con mensaje ya resuelto vuelve a iniciar vacío.
Dos inserciones observadas, ambas con texto vacío. Artefactos `anuncio-dom.mjs`, entrada TSX,
`anuncio-dom-resultado.json` y log. Es una prueba del componente, no un lector de pantalla real.

**Cámara intermitente:** móvil `camara-foto.spec.ts:39`, diálogo no apareció antes de 15 s en
primer intento (18,932 s total); retry aprobó en 6,916 s. Diagnóstico aislado posterior móvil,
sin retries: **2/2 aprobadas**, 16,28 s. Causa no confirmada; no se oculta el primer fallo.

**CSP adicional en producción:** los cinco casos registran `eval` en la sonda capturada de Zod
`Function("")`, sin otros recursos bloqueados. Se reproduce también en el panel inalterado;
su origen es comprobable en los chunks y en `zod/v4/core/util.js`. Desarrollo con webpack
(misma invocación de la base) aprueba los cinco. No se afirma que producción pase. El usuario
aprobó una corrección separada, `docs/sdd/2026-10-15-csp-zod/plan.md`; producción ya revalidada:
**G5 18/18 y recorrido 5/5**, sin reintentos. Suites web 645/panel 458, tipos y builds repetidos
tras el cambio por su implementador. Revisión independiente sin bloqueantes; no se tocó CSP.

Los dos coordinadores cerraron sus cuatro árboles propios, restauraron next-env y confirmaron
puertos 3000/3001/3002/3100 libres. Ningún contenedor fue detenido/recreado. El coordinador cierra
solo PID propios en finally y comprueba puertos al finalizar. La última ventana también cerró
sus procesos y dejó los puertos libres. Docker PostGIS/MinIO sigue healthy; ver
`pila-cierre-2026-10-15.txt`. Sin reconstruir imágenes habituales ni abrir túneles.

Los **159 escenarios culminan aprobados y uno se omite legítimamente**, con una cámara móvil
intermitente registrada; no se declara cero flaky en la corrida completa. G1–G3 preceden al
ajuste adicional de arranque Zod. Tras ese ajuste se repitieron G5 y recorrido, no todos los grupos.
