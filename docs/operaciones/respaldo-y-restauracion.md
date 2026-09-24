# Respaldo y restauración

> Responde a una sola pregunta: **«se perdió la base de datos, ¿cómo volvemos a tener el sistema
> en pie?»**. Todo lo de aquí son comandos que se pueden copiar y pegar, no buenas intenciones.

## Qué hay que respaldar y qué no

| Dato | ¿Respaldo? | Por qué |
|---|---|---|
| Tablas de `public` (reportes, fotos, usuarios, auditoría, puntos críticos) | **Sí, es lo único irrecuperable** | Lo escribieron los vecinos y los técnicos. Si se pierde, no hay de dónde sacarlo. |
| Objetos de fotos (`infra/.storage/fotos` o el bucket S3/MinIO) | **Sí** | Las filas de `reporte_foto` sin el objeto dejan fotos rotas. |
| Tablas de `geo.*` (distritos, unidades vecinales, manzanas) | No es imprescindible | Se regeneran con `pnpm etl:run` + `etl:load` desde `data/raw/`. Respaldarlas igual ahorra una hora de ETL. |
| `data/processed/` | No | Es salida del ETL, reproducible con un comando (CLAUDE.md §6.10). |
| `data/raw/` | **Sí, pero fuera de este sistema** | Es la entrega del municipio, inmutable. Debe estar en el almacenamiento del municipio, no solo aquí (§16, punto 2). |

## Respaldo

### Con Docker (el entorno de la Fase 2)

```bash
docker compose exec -T postgis pg_dump -U curichi -d curichi --format=custom --exclude-table=_migraciones --file=/tmp/curichi.dump && docker compose cp postgis:/tmp/curichi.dump ./respaldos/curichi-$(date +%Y%m%d-%H%M).dump
```

`--format=custom` permite restaurar en paralelo y elegir qué tablas traer; un `.sql` plano no.

`--exclude-table=_migraciones` está por el paso 3 de la restauración: allí las migraciones se
aplican **antes** de cargar los datos, así que la tabla de control ya viene rellena y las filas del
respaldo chocarían con su clave primaria. Sin esta exclusión, `pg_restore` escupe
`duplicate key value violates unique constraint "_migraciones_pkey"`, lo cuenta como «error
ignorado» y **sale con código 0**: el fallo se ve, pero no se nota.

> **En Git Bash sobre Windows**, `docker exec … /tmp/curichi.dump` no funciona: la shell traduce
> la ruta a `C:/Users/…/Temp/curichi.dump` antes de pasarla al contenedor y `pg_dump` responde
> `could not open output file`. Se evita con `MSYS_NO_PATHCONV=1` delante del comando, o usando
> `//tmp/curichi.dump`. En PowerShell, en macOS y en Linux no hace falta.

### Sin Docker (modo local, PGlite)

PGlite guarda todo en un directorio. Con el proceso **parado**:

```bash
tar -czf respaldos/pglite-$(date +%Y%m%d-%H%M).tar.gz infra/.pglite
```

> En caliente no sirve: se copiaría un estado a medias. Para un respaldo lógico con la base en
> marcha se usa `pg_dump` normal contra `127.0.0.1:5433`, que es un PostgreSQL de verdad por el
> socket.

### Fotos

```bash
tar -czf respaldos/fotos-$(date +%Y%m%d-%H%M).tar.gz infra/.storage/fotos
```

Con MinIO o S3: `mc mirror local/fotos ./respaldos/fotos/`.

## Restauración

1. **Levantar una base vacía.**

```bash
docker compose up -d postgis
```

2. **Aplicar el esquema.** Las migraciones son idempotentes y llevan su propio registro:

```bash
pnpm db:migrate
```

3. **Restaurar los datos.** `--data-only` evita chocar con el esquema que acaban de crear las
   migraciones; `--disable-triggers` evita que las claves foráneas rechacen filas por el orden
   de carga.

```bash
docker compose exec -T postgis pg_restore -U curichi -d curichi --data-only --disable-triggers --exit-on-error /tmp/curichi.dump
```

`--exit-on-error` es lo que convierte un problema en un fallo: por defecto `pg_restore` sigue
adelante, imprime «errors ignored on restore» y termina con código 0, de modo que una tarea
automática daría la restauración por buena.

4. **Restaurar las fotos** en `infra/.storage/fotos` (o en el bucket).

5. **Recalcular lo derivado.** Los puntos críticos se reconstruyen a partir de los reportes; no
   hace falta que vengan en el respaldo:

```bash
pnpm --filter db puntos-criticos:recalcular
```

6. **Comprobar** antes de dar por buena la restauración:

```bash
curl -s http://127.0.0.1:3001/ready
```

```sql
-- Debe haber reportes, capas vigentes y usuarios con rol.
SELECT count(*) FROM reporte_inundacion;
SELECT capa, version FROM geo.capa_version WHERE vigente;
SELECT rol, count(*) FROM usuario GROUP BY rol;
-- Ninguna foto servible debe apuntar a un objeto que no exista en el almacén.
SELECT count(*) FROM reporte_foto WHERE exif_sanitizado;
```

## Verificación periódica

