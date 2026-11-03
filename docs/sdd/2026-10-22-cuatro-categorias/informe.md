# Entrega local de las cuatro categorías — 25 de octubre de 2026

**Entrega funcional local M6–M8 completada y verificada: 14/14 pruebas de navegador y
revisión independiente CONFORME.** La demo funciona en la instalación separada `curichi_multitematica`.
Esto no declara terminados M9/M10, la Fase 1 completa ni la preparación de producción.

## Qué se puede demostrar

Inundaciones, Baches, Basura y Áreas verdes comparten cuentas, mapa y panel. El vecino
elige categoría, ubica el punto, completa sus preguntas y puede tomar una foto. El servidor
resuelve distrito/UV con las capas municipales, calcula severidad y controla cupos.
El reporte se publica después de la demora; el técnico puede validarlo y exportarlo.
La información y los filtros conservan la categoría, incluidos los avisos de Basura y
Persona en situación de calle. No hay derivación municipal automática.

- Web: <http://127.0.0.2:4000>; cuenta local `vecina`, contraseña `vecina`.
- Panel: <http://127.0.0.2:4100>; cuenta local `tecnico`, contraseña `tecnico`.
- Otros roles locales: `admin`/`admin` y `ejecutivo`/`ejecutivo`.
- Arranque: `node scripts/multitematica-local.mjs iniciar`, con PostgreSQL disponible.
- El runner permanece abierto en primer plano. `Ctrl+C` cierra sus propios servicios y
  conserva los datos. No repetir `preparar`, seed o carga de capas para restablecer ejemplos.

Son cuentas y reportes sintéticos locales; no utilizarlos en producción. El recorrido
para presentar el sistema está en [la guía de operación](../../operaciones/multitematica-local.md).

## Verificación y evidencia

Corrida real: `demo-20261025-ae8811b2`, un trabajador de navegador y ningún reintento.
Resultado literal: **`14 passed (3.0m)`**, exit 0, cero fallos, omitidos o casos inestables.
Siete casos en escritorio y los mismos siete en móvil comprobaron:

1. Selector de cuatro categorías, prioridad de URL y preferencia del dispositivo.
2. Cuenta nueva y cuatro formularios, ubicación GPS, foto con cámara y avisos por subtipo.
3. Espera real de publicación, detalle/fotos, distrito/UV y privacidad de la respuesta.
4. Marcador ARIA exacto pendiente de M6 para cada categoría, canvas visible, teselas
   recibidas y cero eventos de pérdida de contexto WebGL o bloqueo CSP.
5. Validación técnica y descargas CSV/GeoJSON por categoría y «Todas».
6. Rechazo de acceso, exportación y moderación a la cuenta ciudadana.
7. Permisos reales de ejecutivo y administrador.

La API, el mapa y la persistencia fueron reales, sin interceptar sus respuestas. La cámara
y el GPS de navegador usaron los dispositivos sintéticos de Playwright; no se certifica
una cámara física de teléfono.
Los ocho reportes nuevos quedaron validados, dos por categoría. Se conservaron también
los datos de intentos previos. El control de mapa M6 pasó en esta instalación nueva;
no se presenta como una nueva ejecución completa del G1 histórico.

| Control | Resultado conservado y alcance |
|---|---|
| Contracts 0.24.0 | 512 aprobadas; tipos/build; doble OpenAPI idéntico a la referencia |
| Web ciudadano | 739 aprobadas; tipos, Biome y build separado |
| Panel | 709 aprobadas; tipos, Biome y build separado |
| API | Suite completa anterior: 510 aprobadas y 12 omitidas; corrección H1/H2: 14 focales aprobadas, con un caso nuevo y revisión conforme. No se repitió toda la suite tras ese cambio de prueba |
| DB | 350 casos únicos aprobados por consolidación; no una segunda suite completa |
| Geo-service | 110 aprobadas; tipos y Biome |
| ETL | 21 aprobadas por consolidación de 16 iniciales y cinco focales; tipos/build aprobados. Se conserva el intento EACCES inicial |
| Runner local | 40 aprobadas, sintaxis/Biome aprobados y revisión independiente conforme |
| E2E actual | 14/14, escritorio/móvil; inputs antes/después sin cambios |
| Secretos y diff | Reglas de escaneo intactas; una coincidencia falsa demostrada por AST, sin credencial literal; diff de archivos seleccionados aprobado |

