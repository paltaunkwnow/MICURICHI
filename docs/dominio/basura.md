# Basura — definición de la entrega local

**Aprobada2026-10-22, implementación/verificación en curso.** [ADR0025](../decisiones/0025-cuatro-categorias-y-entrega-local.md),
[plan](../sdd/2026-10-22-cuatro-categorias/plan.md). Parámetros de piloto local, pendientes de
validación municipal. Registrar la definición y activar una instalación son operaciones distintas.

- Slug basura; icono Trash2 y paleta ADR0022.
- Point; subtipo obligatorio en el núcleo. Campos de agua nulos; no duplicar subtipo en detalle.
- Detalle estricto versión1: gravedad_declarada y tamano, ambos obligatorios.

| Subtipo | Etiqueta |
|---|---|
| microbasural | Microbasural |
| contenedor_desbordado | Contenedor desbordado |
| quema_basura | Quema de basura |
| escombros_via | Escombros en la vía |
| basura_canal | Basura en un canal |

| Campo | Valores ordenados y etiquetas |
|---|---|
| gravedad_declarada | bolsas_sueltas:Unas bolsas sueltas; acumulada_dias:Se acumula hace días; ocupa_via:Ocupa la vereda o la calle; quema_o_desague:Hay quema o tapa un desagüe |
| tamano | bolsas:Unas bolsas; carretilla:Una carretilla; camioneta:Una camioneta; camion_o_mas:Un camión o más |

Severidadv1: índicesg,t de0a3,puntaje auxiliar g+t+2,banda combinada crítica≥7,alta≥5,media≥4,
baja en otro caso; piso según gravedad declarada. La matriz de16 casos está en el plan.
No es medición sanitaria, cantidad pesada ni índice comparable entre categorías. Quema muestra
aviso informativo de que el reporte no sustituye atención de emergencia, sin alterar esa fórmula.

Recurrencia10m, distinta del radio del dispositivo60m. Cupos configurables por categoría,
fotos globales, publicación y resolución manual comunes. No caducidad automática, cambios
de categoría ni campos de antigüedad/peligro adicionales. CSV/GeoJSON conservan formato,
con detalle JSON propio y nota metodológica; las celdas de agua quedan vacías.

Los dos campos del detalle son públicos/exportables. Las fotos pueden contener información
personal; no afirmar difuminado inexistente. Esta entrega no incluye producción ni derivación
municipal automática; usar datos sintéticos en la verificación.
