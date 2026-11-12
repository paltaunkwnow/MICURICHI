# Línea base — Mapa y formulario por categoría (web pública, M4)

- **Corrida:** `docs/sdd/2026-10-10-mapa-y-formulario-por-categoria/` · **Medida el:** 2026-10-10 18:48–18:51 -0400 · **Por:** `sdd-verificador` (modo línea base)
- **Foto:** `refs/sdd/mapa-y-formulario-por-categoria` = `48b1e40` · **HEAD:** `3121a0f` · **Rama:** `feat/web-ciudadano/categoria-en-mapa-y-formulario`
- **Banderas:** `ui`, `contrato` (0.21.0 aditivo), `privacidad`, `api` (consumidor) · **Alcance:** `--filter=...contracts` para las filas reutilizadas (paquetes que entran: `contracts`, `db`, `api-core`, `geo-service`, `web-ciudadano`, `panel-admin`, `geodata-etl`); lo corrido ahora, sobre `web-ciudadano` y `contracts`, `--concurrency=1` donde aplica.
- **Condiciones:** RAM libre al inicio **5191 MB** (5568 MB al final) · procesos pesados de otras sesiones **0** (el contador de la matriz dio 4 = 3 `bash.exe` de esta sesión + el `powershell.exe` de la propia consulta; `Get-CimInstance` confirmó 0 `vitest`/`playwright`/`next`/`tsc` reales ajenos) · pila Docker **NO** (Docker Desktop **apagado**: 0 procesos `Docker Desktop`/`com.docker.backend`, pipes `docker_engine` y `dockerDesktopLinuxEngine` inexistentes; puertos 5432/9000/9001 libres) · `next dev` local **no** (puertos 3000-3002/3100 libres) · túneles `cloudflared` **0** · `--concurrency=1`
- **Aviso de la cabecera:** al medir las filas de máquina (18:48–18:51) Docker Desktop estaba **apagado**; la foto de la pila y la primera entrega dejaron la ventana E2E y `privilegios` como **no verificado: base no disponible** (no arranqué la base, regla del verificador). **Actualización (continuación, 2026-10-10 ~19:0x -0400):** el **usuario encendió Docker**; `curichi-postgis` y `curichi-minio` quedaron **healthy**. Completé la ventana E2E sobre el árbol sin tocar (idéntico a la foto `48b1e40`, verificado antes y después). Las filas E2E de abajo pasan de «no verificado» a su resultado.

## Demostración: el código no cambió desde la F4a de M3b (vuelta 1)

La F4a de M3b (vuelta 1) quedó registrada en `docs/sdd/2026-10-09-cupo-por-categoria/verificacion.md` (2026-10-10): **sin regresiones**, E2E **87/87**. El árbol de código de hoy es el mismo. Pruebas:

1. **Árbol trackeado idéntico a la foto M4.** `git diff --name-only 48b1e40` (árbol de trabajo completo vs `refs/sdd/mapa-y-formulario-por-categoria`) → **vacío**. Nada trackeado cambió desde que se tomó la foto M4 en F0 (2026-10-10). También vacío restringido a código: `git diff --name-only 48b1e40 -- packages/ services/ apps/ e2e/`.
2. **La foto M4 contiene exactamente las ediciones de código de M3b.** `git diff --stat d68fe6a 48b1e40 -- packages/ services/ apps/ e2e/` (foto M3b `refs/sdd/cupo-por-categoria` → foto M4) = **22 archivos, +1091/-207**; es el mismo conjunto que M3b registró en su F4a: los 19 de `services/api-core/{src,test}`, `services/api-core/README.md`, `packages/db/src/mantenimiento.ts` y `packages/contracts/CHANGELOG.md`. (Total con `CLAUDE.md`: **23 archivos, +1117/-222**, idéntico a `git diff --stat refs/sdd/cupo-por-categoria` sobre el árbol de hoy.)
   - **Sobre el «+844» de la cabecera de M3b:** la cabecera de `verificacion.md` de M3b anotó «+844/-222» como foto de media corrida (fue una verificación en continuación tras corte de sesión); el conteo del cierre real de M3b (con las ampliaciones de `cupo-diario` de la vuelta 1) es **+1091 de código**, que es lo que la foto M4 ya trae y lo que mide el árbol de hoy. El **conjunto de archivos y las eliminaciones (−222)** coinciden exactamente con lo registrado; el árbol de hoy = foto M4 = cierre de M3b.
