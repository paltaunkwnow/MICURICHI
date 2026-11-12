# M9 — Línea base y condiciones de partida

Fecha: 2026-10-25. Plan e inventario aprobados con «Aprobar y ejecutar M9».
La demo de cuatro categorías terminó su verificación funcional antes de iniciar este hito.

## F0 e integridad

Se conserva la rama `codex/cuatro-categorias`, HEAD
`59b80781030707b8c3334bfbfd40f80000c60a57`, sin commits ni movimientos destructivos.
El trabajo M6–M8 sigue sin commit: se declara ajeno a las dos herramientas nuevas de M9.
`arbol-inicial.txt` registra estado; `.turbo/m9-2026-10-25/f0-hashes.json` guarda938archivos
seguidos/nuevos y `partida.diff` conserva el diff previo. El plan recibió después la nota
de aprobación explícita; ese cambio documental no es una regresión de producto.

## Evidencia reciente reutilizada por identidad, no ejecutada de nuevo

La corrida anterior y sus límites están en
[el informe de cuatro categorías](../2026-10-22-cuatro-categorias/informe.md).

| Control | Evidencia de partida |
|---|---|
| Contracts0.24 | 512PASS,tipos/build y doble OpenAPI; cuatro definiciones reales |
| Web/panel | 739/709PASS respectivamente,tipos/Biome/build; salidas Next propias |
| API | 510PASS+12SKIP en suite completa anterior; focalH1/H2 posterior14PASS con un caso nuevo, revisión conforme |
| DB/geo | DB350PASS únicos consolidados; geo110PASS; tipos y Biome aprobados |
| ETL | 21PASS únicos consolidados,tipos/build; intento EACCES original conservado |
| Runner de demo | 40PASS y revisión conforme; hashes runner/test/turbo cotejados con evidencia |
| E2E | 14/14 reales el25/10, sin fallos/omisiones/reintentos; siete desktop/siete móvil |
| Reinicio | Compilación API/geo exit0 tras reiniciar Windows; seis tablas antes/después con igual conteo y huella |

Las pruebas anteriores no certifican el medidor M9, que todavía no existe en este corte.
El implementador ejecutará el preflight del runner actual antes de crear los dos archivos;
sus comandos y salidas se anexarán a esta corrida al entregarlos. Los negativos nuevos
requieren su rojo→verde y controles propios antes de abrir una conexión real.

**Preflight recibido durante la implementación:** `implementador/preflight-antes.txt`
del scratchM9 conserva literalmente40tests/40pass/0fail/0skipped/0cancelled, duración1203ms,
del runner local existente. No hubo conexiones PostgreSQL en ese control. La herramienta
de medición nueva y sus negativos siguen en elaboración; no se extrapola este PASS a M9.

## Operación y límites

La demo permanece viva en PTY33713/PID26852 y respondió HTTP200 en web4000/panel4100.
Su base propia `curichi_multitematica` tiene cuatro categorías activas y ejemplos sintéticos.
No preparar/sembrar/migrar la demo de nuevo. El plan M9 autoriza una pausa temporal propia
solo durante la medición, con aviso y comparación de sus datos antes/después.

No se creó el banco M9 ni se ejecutó el millón de filas al escribir este documento.
El banco propuesto es `curichi_sdd_m9_20261025`, sin borrado automático. `curichi_e2e`
solo admite bootstrap/metadatos; `curichi`, `curichi_revision` y `postgres` no se conectan.
Sin cambios de roles/contraseñas globales, dependencias, configuración persistente o seguridad.

Se conservan los rojos ajenos: lint global1error/6avisos, auditoría4high/12moderate/1low,
12omisiones API de PG/S3 reales y los mensajes clasificadosCSP que no se explicaron
globalmente. No se certifica producción ni se convierte su ausencia de medición en PASS.

M2 ya midió1M total/250k por categoría sobre0020; usar su informe como antecedente y
distinguirlo de resultados nuevos del modelo0021/contracts0.24.
