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
- [ ] La vista pública no expone identidad del reportante (ni `autor_id`, ni correo, ni nombre) ni
      `direccion_aprox` cuando aplica jitter.
- [ ] Con sesión de ciudadano, el listado público devuelve exactamente lo mismo que sin ella.
- [ ] Las coordenadas exactas solo llegan a técnico/admin.
- [ ] `ip_hash` con sal y borrado programado; sin IP en claro en logs.

## Autenticación y cuentas
- [ ] Los mensajes de login y de alta no permiten saber qué cuentas existen.
- [ ] El alta pública sigue sin aceptar `rol` y sigue creando solo `ciudadano`.
- [ ] La cookie de sesión sigue siendo `HttpOnly` + `SameSite=Lax` + `Secure` en producción.
- [ ] Ningún token en `localStorage`, `sessionStorage`, URL ni parámetros de consulta.

## Autorización y abuso
- [ ] Cada handler verifica rol; moderación y exportación exigen `tecnico` o `admin`.
- [ ] Toda ruta de ESCRITURA exige sesión (crear reporte y subir foto, incluidas).
- [ ] El identificador de autor sale de la sesión, nunca del cuerpo de la petición.
- [ ] Un rol `ciudadano` sigue recibiendo 403 en `/api/v1/tecnico/*` y en `/api/v1/admin/*`.
- [ ] La cuota por cuenta se aplica con el UPDATE condicional dentro de la transacción; si la
      tocaste, la prueba de concurrencia contra PostgreSQL real pasa.
- [ ] Rate limiting y honeypot activos en creación de reportes, subida de fotos, login y altas.
- [ ] Nada se publica en estado `nuevo`.

## Auditoría y cabeceras
- [ ] Transiciones de estado, reclasificaciones, fusiones y activaciones de capa escriben en `auditoria`.
- [ ] CORS restringido a los orígenes de las Partes 1 y 2; cabeceras de seguridad configuradas.
