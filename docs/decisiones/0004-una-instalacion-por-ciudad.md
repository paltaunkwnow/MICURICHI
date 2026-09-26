# ADR 0004 — Una instalación por ciudad

- **Estado:** aceptada
- **Fecha:** 2026-09-26
- **Decide:** el usuario, a partir de la revisión para producción (`docs/revision/2026-09-26-revision-produccion.md`)

## Contexto

El usuario quiere que Mi Curichi pueda crecer a otras ciudades o países sin dejar de concentrarse,
por ahora, en Santa Cruz de la Sierra. La revisión de escalabilidad encontró dos clases de
supuestos atados a la ciudad:

- **En el código**: centro del mapa, zona horaria, idioma y región para fechas, nombre de la ciudad
  en textos, CRS métrico para medir distancias. Cambiarlos exigía editar y recompilar.
- **En el modelo de datos**: ninguna tabla lleva municipio; los ids de capa (`distrito_municipal:07`)
  chocarían entre ciudades; hay una sola versión vigente por tipo de capa en todo el sistema; los
  roles son globales.

Había dos modelos posibles:

| | Una instalación por ciudad (silo) | Una plataforma multi-ciudad (pool) |
|---|---|---|
| Datos | Base propia por ciudad o país | Una base compartida, municipio en cada tabla |
| Residencia de datos | Natural: cada país en su infraestructura | Exige particionar o replicar por país |
| Cambios hoy | Sacar a configuración lo escrito para Santa Cruz | Esquema, índices, permisos y autorización por municipio |
| Costo de operar muchas ciudades | Mayor (N despliegues) | Menor |
| Aislamiento ante fallos o abusos | Total | Compartido |

## Decisión

**Una instalación por ciudad.** La misma imagen sirve a cualquier ciudad; lo que cambia de una a
otra es configuración:

- Variables `CIUDAD_NOMBRE`, `CIUDAD_PAIS`, `CIUDAD_LOCALE`, `CIUDAD_CENTRO_LON`,
  `CIUDAD_CENTRO_LAT`, `CIUDAD_ZOOM_INICIAL`, `ZONA_HORARIA` y `CRS_METRICO_EPSG`, con los valores
  de Santa Cruz por defecto (`CONFIG_DOMINIO.CIUDAD_POR_DEFECTO` en contracts 0.7.0).
- api-core las valida al arrancar (una configuración inválida impide arrancar) y las publica en
  `GET /api/v1/configuracion`. Las apps la leen en tiempo de ejecución: cambiar de ciudad no exige
  recompilar.
- Las capas de la ciudad entran por el ETL con su propia versión; las credenciales, dominios y
  respaldos son propios de cada instalación.

## Consecuencias

- El modelo de datos no cambia ahora: los supuestos «un municipio por base» dejan de ser un
  bloqueo, porque cada base tiene una sola ciudad.
- Operar muchas ciudades cuesta más que con una plataforma compartida. Si algún día conviene, la
  migración a multi-ciudad (municipio en cada tabla, membresía usuario↔municipio detrás de
  `requerirRol`) queda en el backlog de `CLAUDE.md` §15.
- Siguen escritos para Santa Cruz, a propósito, los contenidos propios de la instalación (el plano
  de zonificación del panel, la foto de la catedral), que solo se muestran si la ciudad configurada
  es Santa Cruz. El voseo se mantiene hasta que haya otra variante del español; el número de
  emergencias por país queda pendiente.
