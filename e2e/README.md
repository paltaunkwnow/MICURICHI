# e2e — Parte 5 (calidad)

Pruebas end-to-end **transversales**: las que cruzan varias partes. Los E2E propios de cada app viven dentro de la app.

| Archivo | Qué cubre |
|---|---|
| `tests/recorrido-completo.spec.ts` | Vecino reporta → moderación previa (404 en público) → técnico valida → aparece en el mapa público → sale en CSV y GeoJSON |
| `tests/api-contratos.spec.ts` | Sin navegador: `/ready`, point-in-polygon dentro y fuera, validación de payload, honeypot, 422 fuera de cobertura, 401 sin sesión, capas y teselas, fotos sin EXIF, rechazo por *magic bytes* |
| `tests/mapa-publico.spec.ts` | Mapa público en escritorio y en móvil (proyecto `movil`) |
| `tests/mapa-seleccion.spec.ts` | El reporte elegido sobrevive al zoom, al arrastre y al cambio de consulta; las agrupaciones cuentan sus reportes y se abren al acercar; el 404 del detalle se dice. También en móvil |
| `tests/separacion-publica-tecnica.spec.ts` | Que la vista pública siga siendo pública aunque el navegador lleve cookie de técnico; que la vista técnica exija rol; cabeceras de caché; y que los puntos críticos no publiquen medidas de la geometría exacta |
| `tests/responsive.spec.ts` | Que ninguna pantalla se desborde a lo ancho, de 320 a 1920 px |
| `tests/accesibilidad.spec.ts` | `lang`, `h1`, `alt`, etiquetas de campos, nombres de botones y enlace de salto |
| `tests/datos-reales.spec.ts` | Las capas vigentes son las del municipio y se usan de verdad: nombres, bbox, point-in-polygon y búsqueda |
| `tests/navegacion.spec.ts` | Los cuatro destinos de la barra, cambio de pestaña sin recargar y capas del mapa |
| `tests/resiliencia-interfaz.spec.ts` | Que la interfaz no invente cuando la API falla, y que el borrador del formulario sobreviva a una recarga |

## Cómo correrlos

La primera vez hace falta el navegador:

```bash
pnpm --filter e2e exec playwright install chromium
```

Lo más simple es dejar que Playwright levante las apps: solo hay que tener la base en marcha.

```bash
pnpm db:local           # terminal 1: PostGIS local sin Docker (127.0.0.1:5433)
```

```bash
pnpm db:seed:samples && pnpm test:e2e    # terminal 2
```

`webServer` arranca `pnpm dev` por su cuenta (hasta 5 minutos la primera vez, por la compilación
de Next) y le pasa `RATE_LIMIT_REPORTES_POR_HORA=1000`.

> **Si ya tenés `pnpm dev` corriendo**, Playwright lo reutiliza (`reuseExistingServer`) y **no**
> puede pasarle esa variable. La suite crea varios reportes desde la misma IP y el límite de
> producción es 10/h: a partir de ahí `POST /api/v1/reportes` responde 429 y fallan los casos del
> recorrido completo. Arrancá ese `pnpm dev` así:
>
> ```bash
> RATE_LIMIT_REPORTES_POR_HORA=1000 pnpm dev
> ```
>
> (en PowerShell: `$env:RATE_LIMIT_REPORTES_POR_HORA=1000; pnpm dev`), o simplemente cerralo y
> dejá que Playwright lo levante.

Credenciales: se toman de `E2E_TECNICO_EMAIL` y `E2E_TECNICO_PASSWORD`, y por defecto usan los usuarios sintéticos del seed (ver `packages/db/README.md`).

## Fallos que no son del código

| Síntoma | Causa | Qué hacer |
|---|---|---|
| `page.goto: net::ERR_NETWORK_IO_SUSPENDED` y, en el reintento, `Test timeout of 90000ms exceeded` esperando un elemento | La máquina entró en **modo de espera moderno** (*connected standby*) a mitad de la corrida y Windows cortó la red por directiva. Chromium aborta las peticiones en vuelo con ese código | No es intermitencia de la suite. Comprobalo en el registro de eventos (`Kernel-Power` 506/507 y 172 `Disconnected. Motivo: Policy Setting`) y volvé a correrla con la máquina despierta |
| Tres fallos seguidos en `recorrido-completo.spec.ts` a partir de «el técnico lo valida desde el panel» | Ese archivo es un **recorrido en serie**: si la validación no ocurre, los dos casos siguientes comprueban un reporte que sigue en `nuevo` | Mirar solo el primer fallo; los otros dos son consecuencia |
| `No respondió http://localhost:3000/ en 300 s` en la preparación, con los servicios arriba | `webServer` solo vigila `127.0.0.1:3001/health`. Si quedó un `api-core` suelto en ese puerto, `reuseExistingServer` da la pila por levantada y **no arranca `pnpm dev`**: las apps de Next nunca escuchan | Cerrar lo que haya en 3000, 3001, 3002 y 3100 y volver a correr, o levantar `pnpm dev` entero a mano con los límites de prueba |
| `dentro_cobertura: false` donde antes daba `true`, o `ECONNREFUSED 127.0.0.1:3001` a mitad de la corrida | La base local (PGlite sobre `pglite-socket`) lleva horas en marcha y se degradó: el socket empieza a cortar conexiones (`ECONNRESET`) y api-core se cae detrás. Visto tras un ciclo de suspensión de la máquina | Reiniciar `pnpm db:local` (los datos persisten en `infra/.pglite`) y volver a correr. Es un límite del modo local, no del código: ver [ADR 0003](../docs/decisiones/0003-pglite-solo-en-local-y-pruebas.md) |
| `429` en `POST /api/v1/reportes` o en `/auth/login` | Un `pnpm dev` previo sin los límites de prueba, o un banco de carga que dejó filas en `intento_login` | Ver el aviso de arriba sobre `reuseExistingServer`; para el login, `DELETE FROM intento_login` |
