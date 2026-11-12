# ADR0026 — Contracción física con API compatible

- **Estado:** aceptada; implementación y ensayos pendientes.
- **Fecha:**2026-10-29.
- **Decide:** el usuario, respuesta «Aprobar plan, decisiones e inventario» a
  `call_f5f56593962e47059c6c9e9d984ac262`, incluidos los ajustes acotados de los manuales.
- **Plan e inventario:** [cierre M10](../sdd/2026-10-29-pruebas-historicas-vigentes/plan-cierre-m10.md).
- **Corrida:** [2026-10-29-cierre-m10](../sdd/2026-10-29-cierre-m10/plan.md).

## Decisión

Separar la contracción del almacenamiento de la retirada de compatibilidad externa.
Se podrá cerrar M10 local con `detalle` como fuente única de dominio y sin las seis
columnas de Inundaciones, vista/trigger/funciones/ENUM SQL anteriores, conservando ambos
POST, respuestas/CSV con alias, default Inundaciones y las demás reglas de ADR0012.
El retiro HTTP se difiere sin plazo ni adopción supuestos; conserva ventana medida,
inventario de clientes/PWA y aprobación propios. Esto modifica el alcance de la condición
de ADR0011/13.3§3.4, que antes también alcanzaba al retiro físico.

La cuota histórica se conserva íntegra en `resguardo_m10.cuota_reporte_diaria`, acceso
exclusivo del dueño, sin limpieza automática ni permiso de PUBLIC/API/geo. No se traslada
su saldo al contador actual. Si existe una copia previa, solo se reutiliza con igualdad
exacta; divergencia aborta sin sobrescribirla ni mezclarla. No se fija caducidad ni se
autoriza borrarla. Reversa condicionada a valores/versiones admitidos y usuarios
necesarios existentes; no se inventan usuarios ni se promete reversibilidad incondicional.

Código y esquema se actualizan con parada coordinada. La migración pendiente exige
consentimiento explícito en runner/CLI y señal limitada a transacción; un arranque ordinario
no otorga ese permiso. Se conservan artefactos compatibles con21 y se comprueba la
recuperación del conjunto código+esquema, incluidos datos nuevos admitidos durante22.
La señal de consentimiento no demuestra por sí misma que los escritores estén detenidos.

## Condiciones y límites

La aprobación actual cubre el código y las pruebas aisladas del inventario. Antes de
cualquier operación real se presentará un protocolo concreto revisado para aprobación,
con respaldo cifrado/restaurado, precondiciones, destinos nuevos y recuperación probada.
No se operan ni migran las bases protegidas, demo, E2E o bancos conservados bajo este permiso.

M10 no se declara completo por añadir DDL o aprobar mocks. Requiere verificación
independiente y los ensayos/actualización autorizados del plan. Fase1 y apertura de
producción conservan su puerta humana. Por ahora el usuario pide dejar listo para subir
después: web prevista `micurichi.lat`, sin desplegar ni aprovisionar recursos ahora.

## Alternativas consideradas

Mantener la condición anterior y posponer todo DROP hasta una ventana externa medida;
retirar también HTTP en el mismo release; descartar la cuota histórica. Se adopta la
contracción física compatible y reversible condicionada para conservar clientes y datos.