3. **Los 19 archivos de código sin seguimiento coinciden byte a byte.** `sha256` de cada uno (`git ls-files --others --exclude-standard -- packages/ services/ apps/ e2e/`) comparado contra `arbol-inicial.txt` de esta corrida: **19/19 OK** (ninguno `DIFF`). Son las salidas de M3a/M3b (`contracts/src/categorias/*` ×6, `contracts/test/contrato-0-19|20.test.ts`, `db/migraciones/0020|0021` + sus reversas, `db/test/migracion-0020|0021` y `puntos-criticos-categoria.test.ts`, `api-core/src/categorias.ts` + `test/no-contaminacion-categoria.test.ts`, `geo-service/src/categorias.ts` + `test/no-contaminacion-categoria.test.ts`).

**Conclusión:** árbol de código = cierre de la F4a de M3b (vuelta 1). Reuso válido de sus filas (ver «Resultado por comando», origen `M3b`).

## Cambios ajenos (no son de esta corrida)

Decisión del usuario en F0 (del plan): **declararlos y dejarlos** — todo el trabajo M0–M3b sin commitear es el estado de partida y lo captura la foto `48b1e40` (`git diff` trackeado contra la foto = 0).

| Archivo | Estado | sha256 (solo `??`) |
|---|---|---|
| ~40 trackeados (`git diff --name-only 3121a0f 48b1e40`: `packages/contracts/*`, `packages/db/*`, `services/api-core/*`, `services/geo-service/*`, `e2e/tests/api-contratos.spec.ts`, docs) | `M` | — (trabajo M0–M3b; idéntico a la foto M4) |
| 19 de código sin seguimiento (`packages/`, `services/`) + reversas | `??` | **19/19 iguales** a `arbol-inicial.txt` (ver «Demostración» §3) |

La corrida M4 editará **sus** carpetas designadas: `apps/web-ciudadano/`, `packages/contracts/` (cambio aditivo 0.21.0, custodia P3) y —solo con autorización— `e2e/`. **No** toca `services/*`, `apps/panel-admin/`, `packages/db/`, `infra/`, `scripts/`, la raíz ni `CLAUDE.md` salvo la sección autorizada. Si necesita alguno de esos, para y pregunta.

## Resultado por comando

Origen: **M3b** = reutilizado de `docs/sdd/2026-10-09-cupo-por-categoria/verificacion.md` (F4a + vuelta 1, 2026-10-10; código idéntico, probado en «Demostración»). **ahora** = corrido en esta línea base, para tener el detalle en la zona que toca M4.

