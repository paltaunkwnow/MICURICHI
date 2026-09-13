# infra — Parte 5

- `sql/`: init del contenedor PostGIS. Solo extensiones y roles. Corre una vez al crear el volumen; para reejecutarlo: `docker compose down -v` (borra los datos locales).
- `docker/`: Dockerfiles por servicio.
- `../docker-compose.yml`: PostGIS 18 + PostGIS 3.6, MinIO y creación del bucket de fotos.

Comandos útiles:

```bash
docker compose up -d            # levantar
docker compose ps               # estado y healthchecks
docker compose logs -f postgis  # logs
docker compose down             # apagar (conserva datos)
docker compose down -v          # apagar y borrar volúmenes (datos locales)
```

Backup manual en Fase 1: `docker compose exec postgis pg_dump -U curichi curichi > respaldo.sql`.
