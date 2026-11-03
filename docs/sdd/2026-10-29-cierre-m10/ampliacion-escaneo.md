# Ampliación propuesta — precisión del escáner antes del PR

**APROBADO por el usuario el03/11/2026:** «Sí, corregir y verificar (Recomendado)»,
respuesta a `call_30337537331d4cdea56061d9a224ca34`. Inventario de tres rutas autorizado.
Antes de implementar no se había editado el escáner ni aplicado excepciones.

## Problema comprobado

La verificación independiente ejecutó el CLI original sobre la lista explícita del delta
y los candidatos de publicación:2y9alertas, respectivamente. Se conservaron la salida
original privada y los hallazgos sanitizados por archivo/línea/regla. No se imprimieron
valores de `.env` ni se publicó nada.

La regla de asignación toma el identificador `decodeURIComponent` como si fuera una
contraseña literal. Afecta a tres operadores y a una explicación Markdown del mismo
código. Las otras alertas señalan URL sintéticas de pruebas, incluidas pruebas históricas
cuyas fuentes/cápsulas deben permanecer intactas. Se comprobará cada una sin exponer
valores reales. No se añade una exención general para pruebas, scripts o documentos.

La compilación y las1477pruebas independientes aprobaron; estos resultados no permiten
omitir el pre-commit. El CLI y los hooks deben seguir rechazando secretos reales.

## Inventario y meta

Parte5, raíz/seguridad; trabajador raíz, sin operaciones ni cambios de producto.

| Archivo | Ajuste propuesto |
|---|---|
| `scripts/buscar-secretos.mjs` | Distinguir el valor calculado sin comillas de un literal; admitir únicamente los marcadores sintéticos identificados en su contexto de prueba local. Mantener las demás reglas, selección de archivos, límites y salidas. No ignorar una línea mixta que también contenga un secreto real. |
| `scripts/buscar-secretos.test.mjs` (nuevo) | Casos del CLI para los nueve positivos falsos, valores literales reales y casos mixtos. Entradas sintéticas creadas para probar reglas, sin claves reales ni dependencias nuevas. |
| `.github/workflows/ci.yml` | Añadir únicamente la ejecución de esa suite al control de secretos existente; conservar sus escaneos y demás etapas. |

No se cambian los operadores históricos, las credenciales de sus fixtures, las cápsulas,
los tests de dominio, la política de secretos, los hooks ni sus permisos. El nuevo archivo
de pruebas no redefine qué se permite publicar; comprueba la regla del CLI de producción.

## Verificación exigida

1. Capturar preimagen/SHA y conservar las alertas originales como baseline roja.
2. Probar primero los contraejemplos: los nueve falsos positivos deben fallar con el
   escáner anterior y pasar tras la corrección. Construir el contenido sensible sintético
   en memoria para no introducir un nuevo literal problemático en el propio test.
3. Seguir rechazando claves privadas, tokens de proveedores, URL con contraseña real y
   asignaciones literales largas. Un literal llamado como una función, una contraseña sin
   comillas y una línea que combine una lectura calculada con un secreto real se rechazan.
4. Un marcador de prueba en un servidor ajeno o un valor distinto del marcador no adquiere
   permiso por estar en un archivo de pruebas. Conservar placeholders existentes y los
   modos de selección por índice/`--todos`, sin eximir archivos completos nuevos.
5. Suite propia e independiente, ROOTBiome/sintaxis/YAML y nuevo escaneo de todos los
   candidatos, incluidos los archivos sin seguimiento. No repetir DB/API/geo sin cambios.
6. En el commit real, mantener pre-commit y commit-msg; nunca `--no-verify` ni desactivar
   reglas para obtener un resultado verde. Conservar intentos y resultados efectivos.

## Riesgo y límite

Un filtro demasiado amplio podría ocultar un secreto verdadero. Por eso la corrección
debe ser específica y probar casos mixtos/negativos, con revisión independiente antes de
publicar. No se concede ninguna autorización operacional, migración, despliegue o merge.

Se solicita esta ampliación concreta por AGENTS.md§5.2: «Para tocarlo hace falta
autorización explícita con archivo, motivo y riesgo». El escáner y su test nuevo no estaban
en las96rutas del inventario M10; la CI ya estaba incluida, pero esta adición se declara.
