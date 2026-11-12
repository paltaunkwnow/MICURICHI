# M10 — Inventario previo a la contracción

> **Actualización de estado del29/10 — M10.4 cerrado en local.**
> M9 y M10.1/RF-01/M10.2/M10.3 están cerrados en local; los estados de propuesta que
> siguen documentan aquella fecha, no el estado actual. [M10.4](../2026-10-28-consumidores-internos/informe.md)
> tiene sus21archivos aprobados e implementación verificada: seed/helper/bancoTS y bancos
> Node/SQLmanual/humoCI usan tabla física con filtro flood donde antes lo aportaba la vista;
> FK tipada de fotos corregida. Los alias de lectura API ya salen del JSON desde M10.1.
> La cuota antigua sigue en mantenimiento y ACL, con sus resúmenes; no se declara retirada.
> Vista/columnas/trigger/enums, escritura dual y compatibilidad HTTP permanecen.
> Gate independiente APTO: DB361, API562/12SKIP, Node19, tipos/formato y revisión conformes. Convivencia de clientes,
> autoridad JSON, cuota/reversa y contracción física/HTTP mantienen planes y puertas propios.
> No se deduce adopción de clientes a partir de las mediciones SQL o de ausencia de tráfico.

**Inventario histórico del26/10, revisado el27/10.** M9 ya terminó y M10.1 tiene aprobación
propia en[plan.md](plan.md). Esa aprobación cubre únicamente sus ocho archivos API y documentación;
las dependencias restantes de este inventario siguen siendo planificación, sin autorización
para eliminar objetos o romper HTTP.
Revisión estática independiente de Volta, actor`01a1796c-0dba-7673-9ddb-32f981bba5cb`,
sin PG/HTTP/Docker, suites o ediciones. Al efectuar aquella revisión M9 estaba pendiente y
todavía no existía el plan dedicado M10.1; sí las condiciones de ADR0011 y13.3§3.3–3.4.

## Objetos y consumidores vigentes

| Objeto o dependencia | Fuentes verificadas |
|---|---|
| Vista filtrada `reporte_inundacion`,security_invoker/CHECK OPTION | `packages/db/migraciones/0020_base_multicategoria.sql:249` |
| Seis columnas planas, cinco ENUM SQL, espejo Drizzle | `packages/db/src/esquema/index.ts:295`; espejo antiguo:199; FK de foto todavía apunta al espejo:342 |
| `detalle_inundacion` y sincronizador antes de INSERT/UPDATE | `0020_base_multicategoria.sql:97,221,240`; el trigger sobrescribe JSON inundación y fija detalle_version1 |
| CHECK ligados a columnas | `0020_base_multicategoria.sql:183,189`; conservar JSON objeto/tope8192 de151/156 |
| Seed actual por vista/columnas | `packages/db/src/seeds/samples.ts:190,231,279,282` |
| Escritura API con seis planos y detalle | `services/api-core/src/rutas/reportes.ts:313,335,372` |
| SELECT y respuestas API aún desde planos | `services/api-core/src/vistas.ts:54,84,189,241` |
| CSV plano y GeoJSON técnico | `services/api-core/src/rutas/admin.ts:296,325` |
| POST antiguo y normalizador de ambas formas | `packages/contracts/src/esquemas/reporte.ts:121,224,255` |
| Respuestas aditivas opcionales y OpenAPI | `reporte.ts:291,335,359,396`; `src/openapi.ts:51,167` |
| Detalle de inundación derivado del esquema plano | `packages/contracts/src/categorias/inundacion/esquema.ts:16` |
| Panel todavía consume planos | `TablaReportes.tsx:164`, `ReporteUnitarioModal.tsx:121,437`, `FactoresSeveridad.tsx:21`, `lib/presentacion-reporte.ts:51` |
| Web conserva fallback plano y tipos internos | `categorias/inundacion.tsx:32`, `lib/formato.ts:20`, `lib/formulario-reporte.ts:39,276`; envío real nuevo en440 |
| Cuota antigua aún usada por mantenimiento | `packages/db/src/mantenimiento.ts:90`; API consume resumen en `src/mantenimiento.ts:132` |
| ACL todavía exige cuota antigua | `packages/db/src/cli/matriz-privilegios.mjs:37,58`; prueba:48 |
| Restauración cuenta solo inundaciones | `scripts/respaldo.mjs:246–249`; índices contempla ambos nombres:258 |
| Respaldo operativo exige nombre antiguo | `infra/respaldo/respaldo.sh:256,460` |
| Humo de CI por vista | `.github/workflows/ci.yml:305,312,317` |
| Bancos existentes por vista/planos | `scripts/banco-datos.mjs:75,146,184,203`; `banco-consultas.mjs:36,44,67,105,130`; `packages/db/banco-puntos-criticos.ts:30,55` |
| SQL manual, uso efectivo no comprobado | `scripts/sembrar-30-puntos.sql:4,19` |

