# Entrega local con cuatro categorías — M7/M8 e integración

**Estado: APROBADO por el usuario el2026-10-22.** Respuesta literal:
«Sí, aprobar el plan y ejecutarlo». Abarca decisiones§2,operación§3,inventario§4 y ajustes
acotados de ambos manuales. Las referencias a propuesta/aprobación en el cuerpo conservan
la preparación; quedan resueltas para esta entrega local. Validación municipal pendiente.

El usuario pidió terminar la fase para funcionar con las cuatro categorías y eligió
**una instalación local separada con base nueva, sin tocar curichi**. Esa elección de destino
ya está autorizada. Este plan concreta las decisiones de Basura/Áreas verdes, archivos y
operación necesarios para ejecutar esa entrega conforme a AGENTS§0.9,§5.2 y§12.4.
Las propuestas de dominio de abajo quedaron aprobadas para esta entrega local; no son parámetros municipales.

## 1. Punto de partida y resultado esperado

[VERIFICADO] Inundaciones y Baches tienen definiciones reales; contracts0.23.0. M6.1–5 y
F4 estática de producto entregadas; arnés M6 con467 pruebas independientes aprobadas y
auditoría conforme. Preflight467 real aprobado. G1 anterior falló por marcador ausente;
el diagnóstico focal posterior se detuvo por memoria antes de ejecutar navegador. M6 sigue
abierta. Sus resultados y correcciones no se sustituyen por este plan.

Entrega: web y panel locales utilizables con **Inundaciones, Baches, Basura y Áreas verdes**;
crear, consultar, moderar y exportar reportes por categoría, con cuentas/cupos y mapas comunes.
Nueva base fija propuesta: **curichi_multitematica**, mismas capas municipales disponibles,
fotos y salida Next propias. La nueva instalación conserva las cuatro categorías activas.

El desarrollo de las definiciones puede avanzar tras aprobar este plan aunque el navegador
de M6 siga limitado por memoria. El cierre conjunto exige resolver aquel fallo y verificar
el recorrido completo; no se declara M6 cerrada por avanzar M7/M8.

## 2. Decisiones de dominio propuestas para aprobación conjunta

### 2.1 Campos y valores

[OBSERVADO EN HTML] Se conservan las etiquetas del prototipo. Sus datos guardaban textos;
los identificadores snake_case siguientes son **diseño propuesto**, no literales recuperados.
En ambas categorías: subtipo obligatorio en el núcleo y detalle estricto
`{ gravedad_declarada, tamano }`, ambos obligatorios; detalle versión1.

| Basura: subtipo propuesto | Etiqueta del prototipo |
|---|---|
| microbasural | Microbasural |
| contenedor_desbordado | Contenedor desbordado |
| quema_basura | Quema de basura |
| escombros_via | Escombros en la vía |
| basura_canal | Basura en un canal |

| Basura: campo | Valores propuestos, en orden | Etiquetas, en el mismo orden |
|---|---|---|
| gravedad_declarada | bolsas_sueltas, acumulada_dias, ocupa_via, quema_o_desague | Unas bolsas sueltas; Se acumula hace días; Ocupa la vereda o la calle; Hay quema o tapa un desagüe |
| tamano | bolsas, carretilla, camioneta, camion_o_mas | Unas bolsas; Una carretilla; Una camioneta; Un camión o más |

| Áreas verdes: subtipo propuesto | Etiqueta del prototipo |
|---|---|
| parque_plaza_descuidada | Parque o plaza descuidada |
| juegos_infantiles_rotos | Juegos infantiles rotos |
| arbol_rama_peligrosa | Árbol caído o rama peligrosa |
| pasto_sin_riego | Pasto seco o sin riego |
| persona_situacion_calle | Persona en situación de calle |

| Áreas verdes: campo | Valores propuestos, en orden | Etiquetas, en el mismo orden |
|---|---|---|
| gravedad_declarada | descuidado, uso_limitado, riesgo, peligro_inmediato | Se ve descuidado; Ya no se puede usar bien; Es un riesgo para quien va; Peligro inmediato |
| tamano | rincon, media_plaza, casi_toda_plaza, toda_area_verde | Un rincón; Media plaza; Casi toda la plaza; Toda el área verde |

Rechazar claves adicionales, tipos/subtipos desconocidos y respuestas incompletas antes del
cupo. No incorporar antigüedad, caducidad, residuos peligrosos, personas afectadas ni otras
preguntas investigativas. La geometría sigue siendo Point, sin capa de parques, ADR0019/0020.

