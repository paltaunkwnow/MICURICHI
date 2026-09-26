# Revisión para producción — 2026-09-26

Revisión de todo el repositorio hecha por once revisores especializados en paralelo, de solo
lectura, seguida de las correcciones en la rama `fix/repo/revision-produccion`. El criterio lo fijó
el usuario: el sistema tiene que quedar **listo para producción** y **preparado para crecer a otras
ciudades o países**, con foco actual en Santa Cruz de la Sierra.

| Revisor | Área |
|---|---|
| code-reviewer-pro | Lógica de negocio de api-core |
| security-auditor | Seguridad y privacidad transversal |
| postgresql-pglite-pro | Base de datos, migraciones y SQL de agregados |
| nextjs-pro | App pública |
| react-pro | Panel técnico y ejecutivo |
| backend-architect | geo-service |
| data-engineer | ETL de geodatos |
| architect-reviewer | Coherencia entre contratos, código y documentación |
| qa-expert | Fiabilidad y huecos de las pruebas |
| deployment-engineer | Preparación para producción |
| cloud-architect | Escalabilidad y crecimiento a otras ciudades |

## Decisiones del usuario

1. **Reporte con cuenta obligatoria.** Se mantiene lo que ya hacía el código (autor, cuota por
   cuenta, rastro ante abuso) y se actualiza `CLAUDE.md`, que todavía hablaba de reporte anónimo.
2. **Panel ejecutivo: «inundación activa» = reportes nuevos + validados**, mostrados como
   «N verificadas · M en revisión». Los resueltos salen del número grande y van a «Cómo va el
   trabajo».
3. **Crecimiento: una instalación por ciudad.** La misma imagen sirve a otra ciudad cambiando
   configuración (ADR 0004). La base multi-ciudad compartida queda en el backlog.
4. **Docker Desktop en la máquina de desarrollo.** La base local pasa a PostgreSQL 18 + PostGIS 3.6
   en Docker, con un rol por servicio (ADR 0005). PGlite queda como alternativa sin Docker.

## Hallazgos y resolución

Estados: **corregido** (con prueba que falla sin el arreglo), **mitigado**, **pendiente**.

### Seguridad y privacidad

| Hallazgo | Gravedad | Estado |
|---|---|---|
| La guía de producción pedía `TRUST_PROXY=2`; como Next no agrega `X-Forwarded-For`, el cliente elegía su IP y se saltaba todos los frenos por IP | Bloqueante | Corregido: `TRUST_PROXY=1`, prueba con la topología real y proxy HTTPS que reemplaza la cabecera |
| La exportación CSV no entrecomillaba `\r`: una descripción partía la fila y dejaba una fórmula ejecutable | Alto | Corregido |
| `POST /fotos` sin cuota por cuenta ni autor; cualquier cuenta podía asociar fotos ajenas | Medio | Corregido: `reporte_foto.subido_por` (migración 0012), 12 fotos por hora por cuenta, solo fotos propias |
| Foto sin reporte servida `public, immutable` | Bajo | Corregido: `private, no-store` hasta publicarse |
| El sondeo del panel ejecutivo renovaba la inactividad y la sesión no caducaba nunca | Bajo | Corregido: cabecera `x-curichi-sondeo` |
| La URL del panel viajaba en el JS público (y quedaba `localhost:3100` si faltaba al compilar) | Bajo | Corregido: llega por `/auth/yo` solo a roles de panel |
| Errores internos de Fastify (`FST_*`) llegaban al cliente | Bajo | Corregido: `PAYLOAD_INVALIDO` |
| Next publica la URL interna de los servicios en `x-middleware-rewrite` | Bajo | Corregido en el proxy HTTPS |

### Lógica de negocio (api-core)

| Hallazgo | Gravedad | Estado |
|---|---|---|
| Un reporte se podía fusionar consigo mismo (id en mayúsculas); fusiones cruzadas podían formar ciclos; X→B y B→C dejaba a X apuntando a un duplicado | Medio | Corregido: bloqueo de ambas filas en orden, rechazo explícito y re-apuntado con auditoría |
| Reabrir un rechazado no exigía motivo (§7.3) | Medio | Corregido en contracts 0.6.0 |
| La exportación recortaba en 10 000 filas sin avisar | Medio | Corregido: `total`, `exportados`, `truncado` y aviso en el panel |
| Filtros de fecha en la zona de la sesión de PostgreSQL (UTC en Docker): corridos 4 h | Medio | Corregido: `ZONA_HORARIA` de la ciudad |
| `/indicadores` contaba rechazados y duplicados, sin caché y con 7 conexiones por petición | Medio | Corregido: caché de 30 s, 2 conexiones, invalidación al moderar |
| El resumen ejecutivo presentaba reportes sin moderar como activos | Medio | Corregido con la decisión 2 (contracts 0.6.0) |
| Si fallaba el recálculo de puntos críticos, 500 con el cambio ya guardado y punto desactualizado para siempre | Bajo | Corregido: 200, métrica y marcado para que el mantenimiento lo rehaga |
| `evento_en` futuro y sumidero incoherente aceptados | Bajo | Corregido en contracts 0.6.0 |

### Base de datos

| Hallazgo | Gravedad | Estado |
|---|---|---|
| Puntos críticos: el recálculo completo medía en grados y el incremental en metros; a 24,4 m daban resultados distintos | Medio | Corregido: ambos en metros con el CRS de la ciudad (`CRS_METRICO_EPSG`) |
| Migraciones cortadas por el `statement_timeout` de 30 s con volumen | Medio | Corregido: sin tope de sentencia y con `lock_timeout` configurable |
| Las migraciones no se podían correr desde la imagen de producción | Alto | Corregido: `node dist/cli/migrar.js` y job `migraciones` en el Compose |
| Restaurar un respaldo anterior a una migración que borra columnas fallaba | Medio | Corregido: `--hasta` y versión guardada junto al respaldo |
| Drift entre el esquema Drizzle y el SQL | Bajo | Corregido, con prueba que compara `information_schema` |

