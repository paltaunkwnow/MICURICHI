# M9 — Medición de escala con las cuatro categorías reales

**Estado: aprobado por el usuario el 2026-10-25; F0 iniciada.** Respuesta explícita:
«Aprobar y ejecutar M9». Incluye inventario, banco propio y pausa/reapertura temporal de demo.
La entrega funcional M6–M8 ya está verificada en la instalación separada y la demo sigue
encendida. Este plan no autoriza cambios de producción ni la contracción de M10.

## 1. Objetivo y antecedente

Medir el modelo actual (contracts0.24.0, migraciones hasta0021) con **1.000.000 de reportes
en total:250.000 por categoría**. Comprobar consultas reales y separación de resultados;
informar capacidad, planes de ejecución y límites medidos en este portátil.

M2 ya midió ese volumen sobre la0020 y recomendó combinar GIST con btree parcial por
categoría/fecha. La0021 incorporó el índice. Se reutiliza su método y evidencia, sin
presentar sus números como una nueva medición ni repetir comparativas de índices sin motivo.
Antecedente: [medicion.md de M2](../2026-10-08-base-multicategoria/medicion.md).

No hay una cifra de rendimiento M9 medida todavía. No se promete soportar una cantidad
de usuarios concurrentes mediante un banco de consultas de una sola conexión.

## 2. Alcance, datos y aislamiento

- Parte principal5, calidad/operación; subtrabajoParte4 para consultas y datos espaciales.
  Contracts/API/geo se consumen sin cambiar su código productivo.
- Banco nuevo fijo `curichi_sdd_m9_20261025`, con dueño existente, identidad/OID/comentario
  y diario propios. Si el nombre existe sin procedencia acreditada, abortar y conservarlo.
- Validar todas las URL antes de abrir un cliente. `curichi_e2e` solo permite bootstrap de
  metadatos; no se conecta `curichi`, `curichi_revision` ni `postgres`. Nunca se escribe
  `curichi_multitematica`, cuyo contenido debe conservarse.
- Crear/migrar/cargar únicamente el banco nuevo; reutilizar archivos procesados de
  `DM_UV_MZ_2025` sin transformar originales. Distrito/UV son necesarios para las consultas;
  declarar explícitamente si manzanas se omiten porque ninguna consulta medida las usa.
- Usar detalles/subtipos válidos de las cuatro definiciones reales, severidad calculada
  con sus funciones y puntos sintéticos dentro de UV. Conservar triggers y restricciones.
  Generar combinaciones válidas mediante contracts, sin duplicar sus fórmulas en SQL.
- Separar los ejes categoría, espacio, tiempo, estado y privacidad para evitar correlaciones
  accidentales. Guardar semilla, distribución y conteos efectivos por categoría/estado.
- Carga directa por lotes en el banco, etiquetada como fixture de medición. No representa
  un millón de envíos aceptados por la API ni omite sus cupos en las pruebas funcionales.
- Si hacen falta cuentas para lecturas técnicas HTTP, serán sintéticas del banco nuevo,
  con contraseña aleatoria en memoria y hashing real; no se modifican roles globales.
- Activar las cuatro categorías únicamente en el banco de medición, con actor sintético
  y auditoría; esa activación no cambia la instalación de demo ni las bases habituales.
- No borrar automáticamente el banco ni los logs al finalizar. Se conservarán para revisar
  los resultados; cualquier descarte posterior requerirá autorización. No limpiar cachés.

## 3. Inventario propuesto

| Parte | Archivos que puede escribir | Motivo |
|---|---|---|
| P5 | `scripts/medir-cuatro-categorias.mjs` | Orquestación reproducible con destino fijo, guardas, carga sintética, captura de planes y resultados |
| P5 | `scripts/medir-cuatro-categorias.test.mjs` | Negativos de destinos/procedencia, preservación de datos y estadística sin llamar bases reales |
| P5 | Documentos de esta corrida: `plan.md`, `arbol-inicial.txt`, `archivos.txt`, `linea-base.md`, `implementacion.md`, `medicion.md`, `verificacion.md`, `revision.md`, `informe.md` | Trazabilidad, método, resultados y revisión |
| P5 | `VentanaContexto.md`, `docs/sdd/README.md`, `docs/README.md`, §5 de `docs/arquitectura/14-decisiones-m0-y-plan-m1.md` | Estado real y enlaces al avanzar |
| P4/P5, evidencia | `.turbo/m9-2026-10-25/` | SQL parametrizado derivado de consultas actuales, planes JSON, distribuciones, manifiestos y logs sin secretos |