### 2.2 Severidad, radio y comportamiento común

[PROPUESTA LOCAL] En cada categoría nueva, severidad versión1 con la fórmula `sevNoAgua`
observada: índices g,t de0a3; puntaje auxiliar g+t+2; banda combinada crítica desde7,alta
desde5,media desde4,baja en otro caso; banda final al menos la gravedad declarada.

| Gravedad/tamaño | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| 1 | baja | baja | media | alta |
| 2 | media | media | alta | alta |
| 3 | alta | alta | alta | crítica |
| 4 | crítica | crítica | crítica | crítica |

Cada modelo tiene pruebas de sus16 combinaciones. Los puntajes no se comparan entre categorías.
Inundaciones y Baches conservan modelos/versiones actuales. Radio provisional de recurrencia
**10m en Basura y Áreas verdes**, validación municipal pendiente; dispositivo60m sin cambios.

Se conservan marca Mi Curichi, roles comunes, estados existentes, resolución manual con
motivo, publicación diferida, cuenta antes de reportar, foto opcional, cupos configurables
por categoría y fotos globales. No caducidad automática de basura ni cambio posterior de
categoría. Exportación CSV/GeoJSON conserva formato y deja las celdas de agua vacías para
las otras categorías; detalle JSON, nota y subtipo propios. Paleta/iconos ADR0022:

| Categoría | Icono | c7 / c5 / c1 |
|---|---|---|
| Basura | Trash2 | #6B3FA0 / #8462B8 / #F1EBF8 |
| Áreas verdes | Trees | #0F6E5C / #2E8B76 / #E1F2EE |

### 2.3 Avisos y Persona en situación de calle

[DECIDIDO,ADR0018] Persona se mantiene como subtipo de Áreas verdes, con gravedad/tamaño
y la misma fórmula. Aviso del prototipo:

> Esto no es una denuncia. Se deriva a Desarrollo Social para ofrecer ayuda, no a seguridad.
> No subas fotos donde se vea la cara de la persona.

Mostrar ese aviso al seleccionar el subtipo, en revisión y detalle; destino previsto
Desarrollo Social, y Parques y jardines para los demás subtipos de Áreas verdes. Los textos
no acreditan una integración ni entrega municipal automática. La implementación no enviará
mensajes a terceros. El formulario especializado envolverá el adaptador declarativo existente.

[LÍMITE CONFIRMADO] El HTML decía que el mapa no mostraba fotos de personas, pero renderizaba
la foto sin esa exclusión. No se afirmará que exista ocultación/difuminado. Para este entorno
local se conserva el comportamiento autorizado por ADR0018, usando personas/fotos sintéticas
en las pruebas. Visibilidad, fotos, moderación, retención y marco legal siguen como puerta
antes de producción. Ocultar o prohibir fotos no se introduce silenciosamente.

[PROPUESTA] Al seleccionar Quema de basura, mostrar un aviso informativo de que el reporte
no sustituye atención de emergencias; sin número nuevo ni escalamiento automático por subtipo.
También se implementa como envoltura pequeña del formulario declarativo.

## 3. Nueva instalación local

- Nombre fijo curichi_multitematica, PostgreSQL local existente. Comprobar capacidad de crear
  una base desde conexión exclusivamente a curichi_e2e; no conectar postgres,curichi ni
  curichi_revision. Es una comprobación pendiente, no un permiso de rol ya observado.
- Reusar el dueño y roles curichi_api/curichi_geo existentes, con credenciales de .env solo
  en memoria. No crear roles globales ni cambiar contraseñas/membresías. Separación por base,
  storage/origen/salida; compartir credenciales no promete aislamiento absoluto entre bases.
- Validar URL fija antes de construir clientes. Para cada job, comprobar identidad de
  conexión y current_database()=curichi_multitematica antes de invocar CLI existente con esa
  misma URL y entorno privado. Los CLI actuales no incorporan esa guarda internamente.
- Crear solo si el nombre está libre; si existe sin procedencia/estado reconocido, detenerse
  y conservar. Nunca borrar/recrear para sortear un fallo, ni repetir seed automáticamente.
- Reusar migrador hasta0021, cargar data/processed/DM_UV_MZ_2025 y después seed local. Así las
  capas reales preceden al seed; este solo aporta cuentas y ejemplos sintéticos etiquetados.
  No modificar originales data/raw ni regenerar procesados sin necesidad.
