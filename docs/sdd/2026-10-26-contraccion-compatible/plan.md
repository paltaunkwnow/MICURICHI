# M10.1 — Preparación compatible de la API

**Estado: cerrado en local el27/10, incluido RF-01 aprobado.** Ver[informe.md](informe.md):
562PASS/12SKIP,75/75del delta independiente,tipos/build/Biome0 y revisión conforme.
Aprobado el26/10 e iniciado el27/10 después de cerrarM9;no cierra M10 completo ni producción.
Respuesta explícita: «Sí, aprobar M10.1 después de M9». Incluye ocho archivos de API y
documentación enumerada, sin retiro físico/HTTP ni nuevas conexiones reales.
F0 preservado en `.turbo/m10-2026-10-26/f0/`:952archivos con huella, estadoGit/diff y74
copias de archivos API previos. Trabajador raíz nativo asignado al inventario; línea base
y cambios todavía sujetos a verificación. Baseline funcional:511PASS/12SKIP, tipos del grafo
yBiomeAPI exit0. La demo conserva los procesos/builds anteriores.

Reparto27/10: Feynman implementa los ocho archivos; Mencius revisa comportamiento y Dirac
audita privacidad/seguridad en sololectura, sin ejecuciones pesadas paralelas. Después del
freeze otro verificador nativo ejecutará los controles. Modelo heredado, sin override ni
alias de Claude: son agentes nativos disponibles, no nuevas sesiones visibles del usuario.
Parte3, carpeta designada
`services/api-core/`. Depende del cierre de la medición M9: cambiar sus SELECT antes de
terminar invalidaría las entradas de la comparación. El [inventario](inventario.md)
documenta las dependencias restantes de M10 en todas las partes.

## Objetivo

Leer el dominio de inundación desde`detalle`en la API, conservando exactamente ambas
formas de POST, las propiedades de respuesta actuales y las columnas CSV. Registrar
el uso de cada forma con etiquetas finitas y sin datos personales. Es el primer paso
verificable de la contracción; no se anuncia M10 completa al terminarlo.

El modelo todavía conserva columnas y sincronizador de0020. La escritura continúa
manteniéndolos: quitarlos ahora haría que el trigger sobrescribiera el JSON o rompería
seed/mantenimiento/respaldos. El cambio aquí propuesto no incluye migraciones ni DROP.

## Inventario exacto y motivos

| Archivo de services/api-core/ | Cambio y riesgo controlado |
|---|---|
| `src/vistas.ts` | Obtener los seis valores de inundación desde detalle en SELECT/proyección, manteniendo nombres, tipos y nullabilidad de las respuestas. Riesgo de confundir false/NULL/ausente: cubrir explícitamente |
| `src/rutas/reportes.ts` | Registrar únicamente forma reconocida y resultado aceptado/replay, sin payload/ubicación/autor/correo/IP/ID. Conservar validación, INSERT dual, idempotencia, cupos y auditoría |
| `test/vista-publica-vs-tecnica.test.ts` | Equivalencia de propiedades/privacidad al leer detalle; no reducir aserciones existentes |
| `test/reportes.test.ts` | Entrada plana/nueva equivalentes y registros de etiquetas finitas sin información sensible |
| `test/exportacion.test.ts` | Mismos encabezados y valores CSV/GeoJSON por categoría/Todas, incluyendo false y ausencias |
| `test/no-contaminacion-categoria.test.ts` | Otras categorías siguen sin fabricar campos de inundación |
| `test/m10-compatibilidad.test.ts` (nuevo) | Controles cruzados de lectura canónica, compatibilidad y exclusión de datos sensibles en instrumentación |
| `README.md` | Fuente de los datos y método para medir convivencia sin prometer ventana cerrada |

Documentación permitida: archivos de esta corrida (`plan`, `inventario`, `archivos`,
`linea-base`, `implementacion`, `verificacion`, `revision`, `informe`), raíz`VentanaContexto.md`,
índices de docs/sdd/docs y nota de avance en roadmap14§5. Evidencia en `.turbo/m10-2026-10-26/`.
No requiere editar AGENTS/CLAUDE, contracts, esquema, geo, apps, E2E, infra o dependencias.

## Metas y pruebas

**Ajuste del arnés dentro del inventarioM10.1,27/10:** los tres casos nuevos de exportación
booleano/NULL/ausente vuelven a exportar seis veces el dataset masivo acumulado por otro
grupo, aunque solo inspeccionan el reporte recién creado. En la reanudación dos excedieron
5000ms también en aislamiento. Se acotarán sus consultas a laUV del reporte, conservando
los selectores sin categoría/inundación/Todas y todas sus aserciones. El archivo
`test/exportacion.test.ts` ya está explícitamente aprobado arriba; no se modifica producción,
timeouts, skips ni los casos históricos masivos/de truncamiento. No es una ampliación de
archivos deRF-01 ni una optimización deAPI; es completar la verificaciónM10.1 autorizada.

