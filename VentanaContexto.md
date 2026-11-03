# VentanaContexto — Mi Curichi

Actualizado el2026-11-03, America/La_Paz. Hechos y controles contrastados, sin porcentajes
inventados. Historial detallado previo conservado en .turbo/m10-4-2026-10-28/cierre/
VentanaContexto-historial-completo-m10-4-20261029.md; estados antiguos no prevalecen sobre este.

## A. Estado general

Plataforma municipal de reportes georreferenciados de Santa Cruz: Inundaciones, Baches,
Basura y Áreas verdes sobre un núcleo. pnpm/Turbo/TypeScript, Next/React/MapLibre, Fastify,
PostgreSQL18/PostGIS3.6, Drizzle, contracts0.24.0/Zod4, ETLTypeScript, Vitest/Playwright, Docker.
Apps nunca conectan DB; API escribe reportes; geo solo lee; solo db migra esquema.
M0–M5 y entrega local M6–M8 cerrados; M9 y M10.1/RF-01/M10.2/M10.3/M10.4 cerrados en local.
**M10.4 cerrado29/10 con confirmación independiente y adenda documental conformes.**
**M10.5 cerrado29/10 con375/375 y confirmación independiente CIERRE_APTO.**
M10 completo, cierre humano de Fase1 y producción siguen abiertos.
Rama codex/cuatro-categorias, HEAD59b80781030707b8c3334bfbfd40f80000c60a57; sin nuevo Git.

## B. Completado y pruebas

- Cuatro categorías: docs/sdd/2026-10-22-cuatro-categorias/informe.md; contracts512,
  web739/panel709 y14/14E2E (7desktop7móvil,0skip/retry/flaky) el25/10, con cámara/GPS
  sintéticos, publicación/mapa/M6, detalle/UV/foto, moderación/exportaciones/roles y reinicio.
  No equivale a repetir G1 histórico; no certifica hardware ni producción.
- M9: docs/sdd/2026-10-25-medicion-cuatro-categorias/informe.md;1M/250kcada,71casos,
  136sentencias/1200muestras,95tests herramienta/revisión conforme. Banco197700 retenido.
  Medianas/máximos SQL secuenciales, no HTTP/p95/concurrencia; totalpipeline NO_MEDIDO.
  SQL capturado antesM10.1, no atribuir tiempos al SELECT cambiado después.
- M10.1/RF-01: docs/sdd/2026-10-26-contraccion-compatible/informe.md;562PASS/12SKIP,
  75delta independientes, tipos/build/Biome0. Lectura JSON con alias/compatibilidad HTTP y
  escritura dual; replay causa omitida reconoce claves históricas sin reescribirlas.
- M10.2: docs/sdd/2026-10-27-respaldos-multitematicos/informe.md;23Node+23Bash propios e
  independientes; solo mocks. DROP heredado retirado por M10.3, no reprogramarlo.
- M10.3: docs/sdd/2026-10-27-restauracion-real-segura/informe.md;93casos verificados,
  dos ensayos REALES21→21/19→21, GPG2.4.9/PG18.6, byteigualdad, negativos y rollbackSHA
  en ambas copias.139SELECT propios independientes,15checkpoints(4heredados11nuevos).
  Original cifrar_actual INCIERTO porGPGexit2/clave perdida queda intacto; hijo02 completo,
  corrección Windows→POSIX homedir con gate propio. No repetir ninguno de sus operadores.
  Evidencia .turbo/m10-3-2026-10-27/, resumen cierre/resumen-operacion-real.json;
  cápsula8fuentes cierre/fuente-operacion/ conserva CI original,8/8quieta en revisiónM10.4.