- Verificar ACL con el verificador existente apuntando a la nueva base. Activar bache,
  basura y area_verde en una transacción, con admin local, antes/después y auditoría; conservar
  inundacion activa. Solo en esta base nueva se autoriza ese estado persistente.
- Storage propio infra/.storage/multitematica/fotos. Origen propuesto127.0.0.2 y puertos
  web4000,API4001,geo4002,panel4100; comprobar disponibilidad. Origen distinto evita compartir
  cookies con localhost. Probar cámara/ubicación en ese loopback, sin cambiar CSP.
- Next usa salida propia .next-multitematica cuando el lanzador indica el modo; valor habitual
  por defecto intacto. Declarar CURICHI_INSTALACION_LOCAL en turbo.json. Si Next actualiza
  tipos generados, controlar las referencias en tsconfig.json/next-env.d.ts de cada app,
  conservando su uso habitual y cotejando los cambios; no introducir modificaciones silenciosas.
  Reenvíos API/geo ya son de runtime en src/proxy.ts.
- Runner pequeño de preparación y arranque en primer plano, con cierre de sus propios hijos
  al terminar/interrumpir y log redactado. No importar el arnés E2E como dependencia productiva,
  no duplicar sus90KB ni crear otro marco genérico. No descargas, instalaciones, cambios
  globales de entorno/energía/seguridad ni reconstrucción de Compose habitual.
- Detener conserva base,fotos y evidencias. Entregar comandos y URL de web/panel; dejar una
  forma reproducible de iniciar la instalación sin editar .env ni exponer claves.

## 4. Inventario explícito para la aprobación

N=nuevo,M=modificación acotada. Cada trabajador recibe una parte y su conjunto de rutas.
Fuera del inventario: documentar defecto y pedir ampliación con archivo,motivo y riesgo.

| Parte | Rutas | Cambio y control |
|---|---|---|
| P3 | N packages/contracts/src/categorias/basura/esquema.ts,severidad.ts,definicion.ts; N mismos tres en categorias/area_verde/ | Dos definiciones estrictas/modelos y políticas, sin clonar el núcleo |
| P3 | M packages/contracts/src/categorias/index.ts,package.json,CHANGELOG.md,README.md,openapi/openapi.yaml | Registro de cuatro, versión0.24.0, exports y generación reproducible |
| P3 | N packages/contracts/test/basura-severidad.test.ts,area-verde-severidad.test.ts,contrato-0-24.test.ts; M test/contrato-0-19.test.ts,bache-severidad.test.ts | Matrices, contratos/invariantes y expectativa de registro actualizada; en el test Bache solo nombre/expectativas del registro dos→cuatro, no su modelo |
| P3 | N services/api-core/test/m7-m8-categorias-reales.test.ts; M test/no-contaminacion-categoria.test.ts,README.md | Creación/lectura/cupos/exportación/privacidad de cuatro; ausencia de definición probada con registro inyectado |
| P4 | N packages/db/test/puntos-criticos-cuatro-categorias.test.ts; M services/geo-service/test/no-contaminacion-categoria.test.ts | Aislamiento/radios/caché con definiciones reales; sin fuente DB ni nueva migración |
| P1 | N apps/web-ciudadano/src/componentes/formulario-categorias/area-verde.tsx,area-verde.test.ts,basura.tsx,basura.test.ts; M registro.ts,adaptadores.test.ts en esa carpeta | Envolturas declarativas para avisos, mismos payload/validación/revisión |
| P1 | N apps/web-ciudadano/src/componentes/categorias/area-verde.tsx; M categorias/registro.ts,presentadores.test.ts | Detalle/aviso/destino de Persona sobre presentador genérico |
| P1 | N apps/web-ciudadano/src/lib/cuatro-categorias-reales.test.ts; M README.md,next.config.ts,tsconfig.json,next-env.d.ts del paquete | Flujo de cuatro y salida Next propia optativa; referencias generadas solo si Next las necesita |
| P2 | N apps/panel-admin/src/lib/avisos-categoria.ts,avisos-categoria.test.ts,cuatro-categorias-reales.test.ts; M lib/presentacion-reporte.ts,README.md,next.config.ts,tsconfig.json,next-env.d.ts | Avisos/destino y presentación/ficha/exportación; salida independiente y referencias generadas acotadas |
| P5 | N scripts/multitematica-local.mjs,scripts/multitematica-local.test.mjs,docs/operaciones/multitematica-local.md; M .gitignore,turbo.json | Preparar/arrancar solo destino fijo; negativos de destino y procesos propios; ignorar salida y declarar flag local |
| P5 | N e2e/playwright.cuatro-categorias.config.ts,e2e/tests/cuatro-categorias.local.ts | Casos desktop/móvil de instalación nueva, fuera de ejecución normal accidental; sin setup que migre bases habituales |
| P5 | M e2e/README.md; N docs/dominio/basura.md,areas-verdes.md y docs/decisiones/0025-cuatro-categorias-y-entrega-local.md; M docs/decisiones/README.md | Operación/dominio/decisión al aprobar, sin dar resultados por ejecutados |
| P5 | Documentos de esta corrida plan,linea-base,archivos,implementacion,verificacion,revision,informe; M docs/sdd/README.md,docs/README.md,README.md,docs/arquitectura/14-decisiones-m0-y-plan-m1.md,VentanaContexto.md | Evidencia y continuidad al avanzar; informe final solo con resultados |
| P5,protegidos | M AGENTS.md y CLAUDE.md únicamente §1,§4.8 y fila7§16 | Registrar cuatro definiciones0.24/instalación separada/estado real; aprobación específica incluida en este plan |

