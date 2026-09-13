# infra/docker — Parte 5

Dockerfiles por servicio. Se agregan cuando exista el servicio correspondiente:

| Archivo | Servicio | Tarea de Fase 1 |
|---|---|---|
| `api-core.Dockerfile` | `services/api-core` (Parte 3) | 6 |
| `geo-service.Dockerfile` | `services/geo-service` (Parte 4) | 5 |

Reglas: imagen base `node:24-alpine` o `node:24-slim` `<a confirmar>`, usuario no root, `HEALTHCHECK` contra `/health`, sin secretos en la imagen.
