# Pruebas en rojo — <título corto del cambio>

- **Spec:** `spec.md` (aprobada el <fecha>)
- **Escritas el:** <fecha>
- **Línea base:** `linea-base.md` · **Foto:** `refs/sdd/<slug>`

## Preflight (antes de la primera edición)

| Paquete | Comando | Resultado | ¿Igual a la línea base? |
|---|---|---|---|
| — | `git status --porcelain` | | |

```
<resumen pegado>
```

## Mapa criterio → prueba

| CA | Capa | Archivo:línea | Comando | Veredicto antes de implementar |
|---|---|---|---|---|
| CA-1 | integración | `services/api-core/test/x.test.ts:42` | `npx -y pnpm@12.4.1 --filter api-core exec vitest run test/x.test.ts -t "CA-1"` | rojo |

## Salida literal de cada fallo (recortada)

### CA-1

```
<10–20 líneas: el nombre del test, la aserción que falla y el mensaje>
```

## Suite completa después de escribir las pruebas

| Paquete | Rojos esperados (línea base + CA nuevos) | Rojos obtenidos | ¿Coinciden? |
|---|---|---|---|

## Invariantes cubiertas por tests existentes (no duplicados)

| Invariante | Test existente |
|---|---|

## No ejecutadas y por qué

| CA | Motivo |
|---|---|

## Archivos tocados (para `archivos.txt`)

- …

## Hallazgos sobre la spec

- Criterios ambiguos, ya cumplidos o no probables, si los hubo.