| # | Comando exacto | Bandera | Origen | Salida | Dur. | Veredicto |
|---|---|---|---|---|---|---|
| 1 | `pnpm lint` (`biome check .`) | base | M3b #1 | exit 1 (1 err + 6 warn, ajenos) | — | **rojo** (preexistente; ajenos) |
| 2 | `pnpm exec turbo run typecheck --filter=...contracts --concurrency=1` | base | M3b #2 | exit 0 (9/9) | — | verde |
| 3 | `pnpm exec turbo run test --filter=...contracts --concurrency=1` | base/ui | M3b #3 | exit 0 (contracts 292, db 294, api-core 436+12, web **486**, panel 458, geo 71, geodata 21) | — | verde |
| 4 | `pnpm exec turbo run build --filter=...contracts --concurrency=1` | base/ui | M3b #4 | exit 0 (7/7; apps «Compiled successfully») | — | verde |
| 5 | `pnpm secretos` | base | M3b #5 | exit 0 «sin hallazgos» | — | verde |
| 6 | grep secretos en archivos sin seguimiento | base | M3b #6 | exit 0 (única de código ajena = col `password_hash` en test 0020) | — | verde (revisa el auditor) |
| 8 | `pnpm --filter contracts --filter db build` | contrato | M3b #8 | exit 0 | — | verde |
| 9 | `cp openapi antes; --filter contracts build; cmp` | contrato | M3b #9 | exit 0 (cmp idéntico; determinista) | — | verde |
| 29 | `pnpm audit --audit-level high` | seguridad/api | M3b #29 | exit 1 (3 high: `source-map-js`, `sharp`, `next`) | — | **rojo** (preexistente; ajenos) |
| W0 | `pnpm --filter web-ciudadano exec vitest run` | ui | **ahora** | exit 0 · **34 passed (34) · 486 passed (486)** | 11 s | verde |
| W1 | `pnpm --filter web-ciudadano exec vitest run --reporter=verbose` (12 archivos de la zona M4) | ui | **ahora** | exit 0 · **12 passed (12) · 232 passed (232)** | — | verde |
| C0 | `pnpm --filter contracts exec vitest run` | contrato/ui | **ahora** | exit 0 · **19 passed (19) · 292 passed (292)** | 6 s | verde |
| C1 | `sha256sum packages/contracts/openapi/openapi.yaml` | contrato | **ahora** | `aaa8b711…6bac` (idéntico a M3b) | — | verde |
| T0 | `pnpm --filter web-ciudadano typecheck` (`tsc --noEmit`) | ui | **ahora** | exit 0, sin errores TS | 6 s | verde |
| B0 | `pnpm --filter web-ciudadano build` (`next build`) | ui | **ahora** | exit 0 · «✓ Compiled successfully in 3.0s»; 10/10 páginas; rutas `/`, `/reportar`, `/reporte/[id]`, etc. | 16 s | verde |
| P1 | `privilegios` contra `curichi_e2e` (Docker ya encendido) | ui/api | **continuación** | exit 0 · «privilegios correctos: curichi_api y curichi_geo … 0008, 0009, 0014, 0016 y 0020» | — | verde |
| EZ | Ventana E2E (G2, G3, G5, `recorrido-completo`) | ui/api | **continuación** | **112 passed · 1 skipped · 0 failed · 0 flaky** | — | verde (ver «E2E») |
| G1 | E2E G1 (api-contratos, separacion, cuenta-ciudadana, acceso-panel, publicacion-diferida) | ui/api | M3b | 47/47 | — | verde (reutilizado; ver «E2E») |

Veredictos: `verde` · `verde (cache hit)` · `verde (imagen Docker al día)` · `rojo` · `no verificado: <motivo>`.

### Detalle de W0 — suite completa de `web-ciudadano` (34 archivos, conteo por archivo)

Todos verdes (`passed/total`): `AvisoPuntoResuelto` 5/5 · `AvisosDelReporte` 14/14 · `FormularioAcceso` 9/9 · `api` 9/9 · `borrador` 24/24 · `camara-pagina` 20/20 · `camara` 29/29 · `capas-con-huella` 9/9 · `ciudad` 3/3 · `configuracion` 11/11 · `consultas` 15/15 · `correo-para-entrar` 10/10 · `cupo` 12/12 · `errores` 21/21 · `formato` 15/15 · `formulario-reporte` 34/34 · `foto` 3/3 · `imagenes-propias` 6/6 · `mapa-datos` 19/19 · `misReportes` 13/13 · `next-config` 8/8 · `panel` 12/12 · `proxy` 18/18 · `publicacion` 13/13 · `radio-configurable` 4/4 · `radio` 31/31 · `recursos-mapa` 3/3 · `servicios` 3/3 · `sesion` 9/9 · `sw` 18/18 · `ubicacion-aproximada` 6/6 · `ubicacion-dispositivo` 35/35 · `ubicacion-pagina` 24/24 · `verificacion` 21/21. **Total: 486/486.**

### Detalle de W1 — nombres de las 12 pruebas de la zona M4 (`--reporter=verbose`)