- **M10.4:** docs/sdd/2026-10-28-consumidores-internos/informe.md;942casos únicos PASS:
  DB361/361 (350anteriores+11nuevos), API562PASS/12SKIP históricos, Node19/19.
  Full DB limpio31archivos/307,90s; API256,72s. Suites ejecutadas28/10 y reutilizadas tras
  formato por AST/SHA; no declararlas reejecutadas29/10. Typegraph6tareas, sintaxis/YAML/
  secretos nuevos aprobados. Biome raíz15archivos exit0 confirmado independientemente.
  Revisión producto sin hallazgos;76casos/186aserciones antiguos conservados; adenda5/5
  cotejos/0hallazgos. No retiro de cuota/ACL/estructuras/HTTP ni migraciones nuevas.
  Incidentes conservados: timeoutbeforeAllDB352PASS9autoSKIP→dirigido9/9→full361limpio;
  BiomeNO_CIERREinicial→formato1test→ASTigual→CIERRE_APTOindependiente.
  Artefactos originales102/102quietos,17otrasfuentes+dist6quietos. Pruebasdirigidas10/10
  antes/después pertenecen a Hume; AST/Biome correctivos propios de Hegel.

## C. Trabajo actual — cierre final M10

**Objetivo vigente:** versión completa y funcional en local, preparada para subir después.
El usuario eligió `micurichi.lat` para la web; pidió expresamente SIN DESPLIEGUE ahora.
No comprobaron DNS/TLS/propiedad; VPS y dominio del panel siguen sin elegir.

M10.5 CERRADO en local, informe docs/sdd/2026-10-29-pruebas-historicas-vigentes/informe.md.
Baseline361; full propio e independiente375PASS/0SKIP,361casos anteriores+14nuevos,
137aserciones y27hooks conservados; tipos/Biome/revisión conformes0regresiones.
El full independiente terminó11:51:48.590Z antes de cuota; se recuperó sin repetir.
Tipos/Biome propios15:49Z y dictamen15:56:13.465Z CIERRE_APTO. Fuente7congelada en
.turbo/m10-5-2026-10-29/cierre/fuente-cierre/ ymanifest hermano;freezeSHA
 e3b1fab1d993cd2dd5ed081e7a705bf9e16d542e12b6e8c7b83a08dbe33d174c.
Su sello de22archivos/82links0rotos estáen cierre/sello-cierre.json; no reabrir ese cierre
por las modificaciones posteriores aprobadas. Fuentes anteriores de M10.4 también congeladas.

### Aprobaciones y antes del trabajo final

- Humano: «Aprobar plan, decisiones e inventario»,call_f5f56593962e47059c6c9e9d984ac262.
  Plan canónico docs/sdd/2026-10-29-pruebas-historicas-vigentes/plan-cierre-m10.md.
 92rutas iniciales y ajustes acotados AGENTS/CLAUDE. ADR0026 aceptada/materializada;
 adendas0011/0012/13.3 yroadmap registran la separación DROPfísico/retiradaHTTP.
 APIv1/ambosPOST/aliasCSV se conservan; retiroHTTP diferido sin inventar adopción/plazo.
 Archivo de cuota dueño-only sin limpieza/sobrescritura; reversa condicionada y parada
 de código+esquema. Código/pruebasaisladas aprobados, operaciones reales NO.
- Humano: «Autorizar los cuatro ajustes»,call_f8747937ff1644a885382715293bcd8d.
 docs/sdd/2026-10-29-cierre-m10/ampliacion-guardas.md añade3DB+1API: local/opciones.ts,
 cli/verificar-privilegios.mjs,migracion-0012-foto-subido-por.test.ts yAPI/fotos-cuota-concurrencia-pg.test.ts.
 **96rutas**. Preimágenes4iguales alF0original en f0/ampliacion-guardas.json, sin sobrescribirlo.
- Nueva petición explícita: guía breve de demo/original. **ARRANCAR.md CREADO** en raíz;
 f0/guia-arranque.json registra autorización documental y que no existía. No ejecuté sus
 comandos ni conecté DB/Docker/HTTP. Explica iniciar demo4000/panel4100/Ctrl+C y cuentas
 sintéticas; Mi-Curichi.exe ausente, fuente/compilador como referencia, NO usar su arranque
 que automigra sobre curichi protegido. Durante M10 no saltar guardas de builds/versiones.
 48links locales de guía/plan/baseline verificados,0rotos. Documentación de producción/
 TRASPASO con adendas29/10 distingue estado nuevo de la historia anterior.

Corrida final: docs/sdd/2026-10-29-cierre-m10/{plan.md,protocolo-verificacion.md,linea-base.md,
 ampliacion-guardas.md,arbol-inicial.txt,archivos.txt}. Artefactos .turbo/m10-cierre-2026-10-29/.