No incluye cambios en apps, contracts, esquema/migraciones, endpoints, proxy, E2E habituales,
AGENTS.md/CLAUDE.md, dependencias, Docker o configuración persistente. Si medir revela un
defecto productivo o la necesidad de otro índice, documentar archivo/motivo/riesgo y proponer
la corrección; este plan no autoriza optimizaciones de pasada ni cambiar límites de negocio.

## 4. Reparto y verificación

1. Principal: F0, inventario/hashes y clasificación base/api/geo/seguridad/privacidad/operación.
   Un escritor por carpeta y un pesado global. No ejecutar una nueva suite global intacta.
2. Trabajador raízP5: antes/después de cada edición, pruebas del runner implicado, sus nuevos
   negativos y sintaxis/Biome. Mostrar fallo previo de cada guarda nueva y conservar la salida.
3. EspecialistaP4: revisar las consultas/fixtures contra fuentes reales y contracts0.24;
   producir cobertura por categoría y comprobar ausencia de mezcla. Sin editar producto.
4. Verificador: medir solo al terminar guardas y tras revisar procedencia. Guardar comandos,
   tiempos, volumen, planes, memoria y tamaños; comparar los resultados correctos, no solo tiempos.
5. Revisor/auditor independientes: alcance, SQL, distribución, cálculos, destinos y límites
   de las conclusiones. Ninguno commitea ni realiza conexiones a bases protegidas.

La medición comparte recursos del portátil con la demo. La aprobación incluye **detener
temporalmente solo el runner de demo acreditado**, después de avisar, y reabrirlo al terminar.
Comparar sus datos antes/después de esa ventana, sin seed ni nuevas migraciones de la demo.
No cerrar otras aplicaciones ni cambiar potencia, seguridad, memoria virtual o límites.
Guardas vigentes:1500MiB para controles estáticos;2500MiB antes de abrir navegador con
servicios vivos si una comprobación visual resulta necesaria. Sin descarga/instalación.
Comprobar espacio libre y registrar condiciones antes de cargar; si no hay margen suficiente,
detenerse conservando evidencia y solicitar una decisión, sin borrar archivos para continuar.

## 5. Matriz de medición y aceptación

| CA | Comprobación y evidencia exigida |
|---|---|
| 1 | Banco propio, migraciones0021, catálogo/cuatro definiciones y capas comprobados; negativos prueban cero conexiones a destinos prohibidos |
| 2 | Un millón exacto y250.000por categoría, detalles/severidades válidos y distribuciones decorrelacionadas; no datos personales reales |
| 3 | Listado público y técnico con bbox pequeño/barrio/ciudad, primera página y filtros de categoría; comparaciones contra conteos de control, sin contaminación |
| 4 | Agregados UV/distrito, indicadores, ejecutivo y exportación con categoría y«Todas», usando límites de filas reales; declarar truncamiento cuando corresponda |
| 5 | DBSCAN con cada radio real (Inundación25m; restantes10m según definiciones), separación de categorías y recálculo acotado frente a completo; no mezclar puntajes entre modelos |
| 6 | PIP sobre capas reales e índices GIST; `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` de los casos representativos, sin desactivar índices ni forzar el planificador |
| 7 | Tiempos de carga y tamaños heap/índices/base; muestras crudas, mediana y máximo de9repeticiones por consulta y3DBSCAN, con calentamiento declarado. No llamar p95 al máximo de9muestras ni afirmar caché fría sin controlarla |
| 8 | Si se mide HTTP, usar instancias API/geo propias en puertos libres distintos de la demo y URL privada del banco; respetar rate limits, sin desactivarlos. Distinguir latenciaSQL,HTTP y prueba visual |
| 9 | Revisión independiente conforme, comparación con M2 explicando cambios de versión/método y conclusiones limitadas a este equipo y carga; datos y disponibilidad de demo restaurados |

Las regresiones funcionales son bloqueantes. Para tiempos no se inventa un SLA municipal:
se informan los valores y los objetivos ya documentados que realmente correspondan.
No declarar CI, multiusuario, cámara física, Docker habitual, producción ni pérdida de energía
certificados por esta medición. Las omisiones y vulnerabilidades previas siguen visibles.

## 6. Aprobación requerida

Se aprobó conjuntamente el objetivo, inventario y operación: crear/cargar el banco nuevo
y pausar/reabrir únicamente la demo durante la medición. No se ha creado todavía el banco.
La exigencia procede de AGENTS.md §0.9 y §12.4: plan aprobado antes de programar/repartir.
No autoriza ejecutar M10, borrar bases/archivos, modificar producción ni publicar Git.
