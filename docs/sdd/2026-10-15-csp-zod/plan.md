# Corrección adicional propuesta — Zod y CSP estricta

**APROBADO por el usuario el 2026-10-15: «Sí, aplicar y verificar ambas apps».** Hallazgo de la
verificación adicional de M4 con Next start, 2026-10-15; se mantiene separado de sus dos
vueltas de corrección. P1 y P2, solo arranque cliente de ambas apps.

## Hechos comprobados

G5 en producción: 13 aprobadas y cinco fallos CSP por `eval`, también en el panel sin cambios.
Los chunks de ambas apps contienen la misma sonda `Function("")` de Zod 4.6.4. Su código
instalado en `v4/core/util.js:219` reconoce que una CSP estricta registra la violación aunque
el error se capture, y permite omitirla con `globalConfig.jitless`. No es una autorización para
permitir unsafe-eval. La línea base de M4 usó Next dev con webpack; su comparación está en curso.

## Cambio concreto para aprobar

Crear únicamente:

- `apps/web-ciudadano/src/instrumentation-client.ts`
- `apps/panel-admin/src/instrumentation-client.ts`

Contenido en cada una:

```ts
import { z } from 'zod';
z.config({ jitless: true });
```

Next instalado dispone del cargador `next-instrumentation-client-loader`; `app-next.js` carga
la instrumentación antes de hidratar. Se comprobará que
el hook ejecuta esta configuración antes de construir esquemas en el navegador. Si no resuelve
la sonda en los dos builds, detener y reevaluar, sin ampliar archivos por cuenta propia.

## Meta, riesgo y comprobación

Meta: los cinco casos CSP existentes pasan también con los builds de producción, sin cambiar
política, nonce, aserciones ni esquema de validación. Riesgo: deshabilitar el compilador JIT de
Zod puede reducir rendimiento de validación en el navegador; se conserva el intérprete normal.
No se cambia la configuración de Zod del backend ni se agrega dependencia o contrato.

Preflight: suites web 645 y panel 458 verdes; los cinco casos de CSP de producción están rojos
y dan la prueba de reproducción. Con aprobación: tipos/suites/builds de ambas apps, mismos
cinco casos existentes en producción, revisión independiente focal. No modificar tests E2E,
servicios, DB, `.env`, CSP ni manuales protegidos. Sin commits ni publicación.
