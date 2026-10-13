# Verificación — <título corto del cambio>

- **Banderas:** … · **Alcance:** `--filter=...<paquete>`
- **Ejecutado el:** <fecha> · **Condiciones:** RAM libre <MB> · procesos pesados ajenos <n> · pila Docker sí/no · `next dev` local sí/no · túneles <n> · `--concurrency=1`
- **Diff de la corrida:** `git diff refs/sdd/<slug> -- $(cat archivos.txt)` + archivos nuevos de `archivos.txt` · **Alcance y opciones iguales a la línea base:** sí | no (motivo)

## Resumen

| # | Comando | Bandera | Código de salida | Veredicto |
|---|---|---|---|---|
| 1 | `npx -y pnpm@12.4.1 lint` | base | 0 | verde |

## Comparación con la línea base (`linea-base.md`)

| # | Comando | Línea base | Ahora | Rojos nuevos | Verdes perdidos (omitidos o borrados) | Clasificación |
|---|---|---|---|---|---|---|
| 3 | `npx -y pnpm@12.4.1 exec turbo run test --filter=...api-core --concurrency=1` | rojo: 2 | rojo: 3 | `test/x.test.ts > … > …` | — | **REGRESIÓN — BLOQUEANTE** |

Clasificaciones: `igual` · `mejora` · `nuevo de F2 (tiene que estar verde)` ·
`quitado por la spec (CA-n)` · `intermitente (falló en conjunto y pasó solo al reintentar)` =
IMPORTANTE · `REGRESIÓN` = BLOQUEANTE · `sin línea base` = BLOQUEANTE hasta medirla.
Se compara por nombre de test, archivo de Biome o error de tsc, no solo por código de salida: un
comando que ya estaba rojo puede esconder un rojo nuevo.

## Salida por comando

### 1. `npx -y pnpm@12.4.1 lint`

```
<últimas 15–30 líneas o el resumen de tests>
```

## No verificado

| Comando | Motivo |
|---|---|

## Ventana E2E (si se autorizó)

- `pila-antes.txt` / `pila-despues.txt`: iguales | diferencias: …
- Grupos corridos y resultado por spec: …

## En vivo (con `ui`, `api` o `infra` y el permiso de la puerta 1)

| Servicio | Imagen anterior guardada como | Reconstruida (Created) | ¿Posterior al último archivo editado? | healthy |
|---|---|---|---|---|

| Comprobación (la lista de la línea base más lo que pidió el auditor) | Antes | Después | Veredicto |
|---|---|---|---|

- Consola del navegador: ninguno | <lista> · Captura: <descripción de lo visto, escritorio y móvil>
- Migración aplicada a `curichi`: no aplica | sí, con el dump en `$SCRATCH/…` (fuera del repo)
- Si algo quedó rojo: pila devuelta a `:antes-<slug>` a las <hora>

## Túnel (si corresponde)

| Comprobación sin sesión | Resultado |
|---|---|

Lo que exige sesión lo prueba el usuario (lista en `informe.md`).
