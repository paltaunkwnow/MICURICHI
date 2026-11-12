# ADR 0024 — Baches v1 y piloto local

- **Estado:** aceptada para M6 local; validación municipal y producción pendientes.
- **Fecha:** 2026-10-18.
- **Decide:** el usuario: «apruebo el plan y su inventario, incluido los ajustes acotados de agents md y claude md».
- **Origen:** [plan M6 aprobado](../sdd/2026-10-18-baches-piloto/plan.md), §2 y §9;
  [roadmap 14](../arquitectura/14-decisiones-m0-y-plan-m1.md), §8.

## Contexto

M0–M5 dejaron el núcleo multitemático y sus interfaces, con una sola definición real registrada.
Baches es la primera nueva categoría del roadmap. El HTML del prototipo propone cinco tipos,
cuatro gravedades y cuatro tamaños. Sus rangos de tamaño tienen un hueco entre 60 cm y 1 m;
no constituyen un criterio técnico municipal validado. Los contratos generales todavía exigen
campos de agua no nulos y deben ampliarse antes del recorrido real.

## Decisión

Incorporar Baches (`bache`) por registro, con subtipo obligatorio y detalle estricto v1:
`gravedad_declarada` y `tamano`. Valores, etiquetas y matriz en [dominio de Baches](../dominio/baches.md).
Conservar solo las referencias visuales de tamaño, sin rangos numéricos. La banda sigue la
combinación de gravedad y tamaño del HTML, con piso en la gravedad declarada. Guardar el
índice auxiliar `g+t+2` (2–8), severidad v1; no comparar puntajes entre categorías.

Radio de recurrencia: **10 m**; aviso de diámetro con el factor vigente **4×radio**, es decir,
40 m para Baches y los mismos 100 m para Inundaciones. Mantener la marca Mi Curichi, icono
TrafficCone y los acentos del ADR 0022. Las ubicaciones son Point, vía pública por defecto,
con los caminos GPS/manual/aproximado y protección de viviendas existentes.

Conservar roles, estados, cámara, cupos configurables y demora por categoría. No prometer una
derivación municipal aún no confirmada. Incorporar las respuestas no inundación en contracts
0.23.0 preservando los requisitos de Inundaciones/legado y el CSV actual con detalle JSON.
Validar el subtipo en el servidor antes de consumir cupo y adecuar la nota metodológica de exportación.

El piloto se ejecuta únicamente en `curichi_e2e` existente, sin migrar/sembrar/cargar datos.
Arnés dedicado valida destinos antes de conectar; activa solo Baches temporalmente y conserva
un diario durable para restaurar catálogo con comprobación de concurrencia. Las pruebas de
paquete usan bases efímeras. No se autoriza conectar a `curichi`/`curichi_revision`, activar una
instalación habitual, borrar datos, publicar código, desplegar o ejecutar M7–M10.

## Consecuencias y alternativas descartadas

El formulario y los presentadores declarativos existentes reciben una definición real; no se
clona el sistema de Inundaciones. Registrar no equivale a activar. DBSCAN puede procesar
historial registrado inactivo y conserva esa regla; la disponibilidad pública sigue la doble puerta.

Se descartan rangos nuevos inventados, campos adicionales investigativos, una CLI general de
activación y una migración que active Baches automáticamente. Se conserva la distinción entre
percepción ciudadana y medición/diagnóstico técnico. Antes de producción deben validarse campos,
reglas/radio y proceso de atención con el municipio.

**Aceptada no significa implementada ni verificada.** Avance y resultados en la corrida M6;
esta decisión no certifica sus criterios de aceptación.
