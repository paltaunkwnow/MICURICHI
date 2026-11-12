# Implementación — <título corto del cambio>

- **Carpeta designada:** … · **Foto:** `refs/sdd/<slug>` · **Línea base:** `linea-base.md`
- **Cambio de contrato anunciado:** no | sí

## Preflight (antes de la primera edición)

| Comprobación | Comando | Resultado | ¿Igual a la línea base + pruebas de F2? |
|---|---|---|---|
| Árbol | `git status --porcelain` | | |
| Suite | `npx -y pnpm@12.4.1 exec turbo run test --filter=<paquete> --concurrency=1` | | |
| Tipos | `npx -y pnpm@12.4.1 --filter <paquete> typecheck` | | |

```
<resúmenes pegados>
```

## Un criterio por vez

| CA | Archivos tocados | Comando después de editar | Resultado | ¿Algo verde de la línea base quedó rojo? |
|---|---|---|---|---|

## Cierre

| Comando | Salida | Veredicto |
|---|---|---|
| `npx -y pnpm@12.4.1 exec turbo run test --filter=<paquete> --concurrency=1` | | |
| `npx -y pnpm@12.4.1 --filter <paquete> typecheck` | | |
| `npx -y pnpm@12.4.1 exec biome check <carpeta>` | | |

## Archivos tocados (para `archivos.txt`)

- …

## Fuera de carpeta y pedidos de autorización

| Archivo:línea | Síntoma | Riesgo |
|---|---|---|
