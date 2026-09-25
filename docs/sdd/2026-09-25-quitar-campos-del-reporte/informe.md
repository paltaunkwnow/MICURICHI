# Informe — quitar campos del reporte (manzana, dirección aproximada, duración, afectación) y severidad v2

- **Corrida:** `docs/sdd/2026-09-25-quitar-campos-del-reporte/` · **Rama:** `feat/repo/quitar-campos-del-reporte` · **Parte:** transversal (P1–P5, autorizada) · **Carpetas:** `packages/contracts`, `packages/db`, `services/api-core`, `apps/web-ciudadano`, `apps/panel-admin`, `e2e`, raíz (`CLAUDE.md`, `README.md`, `scripts/banco-*.mjs`, `.gitignore`, `docs/seguridad/*`)
- **Banderas:** base, contrato, privacidad, datos, geo, ui · **Cambio de contrato:** sí, con ruptura (contracts 0.4.0)
- **Vueltas implementador ↔ verificación:** 1

## Qué cambia

El reporte deja de tener `manzana_id`, `direccion_aprox`, `duracion_estimada` y `afectacion`. La severidad pasa a la **v2**: `puntaje = 2·T + F` (3–12), bandas 3–4 baja / 5–7 media / 8–10 alta / 11–12 crítica, reglas E1 y E3; E2 desaparece. La migración 0010 recalcula los reportes existentes y elimina las columnas. El formulario público queda en 4 pasos; los mapas dejan de dibujar la capa de manzanas (la capa, el ETL y geo-service se conservan). El dato «En el mapa público se ve» del panel técnico se conserva por decisión del usuario.

## Criterios

45 criterios (`spec.md`), todos con prueba en rojo antes de implementar (`pruebas.md`) y en verde después (`verificacion.md`). Resumen por paquete: contracts 42 tests · db 53 · api-core 190 (+6 omitidos por diseño) · web-ciudadano 80 · panel-admin 25 · E2E 89. `lint`, `typecheck` (9/9), `build` (7/7) y `secretos` en verde.

## Hallazgos del revisor y del auditor

| Severidad | Hallazgo | Resolución |
|---|---|---|
| Bloqueante | Copia de la base local (`infra/.pglite-corrupto-*`) dentro del repo, sin ignorar | Movida fuera del repo; `.gitignore` ahora cubre `infra/.pglite*/` |
| Bloqueante | Nota en `.claude/skills/sdd/SKILL.md` fuera de las carpetas de la corrida | Va en un commit aparte de la herramienta SDD |
| Importante | P-3 (nota metodológica sin «duración») sin criterio ni prueba | Decisión registrada en `spec.md` §9 y prueba `P-3` en contracts |
| Menor | Filas de prueba v2 con `severidad_version` por defecto 1 | 0010 pone el default en 2; los helpers insertan versión 2 |
| Menor | Restauración de borradores viejos sin aserción del paso | Aserción añadida (paso 3 → 2) |
| Menor | Docs de seguridad describían un control que ya no existe | Tres líneas actualizadas en `docs/seguridad/` |
| Menor | E2E CA-W2 contaba solo inputs; el paso 1 es el mapa | Selector del test corregido (canvas y botones del paso) |
| Menor | `CLAUDE.md` §15 sigue nombrando la geocodificación inversa como opcional | No tocado: §15 no estaba autorizada |

## No verificado (y por qué)

| Qué | Motivo |
|---|---|
| Migración 0010, `pnpm privilegios`, `cuota-concurrencia-pg`, `scripts/banco-consultas.mjs` y `banco-concurrencia.mjs` contra PostgreSQL real | Docker no disponible en esta máquina; verificado solo en PGlite |
| CSP de producción (`next start`) en el navegador | Los puertos 3000/3100 los ocupa la pila de desarrollo que usa el usuario; los `build` de las dos apps sí pasan |

## Hallazgos fuera de la carpeta designada (documentados, NO tocados)

| Archivo:línea | Síntoma | Riesgo |
|---|---|---|
| `CLAUDE.md` §15 | Contradice §3.1 tras quitar la dirección aproximada | Bajo: es backlog |
| `infra/.pglite` (original) | PGlite abortaba al abrirla (`RuntimeError: Aborted()`); se recreó desde cero y se recargaron capas reales y seed | La copia corrupta está en el scratchpad de la sesión (`pglite-corrupto-2026-09-25`) junto con un respaldo previo |
| `pnpm` del sistema | El instalador autogestionado `.tools\pnpm\12.4.1` no es ejecutable en Windows; se usó `npx -y pnpm@12.4.1` | Solo entorno |

---

## Plantilla de PR

### Parte y carpeta designada
- Parte: transversal (P1, P2, P3, P4 solo `packages/db`, P5), autorizada por el usuario el 2026-09-25
- Carpeta designada: ver cabecera

### Qué cambia
Ver arriba.

### Cómo verificarlo

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm db:local   # aplica 0010
pnpm --filter e2e test:e2e
```

### Cambios de contrato (`packages/contracts`)
- [x] Sí, anunciados en el plan y listados aquí: `ReporteCrearSchema` sin `duracion_estimada`/`afectacion`; vistas sin `manzana_id`/`direccion_aprox`; enums `DURACIONES`/`AFECTACIONES` eliminados; `calcularSeveridad` v2 (`SEVERIDAD_VERSION = 2`); `NOTA_METODOLOGICA`; OpenAPI regenerado; CHANGELOG 0.4.0.

### Hallazgos fuera de la carpeta designada (documentados, NO tocados)
Ver tabla.

### Definition of Done (CLAUDE.md §10.3)
- [x] Compila sin warnings nuevos
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` en verde
- [x] Al menos un test cubre el camino crítico de la parte
- [x] README propio con comandos y variables de entorno (sin cambios necesarios)
- [x] `.env.example` sin valores reales (sin cambios)
- [x] Sin datos ficticios presentados como reales
- [x] Sin cambios fuera de la carpeta designada (autorización registrada aquí)
- [x] Checklist de seguridad revisado (`docs/seguridad/checklist-pr.md`): auditor F4, sin hallazgos en el código