Las rutas abreviadas de web/panel son relativas a sus respectivos directorios`src/`.
Las migraciones0001–0021 y sus reversas se conservan como transiciones históricas.
No hacer reemplazo global de`reporte_inundacion`por`reporte`: ampliaría DELETE y conteos
a otras categorías. Distinguir ENUM SQL prescindible de enums TypeScript todavía necesarios
para las preguntas y validaciones dentro de`detalle`.

## Pruebas que requieren clasificación antes de editar

No basta el nombre`migracion-*`para considerarlas aisladas: algunos casos migran hasta la
última versión y consumen seed/mantenimiento/espejos actuales. Revisar especialmente:

- DB:`migracion-0014-cuota-diaria.test.ts:222,242,328`, `migracion-0015-publicacion.test.ts:403,431`,
  `migracion-0020-base-multicategoria.test.ts:195,497`, `esquema-drizzle.test.ts:100,116` y
  `src/test-utils.ts:98,115`.
- API:`test/ayudas.ts:49`, `moderacion.test.ts:135`, `exportacion.test.ts:86` y pruebas de vistas.
- Geo:`plan-agregados.test.ts:27`, `geo-service.test.ts:221`, `huella-y-cifras.test.ts:356`.
- E2E:`tests/ayudas.ts:143`genera POST plano y`quitar-campos-panel.spec.ts:29`lo modifica;
  `scripts/banco-concurrencia.mjs:28`también genera esa forma. Su ejecución no se comprobó.

Las aserciones históricas se fijarán a su versión; las de comportamiento actual se migrarán
sin perder cobertura. La reversa0020 aborta con otras categorías y no sirve como reversa M10.

## Secuencia recomendada y puertas pendientes

1. Preparación compatible: lecturas internas desde detalle conservando entradas/respuestas/CSV;
   inicialmente escritura dual y trigger. Instrumentar forma aceptada con etiquetas finitas,
   sin cuerpo, GPS, correo, identidad o secretos. Actualizar herramientas por alcance explícito.
2. Ventana de convivencia medida: duración/cobertura/criterio por aprobar, clientes/PWA viejas
   contemplados. Cero POST planos sin tráfico representativo no acredita abandono; tampoco
   demuestra que nadie lee propiedades planas de GET. SQL de1M no sustituye esta evidencia.
3. Retiro HTTP: versión nueva y retiro de forma/propiedades/CSV solo con plan y aceptación
   específicos tras la ventana. Sin categoría sigue significando inundación; Todas solo panel.
4. Contracción física: respaldo cifrado/restaurado, ensayo multitemático, reversa nueva y ACL;
   retiro ordenado sin CASCADE y sin tocar bases protegidas. M10 debe mantener los datos de
   las cuatro categorías, fotos, auditoría, puntos críticos y cupos nuevos.

Para reexpandir, reconstruir columnas/ENUM desde JSON solo para inundación, NULL en las otras,
reponer vista/funciones/trigger/ACL y comprobar detalle_version antes de imponer1. Los datos
históricos de`cuota_reporte_diaria`no pueden deducirse fielmente del contador nuevo: preservar
su copia si la reversa promete igualdad exacta. Nunca eliminar`cupo_contador`para volver atrás.

