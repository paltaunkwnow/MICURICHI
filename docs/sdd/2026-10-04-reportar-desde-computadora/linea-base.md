# Línea base — reportar desde una computadora

- **Corrida:** `docs/sdd/2026-10-04-reportar-desde-computadora/`
- **Rama:** `feat/repo/reportar-desde-computadora`
- **Foto:** `refs/sdd/reportar-desde-computadora` = `9ef7729`
- **Banderas previstas (plan):** `base`, `contrato`, `privacidad`, `seguridad`, `datos`, `api`, `ui`.

## De dónde sale

Esta línea base **se hereda** de la verificación de la corrida anterior. No se volvió a ejecutar, y por
qué vale:

- El código en `HEAD` (`9ef7729`) es idéntico al árbol que se verificó en F4a y F4b de
  `docs/sdd/2026-10-04-arreglos-chicos/`, el commit `7369132`.
  - `git diff --stat 7369132 HEAD -- . ':(exclude)CLAUDE.md' ':(exclude).claude' ':(exclude)docs'`
    sale vacío.
  - Entre los dos commits solo cambiaron `CLAUDE.md`, `.claude/agents/trabajador-raiz.md` y
    `.claude/skills/sdd/matriz-de-riesgo.md`, que no son código.
- Aquella verificación corrió la lista de 38 comandos de la matriz con las banderas `base`,
  `contrato`, `privacidad`, `seguridad`, `datos`, `geo`, `api`, `ui` e `infra`. Es un superconjunto de
  las banderas de esta corrida, con el alcance `--filter=...contracts` (todo el monorepo).
- La verificación F4a de esta corrida repite **esa misma lista, con el mismo alcance y las mismas
  opciones**. Así la comparación test por test vale.

## Resultado de esa verificación

Detalle: `docs/sdd/2026-10-04-arreglos-chicos/verificacion.md`.

| Paquete | Pruebas verdes |
|---|---|
| contracts | 227 |
| panel-admin | 432 |
| db | 251 |
| web-ciudadano | 458 |
| api-core | 391 (más 11 omitidas, que piden PostgreSQL real y se corrieron aparte) |
| geo-service | 61 |
| geodata-etl | 21 |
| **Total** | **1841**, 0 rojos |

- **Resto verde:** lint (con 1 warning que ya existía, en un HTML de `docs/dominio`), typecheck 9/9,
  build 7/7, `secretos`, `audit` (0 high, 6 moderate), OpenAPI idempotente, `docker compose config` y
  los puertos solo en loopback.
- **Con PostgreSQL real** (F4b, pila arriba): concurrencia de cupos 9/9, privilegios en una base efímera
  correctos y S3 contra MinIO 11/11.
- **Intermitente conocido:** `db test` dentro de la corrida conjunta (vence un `beforeAll` por
  contención). Pasa solo.
- **Rojos que ya estaban:** ninguno.
- **No verificado:** las ventanas E2E (no autorizadas) y la interfaz en el navegador integrado (el
  certificado de la CA interna de Caddy).

## Pila del usuario

Levantada y sana tras el F4b de la corrida anterior: los 7 servicios `healthy`, con las imágenes de
`7369132`. La base `curichi` tiene la 0018. Hay un respaldo previo en
`$SCRATCH/curichi-antes-arreglos-chicos.dump`.

## Decisiones

- **Plan:** aprobado por el usuario el 2026-10-04, tal cual (`plan.md`).
- **Permisos de la puerta 1 (F4b, 2026-10-04):** actualizar y levantar la pila del usuario **con
  respaldo de la base** → **sí**; **migrar `curichi` (0019) tras el `pg_dump`** → **sí**; **túnel** →
  **no**; **ventana E2E** → **no**. El `sdd-verificador` los ejecutó en vivo; detalle y evidencia en
  `verificacion.md` § «En vivo (F4b)».
- **Ventana E2E:** no autorizada (se ve en el CI). La spec nueva de C6 se corre en el CI.
- **En vivo:** autorizado en la puerta 1 (ver permisos arriba). Se ejecutó contra la pila del usuario.
- **Cambios ajenos:** ninguno. El árbol estaba limpio salvo la carpeta de esta corrida.
