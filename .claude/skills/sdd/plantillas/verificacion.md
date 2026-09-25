# Verificación — <título corto del cambio>

- **Banderas:** …
- **Ejecutado el:** <fecha> · **Máquina:** <Windows / Linux, Docker sí/no>
- **Rango del diff:** `git diff <base>...HEAD`

## Resumen

| # | Comando | Bandera | Código de salida | Veredicto |
|---|---|---|---|---|
| 1 | `pnpm lint` | base | 0 | verde |

## Salida por comando

### 1. `pnpm lint`

```
<últimas 15–30 líneas o el resumen de tests>
```

## No verificado

| Comando | Motivo |
|---|---|

## Bandera `ui` (si aplica)

- App y pantalla: …
- Levantada con: `pnpm --filter <app> build && pnpm --filter <app> start`
- Errores en consola: ninguno | <lista>
- Captura: `docs/sdd/<corrida>/captura-<pantalla>.png`