Todas verdes. Conteos: `misReportes` 13 · `consultas` 15 · `AvisosDelReporte` 14 · `borrador` 24 · `formulario-reporte` 34 · `camara-pagina` 20 · `configuracion` 11 · `publicacion` 13 · `cupo` 12 · `radio` 31 · `verificacion` 21 · `ubicacion-pagina` 24 = **232**.

**`src/lib/misReportes.test.ts` (13):** la lista vieja del navegador > es la clave `curichi.mis-reportes.v1` y se borra · no rompe con el almacenamiento bloqueado ni sin navegador · ya nadie escribe en ella: la lista es la del servidor · la sesión la borra al montarse, así desaparece en cualquier pantalla · los datos de la cuenta al perder la sesión > la clave lleva la cuenta: otra persona en el mismo navegador no ve la lista de la anterior · `removeQueries([mis-reportes])` saca de la caché la lista de cualquier cuenta · se hace al cerrar sesión y cuando `/auth/yo` dice que no hay sesión · GET `/api/v1/mis-reportes` > va con la cookie de sesión y a la ruta del autor · las pantallas de Mis reportes la usan, y no el detalle público · en qué está cada reporte, visto por su autor > mientras espera su `publicar_en`, está en espera · publicado y sin revisar: sin verificar · verificado, resuelto, retirado o sumado a otro punto · el resumen cuenta cada grupo.

**`src/lib/consultas.test.ts` (15):** sin tráfico automático en la app pública > reportes del mapa: volver a la pestaña a los 60 s no dispara otro GET · reportes de la portada: ídem · agregados por unidad vecinal: ídem · detalle de un reporte: ídem · volver la red no dispara otro GET · no hay refresco por intervalo: en 30 minutos abiertos se pide una sola vez · reportes del mapa: volver a la pantalla al minuto usa lo que ya había · reportes de la portada: ídem · agregados por unidad vecinal: ídem · detalle de un reporte: ídem · una invalidación explícita sí vuelve a pedir · las opciones por defecto no reintroducen foco, reconexión ni intervalo · ninguna pantalla vuelve a encender el tráfico automático > ningún `useQuery` pide refresco por intervalo, por foco ni por reconexión · ninguna pantalla le pone caducidad propia a los datos públicos > detecta el `staleTime` en la consulta de reportes, agregados o detalle, y solo ahí · ningún archivo de la app pone `staleTime` en esas consultas.

**`src/componentes/AvisosDelReporte.test.ts` (14):** pie del paso de revisión > «error-envio» está dentro de `.pie`, encima del botón de enviar y con `role="alert"` · conserva `data-campo-con-error` · sin error de envío no dibuja el aviso, y el botón sigue ahí · el botón dice lo que pasa y se deshabilita cuando corresponde · las notas del formulario van después del botón, dentro del mismo pie · error de foto > «error-foto» lleva `role="alert"` y el mensaje · en la revisión lleva además su título «Foto sin subir» · el formulario usa estas piezas y no vuelve a dibujar los avisos a mano > el paso 4 arma su pie con `PieDeRevision` (una vez) · el aviso de la demora y la nota de la ubicación siguen en ese pie, después del botón · el pie del paso 4 es hermano del área con scroll · las dos pantallas con foto (3 y 4) usan `ErrorDeFoto` · paso 3: el error de foto va debajo de «Sacar foto» y antes de la descripción · revisión: el error de foto va justo después de la fila «Fotos», antes del tipo de lugar · «error-envio» y «error-foto» solo se declaran en las piezas.