| CA | Resultado verificable |
|---|---|
| 1 | Los SELECT/proyecciones de respuesta no dependen de las seis columnas físicas; el dominio viene de detalle. Los tipos públicos se mantienen |
| 2 | Para inundación, ambas entradas producen la misma respuesta/detalle/severidad/auditoría y demora; false, NULL y ausente conservan su semántica |
| 3 | Otras categorías mantienen sus campos y restricciones; sin categoría sigue siendo inundación; Todas sigue restringido al panel |
| 4 | CSV/GeoJSON y vistas pública/técnica/propia conservan campos, privacidad y valores, sin exponer atributos no públicos |
| 5 | Instrumentación de forma con valores finitos; pruebas demuestran ausencia de cuerpo, dispositivo, coordenadas, identidad, secretos y texto libre. El tráfico sintético se identifica por entorno de instalación controlado, nunca por un header confiado |
| 6 | Suite API, tipos, build y Biome sin regresiones frente a baseline; consumidores typecheck por grafo en serie. Revisiones independientes conformes |
| 7 | Informe y continuidad distinguen preparación de una ventana realmente cerrada; ninguna base protegida ni estructura borrada |

## Ejecución y reparto propuestos

1. PrincipalP5: F0/hashes, cambios ajenos declarados y línea base del API actual. Medir RAM;
   una sola ejecución pesada,`--concurrency=1`,1500MiB estáticos/SQL y2500MiB navegador.
2. Trabajador raízP3 sin override de modelo: pruebas previas, nuevos casos en rojo y cambio
   mínimo dentro del inventario; pruebas después. Un escritor, ningún commit.
3. Verificador/revisor/auditor independientes: comparar casos/resultados, revisar datos de
   instrumentación y equivalencia del contrato. Regresión bloquea el cierre.
4. Solo si las pruebas detectan necesidad de navegador, proponer el inventario concreto antes
   de cambiar E2E. No repetir toda la matriz intacta ni reconstruir la pila habitual.

Las pruebas usarán PGlite efímero y sus fixtures actuales. Esta aprobación no necesita
conexiones nuevas a PostgreSQL real ni migrar la demo. No conectar`curichi`,
`curichi_revision`o`postgres`;`curichi_e2e`no se modifica. La demo conserva datos y builds
hasta una actualización posterior planificada. Sin descargas, cambios persistentes o Git.

## Lo que seguirá pendiente de M10

Se preparará otro plan concreto para migrar seed/arneses, mantenimiento/ACL, respaldos/CI
y herramientas de banco; extraer acoplamientos de contracts si se retiran sus esquemas;
ensayar respaldo cifrado/restaurado y reversa multitemática; medir convivencia de clientes/PWA
y aprobar el retiro físico/HTTP correspondiente. No fijar una duración municipal inventada.
Una ventana sin tráfico representativo no cuenta como adopción y M9 SQL no la sustituye.

La reversa deberá reexpandir desde JSON sin perder otras categorías; la reversa0020 no sirve.
No se borrará la cuota antigua mientras mantenimiento/ACL dependan de ella. La aprobación
solicitada aquí cubre **solo M10.1**, no esas operaciones posteriores ni producción.

## Operación de continuidad de la demo

La solicitud previa del usuario de mantener la demo de cuatro categorías sigue vigente.
Tras la interrupción del límite de uso, la sesión44362 ya no existe y los cuatro puertos
quedaron libres; los PIDs históricos no identifican procesos actuales. Esta operación
se separa de las pruebas aisladasM10.1 y no amplía su inventario de producto.

Después de terminar la verificación independiente y liberar su turno pesado:

1. Comprobar memoria, puertos y procesos; no cerrar aplicaciones del usuario.
2. Conservar el lock obsoleto del launcher solo tras acreditar que su PID no está activo,
   mediante movimiento a evidencia dentro del workspace, sin borrar logs/cachés.
3. Ejecutar exclusivamente `node scripts/multitematica-local.mjs iniciar`, el runner ya
   autorizado para la instalación`curichi_multitematica`. Nunca`preparar`,seed,carga,migración,
   ni conexión a`curichi`,`curichi_revision`o`postgres`.
4. ComprobarHTTPready/web/panel/configuración y cuatro categorías, guardando metadatos;
   sin crear reportes de prueba ni afirmar que la suiteE2E se volvió a ejecutar.

El arranque cargará los compilados verificadosM10.1, sin retirar contratos ni estructuras.
Los datos de la instalación se conservan; el mantenimiento normal de la app sigue sus reglas.
Si falla una guarda, conservar evidencia y detener la operación; no saltarse límites,
cambiar la protección del equipo, tocar otras bases ni simular disponibilidad.

## Motivo de la aprobación

AGENTS.md§0.9 y§12.4 exigen plan→aprobación→reparto antes de programar;§5.2 limita los
archivos/carpetas. El plan aprobado M9 excluye expresamente ejecutar M10. Aprobar este
documento habilitaría el inventario anterior después de cerrar M9, sin nuevo permiso Git.
