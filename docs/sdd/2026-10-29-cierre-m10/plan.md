# Cierre M10 — corrida aprobada

**Aprobado por el usuario el29/10/2026:** «Aprobar plan, decisiones e inventario»,
respuesta a `call_f5f56593962e47059c6c9e9d984ac262`, incluidos los ajustes acotados de
AGENTS.md/CLAUDE.md. M10.5 ya quedó cerrado y congelado antes de iniciar esta corrida.

[Plan, decisiones e inventario canónicos](../2026-10-29-pruebas-historicas-vigentes/plan-cierre-m10.md).
No se duplican las92rutas inventariadas ni sus criterios; el manifiesto F0 captura la
lista exacta, incluidos siete archivos nuevos, antes de editar producto.
La [ampliación de guardas](ampliacion-guardas.md), aprobada después por el usuario,
añade cuatro archivos (96rutas totales). Sus preimágenes coinciden con el F0 original;
anexo `.turbo/m10-cierre-2026-10-29/f0/ampliacion-guardas.json`, sin sobrescribirlo.
La [ampliación del escáner](ampliacion-escaneo.md) fue aprobada el03/11: tres rutas,
dos adicionales al inventario y CI ya incluida,98únicas. F0 separado en
`f0/ampliacion-escaneo-20261103/manifest.json`; no se modifica el F0 original.
Petición posterior explícita del usuario: guía breve de arranque de demo y versión habitual.
Se creó [`ARRANCAR.md`](../../../ARRANCAR.md), solo documentación, con autorización/origen
en `f0/guia-arranque.json`. No se ejecutaron sus comandos ni se amplió el permiso operacional.

F0: `.turbo/m10-cierre-2026-10-29/f0/manifest.json`,1017archivos y copias de fuentes
existentes inventariadas. Rama `codex/cuatro-categorias`, HEAD
`59b80781030707b8c3334bfbfd40f80000c60a57`. HEAD no representa el antes: se conservan
los cambios de fases previas. No stash/ref/commit/push/PR nuevos.

Banderas: base/datos/geo/seguridad/privacidad/infra/lanzadores/API. Trabajo por partes
con raíces nativos sin override, único escritor por carpeta y ejecución pesada en serie.
Principal coordina, integra y documenta. Verificación y revisión/auditoría independientes.

## Reparto y dependencias

1. Verificador raíz: baseline de paquetes afectados antes de modificar fuentes.
   La suite DB375/375 independiente de M10.5 puede reutilizarse solo demostrando los SHA
   de todas sus fuentes/dependencias en el F0 nuevo. No llamarla una ejecución nueva.
   API/geo/Node/Bash afectados se miden antes; distinguir SKIP/fallos heredados.
2. Raíz Parte4 `packages/db`: migración/reversa/guardas del runner y sus pruebas,
   mirrors, productores, mantenimiento y ACL; únicamente sus rutas de inventario.
   Puede leer/planear mientras se mide baseline, sin editar hasta su liberación.
3. Raíz Parte3 `services/api-core`: writer JSON, arranque compatible y fixtures/pruebas
   autorizadas, tras estabilizar el contrato interno de esquema/runner de Parte4.
4. Raíz Parte4 `services/geo-service`: fixtures actuales y README autorizados tras DB.
5. Raíz Parte5: operadores/restauración/actualizador/CI/Compose/E2E parametrizado;
   sin operaciones reales. Depende de las interfaces estables DB/API.
6. Revisor y auditor/verificador independientes del delta; regresión bloqueante.
   Solo después se prepara el protocolo operacional concreto para aprobación humana.

## Límites vigentes

Solo código y pruebas aisladas. Ninguna conexión/migración de `curichi`,
`curichi_revision`, `postgres`, demo, E2E o bancos retenidos. No PGreal/Docker/S3/HTTP
operacional, respaldo/restauración reales ni actualización de demo en esta aprobación.
Ningún DROP DATABASE, CASCADE de retiro, resembrado, lectura de secretos o cambios globales.
No instalaciones, descarga, npx, limpieza de cachés/logs o modificación de `data/raw/`.

**Autorización posterior del01/11/2026:** el usuario pidió terminar y «una vez termines
todo haz pr en el repositorio». Autoriza commit/push y un PR con el resultado verificado;
no merge, despliegue ni operaciones sobre bases reales. Se conserva la puerta operacional
separada. Los cambios anteriores de M6–M10 forman parte de la versión que se publicará;
no se incluirán secretos, datos originales, dependencias, cachés o artefactos ignorados.

Preparar para subir después; **sin despliegue ahora**. Web prevista `micurichi.lat`,
dominio del panel/VPS sin elegir, DNS/certificado sin comprobar. No se aprovisiona nada.
La autorización operacional posterior debe ser concreta y revisable; no es un permiso
repetido para programar lo aprobado aquí. M10 completo/Fase1/producción no cierran por
crear una migración o por aprobar pruebas simuladas.