F0manifest1017archivos/92rutas/7nuevas,mismoHEAD59b80781030707b8c3334bfbfd40f80000c60a57,
rama codex/cuatro-categorias. Anexo4 aparte. Captura antes de primer cambio funcional:
baseline-fuentes-antes-liberacion.json,75rutasfuncionales iguales y nuevas ausentes.
Cápsula previa compilada21 f0/artefactos-21/365archivos/1488325bytes+manifest; preservada
sin ejecutarla. No acredita por sí sola dependencias/runner/código21 recuperables: el
protocolo operativo futuro debe probarlos y no resolver bare imports hacia dist22 por error.

### Baseline final M10 — ya completada, no repetir

Hegel entregó BASELINE_LIBERADA,0procesos propios, y cerró; evidencia baseline/linea-base.md
 yresultado.json. Copia canónica rebasó links al scratch.
API562PASS/12SKIPhistóricos de574;geo110PASS;Node19bancos/29respaldo/31ensayo/40local/
95medicióninyectados;Bash33PASS tras denegaciónNT inicial resuelta por mismo comando
escalado. Guardar intento previo. TiposAPI/geo/ETLexit0. DB375 ytypesDB REUTILIZADOS M105,
NO nuevos:157fuentes/dependencias+6distidénticos, snapshots/fechas originales preservados.
No PG/Docker/S3/HTTPoperacional ni operadores reales.12SKIP conservan exactamente susnombres.

### Estado vigente y reparto — 02/11

**ÚNICO HEAVY: Erdos01a1a1f6-48d1-7113-bac2-ece901cf1d52**, vueltaSCAN01 del escáner.
Carver cerrado temporalmente tras154unitpropios/9controlesadendaexit0; no más ejecución.
Lease actual publicacion/lease-independiente-adenda-20261103.json, freeze1088 en
publicacion/freeze-adenda-20261103.json SHA0229f0953708d8015adbbb88caaa919e12ff9762fe7401c911836283243c66f7.
Autoriza sólo9cambios existentes (7fixturesSQL+scanner+CI) ytestscanner nuevo; el resto
coincide con el freeze original. Ese freeze original funcional1087fuentes/dist está en
publicacion/freeze-verificacion-20261102.json, SHA902d0bd17c9a13cd707ac53b981dfb1e1bd64faee04739f70d194e987bc74401.
Son fuentes fijadas para verificar, NO un dictamen ni autorización operacional. Documentación
de continuidad queda fuera de ese freeze para registrar los resultados. P5 liberó turno,
CIMescalado0procesos propios y3965MiB libres; los autores no pueden ejecutar más controles.
GEO Mendel01a19933-9ea4-7322-89ea-6dd9243ece2d completó cinco rutas:110/110PASS/0SKIP,
tipos/ROOTBiome0,324aserciones/14hooks/68llamadasHTTP conservados,0regresiones; runtime
quieto ybuildinnecesario. Antes propio55FAIL/54PASS/1autoSKIP por vista/planos retirados,
todos recuperados después; no repetir. Artefactos geo/continuacion-20261102/,resultado.json,
fuentes-finales.json yprocesos-fin-01-escalado.json:0procesos. FuenteGEOcongelada.
Los demás actores no pueden ejecutar suites/builds/tipos hasta nueva cesión explícita.

**DB propia terminada y congelada:** Raman01a19932-641b-7912-b49d-4967f790fb93, cerrado.
Full429/429PASS/0SKIP,375casos anteriores conservados/0regresiones; tipos/build/ROOTBiome0.
33fuentes y80dist quietos, freeze-20261102.json yhandoff.md/json en parte4/continuacion-20261102/.
MigraciónSHAa0a78ddded5783a27ead6d6bb7835eaa36f14121b02e655ca52a9f4a9267666f;
reversa7324ec250842b35ea4dc8bde2506d2db2154cfc10288091ae0084fea70364e25;
dist80manifiestofe4396d665c9d569e4e4d80e34b7e8aac5d63b0df1491cfcc1a80946af0b15f6.
DDL-01..04 y DDL-03-R/05 resueltos y probados. Incluye ACL heredadas de cuota/esquema/
funciones/vista, PK del archivo, CHECK efectivos/historial futuro/columnas y attacl.
El full previo01 conserva321PASS/18FAIL/83autoSKIP porEACCES; esos101casos se recuperaron.
No repetir medición propia terminada; confirmación independiente aún debe ejecutarse.