Un respaldo que nunca se restauró no es un respaldo. Al menos una vez por trimestre:

1. Restaurar el último respaldo en una base desechable.
2. Ejecutar las comprobaciones del paso 6.
3. Anotar fecha, tamaño y tiempo de restauración.

## Pendiente de la Fase 2 (no inventado aquí)

Estas piezas dependen de infraestructura que todavía no existe y **no** se han configurado:

- Dónde se guardan los respaldos (fuera de la máquina que corre la base) y con qué retención.
- Automatización (cron, tarea programada o el gestor del hosting) y alerta si un respaldo falla.
- Cifrado de los respaldos en reposo: contienen datos personales (correos de técnicos,
  coordenadas exactas, `ip_hash`).
- Objetivos acordados de RPO y RTO. Sin ellos, «hacemos respaldos» no significa nada.

---

## Simulacro de recuperación (Fase 4)

> «Tenemos respaldos» no es evidencia de nada. Lo único que demuestra que un respaldo sirve es
> restaurarlo y comprobar que los datos están. Eso es lo que hace el simulacro, y hay que
> correrlo periódicamente, no el día que haga falta.

```bash
node scripts/respaldo.mjs simulacro
```

Respalda, crea una base nueva, restaura, compara los conteos contra el original, mide los tiempos
y borra la base de prueba. Devuelve código de salida distinto de cero si algo no coincide, así
que se puede enganchar a una tarea programada.

### Medido el 2026-09-15 contra PostgreSQL 18.6 + PostGIS 3.6.4 en Docker

Base de **1 004 MB** con **1 000 025 reportes** (750 021 publicables), 15 índices y 7 migraciones:

| Paso | Tiempo | Resultado |
|---|---:|---|
| `pg_dump -Fc -Z 6` | **5,2 s** | 68 MB (≈15× de compresión) |
| `pg_restore -j 4` en base vacía | **14,4 s** | — |
| **Total de recuperación** | **19,6 s** | — |

Verificación de la copia restaurada, todo coincidente con el original: 1 000 025 reportes,
750 021 publicables, 1 000 025 con `geom_publico`, **0 geometrías inválidas**, 12 unidades
vecinales, 2 usuarios, 7 migraciones, 15 índices, 1 punto crítico.

### Medido el 2026-09-18, ya con las capas reales del municipio cargadas

Base de **82 MB**: 38 reportes, 1 foto, 222 filas de auditoría, 23 puntos críticos y las dos
versiones de capas (las reales —16 distritos, 576 unidades vecinales, 27 527 manzanas— y la
muestra sintética que quedó cargada pero no vigente).

| Paso | Tiempo | Resultado |
|---|---:|---|
| `pg_dump -Fc -Z 6` | **3,3 s** | 19 MB |
| `pg_restore -j 4` en base nueva | **2,0 s** | — |
| **Total de recuperación** | **5,3 s** | — |

Las nueve comprobaciones del simulacro coincidieron con el original. Y comparando a mano original
y copia: mismos conteos por tabla, **mismo número de vértices** en las tres capas geográficas
(2 711, 17 255 y 1 432 143), misma huella `md5` de las geometrías de los reportes, 0 geometrías
inválidas y los 3 índices GIST del esquema `geo` en su sitio. La base temporal se borró al
terminar; la principal no se tocó.

### RPO y RTO

- **RTO** (tiempo hasta volver a estar en pie): unos **20 segundos de proceso por gigabyte**, más
  lo que tarde en existir la máquina y en arrancar los contenedores. Escala aproximadamente lineal.
- **RPO** (cuántos datos se pueden perder): **lo que haya entre respaldos**. Con un `pg_dump`
  diario, hasta 24 horas de reportes. Si eso no es aceptable —y para reportes ciudadanos
  probablemente no lo sea—, el paso siguiente es archivado continuo de WAL
  (`archive_mode = on` + `archive_command`), que baja el RPO a minutos. Eso NO está montado
  todavía y no se puede fingir que sí.

### Frecuencia, retención y cifrado propuestos

| Qué | Propuesta | Por qué |
|---|---|---|
| Frecuencia | Diaria, fuera de horario | Con 5 s de `pg_dump` el coste es despreciable; podría ser más frecuente. |
| Retención | 7 diarios + 4 semanales + 12 mensuales | Cubre el error que se nota al día siguiente y el que se nota en meses. |
| Cifrado | **Obligatorio antes de sacar el archivo de la máquina** | El dump lleva `ip_hash`, emails de técnicos y las coordenadas **exactas** de viviendas (§0.8). Un respaldo sin cifrar en un disco externo anula todo el trabajo de jitter. |
| Ubicación | Al menos una copia fuera del servidor | Un respaldo en el mismo disco que la base no protege del fallo más probable. |
| Prueba | `node scripts/respaldo.mjs simulacro` mensual | Un respaldo que nunca se restauró es una hipótesis. |

**Las fotos no están en el dump.** Viven en el volumen `fotos-data` (o en el bucket cuando exista
el adaptador S3) y se respaldan aparte. Un dump de base sin las fotos deja reportes apuntando a
objetos que ya no existen.