Las rutas abreviadas de una fila comparten el paquete/carpeta explícitos. Los dos tests nuevos
de wrappers se usarán con el sufijo/convenio existente del paquete, sin ampliar su contenido
funcional. No se cambian tipos HTTP fuera de contracts, esquema DB, roles, seeds, CLI existentes,
runner/config/helpers/specs E2E normales ni lanzador habitual. Cambios de expectativas antiguas
fuera de esta lista requieren ampliación; nunca convertir un fallo en PASS aflojando aserciones.

Complemento de inventario detectado en baseline: bache-severidad.test.ts:149 también fijaba
el registro de dos y ausencia de las otras definiciones. Actualizar únicamente esas expectativas
es mantenimiento directo del registro de cuatro ya aprobado, dentro de la carpeta contracts.
Se documenta antes de editar; no amplía decisiones de dominio, fórmula ni carpetas designadas.

## 5. Ejecución y aceptación

Plan→aprobación→reparto, agentes nativos con modelo heredado, un escritor por carpeta y un
pesado global. Principal coordina/documenta/revisa; no programa producto. P3 define0.24 primero;
después P1/P2 y comprobaciones P3/P4; P5 prepara instalación/E2E; F4/revisor/auditor independientes.

Antes de editar, guardar inventario/hashes del estado M6 sin commit, reset, clean ni stash.
Comprobar qué evidencia M6 puede reutilizarse por hashes; cada escritor ejecuta su paquete
antes/después. Conservar casos/estados de baseline y los intentos rojos. No reejecutar controles
verdes intactos por rutina. RAM1500 estáticos y2500 navegador con servicios vivos; concurrency1.

| CA | Evidencia necesaria para cerrar |
|---|---|
| 1 | Registro real cuatro,0.24,detalle/subtipo estrictos y32 combinaciones nuevas de severidad correctas; contrastes/iconos/notas |
| 2 | Inundaciones/Baches conservan casos,modelos y resultados; ninguna regresión pendiente |
| 3 | Persona conserva aviso,preguntas,destino previsto y comportamiento local; aviso Quema; pruebas del cambio de selección |
| 4 | Tipos/suites/build de consumidores y doble generación OpenAPI; lint cambiado/secretos/diff sin hallazgos nuevos; rojos ajenos documentados |
| 5 | Reportar/consultar/moderar/exportar las cuatro; rechazo de mezcla/valores inválidos antes de cupo, cupos por categoría y fotos globales |
| 6 | PIP municipal, grupos separados/radios propios y privacidad; cuatro categorías visibles tras activación solo en la base nueva |
| 7 | Instalación reproducible nueva,capas reales,ACL mínimas verificadas,storage/origen/salida propios; negativas sin conexiones/writes a destinos prohibidos |
| 8 | E2E desktop/móvil de selector,URL/preferencia/formulario/foto/detalle/panel/exportación; regresión M6 y fallo del mapa resueltos o bloqueo explícito, nunca omitido como PASS |
| 9 | Arranque/cierre propios y reinicio conservan datos; evidencias de que bases habituales no se conectaron/migraron; no afirmar aislamiento de credenciales absoluto |
| 10 | Revisión y auditoría independientes conformes,documentación sincronizada y entrega de URL/comandos/estado; sin commits/push/PR ni producción |

