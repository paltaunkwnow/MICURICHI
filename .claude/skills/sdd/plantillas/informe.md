# Informe — <título corto del cambio>

- **Corrida:** `docs/sdd/<aaaa-mm-dd>-<slug>/` · **Rama:** … · **Parte:** P_ · **Carpeta:** …
- **Banderas:** … · **Cambio de contrato:** no | sí
- **Vueltas implementador ↔ verificación:** N

## Qué cambia

Tres a cinco líneas.

## Criterios

| CA | Prueba | Antes | Después |
|---|---|---|---|
| CA-1 | `archivo:línea` | rojo | verde |

## Hallazgos del revisor y del auditor

| Severidad | Hallazgo | Resolución |
|---|---|---|

## No verificado (y por qué)

| Qué | Motivo | Qué haría falta |
|---|---|---|

## Hallazgos fuera de la carpeta designada (documentados, NO tocados)

| Archivo:línea | Síntoma | Riesgo |
|---|---|---|

---

## Plantilla de PR (`.github/PULL_REQUEST_TEMPLATE.md`)

### Parte y carpeta designada
- Parte: `P_`
- Carpeta designada: …

### Qué cambia

### Cómo verificarlo

```bash
```

### Cambios de contrato (`packages/contracts`)
- [ ] No hay
- [ ] Sí, anunciados en el plan y listados aquí:

### Hallazgos fuera de la carpeta designada (documentados, NO tocados)

### Definition of Done (CLAUDE.md §10.3)
- [ ] Compila sin warnings nuevos
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` en verde
- [ ] Al menos un test cubre el camino crítico de la parte
- [ ] README propio con comandos y variables de entorno
- [ ] `.env.example` sin valores reales
- [ ] Sin datos ficticios presentados como reales
- [ ] Sin cambios fuera de la carpeta designada (o autorización registrada aquí)
- [ ] Checklist de seguridad revisado (`docs/seguridad/checklist-pr.md`) si toca api-core, fotos o auth