M10.1 convirtió el primer paso en un plan aprobado. Los pasos siguientes todavía requieren
inventarios concretos y aprobación§0.9/§5.2. La funcionalidad local de cuatro categorías
no depende de ejecutar los DROP.

## Bloque aprobado M10.2: respaldos multitemáticos sin contracción

**Aprobada por el usuario el27/10: «Aprobar ambos bloques, en orden».** Ejecutar después
de corregir/verificarRF-01. Todavía no implementada. La aprobación cubre el inventario
y las pruebas aisladas que siguen; no autoriza restauraciones reales ni retiro de estructuras.
Parte5: reparar la verificación de respaldos antes de ensayar cualquier retiro de estructuras.
La inspección del27/10 confirmó dos problemas actuales: el simulacro Node solo cuenta la
vista de Inundaciones; el shell exige que el dump contenga datos de esa vista, que desde0020
es una vista sin datos propios. Además la guarda de destino vacío del shell solo mira esa
vista y usuarios: debe detectar reportes de cualquier categoría.

Inventario propuesto, con cambios limitados a estos archivos:

| Archivo | Cambio y riesgo controlado |
|---|---|
| `scripts/respaldo.mjs` | Verificar tabla física según versión respaldada, todas las categorías, conteos y contenido; conservar compatibilidad con respaldos anteriores a0020. Separar importación/pruebas de la ejecuciónCLI. Riesgo: validar un respaldo incompleto o ejecutar un proceso por importar; probar negativos |
| `scripts/respaldo.test.mjs` (nuevo) | Pruebas con ejecutor simulado de comandos/SQL, esquemas anteriores/actuales, pérdida exclusiva de otra categoría, geometrías inválidas, nombre de destino y errores de herramientas. Ninguna conexión real ni borrado |
| `infra/respaldo/respaldo.sh` | Reconocer la tabla física correcta en el manifiesto y comprobar todas las filas del destino; no tratar una vista como tabla de datos. Rechazar manifiestos incompletos, sin relajar cifrado/integridad ni imprimir credenciales |
| `infra/respaldo/respaldo.test.sh` (nuevo) | Arnés aislado con comandos simulados para dump/manifiesto/restauración; impedir acceso a red/DB/S3 en las pruebas. No usar las carpetas de trabajo operativas |
| `.github/workflows/ci.yml` | Añadir estos controles al trabajo existente de scripts/respaldos; mantener el simulacro real existente de CI. No disparar CI ni publicar desde esta tarea |
| `docs/operaciones/respaldo-y-restauracion.md` | Documentar compatibilidad por migración, comprobación multitemática, límites de simulaciones y ensayo real pendiente |

Documentación de la corrida siguiente, índices, roadmap14§5 yVentanaContexto también formarían
parte del inventario al aprobarlo. No autoriza editar AGENTS/CLAUDE, contratos, esquema,
consumidores, ETL, dependencias o datos. No instala herramientas; si falta bash/shellcheck,
la comprobación correspondiente queda pendiente y se propone un medio disponible.

Metas verificables: baseline antes; pruebas nuevas en rojo contra el comportamiento actual;
verde después y comparación test por test; diferencias de cualquier categoría impiden dar
un simulacro por bueno; dump previo a0020 continúa reconocido; destino con reportes no
inundación se rechaza; mensajes no filtran secretos; sintaxis Node/bash, Biome y shellcheck
si están disponibles; revisión funcional y auditoría independientes.

Esta propuesta **solo permite pruebas aisladas con procesos/SQL simulados**. No ejecutar
`respaldar`, `restaurar`, `simulacro`, Docker, S3 ni conectar PostgreSQL real como parte de
M10.2. El ensayo cifrado/restaurado real requerirá después un plan de origen/destino nuevo,
credenciales y conectividad administrativa expresamente aprobados; no se usará ninguna
base protegida, no se descartarán bancos existentes ni se probará sobre la demo.
Un mock verde no acredita un respaldo real restaurado y no abre la puerta de contracción.