**`src/lib/borrador.test.ts` (24):** borrador del formulario de reporte > guarda y devuelve lo que había a medias · recuerda el modo de ubicación aproximada (ADR 0007) · conserva la clave de idempotencia · olvida el borrador cuando se pide · descarta un borrador caducado en vez de restaurar fotos que el servidor ya borró · ignora basura o restos de una versión anterior · acota el paso restaurado al rango del asistente · con el almacenamiento bloqueado no rompe nada · en el servidor no toca nada · CA-W4: un borrador guardado antes del cambio se restaura sin duración ni afectación · traduce un borrador con `tirante_estimado` a `profundidad_estimada` · si el borrador ya trae profundidad, el tirante viejo no la pisa · traduce las respuestas viejas del sumidero · sin «Sí» en el sumidero cercano no se restaura un estado · un «no brota» que escribió el formulario al montar vuelve a «sin contestar» · abrir el formulario, o llegar desde «Me pasa a mí», no deja nada que retomar · nunca guarda la posición del teléfono (CLAUDE.md §0, regla 8) · un borrador de antes de contracts 0.9.0 pierde el método y la precisión viejos · una ubicación guardada que no son dos números no se restaura · la caducidad no se desliza · un formulario nuevo (otra clave) empieza su propio plazo · al restaurar descarta las fotos cuyo vale de 24 h ya venció · fecha del evento restaurada > una fecha de hoy guardada como mediodía UTC no se restaura en el futuro · un borrador recién abierto no cuenta como algo que retomar.

**`src/lib/formulario-reporte.test.ts` (34):** paso 1: el punto elegido (6) > el mapa abre en el punto elegido · el enlace «Me pasa a mí» solo cuenta con coordenadas válidas · «Continuar» espera a que se resuelva la UV · sin la posición del teléfono, o imprecisa, no se continúa · con el punto a más de 60 m no se continúa · un error de la posición lleva al paso 1 · paso 2: la fecha del evento (10) > el tope del calendario es el día de hoy en hora local · elegir «hoy» de madrugada manda la hora actual · un día pasado se guarda a mediodía local · una fecha futura o de hace más de un año no deja continuar · contra el contrato (3): el día más viejo, «hoy» a cualquier hora, deriva del reloj · lo que no es una fecha completa no produce nada · un error lleva al paso de su campo · lo que no tiene control se dice en la revisión · paso 3: sumidero y fotos (6) > «el agua brota» empieza sin contestar · sin sumidero cerca no queda ni estado ni «brota» · con sumidero se conservan las respuestas · las fotos subidas y la que se sube ocupan lugar · la foto es opcional · mientras sube una foto no se continúa · el envío (4) > la ubicación viaja desde el estado · lleva la posición congelada y pasa el contrato · ya no manda `ubicacion_metodo` ni `precision_gps_m` · el sumidero sale coherente · la validación (4) > valida todo el contrato menos la posición · los errores son los de las respuestas · toma lat/lon de contexto si faltan · normaliza `sumidero_cercano=no` · camino de ubicación aproximada (ADR 0007) (4) > «Continuar» no exige precisión ni radio · el camino normal sí · el envío manda `ubicacion_aproximada: true` · el normal manda `false`.

**`src/lib/camara-pagina.test.ts` (20):** sin galería: ningún input de archivo en la app > ningún archivo de `src/` declara `input[type=file]` ni `capture` · el componente de la cámara no tiene input de archivo en ningún estado · la cámara se pide solo al tocar «Sacar foto» > `getUserMedia` aparece en un único archivo `src/lib/camara.ts` · solo `CamaraReporte` abre la cámara desde el botón · ningún efecto abre la cámara al montar · el detector encuentra un efecto que la pediría · el render inicial muestra «Sacar foto» usable y el diálogo cerrado · marcado del diálogo de la cámara (13) > en reposo solo el botón usable · con fotos completas o una subiendo, el botón se deshabilita · mientras espera el permiso lo dice · es un diálogo con título, video en línea y mudo, disparo grande con nombre · el disparo espera la imagen · con la foto sacada ofrece «Repetir» y «Usar esta foto» · los problemas «sin-soporte», «inseguro», «denegada», «sin-camara», «ocupada», «cortada», «desconocido» se anuncian con su texto y el botón sigue disponible (7).

**`src/lib/configuracion.test.ts` (11):** lector de la ciudad (GET `/api/v1/configuracion`) > pregunta a api-core sin la caché de datos de Next y devuelve la ciudad validada · guarda la ciudad cinco minutos · vencido el plazo responde con la que tiene y la renueva por detrás · la URL de api-core se lee en cada consulta · varias páginas a la vez comparten una sola consulta · si api-core no responde usa `CIUDAD_POR_DEFECTO` y lo registra · el respaldo no se guarda · una respuesta que no es 200 o no cumple el esquema no se usa · si ya tenía ciudad y api-core falla, sigue con esa · una `API_CORE_URL` mal escrita no tumba la página · una consulta colgada se corta al vencer el plazo.