**API propia terminada:** Lorentz01a19931-5232-7c82-b473-3e1525b0d47f ejecutó GREEN50/50
(40filtrados) yfull02:612PASS/12SKIP/624,0diferencias por caso, fuentes quietas. Full01
conserva607PASS/5FAIL/12SKIP: cinco inspecciones físicas M6/M7/M8 aún esperaban columnasNULL.
Se adaptaron a ausencia física/JSONsinagua, conservando HTTP/CSVNULL y detalles íntegros.
Principal consolidó con harness existente typecheck-02/build-01/biome-03:exit0, sin editar
producto. Evidencia parte3/continuacion-20261102/consolidacion-principal/resultado.json.
28fuentes quietas y runtime-finalSHA7a8452e19e3b1b9406ba96b8193e51764075e5ed1cf65aa52f6892aaf60890b0.
Primer preflight del principal omitió--runtime y rechazó el manifiesto viejo, sin hijo;
corregido y registrado. No es cambio de fuente. No repetir full02 al recuperar un corte.
Las12omisiones PG/S3 siguen sin prueba real; warningspg9 se conservan, sin atribuir causa.

**P5 entregado, SIN HEAVY:** Epicurus01a19932-6502-7382-8b98-6e2178470381,15rutas exactas.
RED heredados:respaldo1PASS21FAIL/local14FAIL/ensayo12FAIL;Bash1PASS6FAIL/33filtrados.
NuevoREDP5-02:2FAILesperados; parche de checkpoints ya aplicable/aplicado sinheavy después.
P5-01 índices clave/INCLUDE se corrigió ANTES del negativo específico: desviación de orden
registrada honestamente. Retrospectivo final de preimagen21 aprobó1/1; los intentos previos
que fallaron antes del oráculo se conservan y no son rojos previos a programar.
P5-02:dos negativos RED y GREEN2/2, también dentro del ensayo25. Suites propias completas:
Node279/279=bancos19+respaldo55+local54+ensayo25+legacy31+medición95; Bash47/47. YAML,
sintaxisNode8antesformato/Bash2 yROOTBiomecontrol03exit0. No se repitieron por el corte.
freeze-parcial-20261102-01/{source15-sha.json,handoff-parcial.json,procesos-fin-escalado.json}
conserva15fuentes/copias/0procesos. EquivalenciaAST del formato y conservación exacta de
casos quedan para Carver/Peirce; no inventar conformidad a partir del TSprinter diferente.
Copia22 es la única que se recupera21→22; otras copias permanecen22 quietas. Oráculos
posteriores aPOST22/POST21 deben acreditar el delta completo; no basta autorcomparación.