Después seguirían: migrar consumidores internos (seed, pruebas, mantenimiento/ACL y bancos),
definir/medir convivencia de clientes y PWA, ensayar respaldo/reversa multitemática y recién
proponer el retiro físico/HTTP. No se fija una duración de adopción sin decisión del usuario.

## Ampliación aprobada RF-01: replay cruzado con causa omitida

**Aprobada por el usuario el27/10: «Aprobar ambos bloques, en orden».** Prioridad anterior
aM10.2; ejecución por iniciar. No volver a pedir esta aprobación. La revisión independiente
identificó un comportamiento heredado deF0 en`rutas/reportes.ts`: la huella usa el detalle
recibido, mientras la escritura usa el detalle ya validado con sus defaults. Al omitir
`causa_presunta` en Inundaciones, la forma plana normaliza`desconocida` antes de la huella;
la forma por categoría la agrega después. El reintento cruzado puede409 aunque ambos
cuerpos signifiquen lo mismo. El verificador lo reprodujo el27/10 en ambas direcciones:
201 seguido de409, con un solo reporte/cupo/auditoría/clave y fixtures cerradas. Evidencia
`.turbo/m10-2026-10-26/verificador/rf01.json`, exit0`RF01_REPRODUCIDO`.
La ejecución fue sobre M10.1 congelado; la atribución aF0 es comparación estática, no otra
ejecución del código antiguo.
No se presenta como regresión de la lecturaJSON o de los nuevos logs.

Parte3, carpeta designada`services/api-core/`. Inventario acotado:

| Archivo | Cambio y riesgo |
|---|---|
| `src/rutas/reportes.ts` | Calcular huella desde el detalle validado; para inundación con causa`desconocida`, reconocer también la variante histórica que omitió solo ese default. Conservar transacción, bloqueo, vencimiento24h, separación de cuentas/categorías y exclusión del dispositivo. Riesgo: rechazar claves vigentes antiguas o aceptar contenido distinto |
| `test/m10-compatibilidad.test.ts` | Casos en ambas direcciones con default omitido/expreso, claves creadas antes del fix y negativos con causa real distinta, descripción/coordenada/categoría cambiadas. Verificar un solo reporte/cupo/auditoría y eventos de replay |
| `README.md` | Documentar la compatibilidad de huellas y la diferencia entre omisión del default y cambio real del contenido |

Documentación de la corrida, índices/roadmap yVentanaContexto en su alcance ya declarado.
No modifica`idempotencia.ts`, contratos, esquema, datos existentes, clientes o infraestructura.
Si la implementación exige otro archivo o demuestra más defaults de los previstos, se
presenta el delta concreto antes de ampliarlo; no generalizar ignorando campos arbitrarios.

Diseño propuesto: nueva huella canónica; solo si hay conflicto y el detalle válido de
inundación tiene causa`desconocida`, intentar la única huella histórica compatible que
omite esa clave. El helper transaccional existente mantiene el bloqueo; no se borran ni
reescriben filas vigentes para forzar el replay. Un cambio real debe seguir respondiendo409.
Los casos de caducidad, cuentas distintas y claves huérfanas conservan sus reglas.
Esto requiere demostrar por pruebas la compatibilidad de las claves previas, no solo
probar las creadas por el código nuevo.

Orden: confirmar reproducción; baseline actual535PASS/12SKIP y8huellas; casos nuevos en
rojo; fix mínimo por trabajador raíz; suite/tipos/build/Biome y revisión/auditoría/verificación
independientes del delta. Únicamente PGlite/fixtures, sin PGreal, demo, descargas o Git.
No abre la ventana de adopción ni autoriza retirar estructuras. AGENTS§0.10 impide arreglar
de pasada lo preexistente; la aprobación explícita anterior habilita esta ampliación concreta.