### geo-service

| Hallazgo | Gravedad | Estado |
|---|---|---|
| Todas las creaciones de reportes compartían un cupo de 120/min por IP: en una tormenta, 503 para todos | Alto | Corregido: las llamadas internas con token quedan fuera del cupo |
| Consultas que seguían corriendo 25 s después de que api-core abandonaba | Medio | Corregido: `GEO_DB_STATEMENT_TIMEOUT_MS` (5 s) y 503 con `Retry-After` |
| ETag sin 304 | Bajo | Corregido |

### ETL

| Hallazgo | Gravedad | Estado |
|---|---|---|
| La carga de una versión no era atómica: una falla dejaba capas a medias | Alto | Corregido: una sola transacción por versión |
| El ETL activaba versiones con `--activar` y sin auditoría (§6.9) | Alto | Corregido: solo autoactiva en el primer arranque, con auditoría; el resto desde el panel |
| El control por feature se apagaba en silencio | Alto | Corregido: aviso visible en consola y reporte |
| Hallazgos de calidad identificados por posición | Medio | Corregido: código y respaldo del shapefile |
| Ids de manzana dependientes del orden del archivo | Medio | Corregido: orden estable por hash de geometría |

### App pública

| Hallazgo | Gravedad | Estado |
|---|---|---|
| Volver al paso 1 movía el punto elegido al centro | Alto | Corregido |
| El GPS nunca se guardaba como GPS | Medio | Corregido, con aviso si la precisión es de kilómetros |
| `agua_brota_sumidero` siempre `false` en vez de «sin dato» | Medio | Corregido |
| Se podía enviar con una foto subiendo | Medio | Corregido |
| Cancelar la cámara consumía el tope de fotos | Medio | Corregido |
| Otros siete de nivel bajo (borrador, cuota vieja, sesión, iOS < 17.4…) | Bajo | Corregidos |

### Panel

| Hallazgo | Gravedad | Estado |
|---|---|---|
| Una cuenta ciudadana quedaba atrapada sin poder cerrar sesión | Alto | Corregido |
| El mapa ejecutivo dejaba fuera de vista a los distritos 14 y 15 | Medio | Corregido: encuadre por bbox |
| Distritos de una capa anterior como barras «01» que aclaraban la escala | Medio | Corregido |
| El primer tono de la coropleta no se distinguía de «sin reportes» | Medio | Corregido: contraste ≥ 3:1 |
| Otros de nivel bajo (placeholder, `aria-live`, tooltip táctil, raíz por rol) | Bajo | Corregidos |

### Producción

| Hallazgo | Gravedad | Estado |
|---|---|---|
| Sin imagen de las apps Next ni proxy HTTPS; URLs fijadas al compilar | Bloqueante | Corregido: imágenes standalone, reenvío en tiempo de ejecución y proxy Caddy |
| Sin respaldos automáticos, sin copia externa ni cifrado | Bloqueante | Corregido: job de respaldo cifrado a S3 con retención y restauración probada |
| CI sin publicar imágenes, sin escaneo ni SBOM, acciones por etiqueta | Alto | Corregido |
| El job contra PostgreSQL real no creaba los roles y no corría `pnpm privilegios` | Alto | Corregido |
| Sin monitoreo ni alertas | Alto | Corregido: Prometheus + Alertmanager (perfil `observabilidad`) |
| `/ready` no comprobaba el almacén de fotos | Medio | Corregido |
| `container_name` y puertos fijos impedían escalar | Medio | Corregido |
| `sslmode=require` equivale a `verify-full` en pg 8.23 | Medio | Documentado |

### Crecimiento a otras ciudades

| Hallazgo | Gravedad | Estado |
|---|---|---|
| Centro, zona horaria, idioma y nombre de la ciudad escritos en el código | Medio | Corregido: `GET /api/v1/configuracion` y variables `CIUDAD_*` |
| CRS métrico fijo | Medio | Corregido: `CRS_METRICO_EPSG` |
| Una sola versión vigente por tipo de capa y sin municipio en las tablas | Alto | Pendiente por diseño: no aplica con una instalación por ciudad (ADR 0004) |
| Jerarquía fija distrito → UV → manzana | Medio | Pendiente: se generaliza cuando llegue una ciudad con otra jerarquía |
| Capa entera en memoria por proceso en geo-service | Medio | Pendiente: PMTiles por ciudad cuando haga falta |

## Pendiente, fuera de esta rama

- **Rate limit compartido entre réplicas** (almacén compartido o límite en el proxy). Hoy es por proceso y está documentado.
- **Invalidación de cachés entre réplicas** (`LISTEN/NOTIFY`); hoy cada réplica espera el TTL de 30 s.
- **CSP con nonce** en lugar de `'unsafe-inline'`: posible ahora que todas las páginas son dinámicas.
- **MinIO**: la edición comunitaria ya no publica imágenes; en producción va S3 gestionado.
- **RPO y RTO** acordados con el municipio, y logs centralizados con retención.
- **Número de emergencias** (911) por país en la configuración de la ciudad.

## Verificación

Se registra en el mensaje del commit y en el PR: lint, typecheck, pruebas por paquete, build,
suite E2E completa, y una instalación limpia sobre PostgreSQL real (roles, migraciones 0001–0012,
capas reales, datos de ejemplo y `pnpm privilegios`).
