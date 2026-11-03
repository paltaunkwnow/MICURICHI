# Cierre M10 — preparación de la última puerta operacional

**BORRADOR; no autoriza ni ejecuta operaciones.** El plan aprobado separa las pruebas
aisladas de esta puerta. Debe completarse con el release, comandos y revisión independiente
antes de solicitar la aprobación final. No equivale a una autorización de despliegue.

**Preparación del02/11:** el análisis concreto y manifiesto declarativo de dependencias
se conservaron en `.turbo/m10-cierre-2026-10-29/propuesta-operacional-20261101/`.
Verificó365archivos de la cápsula21, pero aún no acredita un release ejecutable completo.
Se preparan sus copias privadas y el adaptador/supervisor dentro de su continuación02/11,
sin conectarse a bases ni arrancar servicios. La aprobación de PR no autoriza estas operaciones.
Puertos propuestos: loopback `127.0.0.1`, web4200/API4201/geo4202/panel4300; su comprobación
anterior solo acreditó ausencia de escuchas en ese momento, no reserva ni disponibilidad futura.

## Resultado que debe demostrar

1. Restauración cifrada nueva de 19→22, 21→22 y 22→22, en bancos sintéticos nuevos.
2. Recuperación coordinada de código, dependencias, esquema y estado: 22→21→22, incluyendo
   reportes aceptados durante22. La cápsula de archivos dist21 sola no acredita un release21.
   La copia elegida para esta recuperación es `copia22`; las otras dos copias restauradas
   permanecen en22 y deben conservarse sin cambios. No se precrean copias para satisfacer
   una comprobación de identidad: ausencia y OID se acreditan según cada etapa real.
3. Solo después: actualización controlada de `curichi_multitematica`, preservación de datos,
   recorrido de14casos desktop/móvil y reinicio. No repetir preparación, seed o ETL de la demo.

## Destinos reservados propuestos

Servidor PostgreSQL loopback5432 ya instalado; identidad histórica esperada
`7688456033622585387`, que deberá comprobarse sin asumir que sigue siendo la misma.
Dueño existente `curichi`; roles de servicios existentes, sin alterar claves ni privilegios
globales. El nombre de un rol no autoriza conectar una base con el mismo nombre.

Corrida propuesta `cierre_20261029_01`; cada destino debe estar libre antes de crearse:

| Origen sintético nuevo | Copia nueva | Recorrido |
|---|---|---|
| `curichi_sdd_m10c_cierre_20261029_01_origen19` | `curichi_sdd_m10c_cierre_20261029_01_copia19` |19→22 |
| `curichi_sdd_m10c_cierre_20261029_01_origen21` | `curichi_sdd_m10c_cierre_20261029_01_copia21` |21→22 |
| `curichi_sdd_m10c_cierre_20261029_01_origen22` | `curichi_sdd_m10c_cierre_20261029_01_copia22` |22→22 y recuperación coordinada |

Una ocupación sin diario propio verificado aborta: no DROP, recreación ni sustitución.
Los seis bancos y sus resultados se conservarán. También se conservan intactos los bancos
M9/M10.3, las bases protegidas y el estado previo de la demo.
El bootstrap propuesto usaría `template1` exclusivamente para metadatos/creación, si se
autoriza expresamente; ninguna conexión a `curichi`, `curichi_revision` ni `postgres`.

## Condiciones que faltan antes de pedir aprobación

- Suites, tipos, builds y revisión/auditoría independientes del release22 terminadas.
- Manifiestos de código21 y22 con dependencias resueltas, entradas ejecutables y SHA;
  comprobar que el release21 no importa por accidente DBdist22 del checkout.
- Adaptador y comandos concretos del ensayo nuevo revisados, sin operador real por defecto.
  No reutilizar ni modificar los operadores históricos M9/M10.3 para aparentar un ensayo22.
- Directorios propios de evidencia, diario/checkpoints, dumps, cifrado y custodia de clave
  definidos. Ninguna clave en repo, argv, logs o chat; la clave efímera de un ensayo no
  demuestra custodia recuperable de un respaldo de producción.
- Inventario final de puertos/procesos propios y servicios que se pausarán; sin cerrar
  aplicaciones ajenas ni cambiar la configuración de memoria, seguridad o energía.
- Durante la ventana de recuperación21, impedir su limpieza histórica mediante el lock
  de mantenimiento4023 de la propia copia, con supervisión y prueba de pérdida de esa sesión.
  No depender de terminar antes de30segundos ni alterar la retención del producto antiguo.
- SQL de comparación íntegra: seis campos reconstruidos, JSON/versiones/categorías,
  columnas comunes, auxiliares, cuotas/archivo, geometrías, FK efectivas, índices y ACL.
  Mantener evidencia cruda del dump y evidencia lógica versionada separadas.
- Procedimiento de interrupción/reanudación y reversa con checkpoint comprobado antes de
  cada etapa; un resultado incierto se conserva y se investiga, no se repite automáticamente.
- Permiso separado y explícito para la pausa/actualización de la demo, con respaldo
  restaurado comprobado antes de migrarla y recuperación ensayada antes del cambio.

Hasta cumplir esas condiciones, no se conecta ninguna instalación ni se ejecuta un
respaldo, restauración, migración real, Docker, S3 o prueba E2E operacional por esta corrida.
La disponibilidad HTTP histórica y los14PASS del25/10 no sustituyen el nuevo recorrido.

## Límites de la entrega

Preparar para publicar después en `micurichi.lat`; **sin despliegue ahora**. El cierre
técnico local, la aprobación humana de Fase1 y la apertura de producción son resultados
distintos. Dominio del panel/VPS, fuente/licencia municipal, parámetros, privacidad de
Persona, custodia externa/fotos, revisión operativa y pruebas reales pendientes se registran
sin inventar conformidad. El retiro de compatibilidad HTTP continúa diferido (ADR0026).

Referencia: [plan aprobado](plan.md), [pruebas aisladas](protocolo-verificacion.md),
[interfaces](interfaces.md) y [guía de arranque](../../../ARRANCAR.md).
