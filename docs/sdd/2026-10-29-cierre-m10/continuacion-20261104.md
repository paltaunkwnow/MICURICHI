# Continuación de M10 — 04/11/2026

El usuario autoriza «terminar de construir todo lo necesario para cerrar M10» y
«programa todo lo que necesita para cerrar M10». Se continúa el plan aprobado,
conservando la separación entre construcción/verificación y operaciones sobre bases.

## Estado recuperado

El dictamen independiente del03/11 corresponde a las fuentes congeladas de ese día:
1634PASS/12SKIP históricos, con los límites documentados. Otra sesión modificó después
la migración0022, `scripts/respaldo.mjs` y su prueba. Ese resultado no se atribuye
automáticamente a los tres archivos nuevos ni a las copias privadas reescritas.

Grok.md registra un ensayo real incompleto y varios intentos anteriores, incluidos
borrados de bancos propios efectuados por esa otra sesión. Esta continuación conserva
las evidencias y no repite esos borrados. El último resultado físico registra
`completado:false`, cierre propio confirmado y una etapa incierta `probarPostReplay22`.
La demo sigue fuera del permiso de ensayo registrado; no se declara actualizada.

## Correcciones y comprobaciones acotadas

| Parte y escritor | Archivos | Meta verificable |
|---|---|---|
| P4, James | `packages/db/migraciones/0022_contraccion_compatible.sql` y `packages/db/test/migracion-0022-contraccion-compatible.test.ts` | Comprobar la revocación efectiva de privilegios de columna heredados al archivar cuota; reproducir el defecto si existe y corregirlo sin alterar roles/defaults globales. Conservar429casos previos, tipos/build/formato. |
| P5, Galileo | `scripts/respaldo.mjs` y `scripts/respaldo.test.mjs` | Verificar el camino integrado de `snapshotContraccion` con las representaciones booleanas admitidas; rechazar falso, nulo y valores ambiguos sin saltarse la comprobación SQL de permisos. Conservar55casos anteriores y el caso añadido por la otra sesión. |
| P5, revisión independiente Plato | Operador privado en `.turbo/m10-cierre-2026-10-29/propuesta-operacional-20261101/continuacion-20261102/`; solo lectura y reporte propio | Revisar los cambios de GPG, transporte de claves y reanudación de la etapa incierta. Comprobar que los manifiestos se apoyan en evidencia de carga real y revisión independiente. No aceptar una etapa por borrar su entrada incierta del diario. |
| P5, Halley | Copia privada nueva `propuesta-operacional-20261101/continuacion-20261104/`, bajo el scratch de M10 | Resolver los siete hallazgos del delta privado, manteniendo intacto el intento anterior. Rechazar cualquier adopción/repetición de una etapa incierta; GPG y pipes propios; carga de app.js reales bajo guardas; evidencia vigente y revisión posterior de otro actor. |

El resto de producto permanece congelado. Un escritor por carpeta y un único HEAVY:
primero DB; luego respaldo y controles privados por cesión expresa. Los tests reciben
solo entorno OS permitido y CI/test, sin dotenv ni credenciales heredadas. No instalación,
descarga, cambios globales, limpieza, Git ni operaciones reales dentro de estas correcciones.

## Dependencias del cierre

Después de corregir y verificar: revisión independiente del delta, nueva captura de
fuentes y artefactos22, carga aislada de las aplicaciones compiladas reales sin importar
`servidor.js`, actualización de manifiestos y sello coherente con sus pruebas. Las copias
previas y los intentos no se sobrescriben para aparentar continuidad de verificación.

Una etapa incierta requiere reconciliación demostrada de estado y evidencias antes de
ejecutar cualquier acción posterior. La sola existencia de un permiso o una nota de
reanudación no demuestra que no se haya aceptado un POST ni consumido cupo.
No se cambia a PASS una restauración incompleta ni se da por cerrado M10 por sus mocks.

