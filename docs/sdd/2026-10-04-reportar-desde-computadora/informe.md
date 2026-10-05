# Informe — reportar con ubicación aproximada desde una computadora

- **Corrida:** `docs/sdd/2026-10-04-reportar-desde-computadora/`
- **Rama:** `feat/repo/reportar-desde-computadora`
- **Partes:** P1 a P5 y el agente principal (C7).
- **Banderas:** `base`, `contrato`, `privacidad`, `seguridad`, `datos`, `api`, `ui`. Se corrió también la
  lista heredada de `geo` e `infra`.
- **Cambio de contrato:** sí. contracts 0.17.0 → **0.18.0**, sin ruptura:
  - `aproximada` en `UBICACION_METODOS`;
  - `ReporteCrearSchema.ubicacion_aproximada`, con `false` por defecto;
  - código `422 UBICACION_PRECISA_DISPONIBLE`;
  - el tope de `dispositivo.precision_m` sube de 10 000 a 100 000 m;
  - `NOTA_METODOLOGICA` ampliada.
- **Decisión:** ADR 0007, aprobado por el usuario («Permitir computadoras» y el plan tal cual).
- **Vueltas implementador ↔ verificación:** 0. El revisor y el auditor no encontraron defectos de código.
- **Foto:** `refs/sdd/reportar-desde-computadora` = `9ef7729`.
- **Cambios ajenos:** ninguno.
- **Línea base:** heredada de `arreglos-chicos`, porque el código es idéntico (`linea-base.md`).
- **Modelos:**
  - plan, ADR y CLAUDE.md: agente principal (Opus 5.5);
  - C1, C2, C3, C4 y los `sdd-*`: Opus 4.8;
  - C5 y C6: Sonnet 5.5.

## Qué cambia

Un dispositivo que no llega a 50 m de precisión, como una laptop que se ubica por Wi-Fi, puede reportar por
el camino **«Reportar con ubicación aproximada»**:

- el punto se pone a mano en cualquier lugar de la cobertura, sin el círculo de 60 m;
- se guarda con `ubicacion_metodo = 'aproximada'`, la precisión declarada y la distancia en `null`;
- la posición del dispositivo sigue sin guardarse;
- el servidor rechaza el camino si la precisión es de 50 m o menos (`422`), así que un teléfono con GPS
  sigue con los 60 m;
- los técnicos lo ven como «Ubicación aproximada — sin comprobar con el dispositivo» en la bandeja
  (insignia «Aproximada»), el detalle y la ficha;
- el mapa público no cambia.

## Regresión contra la línea base

| Paquete | Línea base | Después |
|---|---|---|
| contracts | 227 | 237 |
| panel-admin | 432 | 458 |
| db | 251 | 260 |
| web-ciudadano | 458 | 486 |
| api-core | 391 (11 omitidas) | 405 (11 omitidas) |
| geo-service | 61 | 61 |
| geodata-etl | 21 | 21 |
| **Total** | **1841** | **1928, sin regresiones** (comparado test por test) |

Las 11 omitidas son las pruebas `*-concurrencia-pg`, que piden PostgreSQL real.

Además, en verde:

- lint (1 warning que ya existía), typecheck 9/9, build 7/7;
- `secretos` y `audit` (0 high);
- OpenAPI idempotente y CHANGELOG;
- migración 0019 mayor que 0018, con su prueba, sin tocar migraciones existentes;
- `docker compose config` y puertos;
- E2E sin pila: `tsc` 0, `--list` con 198 pruebas en 27 archivos (con la spec nueva) y Biome.

**Intermitente:** #26 `geodata-etl test` falló primero por un error de entorno de `pnpm` al escribir su
estado en el disco A: (`os error 21`). Las 21 pruebas pasaron y el reintento dio verde.

## Preflight y evidencia por tarea

En esta corrida no hay `pruebas.md` ni `implementacion.md`: es el flujo de §12.4 y no un `/sdd` completo.
Cada escritor corrió la suite de su paquete antes de editar y después de cada meta, y escribió primero las
pruebas, que vio fallar.