**Independientes:** Carver01a19934-abac-7e90-92fc-895866a36a99 preparó controles/matriz:
89preimágenes/87artefactos,1306casos anteriores incluidos12SKIP. Ya tiene lease expreso;
debe ejecutar sus propias suites en serie y comparar por caso/aserciones, sin atribuirse
los verdes de autores. Evidencia verificacion-independiente/continuacion-20261101/turno-final-20261102/.
**Las10suites independientes terminaron1477PASS/0FAIL/12SKIP:** DB429, API612+12SKIP,
geo110, Node279, Bash47. Todos exit0/0cambiosfreeze;1306casos anteriores conservados sin
issues en comparacion-casos-final-01.json. Grafo6/6exit0,0cache, contracts/DBbuild incluidos.
No repetirlos al recuperar. APIbuild01–03 no lanzaron compilador por PNPMrunstate/link/ruta
larga del espejo; no son fallosTS. compilador-equivalencia-01.json prueba igualTS5.9.3/SHA
ybodytsc. Pendiente ejecutar ese bodydirecto en espejo, terminarOpenAPI/sintaxis/YAML/
Biome/scans/aserciones yhandoff. El03Nov14:11Z se confirmóCIM0,3218MiB y1087SHA0mismatch;
principal renovó lease8h para Carver. No más preparación general ni repetirlos.
El03Nov terminaron buildAPI/DB bodyoriginalTS5.9.3:exit0; sintaxis8Node+2Bash/YAMLexit0,
Biomedelta75exit0. Biomeglobal conserva1error6warnings en contextoajeno. Escáneroriginal
delta2/publicación9alertas: expresiones calculadas y URL sintéticas; no son secretos
confirmados, pero bloquean el hook. Plan ampliacion-escaneo.md aprobado03Nov porrespuesta
«Sí, corregir y verificar (Recomendado)»,call_30337537331d4cdea56061d9a224ca34.
Scanner+testnuevo+CIstep:3rutas,2nuevasalalcance/98únicas, sin cambiosoperadoreshistóricos.
CIM03Nov15:09Z0procesos y3025MiB. Carver fue cerrado temporalmente, fuentes/resultados
conservados. Aristotle terminó98/98PASS,0caseDiff,ROOTBiome0,47bytesexactos/gitdiffcheck0,
0hijos yleaseLIBERADO15:14:50Z; hecho.json/proof-final.json en formato-api-20261102/. Cerrado.
Erdos raíz01a1a1f6-48d1-7113-bac2-ece901cf1d52 terminó y cerró: original150casos
101PASS49FAIL, final154/154PASS0SKIP;9FPresueltos;877tracked/1038incluntracked0alertas,
ROOTBiome/syntax/YAML/diffcheck0,7fuenteshistóricasquietas y0hijos. hecho.json en escaneo-20261103/.
Hubo1alerta en su testnegativo, corregida construyéndolo enmemoria sin eximirlo; intento
conservado. Carver ejecutó154/154propios exit0 en turno-final.../adenda-20261103/unit-scanner-01/;
cuenta total disjunta1631PASS/12SKIP, NO sumar98formatter. Faltan últimoscontroles/adenda/
escaneo yreview3rutas dePeirce; luego Kant privado21→RED→mínimos→GREEN con leaseexpreso.
**Bloqueante nuevo03Nov15:37Z SCAN01P2**, revisión adenda-escaneo-20261103/revision.md:
la excepción acepta prefijo `decodeURIComponent(url.password)` seguido de fallback||/??/+
con literal sensible.154PASS no cubrían ese caso; no permiten cierre/publicación. Mismo
scope3yaaprobado, sin nueva pregunta. Se cerróCarver tras9checks0y se reabrióErdos con
leaseexclusivo paraRED3variantes→fixfinalexpresiónúnica→GREEN154+nuevos/scan0/Biome0.
Peirceconfirmará sóloSCAN01ySHAfinales. No fuentehistórica ni otras reglas/exenciones.
Peirce01a19938-e4dc-75f3-9de0-84c3787a07a2 revisa/audita sinheavy; API y adenda dosfixtures
conformes estáticas. AdendaP5 congelado también conforme,0P1/P2 nuevos;15quietas,7AST
equivalentes y3deltasfuncionales leídos, sin inventar preimagen completa anterior al formato.
CasosF0noeliminados/E2E7cuerposquietos/config14; sin E2Ereal aquí. revision-independiente-20261101/.
Sartre01a19936-8431-7492-83b3-c56304af6587 preparó releases/adaptador/supervisor privados,
sinheavy ni operaciones. Driver-real29KB y otros artefactos están en propuesta-operacional-20261101/
continuacion-20261102/; no tienen aún prueba/cierre que permita pedir la operación real.
Revisión privada encontró OP01–03P2: checkpoint siempre falla, no se exige incremento de
cuota y login21 legítimo rechazado por el oráculo. Sartre cerró sin escribir ni ejecutar;
Kant raíz01a19ecc-2039-7611-b068-3e30cad34fb7 es ahora el único escritor de esa carpeta
privada para negativos/parches, SIN HEAVY. No aplicar antes deRED ni pedir autorización
operacional con esos defectos abiertos. Turno pesado actual indicado al inicio de esta sección.
Aristotle raíz01a19ed0-ae74-7a23-bcee-51ab6d3a30ff terminó limpieza exacta47bytes de siete
fixturesAPI en formato-api-20261102/: hecho-preparacion.json,7copiasSHAquietas,98casos
baseline dirigidos reutilizados del fullindependiente y98posterioresPASS,0caseDiff;
una suite serial7, ROOTBiome7, proofSQLtokens/bytes y0hijos. Carver confirma adenda yscans
finales trasErdos. No repetirfull1477 por un blancoSQL demostrado. OpenAPIprincipal02:
F0manifest/actual/salidadelbuildindependienteidénticosSHA5a089fbb8cb75a509b446c8f6a3725c94a7aa7e0cb6b83d537f029a3ddd4623a;
primer control diofalse por copiaF0inexistente, corregido usandoSHAoriginal delmanifest.