Los protocolos operacionales concretos, la actualización de demo, sus14E2E y el reinicio
siguen después de esta preparación. El PR solicitado se realizará con el cierre efectivo;
no se autoriza merge ni despliegue a producción.

## Revisión recuperada del operador

Plato identificó cuatro P1 y tres P2 en los cambios posteriores de la otra sesión.
Su informe está en `correcciones-20261104/revision-operador/revision-delta-20261104.md`,
bajo el scratch de M10. OP01–OP03 originales siguen cerrados para sus fuentes originales;
los defectos nuevos se limitan a reanudación, acreditación y GPG/pipes/resultados.

Se aplica la alternativa mínima segura: conservar el intento incompleto y rechazar su
reanudación automática. No se construye un motor genérico para adoptar un ledger incierto,
ni se borran resultados, cifrados o bancos para repetirlo. La copia privada nueva reserva
la corrida `cierre_20261104_02`, con los seis sufijos origen19/origen21/origen22/copia19/
copia21/copia22 bajo `curichi_sdd_m10c_cierre_20261104_02_`.
Es una propuesta técnica para un ensayo nuevo, no permiso para crear esos destinos.
El permiso antiguo ligado a otros nombres y sellos no se reutilizará para esta propuesta.

Las fuentes y pruebas privadas nuevas se verificarán antes de emitir cualquier acreditación
o sello. La prueba de carga debe importar los app.js reales de API y geo de ambos releases;
importar solo contracts/db y dos utilidades no basta. Ningún preparador firma su propia
revisión independiente y ningún booleano sustituye el informe de otro actor.

## Resultados recuperados durante esta continuación

DB: el intento inicial conservó424PASS/5FAIL. El reintento escalado con el mismo
transporte y sin editar las pruebas aprobó429/429,32archivos,526s. Los errores previos
de `uv_os_get_passwd/ENOMEM` no se atribuyen a RAM física sin evidencia. Los dos casos
nuevos de ACL del camino fresco aprobaron desde el inicio; no se inventó un RED.
Después de retirar el bloque añadido por la otra sesión,4/4dirigidos aprobaron,
incluidos los rechazos del archivo preexistente. Types/build/Biome exit0,80dist iguales.
SQL volvió al SHA original revisado `a0a78ddded5783a27ead6d6bb7835eaa36f14121b02e655ca52a9f4a9267666f`.
Full posterior aprobado con 431 de 431 casos en 32 archivos. La comparación conserva
los 429 anteriores y suma dos nuevos, con cero ausencias y cero regresiones. Los
80 artefactos compilados conservan su SHA. Evidencia `db/entrega-final-01.json`.

Respaldo: baseline56aprobados; el RED integrado falló al tratar el booleano nativo como
texto antes de la comprobación. El arreglo mantiene la consulta SQL de propietario/ACL
y acepta solo booleanos o texto booleano reconocido; objetos y valores ambiguos rechazan.
La suite posterior aprobó56/56, conservando55casos históricos y el caso adicional previo;
las variantes integradas amplían sus aserciones sin inflar el número de casos. Sintaxis
y ROOTBiome aprobaron; censo confirmado0hijos. Revisión independiente pendiente.
Fuentes: `respaldo.mjs` SHA `6758a4458c5c8fa38d26aec245d232bd70afd73093ca8726f45055fdc9da6cb5`;
test SHA `c0eaf1a9a10aa1aa32ae2a3b67c6955b9d1a5af87a1ab5d0eef919c256406587`.
Evidencias: `correcciones-20261104/{db,respaldo}/` bajo el scratch de M10.

En la reanudación del 05/11 se recuperó la suite privada final del autor con 106 de
106 casos aprobados y 22 comprobaciones de sintaxis con salida cero. Se conservaron
los intentos anteriores con fallos, incluido el doble de streams incompatible. La
suite final y los archivos MJS coinciden en el corte temporal. Se verificó el cierre
de los 26 procesos registrados. Pendientes de preparación: GPG sintético offline,
materialización de los releases, carga de aplicaciones reales y revisión del sello.