Detalles y límites en [verificacion.md](verificacion.md). La evidencia original queda en
`.turbo/cuatro-categorias-2026-10-22/`: los directorios por paquete, `calidad-final/`,
`revision/` y `e2e/salidas/demo-20261025-ae8811b2/`. Las ocho capturas originales de mapa
están adjuntas en `playwright.json` y extraídas sin edición en `capturas/`.
La guarda inicial registró 3016 MiB libres; el mínimo observado durante la prueba fue
1209 MiB. No se afirma que hubiera 2500 MiB libres durante toda su ejecución.

La [revisión independiente de cierre](revision.md) acreditó CA1–9 y la revisión/auditoría
de CA10, con 14 identidades únicas y 8/8 inputs/capturas cotejados. La observación editorial
de CA10 se atendió después: checkpoint, índices, manuales autorizados e informe sincronizados.
No se modificó producto para cerrar esa observación ni se repitieron pruebas verdes.

## Instalación y reinicio

Se preparó únicamente `curichi_multitematica`: 21 migraciones, capas municipales vigentes
(16 distritos, 576 UV y 27 527 manzanas), ACL comprobada y cuatro categorías activas.
Las bases protegidas no se migraron ni se consultaron; `curichi_e2e` se usó solo como
bootstrap de metadatos en la preparación autorizada. No se cambiaron roles o contraseñas
globales. Los frontends no reciben credenciales de PostgreSQL.

El bloqueo EPERM de los dos archivos compilados se resolvió después del reinicio de
Windows comunicado por el usuario. Ambas compilaciones ordinarias terminaron con exit 0.
No se identificó la causa original ni se modificaron permisos o protecciones.

Antes de nuevos envíos, la comparación posterior al arranque confirmó igualdad exacta
de recuentos y huellas de seis tablas con el snapshot anterior al reinicio. Esto comprueba
este reinicio; no simula una pérdida de energía. Evidencia: `operacion/antes-reinicio.json`,
`despues-reinicio.json` y `post-reinicio-windows-20261025/compilacion.json`.

Después de las pruebas, el resumen de solo lectura registró 9 usuarios, 48 reportes,
6 fotos y cuatro categorías activas. Son datos sintéticos sobre cartografía municipal.
Ver `operacion/resumen-entrega-20261025.json`.

## Límites y trabajo siguiente

- M9: medición de escala con cuatro categorías y un millón de filas del modelo actual.
  La medición de M2 ya existe y es antecedente, no un resultado nuevo de M9.
- M10: contracción de compatibilidad, con plan y validación propios. Esta entrega
  conserva vista, columnas heredadas y compatibilidad de API.
- Mantener declarados los rojos previos de lint global y auditoría de dependencias
  (4 high, 12 moderate y 1 low); no se actualizaron dependencias en esta corrida.
- Las 12 omisiones de API (S3/PG real) no son pruebas aprobadas. No se certifican
  imágenes Docker habituales, accesibilidad con lector real ni despliegue público.
- La revisión detectó 12 mensajes de consola clasificados como CSP en panel/admin.
  No demostraban por sí solos doce violaciones. Una observación focal posterior, sin
  modificar CSP, registró cero mensajes/eventos de violación en bandeja y detalle, ambos
  con canvas real. Su causa original no se estableció; no se afirma «cero CSP» global.
  Evidencia: `e2e/csp-panel-20261025.json`; aclararlos antes de certificar producción.
- Producción requiere la puerta de privacidad de Persona, validación municipal de
  parámetros/fuente/licencia, seguridad, respaldos y aprobación de la fase correspondiente.

No hubo nuevos commits, push, PR, limpieza de cachés ni cambios de datos originales.
La demo utiliza sus propias salidas de frontend y almacenamiento. Para detenerla,
usar el cierre del runner; no borrar ni reconstruir bases para volver atrás.