S3/PG reales que no se ejecuten se rotulan no verificados. No certificar lector de pantalla
real, funcionamiento habitual de Docker o pérdida de energía con pruebas estáticas.
M9 de escala1M y M10 de contracción conservan sus hitos separados del roadmap: esta entrega
funcional mantiene la compatibilidad existente; no exige borrar vista/columnas heredadas.

## 6. Aprobación requerida

Aprobar conjuntamente: §2(categorías/modelos/radio10m/avisos/comportamiento local),§3(instalación
nueva y activación persistente solo allí) y el inventario§4(incluidos ajustes acotados de ambos
manuales). El destino separado ya fue elegido; no se vuelve a preguntar esa preferencia.

Motivo: AGENTS§0.9 establece «Antes de programar: plan→aprobación→reparto» y§5.2 exige
autorización explícita para ampliar archivos. El alcance multitemático ya está aprobado;
esta aprobación cierra decisiones de dominio todavía abiertas y los archivos de la entrega.

No autoriza migrar curichi/curichi_revision,publicar o tomar decisiones municipales de
producción. Si el usuario ajusta un parámetro, actualizar este plan antes de programarlo.

### Ampliación puntual aprobada: expectativa histórica del registro en web

Usuario: «Sí, ajustar esa prueba y verificar», 2026-10-22. Autorización limitada al caso y
título descritos; mantener el fallo cerrado con registro inyectado y verificar.

La baseline de web tras cargar contracts0.24 conservó723 casos aprobados y falló uno:
`apps/web-ciudadano/src/lib/m6-bache-real.test.ts:407`. Tipos aprobados. Ese caso fija el
registro global a dos y afirma que Basura/Áreas verdes no tienen definición. Es incompatible
con las cuatro definiciones aprobadas, aunque sigue siendo válida la regla catálogo+registro.

Se propone modificar solo ese caso y su título: esperar cuatro definiciones canónicas,
aceptar Basura/Áreas verdes cuando el catálogo las habilita y conservar/probar el rechazo
mediante un registro inyectado sin dichas definiciones. No cambiar modelos, UI ni otros casos.
Riesgo: perder cobertura del fallo cerrado si se elimina la aserción de ausencia; se evita
manteniéndola con ese registro explícito y comprobando la suite completa. El archivo no estaba
en el inventario inicial; esta ampliación quedó aprobada según AGENTS§5.2.

### Ampliación puntual aprobada: expectativa histórica del registro en API

Usuario: «Sí, ajustar y verificar esa prueba», 2026-10-22. Incluye los imports necesarios
para comprobar las definiciones concretas, sin cambiar los demás casos.

La preparación de API encontró el mismo supuesto antiguo, por lectura aún sin ejecutarlo:
`services/api-core/test/m6-bache-real.test.ts:215–218` espera que Basura/Áreas verdes no
estén en el registro. Se propone cambiar solo el título y las dos expectativas de ausencia
por la identidad de sus definiciones reales, conservando la identidad de Baches y los demás
casos. No cambiar API, payloads, cuotas ni modelos. Riesgo: debilitar el control de registro;
se evita con igualdad a las definiciones concretas y suite completa antes/después. Este
archivo adicional quedó autorizado según AGENTS§5.2.

### Ajuste adicional aprobado en el caso de adaptadores de Baches

Usuario: «Sí, ajustar esa igualdad y verificar», 2026-10-22. Alcance limitado a la igualdad
de claves; Baches genérico y todas las demás aserciones se conservan.

El post de web encontró otra expectativa anterior en el mismo archivo ya autorizado:
`apps/web-ciudadano/src/lib/m6-bache-real.test.ts:210` exige que el único adaptador especial
sea Inundaciones. Basura/Áreas verdes ahora requieren las envolturas aprobadas de avisos.
Se propone cambiar únicamente esa igualdad para esperar los tres adaptadores registrados,
conservando la comprobación de que Baches usa el adaptador genérico y sus demás aserciones.
No cambia formularios ni validaciones. Riesgo: aceptar un registro incorrecto; se mantiene
la igualdad exacta de las tres claves y la ausencia de un componente especial de Baches.
Es otro caso distinto al 407; su ampliación ya quedó aprobada.
