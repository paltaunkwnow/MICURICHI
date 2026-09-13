# Checklist de seguridad para PR (Parte 5)

Aplicar a todo PR que toque `services/api-core`, manejo de fotos, autenticación o exposición pública de datos. Fuente: `CLAUDE.md` §13.

## Secretos y configuración
- [ ] Ningún secreto, clave o credencial en el diff (revisar también fixtures y tests).
- [ ] Toda variable nueva está en `.env.example` sin valor real.

## Entradas y archivos
- [ ] Todo payload se valida en el servidor con los esquemas de `packages/contracts`.
- [ ] Tipos de archivo verificados por *magic bytes*, no por extensión; tamaño máximo aplicado.
- [ ] Las fotos se reprocesan y se eliminan sus metadatos EXIF antes de guardarse; existe test que lo prueba.
- [ ] Nombres de objeto generados por el servidor, nunca el nombre original.

## Privacidad
- [ ] La vista pública no expone identidad del reportante ni `direccion_aprox` cuando aplica jitter.
- [ ] Las coordenadas exactas solo llegan a técnico/admin.
- [ ] `ip_hash` con sal y borrado programado; sin IP en claro en logs.

## Autorización y abuso
- [ ] Cada handler verifica rol; moderación y exportación exigen `tecnico` o `admin`.
- [ ] Rate limiting y honeypot activos en creación de reportes y subida de fotos.
- [ ] Nada se publica en estado `nuevo`.

## Auditoría y cabeceras
- [ ] Transiciones de estado, reclasificaciones, fusiones y activaciones de capa escriben en `auditoria`.
- [ ] CORS restringido a los orígenes de las Partes 1 y 2; cabeceras de seguridad configuradas.
