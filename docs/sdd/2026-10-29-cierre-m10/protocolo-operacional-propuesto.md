# Cierre M10 — preparación de la última puerta operacional

**Estado vigente del 09/11.** El ensayo R4 de otra sesión completó 24 de 24 etapas.
La revisión independiente posterior acreditó la cadena, siete altas conservadas
tras la reversa y reaplicación y la conservación de otras copias. Los límites de
custodia y de las pruebas están en el [informe](informe.md). El siguiente paso es
la [actualización de la demo](#preparación-de-la-actualización-de-la-demo).
Las secciones R2 y R3 siguientes conservan el historial de esos intentos.

**Preparación aprobada por revisión independiente el 05/11/2026. Ensayo autorizado
por el usuario el 06/11/2026 y ejecutado con 15 de 24 etapas verificadas.** La candidata R2 y la comprobación de la
puerta corresponden al mismo sello de 108 entradas. La candidata anterior se
conserva con su dictamen no conforme. Ver [continuación y evidencias](continuacion-20261104.md).

R2 llegó a esquema 22 en las tres copias y registró cinco altas con sus reintentos.
La comprobación posterior `probarPostReplay22` quedó incierta por
`POST_REPORTE_SEMANTICA`. El operador confirmó su cierre y conservó los bancos,
respaldos y diario. Este protocolo identifica el ensayo ya ejecutado y su alcance.

**Cambio del04/11:** la revisión del delta posterior encontró una reanudación sin
conciliación suficiente. Se retira esa vía y se prepara un intento nuevo separado,
`cierre_20261104_02`. El resultado anterior `completado:false`, sus diarios, cifrados y
bancos permanecen conservados. Esta propuesta no adopta ni repite la etapa incierta.
Una carpeta de ejecución previa o un resultado existente bloquean antes de leer
credenciales. Tras validar el permiso, un nombre de base ocupado bloquea en el
preflight de metadatos antes de crear o mutar destinos.
La preparación usa evidencias del intento nuevo. Ver [continuación](continuacion-20261104.md).

**Código verificado.** El corte del 03/11 registró 1634 aprobadas, cero fallos y
12 omisiones históricas, con tipos, builds y formato del delta aprobados. La revisión
del 05/11 confirmó 431 pruebas de base y 56 de respaldo para las fuentes corregidas.
La candidata revisada está en
`.turbo/m10-cierre-2026-10-29/propuesta-operacional-20261101/continuacion-20261105-r2/`.
Se materializaron los releases 21 y 22 y se resolvieron sus dependencias en esta
máquina. El freeze 22 cotejó 399 archivos. La comprobación independiente cargó las
dos aplicaciones compiladas y sus configuraciones en ambos releases, sin escucha
HTTP. La prueba GPG recuperó bytes sintéticos y el lanzador transfirió bytes por FD 3.
Los 114 casos privados aprobados corresponden a la preparación aislada del ensayo.
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

Corrida propuesta `cierre_20261104_02`; cada destino debe estar libre antes de crearse:

| Origen sintético nuevo | Copia nueva | Recorrido |
|---|---|---|
| `curichi_sdd_m10c_cierre_20261104_02_origen19` | `curichi_sdd_m10c_cierre_20261104_02_copia19` |19→22 |
| `curichi_sdd_m10c_cierre_20261104_02_origen21` | `curichi_sdd_m10c_cierre_20261104_02_copia21` |21→22 |
| `curichi_sdd_m10c_cierre_20261104_02_origen22` | `curichi_sdd_m10c_cierre_20261104_02_copia22` |22→22 y recuperación coordinada |

Una ocupación sin diario propio verificado aborta: no DROP, recreación ni sustitución.
Los seis bancos y sus resultados se conservarán. También se conservan intactos los bancos
M9/M10.3, las bases protegidas y el estado previo de la demo.
El bootstrap propuesto usaría `template1` exclusivamente para metadatos/creación, si se
autoriza expresamente; ninguna conexión a `curichi`, `curichi_revision` ni `postgres`.

## Candidata y ejecución propuesta

- Sello R2 SHA256 `9f6be9d84b3a7c6cb43558b0b37dfaee2c7cae8a0740686b3a8507eeb2bc7fdb`.
- Plan canónico SHA256 `363bc756f3b26278ab4402cb9907c9e0dc96cc5fd47305ceec70f3a4d4dfbc48`.
- Dictamen independiente SHA256 `514c720247850a5f6faa38ad8b03a8306fa0cde4c89d68aadaf2c519bcdd9d3b`.
- La comprobación de puerta previa aprobó. El recibo de ejemplo recibió
  `SIN_AUTORIZACION_OPERACIONAL_VIGENTE`. R2 ya tiene directorio de ejecución y diario.

El 06/11 se emitió y validó el recibo ligado al plan, sello, seis bancos y 24
etapas, con vencimiento a las 16:27 de La Paz. Docker informó PostgreSQL saludable
en `127.0.0.1:5432` y la comprobación del equipo halló libres los cuatro puertos del
ensayo. La consola del lanzador se abrió a las 12:27 de La Paz para las claves.
Este fue el comando desde la raíz:

```powershell
$ensayo = Join-Path $PWD '.turbo/m10-cierre-2026-10-29/propuesta-operacional-20261101/continuacion-20261105-r2'
pwsh -NoProfile -File (Join-Path $ensayo 'ejecutar-ensayo.ps1') -Permiso $reciboAutorizado
```

`$reciboAutorizado` es la ruta al recibo emitido tras la aprobación, sin credenciales.
El lanzador verifica la puerta antes de pedir las claves existentes de los tres roles
y la frase GPG por la consola local. Usa el contenedor existente `curichi-postgis`
para las herramientas de PostgreSQL. La comprobación real de identidad del servidor,
ocupación, puertos y memoria corresponde al preflight del día del ensayo.

## Controles durante el ensayo y después

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

La autorización solicitada cubre solo el ensayo descrito en los seis destinos nuevos.
La actualización de la demo se presentará aparte, tras comprobar las restauraciones y
la reversa. El último esquema verificado de la demo es 21 y sus 14 casos del 25/10 son
evidencia histórica.

## Siguiente intento propuesto, R3

La candidata `continuacion-20261106-r3` corrige la comparación de `publicar_en` y
la captura de geometría. Pasaron 121 pruebas del operador, incluidas dos con las API
compiladas y PostGIS efímero en esquemas 21 y 22. La carga aislada independiente
aprobó. La revisión de los 79 archivos sellados fue conforme y la comprobación de
la puerta rechazó el permiso de ejemplo con la preparación íntegra. El usuario
autorizó R3 el 06/11 para los seis destinos de esta sección. El recibo válido liga
las 24 etapas a ese plan y sello, y vence a las 17:13 de La Paz. El contenedor
estaba saludable en loopback y los cuatro puertos libres al abrir el lanzador
a las 13:14. El lanzador salió con código 1 a las 13:17. R3 conservó seis altas de
banco, tres cifrados y 12 de 24 etapas verificadas, hasta `cargar22`. El proceso
terminó antes de guardar `resultado.json`. El agente GPG residual propio se cerró
tras verificar su identidad. Se conserva íntegro el intento para el diagnóstico.

- Sello SHA256 `b0abb8eb248c6182c299e3992a33c06956cbdffa817df4b662ef1a8dd8109f51`.
- Plan canónico SHA256 `711233520f062b0edf986627d003ce442ad6a7b9377c2b1170e0aa114d847b9b`.
- Dictamen SHA256 `ef04dbdb8902b85718484e736830955ecce8225a4e2975c4f5454bab3fdab37e`.

La corrida propuesta `cierre_20261106_03` conserva el alcance de R2 y reserva seis
destinos distintos:

| Origen sintético nuevo | Copia nueva | Recorrido |
| --- | --- | --- |
| `curichi_sdd_m10c_cierre_20261106_03_origen19` | `curichi_sdd_m10c_cierre_20261106_03_copia19` | 19→22 |
| `curichi_sdd_m10c_cierre_20261106_03_origen21` | `curichi_sdd_m10c_cierre_20261106_03_copia21` | 21→22 |
| `curichi_sdd_m10c_cierre_20261106_03_origen22` | `curichi_sdd_m10c_cierre_20261106_03_copia22` | 22→22 y recuperación 22→21→22 |

R3 conserva los bancos y la evidencia de R2. El recibo propio se emitió tras la
aprobación del usuario para estos seis destinos y el sello revisado.

Con ese recibo, la consola local pedirá las claves y la frase GPG. El lanzador se
encuentra en `.turbo/m10-cierre-2026-10-29/propuesta-operacional-20261101/continuacion-20261106-r3/ejecutar-ensayo.ps1`.
Se conserva el preflight de R2, incluida la conexión a `template1` para metadatos y
creación de los seis destinos. La demo se aprueba aparte.

## Límites de la entrega

Preparar para publicar después en `micurichi.lat`; **sin despliegue ahora**. El cierre
técnico local, la aprobación humana de Fase1 y la apertura de producción son resultados
distintos. Dominio del panel/VPS, fuente/licencia municipal, parámetros, privacidad de
Persona, custodia externa/fotos, revisión operativa y pruebas reales pendientes se registran
sin inventar conformidad. El retiro de compatibilidad HTTP continúa diferido (ADR0026).

Referencia: [plan aprobado](plan.md), [pruebas aisladas](protocolo-verificacion.md),
[interfaces](interfaces.md) y [guía de arranque](../../../ARRANCAR.md).

## Preparación de la actualización de la demo

El siguiente paso local es actualizar la instalación existente `curichi_multitematica`
desde 21 a 22. Su estado archivado sigue `active`, OID esperado `181316`, sin estado
M10. La operación deberá comprobar esos datos antes de modificarla. El ensayo R4
completo recibió confirmación independiente el 09/11, con los límites de custodia
detallados en el informe. Esta sección prepara la operación de
demo que se presentará con su adaptador probado y sus archivos concretos.

El adaptador privado se preparará en
`.turbo/m10-cierre-2026-10-29/propuesta-operacional-20261101/demo-20261109/` y usará
las interfaces `updateInstallation` y `recoverInstallation` del código aprobado.
Su construcción y pruebas aisladas forman parte del cierre de M10 aprobado. La
operación sobre la demo mantiene su aprobación específica posterior.

1. Validar release 21 y 22, identidad de servidor y demo, estado archivado, capas,
   categorías, memoria y espacio. Archivar la preimagen del estado antes de llamar
   al actualizador. Identificar y pausar los procesos propios durante `preflight21`
   y comprobar que no quedan escritores. Un proceso desconocido bloquea la operación.
2. Capturar el estado y la huella de los datos de la demo. Mantener el lock de
   mantenimiento de su propia base durante la ventana controlada.
3. Cifrar un respaldo nuevo de la demo en 21 con frase bajo custodia del operador.
   Restaurarlo en `curichi_sdd_m10c_demo_20261109_copia21`, que deberá estar libre,
   y cotejarlo antes de migrar la demo. Conservar el destino y los cifrados.
4. Migrar la demo a 22 con consentimiento explícito y comparar equivalencia de
   reportes, cuotas, auditoría, fotos, capas y permisos. Guardar cada checkpoint.
5. Seleccionar el release 22 verificado y reconciliar el estado de la instalación.
   Ante una etapa incierta, conservar el diario y los datos para diagnóstico.
6. Arrancar web, panel, API y geo con los puertos locales de la demo. Ejecutar las
   14 pruebas desktop/móvil y registrar los datos sintéticos que agreguen.
7. Reiniciar los servicios propios y cotejar que conserva datos, esquema y estado.
   Solo después registrar el cierre M10 y preparar el PR solicitado.

La actualización usará la demo y la copia nueva enumeradas. El bootstrap de creación
se limita a metadatos en `template1`. El inventario operativo identificará la frase
GPG bajo custodia local, los cuatro servicios, el archivo de estado y las evidencias;
las claves se introducirán mediante el canal privado del lanzador.

El checkpoint `pausar21` posterior al respaldo vuelve a comprobar la pausa ya
realizada. El arranque normal conserva su guarda de esquema 22. Una recuperación
explícita a 21 debe seleccionar sus servicios compatibles desde el adaptador.
La URL bootstrap de `updateInstallation` conserva su contrato de validación y no
se utiliza para abrir una conexión a `curichi_e2e`.

### Inventario del adaptador en preparación, 10/11

La entrada es `demo.mjs`; `adaptador.mjs` conecta las etapas aprobadas con
`primitivas.mjs`, `procesos.mjs` y `servicios.mjs`. `permiso.mjs` debe comprobar
el inventario de fuentes, el runtime y el dictamen independiente antes de reclamar
un intento. El lanzador `ejecutar-demo.ps1` usa PowerShell 7 y transporta las claves
por pipe hacia `lanzar.mjs` y FD 3 del operador. Su revisión y sus pruebas siguen
en curso: esta enumeración no constituye una autorización de ejecución.

El protocolo de la demo incluirá la lectura local de una lista cerrada de configuración
existente: `CIUDAD_NOMBRE`, `CIUDAD_PAIS`, `CIUDAD_LOCALE`, `CIUDAD_CENTRO_LON`,
`CIUDAD_CENTRO_LAT`, `CIUDAD_ZOOM_INICIAL`, `ZONA_HORARIA`, `CRS_METRICO_EPSG`,
`IP_HASH_SAL` y `JITTER_SAL`. Se conservarán sus valores, sin rotar las sales en cada
arranque. El lanzador los seleccionará en memoria desde `.env` únicamente después
de aprobarse esta operación; no imprimirá ni guardará sus valores y no transmitirá
el entorno completo a los servicios. La construcción y las pruebas actuales usan
archivos sintéticos y no leen ese archivo local.

Las tres claves de roles y la frase GPG se introducirán en la consola local. La
frase deberá quedar bajo custodia del operador para recuperar el cifrado conservado;
una frase aleatoria perdida al terminar el proceso no satisface este requisito.
El resultado se separará en actualización, primer arranque y reinicio, cada uno con
su evidencia propia. Una migración incierta no se repite automáticamente.

Antes de solicitar la autorización final deberán estar fijados los hashes de las
fuentes y herramientas, las pruebas aisladas, la compatibilidad de los frontends
con los releases 21/22 y el dictamen independiente. La operación real sigue pendiente.

El 10/11, Archimedes preparó el cotejo independiente de compatibilidad HTTP y
los builds existentes: 641 archivos de web/panel y 121 archivos de contracts
idénticos entre ambos releases y el workspace. La evidencia y sus límites están en
`correcciones-20261104/revision-demo-20261110/compatibilidad-informe.md`, bajo el
scratch de M10. Es una revisión estática de los bytes y del intercambio conservado;
no constituye una ejecución nueva de Next ni sustituye las 14 E2E posteriores.
### Candidato para la operación local del 11/11

El inventario de 30 archivos tiene SHA256
`f1b79bf4adc11a362312a6bfc9e91ef167f3e77a7bd1bc50f737165000d134bd`.
El runtime tiene SHA256
`692fd158971d22c9ab5bd9147c28b5c6dc40491f39c4db47daade4cf01fec06d`.
PowerShell 7 cambió de ruta y conserva el hash del ejecutable. El preflight
comprueba ambos builds y la identidad del Next instalado antes de migrar.
Las capturas `controles/relevo-20261111-*` acreditan 20/20 casos del adaptador,
36/36 de guardas, 3/3 de PowerShell, 4/4 de FD 3 y los dos builds 21/22 con
rechazo del caso de Next divergente. La revisión independiente detectó que
PowerShell iniciaba Node antes de validarlo. El ajuste final coteja el SHA del
runtime recibido desde el protocolo y luego comprueba ruta y SHA de Node antes
del primer proceso. `controles/relevo-20261111-pre-node` acredita 6/6 con datos
sintéticos, incluidos tres rechazos antes de iniciar Node. La revisión
independiente de Kuhn confirmó el ajuste y emitió dictamen apto. Su archivo
`revision-independiente.json` tiene SHA256
`b8f540d37ec53dd4e4efa3da327735b3dfbaa883a000092c443684c191a472fe`. La inspección confirmó
los tres artefactos requeridos. El permiso de ejemplo fue rechazado por Node
con `SIN_APROBACION_DEMO_VIGENTE` y por PowerShell antes de pedir claves. Todos
los procesos de control terminaron. Queda la aprobación operacional de la demo.

Tras la aprobación operacional, el coordinador emitirá un recibo vigente ligado
a estos hashes y al dictamen independiente. Su alcance es una actualización y
dos ventanas `iniciar22`. Cada ventana se abre con PowerShell 7 y
`ejecutar-demo.ps1 -Accion <actualizar|iniciar22> -Permiso <recibo> -RuntimeSha256 <sha-del-runtime-aprobado> -ConfiguracionLocal`.
La consola pedirá las claves de PostgreSQL. La frase GPG se pedirá durante
`actualizar` y se conserva bajo custodia del operador. Una recuperación real
requeriría su propio permiso y parte del estado acreditado por el operador.

Cuando termine `actualizar`, comprobar `intentos/actualizar/ejecucion/resultado.json`
y los siete checkpoints. El primer arranque deberá responder en los puertos
4000, 4001, 4002 y 4100 de `127.0.0.2`. Ejecutar una vez la configuración
`e2e/playwright.cuatro-categorias.config.ts` con las cuentas sintéticas técnico,
ejecutivo y admin, destino explícito `curichi_multitematica`, identificador de
corrida nuevo, un trabajador y Chromium ya instalado. Pasar las variables sólo
al proceso de Playwright. Conservar su JSON y exigir 14 casos aprobados,
siete por proyecto, sin omisiones.

Tras el recorrido, obtener los ocho reportes sintéticos de esa corrida de las
listas públicas por categoría. La descripción empieza con
`Cuatro <MULTITEMATICA_E2E_RUN_ID> ` y la categoría debe coincidir. Guardar los
IDs y una huella del JSON de detalle de cada uno, además de las huellas de sus
fotos accesibles. Pedir cierre con
`node demo.mjs --solicitar-cierre --accion iniciar22 --permiso <recibo> --ventana <id>`.
El identificador se obtiene del registro de la primera ventana. Esperar su
`resultado.json` con `completado:true` y `cierrePropioConfirmado:true`, y cotejar
puertos propios libres. La segunda ventana vuelve a verificar el esquema 22,
los cuatro servicios y las huellas públicas de esos mismos IDs tras el reinicio.
Si una comprobación falla, conservar la evidencia y el estado observado.

### Primer arranque del operador autorizado, 11/11

La aprobación habilitó sólo `actualizar` y dos ventanas `iniciar22`. El
lanzador reclamó el intento y se detuvo antes de crear el proceso operativo.
El diagnóstico acotado del selector devolvió
`CONFIGURACION_EXISTENTE_INCOMPLETA`. El censo registró cero procesos del
operador, los cuatro puertos libres y ninguna carpeta de intento. El SHA del
estado de instalación coincidió con la preimagen. Se conserva el recibo y el
registro del reclamo.

La configuración local omite ciudad, país y zona horaria, campos que api-core
ya resuelve por defecto. La corrección deja esos campos ausentes y conserva
las dos sales existentes. El caso aislado reprodujo el fallo antes del ajuste
y pasó después. El coordinador verificó 21/21 casos del adaptador y 37/37
guardas. Los destinos, las operaciones autorizadas y el runtime conservan su
alcance. Volta verificó 21/21 y 37/37 y aprobó el sello
`0daad99ba550a2f632a7a0b575d401c08dd7a08c3a051f52272659befe5e5f8c`, dictamen SHA256
`887b35ff3bc319b4858bf21806c5b2412f57844fef9cf354672d8cecfdcc1fca`.
Se emitió el recibo corregido sin ampliar alcance ni vencimiento. El
preflight del selector aprobó con la configuración real, sin imprimir sus
valores. Se abrió la consola corregida para la entrada del operador.

### Actualización comprobada y prueba de la demo

La actualización terminó a las 21:29 del 11/11. Se acreditaron los siete
checkpoints y el cierre del hijo. Se conservan el cifrado y la copia nueva.
Boyle cotejó esos artefactos con el estado de instalación. El detalle y las
huellas se registraron en el [informe](informe.md).

Las dos zonas del recorrido de octubre conservaban un reporte por categoría
cada una. La suite admite dos coordenadas opcionales con
`MULTITEMATICA_E2E_PUNTO_CHROMIUM` y `MULTITEMATICA_E2E_PUNTO_MOVIL`, limitadas
al destino explícito `curichi_multitematica`. Se mantienen las coordenadas
históricas como valores por defecto. El listado conserva los 14 nombres en
orden y rechaza cajas solapadas. La prueba vuelve a comprobar cobertura y
ausencia de reportes antes de crear datos. El preflight de las zonas elegidas
se conserva como `publicacion/demo22-puntos-20261111.json` en el scratch de M10.

La corrida real terminó 14/14. Después del cierre confirmado del primer
arranque, la segunda ventana respondió en los cuatro servicios y las huellas
de los ocho reportes y las cuatro fotos fueron idénticas. El segundo cierre
también quedó confirmado y liberó los cuatro puertos.
