# M10.4 — Alcance de la verificación

Plan e inventario aprobados el2026-10-28. Banderas: base, datos, seguridad y geo;
CI activa revisión de infraestructura. No hay cambio de contratos ni interfaz.

## Línea base y comparación

Foto propia de990archivos y copias de los21archivos en
`.turbo/m10-4-2026-10-28/f0/manifest.json`. No comparar únicamente con HEAD: incluye
trabajo anterior de otros hitos. La foto conserva también los archivos nuevos anteriores
que Git todavía no sigue. Registrar cambios, ausencias y SHA; no guardar secretos.

Parte4 conserva salida literal, exit, RAM y casos de db/API antes de editar. Parte5 mide
su ámbito antes de sus cambios. La comparación final se hace por caso y significado,
además del conteo: no basta que suba el total si desapareció una aserción histórica.
Un caso verde que falle después bloquea; un rojo previo se informa y no se corrige de paso.

## Evidencia necesaria

- FK: metadatos Drizzle y catálogo efectivo de la fixture, asociación de fotos de cuatro
  categorías y cascade selectivo, con filas e IDs positivos. Mantener foto huérfana.
- Seed/helper: tabla física y filtro flood donde antes intervenía la vista, IDs/defaults,
  RNG/fechas/publicación/severidad, detalle y booleanos opcionales ausentes/false.
  Negativos con las otras categorías y autores ajenos a las cuatro cuentas recreadas.
  El recálculo global de puntos del seed permanece: no confundir IDs recalculados con
  pérdida de reportes/fotos ni prometer invariantes que ese proceso no conservaba.
- Cuotas: limpieza antigua y contador vigente distinguidos, día local/hoy/futuro,
  segunda pasada y campos de resumen con su significado original. Sin cambios de ACL.
- Bancos: imports sin operación, ejecutor hermético, errores detectados, SQL literal
  en PGlite; seis alias desde JSON conservan tipos/NULL. UV vacías sobreviven al
  LEFT JOIN, origen/vecino/semilla quedan en inundación. Estados y límites históricos
  permanecen; estos bancos no certifican el SELECT HTTP vigente.
- Limpieza preexistente aprobada: solo puntos de inundación en DELETE exterior;
  miembros leídos de reporte. Reportes/fotos/puntos ajenos sobreviven, aun con la
  misma marca sintética. Conservar también inundaciones sin la marca.
- SQL manual: mismas30tuplas/transacción/dominio/geometrías; ejecutar exclusivamente
  contra fixture ficticia con sus dependencias, nunca contra una instalación real.
- Humo CI: tres lecturas desde reporte filtrado; negativo con cero inundaciones y
  otras categorías presentes. Solo añadir el nuevo arnés en el bloque autorizado.

Parte4/Parte5 guardan ciclos rojos y verdes, suites db/arnés, tipos/build db, typecheck de
consumidores en serie y suite API dependiente de los helpers. Biome del delta, sintaxis
y YAML; no ampliar dependencias ni repetir builds de apps que sirven la demo.

## Reparto independiente y límites

Un verificador nativo ejecuta controles pertinentes y compara con la línea base; otro
agente revisa funcionalidad, seguridad y alcance en solo lectura. Ninguno edita producto.
Un solo heavy global, RAM>=1500MiB antes de cada comando. Salida propia y reutilizada
por SHA se distinguen; omisiones no cuentan como aprobadas. Regresiones vuelven al escritor.

El plan aprobado limita esta corrida a pruebas herméticas/PGlite. No se aplican los
operadores reales de la matriz histórica: PostgreSQL, roles, Docker, S3, HTTP, E2E, túneles,
CLI de bancos o seed/SQL manual en instalaciones reales están fuera de este bloque.
Las comunicaciones efímeras de loopback entre fixtures propias de la suite original
se conservan; no son acceso HTTP a la demo u otro servicio operativo. Un adaptador de
transporte simulado no se contará como equivalente a esas pruebas originales.
La demo y los bancos de M9/M10.3 se conservan. CI remoto no se ejecuta; una comprobación
de YAML o de su SQL no equivale a su job real. Los12casos PG/S3 históricos omitidos de API
siguen sin verificar si no hay evidencia nueva autorizada.

M10.3 conserva su cápsula/diarios completos y el intento GPG incierto original. Un cambio
autorizado posterior del humo CI se compara contra F0 M10.4; no invalida ni sobrescribe
la fuente congelada con la que se completó M10.3. Ninguna restauración se repite.

El informe final enumera archivos y límites; no declara M10 completo, cierre humano
de Fase1, despliegue, nueva publicación Git ni adopción de clientes antiguos.
