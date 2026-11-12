# Arranque rápido de Mi Curichi

## Demo para exponer: cuatro categorías

**La demo existe.** Tiene Inundaciones, Baches, Basura y Áreas verdes, cuentas y reportes
sintéticos y las capas municipales. El 11/11 pasó 14/14 pruebas de escritorio
y móvil con esquema 22. La base separada `curichi_multitematica` ya está preparada.

1. Abre Docker Desktop y espera a que esté listo.
2. Abre PowerShell y ejecuta:

```powershell
Set-Location -LiteralPath "C:\Users\HP\Desktop\MICURICHI"
docker compose up -d postgis
node scripts/multitematica-local.mjs iniciar
```

3. Deja esa consola abierta. Cuando indique que los servicios están listos, abre:

- **Mapa ciudadano:** [http://127.0.0.2:4000](http://127.0.0.2:4000).
- **Panel municipal:** [http://127.0.0.2:4100](http://127.0.0.2:4100).

Para detener los servicios de la demo, pulsa **Ctrl+C en esa consola**. Los datos se conservan.
El arranque exige dependencias/builds válidos y al menos 2500 MiB de memoria libre; no instala
ni recompila automáticamente. No repitas `preparar`, seeds, carga de capas o migraciones.

El reinicio de M10 conservó los ocho reportes y cuatro fotos de la corrida de
verificación. Si aparece un rechazo de versión, conserva el mensaje para
identificar qué artefacto requiere el release compatible con el esquema 22.

Para exponer: cuenta `vecina` en la web y `tecnico` en el panel; `ejecutivo` muestra el
resumen y `admin` la administración. En esta demo se configuraron contraseñas iguales
al usuario; son cuentas sintéticas para uso local. Cambia de categoría, muestra un
reporte y valida otro desde el panel. No se usan estas cuentas en producción.
Para mostrar dos roles a la vez, abre el panel en una ventana de incógnito.

## Arranque habitual del proyecto

El código de la demo y del proyecto es compartido; cambia la instalación y su configuración.
El arranque habitual documentado usa `Mi-Curichi.exe`, con mapa en `https://localhost` y
panel en `https://panel.localhost`.

**En este checkout el ejecutable no está generado.** Su fuente y compilador están en
[`scripts/lanzador/`](scripts/lanzador/README.md).

**No uses ese arranque ahora sobre la base habitual protegida `curichi`.** El lanzador
habitual también ejecuta el trabajo de migraciones: no equivale al arranque aislado de
la demo. Su actualización requiere un plan propio; no se debe conectar ni migrar
`curichi`/`curichi_revision` con el trabajo actual. Para la exposición, utiliza la demo separada.

Comandos de referencia para una instalación aprobada y compatible:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\lanzador\compilar.ps1
.\Mi-Curichi.exe --iniciar
```

Guía detallada: [instalación multitemática](docs/operaciones/multitematica-local.md).
Estado y próximo paso: [`VentanaContexto.md`](VentanaContexto.md).
Preparación para una futura web en `micurichi.lat`; todavía sin despliegue público.
