# ADR0025 — Cuatro categorías y entrega local separada

- Estado: **aceptada para la entrega local**.
- Fecha:2026-10-22.
- Decide: usuario, «Sí, aprobar el plan y ejecutarlo».
- Origen: [plan aprobado](../sdd/2026-10-22-cuatro-categorias/plan.md).

## Decisión

Incorporar Basura y Áreas verdes al mismo núcleo de Inundaciones/Baches, contracts0.24.0.
Dos definiciones con cinco subtipos cada una, detalle estricto de gravedad/tamaño, versión1,
severidadv1 por fórmula del prototipo con piso declarado, radio provisional10m y Point.
Las claves/etiquetas y matriz aprobadas están en el plan; no se atribuyen al municipio.
Se conservan roles, estados, cupos, publicación, marca y formato de exportación.

Persona en situación de calle permanece como subtipo de Áreas verdes, con preguntas/aviso
y destino previsto Desarrollo Social. No implica integración municipal. Comportamiento local
según ADR0018; no afirmar que se ocultan caras/fotos si no existe esa protección. Su puerta
de privacidad antes de producción sigue pendiente. Quema muestra un aviso informativo sin
nuevo número de emergencia ni escalamiento automático por subtipo.

Entregar una instalación local con base nueva fija curichi_multitematica, capas existentes,
storage/origen/puertos/salidaNext propios y cuatro categorías activas. Reusar credenciales
y roles de mínimo privilegio existentes, sin cambios globales de roles/contraseñas. La
separación de datos no promete aislamiento absoluto de credenciales compartidas.

El control previo puede conectar solo a curichi_e2e; los jobs de preparación/escritura solo
a la base nueva, con identidad/destino comprobados. No conectar/migrar curichi ni
curichi_revision ni usar postgres como base administrativa. Crear solo si el nombre está
libre; conservar ante un estado desconocido, sin borrar/recrear o repetir seed sin control.

## Verificación y límites

Plan→reparto→pruebas antes/después→F4/revisión/auditoría independientes. La instalación se
considera entregada con recorrido real de cuatro categorías, regresión de Inundaciones/Baches,
ACL/capas/operación comprobadas y comandos reproducibles. El pendiente del mapa/M6 forma
parte del cierre conjunto; no se omite por aprobar este ADR.

No autoriza producción, validación municipal, nuevas publicaciones Git ni eliminación de
cachés/logs/datos. M9 de escala y M10 de contracción mantienen sus hitos separados.
