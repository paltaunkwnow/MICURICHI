# M10.3 — Restauración real segura en bancos sintéticos

**Aprobado el 2026-10-27:** respuesta explícita del usuario «Aprobar M10.3 completo
(Recomendado)» a la pregunta que incluyó ocho archivos, `template1`, cuatro bancos
sintéticos nuevos conservados y ensayo cifrado/restaurado real. M10.2 ya está cerrado.
Parte5. F0 en `.turbo/m10-3-2026-10-27/f0/`; ejecución por trabajador raíz y verificadores
independientes. Primero guardas y pruebas aisladas; ningún operador real antes de su revisión.

**Avance verificado el28/10:** gate inicial superada con77pruebas independientes y revisión
estática conforme. Preflight y crear/sembrar/respaldar_actual terminaron; banco sintético OID205892.
La etapa de cifrado quedó incierta por exit2 de GPG; original, dump y artefactos conservados,
sin crear la copia ni los bancos históricos. [Corrección acotada](correccion-gpg.md) en tres
archivos ya incluidos: rutas GPG y continuación manual en diario hijo, con nueva gate antes
de operar. No se reintenta ni modifica el diario original para forzar avance.

**Cierre posterior del28/10:** corrección93casos verificados, continuación sellada y dos
ensayos reales conformes;15checkpoints completos, originales/bancos conservados y139SELECT
independientes de comprobación final. Ver [informe y límites](informe.md). No autoriza
contracción, producción ni publicación Git.
M10.2 permite comprobar la lógica con mocks; este bloque comprobaría PostgreSQL/PostGIS
y un archivo realmente cifrado y restaurado, sin usar datos de la demo o de usuarios.
No autoriza contracción física/HTTP, producción ni publicaciónGit.

## Problemas que deben resolverse antes del ensayo

1. El CLI Node de restauración heredado borra/recrea el destino; solo protege el nombreBASE.
   La revisiónM10.2 lo documentó. Se retirará el borrado automático: si el destino existe,
   se rechaza y conserva íntegro. No usar`simulacro`, cuyo cierre heredado borra su copia.
2. La migración0020 inicializa cuatro filas en`categoria`. Un restore de datos sobre un esquema
   recién migrado puede colisionar con esas filas. Es una inferencia estática: todavía no se
   ejecutó ese restore. Se preparará exclusivamente el catálogo inicial de un destino nuevo
   y vacío antes de cargar, conservando después el catálogo exacto del respaldo.

No se vacía un catálogo de una instalación existente ni se usaCASCADE. Las guardas y las
pruebas negativas se implementan y revisan antes de ejecutar cualquier operación real.

## Inventario exacto propuesto

| Archivo | Cambio y riesgo controlado |
|---|---|
| `scripts/respaldo.mjs` | Rechazar destinos existentes; retirarDROPautomático de restaurar; preparar solo filas iniciales de un destino nuevo sin datos; permitir base administrativa explícita por argumento para evitar`postgres` en este ensayo |
| `scripts/respaldo.test.mjs` | Negativos con destino ocupado, catálogo modificado y SQLfallido; comprobar que no se borra nada ni se llega a cargar; conservar los23casos previos |
| `infra/respaldo/respaldo.sh` | Preparación equivalente del catálogo inicial, solo tras verificar destino vacío y filas de migración esperadas; mantener cifrado/manifiesto/guardas |
| `infra/respaldo/respaldo.test.sh` | Casos de seed del catálogo, rechazo de configuración/datos preexistentes y error; conservar los23previos |
| `scripts/ensayar-respaldo-multitematico.mjs` (nuevo) | Runner de ensayo con nombres fijos, diario/checkpoints, identidades, operadores y rutas limitados; importación/estado sin efectos; no limpieza automática |
| `scripts/ensayar-respaldo-multitematico.test.mjs` (nuevo) | Pruebas herméticas con operadores bloqueados para todos los guardas, errores, rechazos y etapas inciertas; sin fallback real |
| `.github/workflows/ci.yml` | Añadir las pruebas aisladas nuevas; conservar los trabajos y sus guardas. No ejecutarCI desde esta tarea |
| `docs/operaciones/respaldo-y-restauracion.md` | Nuevo rechazo de destino existente, procedimiento seguro y alcance exacto del ensayo |

Documentación de esta corrida, índices, roadmap14§5 yVentanaContexto. Sin editarAGENTS/CLAUDE,
contratos, esquema/migraciones, apps, API, geo, ETL, dependencias o configuración persistente.

## Conectividad y destinos reales solicitados

Solo PostgreSQL local ya instalado. **`template1` se usaría exclusivamente para metadatos y
crear estas cuatro bases nuevas**, con el rol dueño existente y sin modificar roles/contraseñas:

