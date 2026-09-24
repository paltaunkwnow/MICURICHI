# Revisión de seguridad — Fase 1

- **Fecha:** 2026-09-14
- **Alcance:** todo el repositorio en el commit de cierre de la Fase 1, recorriendo
  `docs/seguridad/checklist-pr.md` contra el código real.
- **Método:** lectura del código + verificación ejecutada (tests, suite E2E contra la pila
  levantada, y comprobaciones manuales con `curl` contra `api-core` y `geo-service`).
- **Convención:** ✅ verificado ejecutándolo · 🟡 verificado por lectura · ⛔ no comprobable aquí.

## Secretos y configuración

| Punto | Estado | Evidencia |
|---|---|---|
| Ningún secreto en el diff | ✅ | `.gitignore` excluye `.env*` salvo `.env.example`; los únicos valores en el repo son de ejemplo. Las contraseñas del seed son de desarrollo y están documentadas como tales. |
| Variables nuevas en `.env.example` | ✅ | `IP_HASH_SAL`, `JITTER_SAL`, `GEO_TOKEN_INTERNO`, `TRUST_PROXY`, `EXPONER_DOCS`, `IP_HASH_RETENCION_DIAS`, `GEO_RATE_LIMIT_POR_MINUTO`. |
| Valores de ejemplo no llegan a producción | ✅ | `leerConfig` llama a `verificarProduccion` cuando `NODE_ENV=production` y aborta el arranque si la sal de IP o la de jitter siguen con el valor de ejemplo, si la cookie no es segura o si CORS es `*`. Cubierto en `test/seguridad.test.ts`. |

## Entradas y archivos

| Punto | Estado | Evidencia |
|---|---|---|
| Validación en servidor con `contracts` | ✅ | Todas las rutas de escritura usan `safeParse` de los esquemas Zod. E2E "la creación de reportes valida el payload, el honeypot y la cobertura". |
| Tipo por *magic bytes* y tamaño máximo | ✅ | `detectarMime` en `rutas/fotos.ts`; E2E "rechaza archivos que no son imágenes aunque la extensión mienta" y test unitario de límite de tamaño. |
| EXIF eliminado antes de guardar | ✅ | `sanitizarImagen` reprocesa con sharp y vuelve a leer los metadatos para comprobar que no quedan. Test `api-core` "el objeto guardado NO conserva EXIF" y E2E "las fotos se guardan sin metadatos EXIF". |
| Nombre de objeto generado por el servidor | ✅ | `randomUUID()`; `AlmacenDisco.ruta` rechaza cualquier clave que no case con el patrón uuid, así que no hay travesía de rutas. |
| Vale de foto acotado en el tiempo y de un solo uso | ✅ | La asociación exige `reporte_id IS NULL` y menos de 24 h; si alguna clave no casa, la transacción se revierte con `FOTOS_INVALIDAS`. Tests en `test/reportes.test.ts`. |

## Privacidad

| Punto | Estado | Evidencia |
|---|---|---|
| Sin identidad del reportante en público | ✅ | `ReportePublico` no incluye `autor_id`; solo `ReporteTecnico` lo expone. Test "degrada la precisión en público…". |
| Jitter no reversible | ✅ | La semilla es `id + JITTER_SAL`; la sal no sale nunca al cliente. Antes la semilla era solo el `id`, que viaja en la respuesta: con el algoritmo del repositorio se podía deshacer el desplazamiento. Tests en `test/seguridad.test.ts`. |
| `direccion_aprox` oculta cuando hay jitter | ✅ | `vistaPublica` la anula si `degradar`. |
| Coordenada exacta solo para técnico/admin | ✅ | E2E "el reporte no se publica hasta que lo validan" + tests de vista pública/técnica. |
| `ip_hash` con sal y borrado programado | ✅ | Sal por variable de entorno y rotación diaria en el hash. El borrado a los 30 días **ahora existe**: `ejecutarMantenimiento` en `packages/db`, programado cada 6 h desde `api-core/servidor.ts`. Test de retención en `packages/db/test/db.test.ts`. |
| Sin IP en claro en logs | 🟡 | El único `req.log` con IP es el aviso de login fallido, y registra `req.ip`. Queda anotado como riesgo: en producción conviene registrar el hash, no la IP. |

## Autorización y abuso

| Punto | Estado | Evidencia |
|---|---|---|
| Rol verificado en cada handler | ✅ | `requerirRol` como `preHandler` en moderación, exportación, indicadores y capas. Tests "sin sesión no se puede moderar", "la exportación exige sesión de técnico" y "activar capa solo admin". |
| Rate limiting y honeypot | ✅ | Test "aplica rate limit a la creación de reportes" (429 al tercer intento con límite 2) y E2E del honeypot. `geo-service` también limita ahora (verificado con 125 peticiones: 115 × 200, 10 × 429). |
| El rate limit no se puede saltar | ✅ | `trustProxy` pasó de estar siempre activo a depender de `TRUST_PROXY`. Con el valor anterior, cualquier cliente elegía su `X-Forwarded-For` y con él su cubo de rate limit y su `ip_hash`. |
| Nada se publica en `nuevo` | ✅ | `soloPublicos` filtra a `validado`/`resuelto`; E2E lo comprueba de punta a punta. |
| Rutas internas no expuestas | ✅ | `POST /geo/v1/capas/invalidar` era pública y cada llamada recarga la capa entera; ahora exige token compartido o loopback. Tests en `geo-service`. |

## Auditoría y cabeceras

| Punto | Estado | Evidencia |
|---|---|---|
| Auditoría de transiciones, fusiones y activaciones | ✅ | `INSERT INTO auditoria` en la misma transacción que el cambio (antes iba fuera y podía quedar huérfano). |
| CORS restringido | ✅ | Lista explícita de orígenes; `verificarProduccion` rechaza `*` con cookies. |
| Cabeceras de seguridad | ✅ | Comprobado con `curl`: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY` y `Content-Security-Policy: default-src 'none'` en `api-core`; `nosniff` y `Referrer-Policy` en `geo-service`. Las apps Next añaden las suyas en `next.config.ts`. |
| Sin fuga de detalles internos | ✅ | `/ready` devolvía el mensaje de error de `pg`, que incluye host, usuario y base de datos; ahora va al log y la respuesta es genérica. |

## Fuera del alcance de esta revisión

- ⛔ **HTTPS, HSTS y cabeceras del borde**: dependen del despliegue de la Fase 2.
- ⛔ **Backups y retención acordada con el municipio**: §13 los deja para la Fase 2 y falta la
  decisión del usuario (§16, punto 11).
- ⛔ **Escaneo de secretos en pre-commit y auditoría de dependencias en CI**: la herramienta está
  `<a confirmar>` en `CLAUDE.md` §13 y todavía no se eligió.
- ⛔ **Argon2id**: decidido para la Fase 2 (ADR 0002); hoy es `scrypt` con N=16384, r=8, p=1.

## Riesgos abiertos

1. **Sin bloqueo de cuenta ni límite por email en el login.** El límite es 20/15 min por IP.
   Un atacante distribuido puede probar contraseñas contra una cuenta conocida.
2. **La sesión no caduca por inactividad ni se renueva.** Dura `SESION_DIAS` (7) desde el login.
3. **`ip_hash` es reversible por fuerza bruta** si se filtra la sal: el espacio de IPv4 es
   pequeño. La rotación diaria limita la ventana, no el ataque.
4. **`req.ip` en el log de login fallido** (ver arriba).
5. **Sin CSP en las apps Next**: hoy solo llevan `nosniff`, `Referrer-Policy` y `X-Frame-Options`.
