# infra — Parte 5

| Carpeta | Qué hay |
|---|---|
| `sql/` | Init del contenedor PostGIS: solo extensiones (`00-extensiones.sql`) y roles de aplicación (`01-roles.sh`). Corre una vez, al crear el volumen; para una base que ya existe, ver `docs/operaciones/manual.md`. |
| `docker/` | `servicio.Dockerfile` (api-core y geo-service), `app.Dockerfile` (web-ciudadano y panel-admin), `proxy.Dockerfile` (proxy de entrada) y `respaldo.Dockerfile` (trabajo de respaldos), cada uno con su `.dockerignore`. Ver `docker/README.md`. |
| `proxy/` | `Caddyfile` y `arrancar.sh` del proxy de entrada (perfil `servicios`): TLS, IP real del cliente, reparto entre réplicas. Van horneados en la imagen; cambiarlos exige reconstruirla. Ver `docs/operaciones/produccion.md`, «Topología». |
| `minio/` | `inicializar.sh`: bucket privado y usuario de api-core limitado a ese bucket (perfil `minio`, solo desarrollo). |
| `respaldo/` | `respaldo.sh`: pg_dump diario, cifrado, a un S3 externo, con retención y restauración verificada (perfil `respaldos`). |
| `observabilidad/` | Prometheus, reglas de alerta, Alertmanager y blackbox (perfil `observabilidad`). |
| `../docker-compose.yml` | Todo lo anterior, por perfiles. |

```bash
docker compose up -d postgis                                    # solo la base (desarrollo con pnpm dev)
docker compose --profile servicios --profile minio up -d        # la aplicación en contenedores, con su proxy
docker compose ps                                               # estado y healthchecks
docker compose logs -f postgis                                  # logs
docker compose stop                                             # parar (conserva todo)
```

`docker compose down -v` borra los volúmenes: la base y las fotos. Solo en una máquina de
desarrollo.

Respaldos: `docs/operaciones/respaldo-y-restauracion.md`. Monitoreo:
`docs/operaciones/observabilidad.md`. Producción: `docs/operaciones/produccion.md`.