Plato ejecutó en serie 431 pruebas de base y 56 de respaldo, todas aprobadas. El
cotejo confirmó 429 casos de base conservados, dos casos nuevos y los 56 nombres
de respaldo, sin regresiones. Para comparar los nombres de respaldo se corrigió
la lectura CP437 en memoria y se conservó el TAP original. Las cuatro fuentes
coincidieron antes y después, con cero procesos propios al cierre.

El coordinador cotejó las capturas, las 1088 fuentes de referencia con sus tres
deltas y los 399 archivos del release 22. El manifiesto definitivo está en
`publicacion/freeze22-verificado-20261105.json` bajo el scratch de M10. Su SHA256 es
`5cb7e0edb15e8ead2a57c0e65a188c4aca920349a9d918bb74e00514a3f2d788`.
Halley añadió los scripts de materialización, resolución, acreditación y arranque
del intento nuevo. Se materializaron y acreditaron los releases 21 y 22. Plato cargó
seis módulos por release, incluidas las dos aplicaciones compiladas, y validó dos
configuraciones por versión. Aprobaron 12 guardas y se cotejaron 480 dependencias del
grafo. La carga aislada no arrancó servidores. Captura
`manifiestos/carga-real-plato-20261105.json`, SHA256
`7460aa499e71444d627f7c3cc329994d8b0f427e07d8d37bd9b9f3c075a46e62`.

Las dos primeras pruebas GPG se detuvieron antes de recibir la frase. Windows
heredaba dos permisos adicionales en la carpeta temporal del ensayo. El operador
acotó la corrección de la lista de acceso a la carpeta nueva de su propiedad. La
prueba posterior cifró y descifró un archivo sintético con igualdad exacta de bytes,+siete subprocesos con salida cero y cierre confirmado del agente propio. Captura
`controles/gpg-offline-9b9992a0-1b27-4158-9dcb-261fd9b756b5.json`, SHA256
`64c0062ba73251fe4ac07a21884ac7d7778840d26504aabacbea0e43a0c37e40`.

Tras ajustar GPG y el lanzador, el operador registró 107/107 casos privados, envío
sintético por FD 3 con igualdad de bytes y cierre del hijo, y cero errores de parser
en los dos scripts de PowerShell. Capturas `controles/green-gpg-fd3-20261105-01`,
`controles/fd3-sintetico-02` y `controles/powershell-parser-20261105.json`.

El operador selló 113 entradas. El cotejo del preparador registró cero divergencias
y cero procesos propios al cierre. El sello `manifiestos/sello-artefactos.json` tiene
SHA256 `3f3fba73e7f5a6f176647e4e0f8985ed8b43b270350ec785c54d34be4f0f263d`.
El SHA256 de `plan-final.json` es
`6fba9e933d29b9a11b07fc48dbde6b216472f7501c69e8776f98bded2b34ac2e`.
PowerShell rechazó el recibo de ejemplo antes de leer claves. Captura
`controles/puerta-powershell-negativa-20261105.json`.

### Revisión posterior al sello y corrección

Plato cotejó las 113 entradas y las seis herramientas del sello. El dictamen fue
**no conforme** por un P1 y tres P2:

1. `process@0.11.10`, `string_decoder@1.3.0` y `safe-buffer@5.2.1` se cargaron fuera
   de los dos inventarios sellados. Hay que inventariar sus bytes y verificar la
   pertenencia de cada módulo antes de cargarlo y al revisar la evidencia.
2. La guarda de carga permite abrir archivos para escritura. Se requieren aperturas
   de solo lectura y una prueba negativa de los flags de escritura.
3. La entrada directa acepta un archivo regular en FD 3. El consumidor debe verificar
   el tipo de canal y conservar la prueba de transporte Windows.