**`src/lib/publicacion.test.ts` (13):** el aviso antes de enviar > dice 1 minuto para el primero del día y 4 para los siguientes · lee `demora_proximo_s` de `/auth/yo` · sin `demora_proximo_s` la deduce del cupo y si tampoco hay no inventa · con demora 0 no promete espera · el formulario lo muestra en la revisión · la cuenta regresiva > formatea minutos y segundos · con el reloj 10 min adelantado, 240 s del servidor son 4:00 · el componente dibuja lo mismo · parte de `segundos_para_publicar` del servidor · lo que dice debajo de la cuenta > con 0 s no dice «Hasta entonces no aparece» · mientras falta algo lo dice y al terminar deja de decirlo · sin los segundos del servidor avisa sin inventar minutos · la confirmación usa ese texto.

**`src/lib/cupo.test.ts` (12):** cuántos reportes le quedan hoy > el tope del contrato: 3 por día · lo dice `/auth/yo` en `reportes_restantes_hoy` · sin el campo, un turno pendiente es «ninguno ahora» · «Te quedan N de 3 reportes hoy» · la puerta del cupo del formulario > mientras se vuelve a preguntar todavía no se sabe · con 0 restantes agotado; con alguno o sin dato, se sigue · el aviso de cupo agotado no ofrece ubicación ni cámara · el formulario revalida `/auth/yo` al abrirse · el aviso del cupo va antes del paso de ubicación y la cámara · el formulario y la cuenta muestran «Te quedan N de 3 reportes hoy» · ya no hay espera de 60 minutos ni tope de fotos por hora > nadie usa las constantes deprecadas de 0.10.0 · ningún texto habla de «cada 60 minutos» ni de fotos «por hora».

**`src/lib/radio.test.ts` (31):** el radio del reporte es el del contrato: 60 m · recortar el punto al círculo (4) · mover el punto con botones y flechas (3) · el círculo que se dibuja: anillo cerrado a 60 m · el encuadre del mapa (2) · escribir las coordenadas (4) · dónde arranca el punto cuando llega la ubicación (5) · qué cuenta como elegido al volver a compartir (5) · al salir del paso 1 el punto deja de ser precargado — hallazgo de T2 (3) · modo de ubicación aproximada: sin radio, ADR 0007 (3).

**`src/lib/verificacion.test.ts` (21):** la etiqueta «NO SE HA VERIFICADO» (8) > texto exacto del contrato · `verificado` sale del campo del servidor y si falta del estado · cada estado tiene contraste AA (4,5:1) · el cálculo de contraste es el de WCAG · el chip lleva texto visible e icono · aparece en la tarjeta, en el detalle, en la leyenda · las pastillas del mapa (2) · la coropleta pública solo con verificados (6) · los textos de la moderación previa se reescribieron (5).

**`src/lib/ubicacion-pagina.test.ts` (24):** nada se pide ni se lee al cargar (6) · «Cómo funciona» dice qué se guarda de la ubicación · «Ir a mi ubicación» sin permiso · paso 1: pedir la ubicación (7) · paso 1: reportar con ubicación aproximada, ADR 0007 (4) · el formulario cablea el camino aproximado (5).

## Rojos que ya estaban (lista exacta: F4 compara contra esto)

Son los mismos dos de M3b (código idéntico), reutilizados.

### 1. `pnpm lint` (`biome check .`) — exit 1

«Found 1 error. Found 6 warnings.» Todos en archivos **ajenos** (nada en `web-ciudadano`, `contracts`):

