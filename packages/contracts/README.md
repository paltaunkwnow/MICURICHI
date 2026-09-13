# contracts — transversal (custodia Parte 3)

Única fuente de verdad de los contratos entre partes: enums del dominio, matriz de severidad, parámetros de dominio, esquemas Zod de cada payload y respuesta, y la especificación OpenAPI generada.

| Qué | Dónde |
|---|---|
| Enums y etiquetas en español | `src/dominio/enums.ts` |
| Severidad (función pura, §9.1) | `src/dominio/severidad.ts` |
| Parámetros (radio 25 m, jitter 30 m, fotos) | `src/dominio/config.ts` |
| Esquemas Zod | `src/esquemas/*.ts` |
| Jitter determinista | `src/geo/jitter.ts` |
| OpenAPI 3.1 generado | `openapi/openapi.yaml` (no editar a mano) |
| Export para otros lenguajes | `dist/dominio.json` |

```bash
pnpm --filter contracts build      # tsc + genera openapi.yaml y dominio.json
pnpm --filter contracts test       # vitest: severidad (256 combinaciones), esquemas, jitter
pnpm --filter contracts typecheck
```

Regla: todo cambio aquí es cambio de contrato. Se anuncia en el plan de la tarea, se versiona en `CHANGELOG.md` y lo revisa la Parte 3.