4. Si vence el permiso durante el ensayo, el cierre de GPG puede fallar por esa misma
   guarda. El cierre debe limitarse al agente propio y seguir disponible tras el vencimiento.

La candidata `continuacion-20261105-r2` se prepara con los mismos seis nombres
propuestos. La candidata inicial, su sello y sus resultados se conservan. Las pruebas
de producto aprobadas siguen ligadas al mismo freeze. Solo se repiten los controles
privados afectados y la carga independiente antes del sello nuevo.

El inventario nuevo incluye las tres dependencias en ambos releases. Materializar,
resolver y acreditar 21 y 22 terminó con seis salidas cero. La suite privada pasó
113/113 y conservó los 107 casos de referencia. La prueba Windows de extremo a
extremo usó el consumidor real de FD 3: recibió los datos sintéticos íntegros,
rechazó un archivo regular y terminó sin hijos vivos. Capturas en `controles/` de
R2: `green-r2-01` y `fd3-extremos-r2-01`. Falta la carga independiente del delta.

El primer control independiente de R2 terminó con salida 1 y cerró su proceso. El
diagnóstico aisló el binario nativo de Sharp, presente con su SHA en ambos inventarios.
En Node 24.15.0 para Windows, el coordinador comprobó que el cargador CJS entrega a
`process.dlopen` una ruta con prefijo de espacio de nombres. `realpathSync` devuelve
`EISDIR` para esa ruta. `realpathSync.native` obtiene el mismo destino canónico de la
ruta ordinaria. El ajuste debe conservar la pertenencia y la comprobación de SHA.

Se aplicó `realpathSync.native` al inventario y al cotejo de la evidencia. La prueba
dirigida reprodujo el error antes y aprobó después. Un caso anterior de readiness
suponía que la carpeta real carecía del manifiesto de interfaz; la suite ahora
simula esa ausencia dentro del test y conserva el mismo criterio. El control final
aprobó 114/114, con los 113 casos previos conservados. Evidencia
`controles/green-canon-native-r2-02` de R2. Plato repite la carga independiente con
los mismos releases y el canon corregido.

La repetición independiente salió 0, con el proceso cerrado. Cargó seis módulos
raíz por versión, validó dos configuraciones por versión y cotejó 480 aristas.
El registro contiene 731 módulos del inventario, 13 guardas comprobadas y cero
intentos bloqueados durante la carga. Captura
`manifiestos/carga-real-plato-20261105-r2-native.json`, SHA256
`0d04ff9de45e2facd107cfc21b94cccdf06e0fbaa01176a99b975f36592d74c9`.

El sello R2 fija 108 entradas. El preparador comprobó cero divergencias y el cierre
del proceso de sellado. SHA256 del sello
`9f6be9d84b3a7c6cb43558b0b37dfaee2c7cae8a0740686b3a8507eeb2bc7fdb`.
SHA256 del archivo de plan
`9f17ad16d651556209aa30e7c0b1d9ec7a890b5837813d57ad01c149b85469e0`.
Plato emitió el dictamen conforme sobre las 108 entradas y dejó cero hallazgos
bloqueantes. SHA256 del informe
`514c720247850a5f6faa38ad8b03a8306fa0cde4c89d68aadaf2c519bcdd9d3b`.
El coordinador cotejó el alcance y añadió su procedencia. Se corrigió un salto de
línea serializado como texto literal en dos capturas del coordinador, conservando
sus preimágenes y sin cambiar el sello ni los datos de las pruebas.

La comprobación final de la puerta salió 0, validó la preparación y rechazó el
recibo de ejemplo antes de ejecutar la operación. Captura
`controles/puerta-final-offline-20261105.json` de R2. El plan canónico ligado a la
puerta tiene SHA256 `363bc756f3b26278ab4402cb9907c9e0dc96cc5fd47305ceec70f3a4d4dfbc48`.
La operación queda pendiente de autorización según el [protocolo revisado](protocolo-operacional-propuesto.md).