```
ContextosySkills\hooks\contexto.mjs                     format            (= el 1 error)
ContextosySkills\hooks\contexto.mjs:42:17  lint/suspicious/noUndeclaredEnvVars
ContextosySkills\hooks\contexto.mjs:43:13  lint/suspicious/noUndeclaredEnvVars
ContextosySkills\hooks\contexto.mjs:45:14  lint/suspicious/noUndeclaredEnvVars
ContextosySkills\hooks\contexto.mjs:45:55  lint/suspicious/noUndeclaredEnvVars
ContextosySkills\hooks\contexto.mjs:49:24  lint/suspicious/noUndeclaredEnvVars
docs\dominio\infografia-plataformas-riesgo.html:128:3  lint/style/noDescendingSpecificity
```

### 29. `pnpm audit --audit-level high` — exit 1

3 **high** (de deps de apps/services; `pnpm audit` escanea todo el lockfile):

```
high  source-map-js  — event-loop DoS
high  sharp          — librsvg CVE-2026-96889
high  next           — SSRF en Image Optimization
```

Recuento: **16 verdes** (W0, W1, C0, C1, T0, B0 corridos ahora; `privilegios` y la ventana E2E en la continuación; filas base/contrato 2, 3, 4, 5, 6, 8, 9 reutilizadas de M3b) · **2 rojos preexistentes ajenos** (lint, `pnpm audit`) · **no verificados:** ninguno (la ventana E2E corrió en la continuación, con Docker encendido por el usuario).

## Pila en vivo (bandera `ui`; foto sin tocar nada)

**Foto al medir las filas de máquina (18:48–18:51):** Docker Desktop apagado; `postgis`/`minio` sin correr (5432/9000/9001 libres); `curl -sk https://localhost/` y `…panel.localhost/login` = `000`. No arranqué nada entonces.

**Continuación (usuario encendió Docker):** `docker compose ps` → `minio running healthy`, `postgis running healthy` (perfil `servicios` — api-core/geo-service del contenedor/Caddy — **sigue abajo**: por eso la ventana E2E se corrió con la pila `pnpm dev` que levanté yo contra `curichi_e2e`, no con las imágenes Docker). Para la ventana E2E levanté y bajé esa pila `pnpm dev`; `curichi` nunca se tocó (0 cuentas `e2e-*@curichi.test`; las escrituras fueron a `curichi_e2e`: ciudadanos 95→151, reportes 89→116). El «en vivo» (reconstruir las imágenes) **no aplica**: el plan lo deja fuera (migraría `curichi`).

## E2E sobre el árbol sin tocar (ventana autorizada por la puerta 1)

Corrida en la **continuación** (usuario encendió Docker). **Base:** `curichi_e2e` en la **0021** (`_migraciones`: 21 aplicadas, última `0021_indice_categoria_creado.sql`; índice `reporte_categoria_creado` presente; catálogo `categoria`: `inundacion` activa, resto inactivas; capas reales DM_UV_MZ_2025 16/576/27527 vigentes; usuarios semilla `tecnico`/`ejecutivo`/`admin` + ciudadanos). `privilegios` contra ella → «privilegios correctos». **Pila:** el runner `correr-local.mjs` aborta en esta máquina porque `.env` no trae `API_DATABASE_URL`/`GEO_DATABASE_URL`; como en M3b, levanté yo `pnpm dev` (api-core 3001, geo-service 3002, web 3000, panel 3100) con `DATABASE_URL`/`API_DATABASE_URL`/`GEO_DATABASE_URL` → `curichi_e2e` y el entorno de prueba de `playwright.config.ts` (demora 2/4 s, cupo 3, `ALTAS_POR_DIA_POR_IP=10000`, `COOKIE_SEGURA=0`, rate limits altos). Playwright **reutilizó** esa pila (`reuseExistingServer`), nunca levantó `pnpm dev` contra `curichi`. Antes de correr: api-core `/ready` = `{db:ok,geo:ok,fotos:ok,degradado:false}`, geo `/health` 200, login técnico 200. **`PLAYWRIGHT_BROWSERS_PATH`** = `…\claude_pzs8sxrjxfjjc\LocalCache\Local\ms-playwright`, solo en mis comandos. RAM comprobada ≥ 2500 MB antes de cada grupo (2663 → 3462 → 3398 → 3238).