**Próximos pasos:** verificación/revisión/auditoría independientes y controles
del grafo/OpenAPI/secretos/publicación. Preparar operador real ejecutable/revisado antes de
su aprobación concreta; luego ensayo nuevo y actualización de demo14E2E/reinicio autorizados.
Nunca conectar curichi/curichi_revision/postgres; bancos anteriores retenidos, sinDROP/cleanup.
Usuario01/02Nov autoriza commit/push/PR AL TERMINAR, sin merge/despliegue ni operaciones
reales implícitas. Rama codex/cuatro-categorias aún no publicada; remoto main3121a0 e
interfaz-prueba59b8078 confirmados por ls-remote escalado. Simulaciónpush exit0 confirmó
que puede publicar la rama, sin publicación real. Candidatos277/0rutas sensibles, todavía
sin stage/commit/PR; escaneo de contenido pendiente. NuevoPR a main incluirá también
la historia hastaM5 delPR23 aún abierto. No publicar cierre incompleto como terminado.

## D. Actores/evidencia para recuperar

M10.4 .turbo/m10-4-2026-10-28/:
- Hume raíz01a183db-c09e-7da3-847a-d340b9caf078 CERRADO, parte4/ ycorrectivo
  parte4/correccion-formato/. Freezeoriginal13SHA dc68903bad3e12c087625f12c363a85d9deaa511b4078da79ad1361028880cbc
  se conserva; nuevo13SHA3e689ccd6654e5f59d6cb58eff2150d7bca4c63a1a8f7bab3c70e0f34ca950b7.
- Popper raíz01a18501-51b8-7ff3-9d28-656469121bd6 CERRADO, parte5/;
  freeze5SHA1984a1f69aa41814afb76f91ad536a5f2c7f749868265e52587355a689d9e417.
- Hegel verificador01a18513-5f63-74a1-88ad-12681dd31b3d CERRADO, verificador/;
  originalresultadoNO_CIERREintacto; correccion-formato/{adenda.md,resultado.json}CIERRE_APTO.
  Corte por cuota ocurrió DESPUÉS de AST/Biome exit0 a29/10T01:08Z; consolidó29/10 sin
  repetirlos. No reiniciar suites al recuperar; comparar SHA/evidencia guardada primero.
- Godel revisor01a183ea-6cee-78d0-a488-0f23b7cf5b60 CERRADO, revision/;
  adenda-cierre/{adenda.md,resultado.json}conforme5/5. Cuatro preimágenes de docs
  recuperadas byteexactas aF0 en f0/recuperadas/; no existía necesidad de inventar estados.

Leer informeM10.4/confirmación verificacion-formato.md/revision-cierre.md → planM10.5 →
AGENTS/CLAUDE → Git/fuentes reales antes de empezar. F0nuevo por corrida; HEAD no es el antes
real porque hay cambios locales de varias fases. No usar PIDs antiguos ni controles *.running
como prueba de vida: revisar *.control y la identidad actual. No duplicar escritores.

## E. Restricciones y decisiones

ADR0008–0025: núcleo+categorías, catálogo Y definición activa, sin categoría=inundación;
Todas solo panel. URL→preferencia dispositivo→inundación→primeraactiva;3reportes/cuenta/
categoría/día configurable,12fotosglobal,demora porcategoría. D3v2extendida,IDcorto/UUID,
ÁreasverdesPoint/sincapamunicipal,Persona permanece con puerta deprivacidad producción.

