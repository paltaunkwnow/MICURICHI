# Implementación — cuatro categorías

Estado parcial, 2026-10-23. Plan e inventario aprobados por el usuario. Rama
`codex/cuatro-categorias`; no hay commit ni publicación de esta corrida.

## Contracts 0.24.0 entregada

Se incorporaron las definiciones reales de Basura y Áreas verdes, sus detalles estrictos,
subtipos, severidad v1, políticas, preguntas y notas. El registro contiene las cuatro
categorías. Las funciones de severidad de Inundaciones/Baches se conservaron por hash.
Los dos cambios de pruebas existentes actualizan las expectativas del registro, sin
alterar los modelos de dominio. Lista exacta de 15 archivos en `archivos.txt` y en
`.turbo/cuatro-categorias-2026-10-22/contracts/touched-files.json`.

El build dejó disponible `dist`; OpenAPI se regeneró dos veces con bytes idénticos al
estado inicial. El contrato HTTP genérico no requiere modificar su esquema por categoría.
Esto no activa el catálogo de una base de datos.

## Integración en curso

Web incorporó envolturas sobre el formulario declarativo para los avisos de Persona y Quema,
y la presentación de Áreas verdes. Suite739, tipos, Biome y build de salida propia aprobados;
revisión independiente sin defectos funcionales; formato JSON generado corregido y verificado.
Panel entregó709 pruebas, tipos, Biome y build propio;586casos anteriores preservados y
123nuevos. Revisión independiente conforme. Ambas salidas usan `.next-multitematica`;
la conservación de `.next` se verificó por metadatos, no por hashes binarios.

API conserva sus fuentes productivas y pasó510casos más12omisiones conocidas; tipos/Biome0.
Quince casos nuevos ejercitan modelos, efectos anteriores al cupo, privacidad, moderación y
exportación. El título M6 fue actualizado dentro de la ampliación aprobada.

El runner de la instalación separada pasó38casos inicialmente; se corrigieron comentario
compartido de base y herencia del modo ESM a los workers del seed. Regresiones nuevas
demostradas en rojo y luego40/40PASS, Biome0 y revisión independiente conforme.

La base nueva quedó preparada/activa el24/10, con21migraciones,capas municipales16DM/576UV/
27527MZ,4cuentas sintéticas,37reportes y22puntos críticos; ACLexacta y tres activaciones
auditadas. La recuperación del seed fallido inspeccionó el destino y conservó journal/log.
Se iniciaron API4001,geo4002,web4000 ypanel4100 en127.0.0.2 con almacenamiento y salidas
separadas. HTTP200 y configuración de cuatro categorías comprobados.

La demo de frontend está disponible y su mapa municipal se comprobó visualmente por captura
real de Chromium. El selector/URL/preferencia desktop pasó. El primer selector de login del
test era ambiguo; se acotó al contenido. La cámara sintética mostró un fallo intermitente y
luego completó captura/preview en diagnóstico observacional. Se conservan ambos resultados;
está en curso otro recorrido completo, sin omitir las exigencias de foto ni marcador M6.

Los ajustes autorizados de AGENTS.md/CLAUDE.md se limitan a §1, §4.8 y fila 7 de §16;
describen el avance parcial y conservan las restricciones de bases habituales/producción.

Actualización del25/10: H1/H2 de API subsanadas y revisadas de forma independiente,
con14casos focales aprobados. DB350PASS consolidada y geo110PASS; ETL21PASS consolidada y
runner40PASS. Tipos DB/geo y estáticos E2E aprobados; no se repitió toda DB como suite nueva.

El reinicio de Windows resolvió el bloqueo de emisión: API y geo compilaron con exit0,
sin cambios de código, permisos o seguridad. Se arrancó de nuevo la instalación existente
y la comparación de seis tablas conservó exactamente los datos anteriores al reinicio.
La corrida `demo-20261025-ae8811b2` ya aprobó los siete casos desktop, incluido el marcador
exacto M6 y moderación/exportación de las cuatro categorías. En móvil aprobó selector y
cuatro formularios; el resultado definitivo se recoge a continuación.

**Cierre funcional local del25/10:**14/14 E2E, siete desktop y siete móvil, sin fallos,
omisiones o reintentos. El marcador exacto M6 pasó con las cuatro categorías. Revisión
independiente final CONFORME y documentación de CA10 sincronizada. Los ejemplos de ambas
corridas se conservan: instalación con9usuarios/48reportes/6fotos y cuatro categorías activas.
La demo permanece encendida. Ver `informe.md`, `revision.md` y `verificacion.md` para evidencia
y límites. M9/M10 y la apertura de producción no se declaran terminadas por esta entrega.
