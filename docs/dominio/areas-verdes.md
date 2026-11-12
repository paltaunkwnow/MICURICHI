# Áreas verdes — definición de la entrega local

**Aprobada2026-10-22, implementación/verificación en curso.** [ADR0025](../decisiones/0025-cuatro-categorias-y-entrega-local.md),
[plan](../sdd/2026-10-22-cuatro-categorias/plan.md),[ADR0018](../decisiones/0018-persona-en-situacion-de-calle.md).
Parámetros locales, pendientes de validación municipal.

- Slug area_verde,URL area-verde; icono Trees,paleta ADR0022.
- Solo Point,sin capa de parques/polígonos/detección municipal,ADR0019/0020.
- Subtipo obligatorio en núcleo; detalle estricto versión1 con gravedad_declarada y tamano.

| Subtipo | Etiqueta |
|---|---|
| parque_plaza_descuidada | Parque o plaza descuidada |
| juegos_infantiles_rotos | Juegos infantiles rotos |
| arbol_rama_peligrosa | Árbol caído o rama peligrosa |
| pasto_sin_riego | Pasto seco o sin riego |
| persona_situacion_calle | Persona en situación de calle |

| Campo | Valores ordenados y etiquetas |
|---|---|
| gravedad_declarada | descuidado:Se ve descuidado; uso_limitado:Ya no se puede usar bien; riesgo:Es un riesgo para quien va; peligro_inmediato:Peligro inmediato |
| tamano | rincon:Un rincón; media_plaza:Media plaza; casi_toda_plaza:Casi toda la plaza; toda_area_verde:Toda el área verde |

Modelo de severidadv1: g,t=0…3,puntaje auxiliar g+t+2,cortes4/5/7 y piso de gravedad declarada;
matriz de16 casos en el plan. No es medición de área ni comparación de puntajes con otras
categorías. Radio de recurrencia10m; reglas comunes de ubicación,cupo,fotos y estados.

## Persona en situación de calle

Se mantiene como subtipo con las mismas preguntas y fórmula. Aviso autorizado:

> Esto no es una denuncia. Se deriva a Desarrollo Social para ofrecer ayuda, no a seguridad.
> No subas fotos donde se vea la cara de la persona.

Destino previsto Desarrollo Social; los otros subtipos,Parques y jardines. La plataforma no
confirma entrega/integración municipal automática. Formulario/revisión/detalle deben mostrar
el aviso correspondiente y retirarlo al cambiar de subtipo, sin cambiar el payload de dominio.

En local se conserva el comportamiento común,ADR0018. La frase del HTML sobre ocultar fotos
no estaba implementada: no se promete ocultación,difuminado o moderación previa inexistentes.
Pruebas con datos sintéticos. Visibilidad,fotos,moderación prioritaria,retención y marco legal
siguen siendo una puerta antes de activar esta categoría en producción.