Nunca conectar/consultar/migrar curichi,curichi_revision ni postgres. No migrarE2E.
Demo solo iniciar normal; nunca preparar/seed/load/migrar de nuevo. M9 y cuatro bancos
M10.3 conservados; noDROP DATABASE, Dockerdown/rm/-v, stash/reset/clean/checkoutdestructivo.
Sin limpiarlogs/cachés (usuario rechazó), instalaciones/descargas/npx, env/sistema/seguridad/
potencia persistentes, cambios globales de roles/contraseñas. data/raw inmutable.
.env nunca valores. Commit/push/PR ahora autorizados expresamente01/11 al terminar y verificar;
sin merge ni despliegue. La publicación anterior por sí sola no daba ese permiso.
Principalcoordina/docs; raíz nativo sinmodeloverride. No roles sdd-* sin invocar skill.
Unwriter/carpeta y unheavyglobal, RAM1500MiBunit/SQL,2500antesnavegador con servicios vivos.
M10.5 solo fixtures/PGlite y loopback propio original, sin DBreal/Docker/S3/HTTPoperacional.
Pnpm C:/Users/HP/.local/bin/pnpm.exe --config.verify-deps-before-run=false; no npx/install.
Fallo sandbox se escala por misma herramienta/comando, sin bypass.

## F. Instalaciones y conservación

Demo histórica: web http://127.0.0.2:4000/ ypanel http://127.0.0.2:4100/,
curichi_multitematica OID181316/21migs. ÚltimoHTTPverificado28/10T18:32:23Z5GET200,
APIdegradadofalse/4slugs; no controlHTTPnuevo enM10.4 ni afirmar disponibilidad actual
por el navegador abierto. Inicio28/10T15:14Zsesión7826/launcher28024; PIDs pueden reutilizarse.
DistAPI RF01 de27/10T21:14:39.917Z; warningNextstandalone preexistente.

M10.3 servidor7688456033622585387,dueñocurichi,bancosretenidos:
curichi_sdd_m10_20261027_actual OID205892 y copia_actual207565 (21migs/4reportes1porcat);
curichi_sdd_m10_20261027_pre0020 OID209239 (19migs/1flood) y copia_pre0020 OID210842(21).
Sus cuatro Clients cerraron tras139SELECT; no repetir restauraciones/cifrado/negativos.
M9 curichi_sdd_m9_20261025 OID197700,1M/250kcada,21migs16DM576UVreales,sinmanzanas.

## G. Pendientes y límites

**Retomar sin reiniciar:** DB/API/GEO/P5 terminaron sus suites propias. No repetirlas.
Recuperar primero controles actuales del turno final de Carver yformato-api-20261102;
Erdos tiene el únicoheavy para SCAN01; después Carveradendaacotada y Kant privado.
No inferir libre por ausencia de `.running`; autorP5 dejó handoff y0procesos. P5-01/02 tienen
pruebas propias posteriores aprobadas; falta dictamen independiente de delta/formato.
Carver ejecuta confirmación independiente con fuente congelada y compara1306
casos históricos (incluidos12SKIP), aserciones/SHA; mismo transporte/entorno, sin operaciones.
Kant continuará correcciones del operador privado de Sartre para una aprobación concreta.
No pedir operaciones con su borrador anterior NO_EJECUTABLE ni anunciar PR antes del cierre.

M10.5 cerrado; completar el plan final M10 con su F0/baseline ya conservados, sin repetirlos,
para cuotaantigua/limpieza/ACL, autoridad JSON/reversa multitemática y convivencia clientes/PWA.
No inventar duración de adopción ni interpretar cero tráfico como abandono. Reversa0020
no sirve con cuatro categorías; cupo_contador no se retira. Retiro físico compatible aprobado como código/pruebas aisladas; retiradaHTTP diferida, operaciones reales aún sin autorización.
Fase1/producción: fuente/licencia capas, parámetros/plazos/retención municipales, privacidad
Persona, hosting/mapa/secrets/fotosoffsite/custodiaclave, hardware/lector/apagado/CI remoto.
12SKIPPG/S3 siguen NO_VERIFICADO. Lint/auditglobalhistóricos1error6warnings y4high12moderate
1low0critical, sin auditnuevo; no son problemas corregidos de pasada.14E2E25/10 y mediciónM9
conservan su alcance, no prueban UI/HTTP de hoy ni sustituyen requisitos de producción.