| Grupo / spec | Proyecto | Pasaron | Fallaron (lista exacta) | Veredicto |
|---|---|---|---|---|
| **G1** · `api-contratos` 14, `separacion-publica-tecnica` 7, `cuenta-ciudadana` 12, `acceso-panel` 8, `publicacion-diferida` 6 | chromium | **47/47** | — | verde (**reutilizado de M3b**; `docs/sdd/2026-10-09-cupo-por-categoria/verificacion.md`, misma base `curichi_e2e` en 0021, código idéntico) |
| **G2** · `datos-reales` | chromium | 9/9 | — | verde |
| **G2** · `mapa-publico` | chromium+movil | 4/4 (2+2) | — | verde |
| **G2** · `mapa-seleccion` | chromium+movil | 10/10 (5+5) | — | verde |
| **G2** · `navegacion` | chromium | 6/6 | — | verde |
| **G2** · `trafico-publico` | chromium | 2/2 | — | verde |
| **G3** · `formulario-reporte` | chromium | 11/11 | — | verde |
| **G3** · `formulario-sumidero-y-fotos` | chromium | 6/6 | — | verde |
| **G3** · `ubicacion-obligatoria` | chromium+movil | 19/19 (10+9) | — | verde (+1 **skip** legítimo: `:422` api-core directo no corre en `movil`) |
| **G3** · `ubicacion-aproximada` | chromium | 3/3 | — | verde |
| **G3** · `camara-foto` | chromium+movil | 4/4 (2+2) | — | verde |
| **G3** · `resiliencia-interfaz` | chromium | 9/9 | — | verde |
| **G3** · `quitar-campos-web` | chromium | 6/6 | — | verde |
| **G5** · `accesibilidad` | chromium | 6/6 | — | verde |
| **G5** · `responsive` | chromium | 7/7 | — | verde |
| **G5** · `csp` | chromium | 5/5 | — | verde |
| **`recorrido-completo`** (de G4) | chromium | 5/5 | — | verde |

**Totales de la continuación: G2 31/31 · G3 58/58 (+1 skip) · G5 18/18 · recorrido-completo 5/5 = 112 passed, 1 skipped, 0 failed, 0 flaky.** Con G1 (47/47 reutilizado de M3b): **159 passed, 1 skipped, 0 failed, 0 flaky** sobre el árbol sin tocar. Ningún reintento hizo falta; sin intermitentes.

### Cierre de la ventana (hecho siempre)

- Matados los árboles de proceso de los 4 dev servers; **puertos 3000-3002/3100 LIBRES**; 0 `node` de dev restantes (el task de fondo de `pnpm dev` terminó al matar el árbol).
- `pila-antes.txt` **=** `pila-despues.txt` (`minio running healthy` · `postgis running healthy`).
- `next-env.d.ts` de `web-ciudadano` y `panel-admin` **restaurados** (`git checkout`).
- Artefactos borrados: `e2e/test-results` (no quedaron `playwright-report`/`logs`); el JSON de Playwright fue a la scratchpad, no al repo.
- `curichi` intacto (0 cuentas `e2e-*@curichi.test`); las escrituras fueron a `curichi_e2e`. Árbol trackeado = foto `48b1e40` antes y después.

## Decisiones de la puerta 1 (las copia el agente principal)

- **Rojos que ya estaban:** `lint` (ajenos) y `pnpm audit` (3 high) → seguir como conocidos.
- **Ventana E2E:** autorizada y **corrida** (continuación, Docker encendido por el usuario): G2 31/31 · G3 58/58 (+1 skip) · G5 18/18 · recorrido-completo 5/5 = **112 passed, 1 skipped, 0 failed, 0 flaky**; G1 47/47 reutilizado de M3b. `curichi` intacto; pila `pnpm dev` levantada y bajada; `pila-antes.txt` = `pila-despues.txt`.
- **En vivo (reconstruir y reemplazar su pila):** **no aplica** (migraría `curichi`).
- **Migrar `curichi` tras `pg_dump`:** no. **Túnel temporal:** no aplica.