| Tarea | Preflight (antes) | Pruebas nuevas vistas en rojo | Después |
|---|---|---|---|
| C1 contracts | 227 verdes, tipos limpios | `contrato-0-18.test.ts` (10) | 237 verdes |
| C2 db | 251 | `migracion-0019-*.test.ts` (9, 7 rojas antes) | 260 |
| C3 api-core | 391 + 11 omitidas | `ubicacion-aproximada.test.ts` (14, 12 rojas antes) | 405 + 11 omitidas |
| C4 web | 458 (tipos: 1 error esperado de C1) | 28 nuevas en `ubicacion-aproximada`, `radio`, `formulario-reporte`, `borrador`, `errores`, `ubicacion-pagina` y `ubicacion-dispositivo` | 486, tipos limpios |
| C5 panel | 432 | 26 (17 rojas antes) en `formato`, `DatosUbicacion`, `ReporteUnitarioModal` y `TablaReportes` | 458 |
| C6 e2e | `tsc` 0, `--list` 195/26 | `ubicacion-aproximada.spec.ts` (3) | `tsc` 0, `--list` 198/27 (corre en el CI) |

Pruebas existentes ajustadas (el revisor las juzgó honestas):

- `contrato-0-9.test.ts`: el código nuevo y el tope;
- `contrato-0-16.test.ts`: el pin de versión;
- `migracion-0018-*`: pasa de «máximo en disco» a consecutividad;
- `ubicacion-obligatoria.spec.ts`: se conserva «camino normal cerrado» y se suma la oferta;
- `recorrer` pasa a `ayudas.ts` sin cambios.

## Criterios

| Meta | Prueba | Estado |
|---|---|---|
| C-1.1 … C-1.4 | `packages/contracts/test/contrato-0-18.test.ts`, `contrato-0-9`, `contrato-0-16` | verde |
| C-2.1 | `packages/db/test/migracion-0019-ubicacion-aproximada.test.ts`, `esquema-drizzle.test.ts` | verde |
| C-3.1 … C-3.3 | `services/api-core/test/ubicacion-aproximada.test.ts` (borde 50 / 50,1; sin cupo gastado; sin radio; `FUERA_DE_COBERTURA`; auditoría sin posición; técnica y exportación) | verde |
| C-4.1 … C-4.3 | `apps/web-ciudadano/src/lib/ubicacion-aproximada.test.ts`, `ubicacion-pagina.test.ts`, `radio.test.ts`, `formulario-reporte.test.ts`, `borrador.test.ts`, `errores.test.ts`, `ubicacion-dispositivo.test.ts` | verde. La accesibilidad con axe queda para el G5 del CI |
| C-5.1 | `apps/panel-admin/src/lib/formato.test.ts`, `DatosUbicacion.test.ts`, `ReporteUnitarioModal.test.ts`, `TablaReportes.test.ts` | verde |
| C-6.1 / C-6.2 | `e2e/tests/ubicacion-aproximada.spec.ts`, `ubicacion-obligatoria.spec.ts` | escritas y listadas; corren en el CI |
| C-7.1 / C-7.2 | ADR 0007, CLAUDE.md, matriz SDD | hecho |

## En vivo y túnel

Corrió (F4b) con el permiso del usuario. El detalle está en `verificacion.md`, § «En vivo (F4b)». Sin rojos;
no se revirtió nada.

- **Respaldo:** `pg_dump` de `curichi` antes de migrar: `$SCRATCH/curichi-antes-reportar-desde-computadora.dump`,
  18,4 MB.
- **Migración:** `run --rm --no-deps migraciones` aplicó la 0019 **sin recrear `postgis`**. El enum quedó
  `gps,manual,aproximada`.
- **Imágenes:** api-core, geo-service, web-ciudadano y panel-admin reconstruidas, con `docker builder prune`
  entre cada una. Las de antes quedaron como `:antes-reportar-desde-computadora`. Los 7 servicios quedaron
  `healthy`.
- **Humo por el proxy:**
  - `/`, `/api/v1/configuracion` y `panel.localhost/login` → 200;
  - CSP con nonce y sin `unsafe-inline` en `script-src`, `nosniff`, sin `x-middleware-*`;
  - `/ready` sin `degradado`.
- **Vista pública:** 35 reportes y **ninguno** trae `ubicacion_metodo`, `precision_gps_m`,
  `distancia_dispositivo_m`, `autor_id` ni `ip_hash`.
- **Camino nuevo, sin crear datos** (cuenta de desarrollo `vecina`):
  - con la marca y 30 m → `422 UBICACION_PRECISA_DISPONIBLE`;
  - sin la marca y con 178 m → `422 PRECISION_INSUFICIENTE`;
  - `reportes_restantes_hoy` sigue en 2 antes y después;
  - `curichi` intacta: 41 reportes y 442 usuarios.
- **PostgreSQL real y S3:**
  - #22, concurrencia: 9 pruebas en verde;
  - #23, privilegios en una base efímera: correctos, y la base se borró al final;
  - #16, S3 contra MinIO: 11 pruebas en verde.
