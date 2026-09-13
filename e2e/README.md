# e2e — Parte 5 (calidad)

Pruebas end-to-end **transversales**: las que cruzan varias partes. Los E2E propios de cada app viven dentro de la app.

| Archivo | Qué cubre |
|---|---|
| `tests/recorrido-completo.spec.ts` | Vecino reporta → moderación previa (404 en público) → técnico valida → aparece en el mapa público → sale en CSV y GeoJSON |
| `tests/api-contratos.spec.ts` | Sin navegador: `/ready`, point-in-polygon dentro y fuera, validación de payload, honeypot, 422 fuera de cobertura, 401 sin sesión, capas y teselas, fotos sin EXIF, rechazo por *magic bytes* |
| `tests/mapa-publico.spec.ts` | Mapa público en escritorio y en móvil (proyecto `movil`) |
| `tests/accesibilidad.spec.ts` | `lang`, `h1`, `alt`, etiquetas de campos, nombres de botones y enlace de salto |

## Cómo correrlos

```bash
pnpm db:local           # terminal 1: PostGIS local sin Docker (127.0.0.1:5433)
pnpm db:seed:samples    # datos sintéticos + usuarios locales
pnpm dev                # terminal 2: api-core, geo-service y las dos apps
pnpm test:e2e           # terminal 3
```

Si no hay nada escuchando, `webServer` levanta `pnpm dev` solo (hasta 5 minutos la primera vez, por la compilación de Next).

Credenciales: se toman de `E2E_TECNICO_EMAIL` y `E2E_TECNICO_PASSWORD`, y por defecto usan los usuarios sintéticos del seed (ver `packages/db/README.md`).