| Banco fijo | Contenido |
|---|---|
| `curichi_sdd_m10_20261027_actual` | Esquema0021 y pequeños ejemplos sintéticos de las cuatro categorías |
| `curichi_sdd_m10_20261027_copia_actual` | Restauración nueva del caso actual |
| `curichi_sdd_m10_20261027_pre0020` | Esquema0019 y ejemplos sintéticos de inundación |
| `curichi_sdd_m10_20261027_copia_pre0020` | Restauración en0019 y migración posterior a0021 |

Son identificadores fijos, aunque el ensayo se retome otro día. Si alguno existe sin un
diario/identidad propios verificados, se aborta; nunca se borra/reutiliza por coincidencia de nombre.
Los bancos y archivos se conservan al terminar. **NingúnDROP DATABASE,down,rm o-v de Docker.**
No conectar, consultar ni migrar`curichi`,`curichi_revision`,`postgres`,`curichi_e2e`,
`curichi_multitematica`o el bancoM9 como parte del ensayo. No respaldar datos municipales reales.
La demo solo podría pausarse y reabrirse con su runner normal para liberar recursos, sinseed/load
o migración; esa operación se registraría por separado.

## Herramientas y datos

Usar solo el contenedorPostGIS ya instalado, sus`pg_dump`/`pg_restore` y los ejecutablesGPG
existentes deGit. Se verificó únicamente su existencia física, no su funcionamiento:
`C:/Program Files/Git/usr/bin/{gpg,gpgconf,gpg-agent}.exe`.
No descargar, instalar, construir imágenes ni abrirS3/red externa.

El runner crea datos pequeños y ficticios por categoría, con referencias de fotos enDB,
cuentas,cupos,auditoría e idempotencia suficientes para verificar conservación. No copia fotos
u objetos de la instalación habitual. La prueba no cubre el respaldo externo de esos objetos.

Credenciales existentes solo en memoria privada; URLs derivadas hacia los destinos aprobados
antes de conectar. La clave simétrica del ensayo se genera en memoria, pasa por descriptor,
nunca porargv,archivo,log oGit. GNUPGHOME temporal propio, sin tocar el llavero del usuario;
cerrar solo un agenteGPG propio si se creó. Los archivos son sintéticos y van al scratch ignorado
`.turbo/m10-3-2026-10-27/`; ningún secreto durable se guarda allí.

## Orden, criterios y pruebas

1. F0 ybaseline de los archivos afectados, pruebas nuevas en rojo y cambios mínimos por
   trabajador raíz. Pruebas unitarias, sintaxis, formato, YAML y revisiones independientes.
   Ningún operador real hasta que las guardas y el código estén verificados y congelados.
2. Preflight real: herramientas sin instalación, memoria>=1500MiB, SQLsolo loopback,
   rol/contenedor/versiones y ausencia de los cuatro nombres. Crear e identificar únicamente
   esos bancos. No crear privilegios globales si faltan; abortar y conservar evidencia.
3. Para cada caso, migrar la fuente sintética, registrar conteos/huellas/IDs, generar dump y
   versión, cifrar y descifrar realmente, comprobar igualdadSHA256del archivo, restaurar solo
   en su destino nuevo. El caso histórico termina migrado a0021.
4. Comparar reportes por categoría y contenido con el verificadorM10.2 sobre SQLreal; comprobar
   cuentas/fotosreferidas/cupos/auditoría/idempotencia, geometrías, claves y restricciones.
   Distinguir columnas/tablas añadidas legítimamente por las migraciones del caso histórico.
5. Negativos controlados: destino ya ocupado se rechaza sin cambios; alteración de contenido
   con igual conteo y pérdida de una categoría se detectan dentro de una transacción propia
   del banco de copia y se deshacen conROLLBACK. Nunca probar esos negativos en bases protegidas.
6. Registrar stdout/exit/tamaños/duraciones reales y hashes antes de nuevas guardas de recursos.
   Si una etapa queda incierta, conservar diario y bancos; no repetir cargas/restores de forma
   automática. Informe y revisión independientes, cierre de procesos propios y reapertura
   de la demo si se pausó.

No se declara compatibilidad con todas las migraciones históricas por probar0019; no se
declaranS3, producción, recuperación tras apagado ni ventana de adopción. La clave efímera
permite verificar el cifrado en la corrida, no ofrece custodia durable para producción.
La eliminación de columnas/vistas y la actualización de consumidores internos mantienen
sus planes y aprobaciones propios. El resultado buscado aquí es un ensayo real seguro,
conservado y reproducible sobre datos ficticios.

## Aprobación y límites vigentes

La nueva aprobación M10.3 autoriza esta ampliación concreta de ocho archivos, conexión
administrativa a `template1`, cuatro bancos nuevos y ensayo cifrado/restaurado. Se conserva
la exclusión de bases protegidas, borrado de bases, producción, contracción física/HTTP y Git.
No solicitar de nuevo este permiso; cambios adicionales de inventario mantienen AGENTS§5.2.
