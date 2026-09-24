# panel-admin — Parte 2 — Frontend administrativo / plataforma técnica

Panel del técnico municipal: bandeja de triaje, ficha del reporte con moderación, indicadores,
capas y el plano oficial de referencia. Especificación en `CLAUDE.md` §4.4; el estado y los
pendientes están en [`docs/TRASPASO.md`](../../docs/TRASPASO.md).

```bash
pnpm --filter panel-admin dev        # 3100; necesita api-core (3001) y geo-service (3002)
pnpm --filter panel-admin test       # Vitest
pnpm --filter panel-admin build && pnpm --filter panel-admin start   # modo producción
```

## Pantallas

La interfaz reproduce el prototipo funcional que entregó el usuario
(«Mi Curichi · Prototipo (compartible).html»), que es la fuente de verdad visual:

| Ruta | Pantalla del prototipo | Qué hace |
|---|---|---|
| `/reportes` | M-02 | Bandeja: filtros, tabla y mapa sincronizados, exportación, indicadores de carga |
| `/reportes/:id` | M-03 | Ficha completa: lo declarado, de dónde salió el puntaje, moderación y auditoría |
| `/indicadores` | M-09 | Conteos por severidad, distrito y unidad vecinal |
| `/capas` | A-02 | Versiones cargadas por el ETL y activación de la vigente |
| `/plano` | A-06 | Plano oficial de zonificación como referencia, con su advertencia |

El texto de estado usa las palabras del técnico («Validado», «Duplicado»), no las del vecino: acá
se trabaja con la máquina de estados de `CLAUDE.md` §7.3.

## El mapa

Mismo tratamiento que en la app pública: base raster desaturada y marcadores en pastilla con el
nombre de la severidad escrito. Pasar el puntero por una fila de la tabla resalta su pastilla.

`scripts/copiar-worker-maplibre.mjs` copia el worker de MapLibre a `public/maplibre/` antes de
`dev` y de `build`, y `src/lib/worker-maplibre.ts` se lo declara con `setWorkerUrl`. Sin eso
MapLibre busca su worker junto al chunk de Next, recibe la página 404 en HTML y el mapa se queda
sin nada vectorial —ni puntos, ni polígonos— sin un solo error visible. El detalle está en el
[README de `web-ciudadano`](../web-ciudadano/README.md#el-worker-de-maplibre-hay-que-servirlo-aparte).

## Cuando la sesión caduca

La sesión del técnico vence por inactividad (`SESION_IDLE_HORAS`, 12 h por defecto). Cualquier
respuesta 401 de api-core que no venga del propio login dispara `EVENTO_SESION_CADUCADA`; el
envoltorio `Protegido` lo escucha, tira la caché de TanStack Query —que puede tener reportes que
este usuario ya no debería ver— y lleva a `/login?caducada=1`, que lo explica en una frase.

Antes eso se descubría en mitad de una moderación: «Confirmar rechazo» devolvía un escueto
`ERROR (401)` dentro del formulario, sin decir qué había pasado ni cómo volver a entrar.

## Pruebas end-to-end

Esta app no tiene una suite Playwright propia: el recorrido que la atraviesa (ciudadano reporta →
técnico valida → aparece en el mapa público → sale en la exportación), la accesibilidad de sus
pantallas y los contratos de la API se cubren desde la suite transversal de `e2e/`.

```bash
pnpm db:local          # terminal 1
pnpm db:seed:samples
pnpm --filter e2e test:e2e
```

La Definition of Done de `CLAUDE.md` §4.3 y §4.4 pide además una suite propia por app; queda
pendiente de decidir si aporta algo sobre la transversal o si se consolida allí.
