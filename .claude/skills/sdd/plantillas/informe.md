# Informe — <título corto del cambio>

- **Corrida:** `docs/sdd/<aaaa-mm-dd>-<slug>/` · **Rama:** … · **Parte:** P_ · **Carpeta:** …
- **Banderas:** … · **Cambio de contrato:** no | sí
- **Vueltas implementador ↔ verificación:** N
- **Foto:** `refs/sdd/<slug>` · **Cambios ajenos:** ninguno | N, que no van en el commit · **Línea base:** `linea-base.md` (rojos que ya estaban: N; decisión: …)

## Qué cambia

Tres a cinco líneas.

## Regresión contra la línea base

| Comando | Línea base | Después | Clasificación |
|---|---|---|---|

Rojos que ya estaban y siguen igual (decisión de la puerta 1: …): … · Intermitentes: …

## Criterios

| CA | Prueba | Antes | Después |
|---|---|---|---|
| CA-1 | `archivo:línea` | rojo | verde |

## En vivo y túnel

- Servicios reconstruidos: … · humo por `https://localhost`: … · consola: … · capturas antes y después: …
- Ventana E2E: grupos corridos … · pila devuelta igual: sí | no (…)
- Túnel: comprobaciones sin sesión: … · Para que pruebes vos desde el celular, con tu cuenta de
  prueba: [ ] entrar · [ ] reportar con GPS y foto · [ ] ver tu reporte en «Mis reportes» ·
  [ ] abrir el panel y validarlo · …

## Hallazgos del revisor y del auditor

| Severidad | Hallazgo | Resolución |
|---|---|---|

## No verificado (y por qué)

| Qué | Motivo | Qué haría falta |
|---|---|---|

## Hallazgos fuera de la carpeta designada (documentados, NO tocados)

| Archivo:línea | Síntoma | Riesgo |
|---|---|---|

## Cómo volver atrás (si no se aprueba)

- Código: `git checkout refs/sdd/<slug> -- <archivo>` por cada modificado de `archivos.txt`, y
  borrar los nuevos de la corrida. Lo ajeno no se toca.
- Pila: `docker tag mi-curichi-<svc>:antes-<slug> mi-curichi-<svc>:local && docker compose --profile servicios --profile minio up -d --no-deps --force-recreate <svc>`.
- Base (solo si hubo una migración autorizada): restaurar el dump de `$SCRATCH`; lo decide el
  usuario.

---

## Plantilla de PR (`.github/PULL_REQUEST_TEMPLATE.md`)

### Parte y carpeta designada
- Parte: `P_`
- Carpeta designada: …

### Qué cambia

### Cómo verificarlo

```bash
# Si F4b tuvo permiso, tu pila Docker ya tiene el cambio. Si no:
docker compose --profile servicios --profile minio up -d --build --no-deps <svc>
npx -y pnpm@12.4.1 exec turbo run test --filter=...<paquete> --concurrency=1
```

### Cambios de contrato (`packages/contracts`)
- [ ] No hay
- [ ] Sí, anunciados en el plan y listados aquí:

### Hallazgos fuera de la carpeta designada (documentados, NO tocados)

### Definition of Done (CLAUDE.md §10.3)
- [ ] Compila sin warnings nuevos
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` en verde, sin regresiones contra la línea base
- [ ] Al menos un test cubre el camino crítico de la parte
- [ ] README propio con comandos y variables de entorno
- [ ] `.env.example` sin valores reales
- [ ] Sin datos ficticios presentados como reales
- [ ] Sin cambios fuera de la carpeta designada (o autorización registrada aquí)
- [ ] Checklist de seguridad revisado (`docs/seguridad/checklist-pr.md`) si toca api-core, fotos o auth