- **Falta, del lado del usuario, desde su laptop:**
  - con «Precisión actual: 178 m» aparece «Reportar con ubicación aproximada»;
  - el punto se pone a mano y el reporte se envía;
  - en el panel figura la insignia «Aproximada».

  El navegador integrado no acepta la CA interna de Caddy.

## Hallazgos del revisor y del auditor

| Severidad | Hallazgo | Resolución |
|---|---|---|
| IMPORTANTE (revisor, proceso) | Faltan `pruebas.md` e `implementacion.md` | Es el flujo §12.4, no un `/sdd` completo. La evidencia por tarea está en «Preflight y evidencia por tarea» |
| MENOR (revisor) | La edición de la matriz SDD no estaba en el plan | Se sumó como C-7.2 |
| MENOR (revisor, ya existía) | G4 de la matriz desactualizado | **Corregido** (`panel-indicadores-tortas`, `panel-mapa-reactivo`) |
| — (auditor) | Sin hallazgos. Riesgo residual documentado: la precisión la declara el cliente (ADR 0007, §9.4, §13) | Aceptado |
| — (auditor, ya existía) | El ítem del checklist «Nada se publica en `nuevo`» quedó viejo frente al ADR 0006 | Para una tarea de la Parte 5 |

## No verificado (y por qué)

| Qué | Motivo | Qué haría falta |
|---|---|---|
| Ventanas E2E (la spec nueva incluida) | No autorizadas | CI al subir a `main` |
| La interfaz en el navegador (camino aproximado y la insignia del panel) | El navegador integrado no acepta la CA de Caddy | La prueba del usuario desde su laptop |

## Hallazgos fuera de la carpeta designada (documentados, NO tocados)

| Archivo:línea | Síntoma | Riesgo |
|---|---|---|
| `docs/seguridad/checklist-pr.md` | «Nada se publica en estado `nuevo`» contradice el ADR 0006 | Bajo (confusión al auditar) |
| `e2e/global-setup.ts` | No precalienta `/reportes/[id]` del panel: la prueba (c) de la spec nueva puede tardar en frío | Bajo (hay 1 reintento) |

## Cómo volver atrás (si no se aprueba)

- **Código:** `git checkout refs/sdd/reportar-desde-computadora -- <archivo>` por cada archivo modificado
  de `archivos.txt`, y borrar los nuevos.
- **Pila:** `docker tag mi-curichi-<svc>:antes-reportar-desde-computadora mi-curichi-<svc>:local && docker compose --profile servicios --profile minio up -d --no-deps --force-recreate <svc>`.
- **Base:** la 0019 ya está aplicada. El valor del enum queda, sin uso. Para volver del todo, se restaura
  `$SCRATCH/curichi-antes-reportar-desde-computadora.dump`. Lo decide el usuario.

---

## Plantilla de PR (`.github/PULL_REQUEST_TEMPLATE.md`)

### Parte y carpeta designada

- **Partes:**
  - P1 `apps/web-ciudadano`;
  - P2 `apps/panel-admin`;
  - P3 `services/api-core` (+ `packages/contracts`, de su custodia);
  - P4 `packages/db`;
  - P5 `e2e/` + `.claude/skills/sdd/matriz-de-riesgo.md`;
  - documentación: `docs/decisiones/0007-*`, `CLAUDE.md` (autorizado por el usuario).
- **Plan:** `docs/sdd/2026-10-04-reportar-desde-computadora/plan.md`.

### Qué cambia

Ver «Qué cambia».

### Cómo verificarlo

```bash
docker compose --profile servicios --profile minio up -d --build --no-deps api-core web-ciudadano panel-admin
npx -y pnpm@12.4.1 exec turbo run test --filter=...contracts --concurrency=1
```

Antes: `pg_dump` de `curichi` y `docker compose --profile servicios run --rm --no-deps migraciones` (0019).

### Cambios de contrato (`packages/contracts`)

- [x] contracts 0.18.0 (ver arriba). Sin ruptura de tipos para los consumidores, salvo
  `Record<CodigoUbicacionDispositivo, …>` en la web, ya actualizado.

### Definition of Done (CLAUDE.md §10)

- [x] Compila sin warnings nuevos
- [x] lint, typecheck y test en verde, sin regresiones contra la línea base
- [x] Al menos un test del camino crítico de cada parte
- [x] README actualizado (web y panel)
- [x] `.env.example` sin cambios
- [x] Sin datos ficticios presentados como reales
- [x] Sin cambios fuera de las carpetas designadas (la matriz SDD, declarada como C-7.2)
- [x] Checklist de seguridad revisado por `sdd-auditor`
