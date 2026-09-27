# contracts — transversal (custodia Parte 3)

Única fuente de verdad de los contratos entre partes: enums del dominio, matriz de severidad, parámetros de dominio, esquemas Zod de cada payload y respuesta, y la especificación OpenAPI generada.

| Qué | Dónde |
|---|---|
| Enums y etiquetas en español; estados públicos, verificados y retirados, y la etiqueta exacta «NO SE HA VERIFICADO» | `src/dominio/enums.ts` |
| Severidad (función pura, §9.1) | `src/dominio/severidad.ts` |
| Parámetros (radio 25 m, jitter 30 m, radio del dispositivo 60 m, precisión 50 m, cupo de 3 reportes y 12 fotos por día, 10 altas por IP y por día, demora de publicación de 60 y 240 s, fotos, fecha del evento, exportación, zona horaria y ciudad por defecto) | `src/dominio/config.ts` |
| Máquina de estados (`TRANSICIONES`, `transicionPermitida`, `transicionExiste`) y vista del autor (`MiReporte`, `/mis-reportes`) | `src/esquemas/reporte.ts` |
| Huella de capas y teselas (`HuellaCapaSchema`, `rutaCapaConHuella`, `rutaTeselasConHuella`, 410 `CAPA_CAMBIO`) | `src/esquemas/geo.ts` |
| Distancia (haversine) y radio del dispositivo, la misma cuenta en la interfaz y en api-core | `src/dominio/geo.ts` |
| Configuración pública de la ciudad (`GET /api/v1/configuracion`) | `src/esquemas/configuracion.ts` |
| Esquemas Zod | `src/esquemas/*.ts` |
| Jitter determinista | `src/geo/jitter.ts` |
| OpenAPI 3.1 generado | `openapi/openapi.yaml` (no editar a mano) |
| Export para otros lenguajes | `dist/dominio.json` |

```bash
pnpm --filter contracts build      # tsc + genera openapi.yaml y dominio.json
pnpm --filter contracts test       # vitest: severidad (256 combinaciones), esquemas, jitter, radio
pnpm --filter contracts typecheck
```

Regla: todo cambio aquí es cambio de contrato. Se anuncia en el plan de la tarea, se versiona en `CHANGELOG.md` y lo revisa la Parte 3.
