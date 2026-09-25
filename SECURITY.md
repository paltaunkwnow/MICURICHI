# Política de seguridad — Mi Curichi

Mi Curichi guarda **dónde se le inunda la casa a alguien**. Ese es el dato que hay que proteger y
el que ordena todo lo demás. Si encontrás una forma de sacar una ubicación exacta, de leer un
reporte sin moderar o de escribir en nombre de otra persona, queremos saberlo.

## Versiones cubiertas

El proyecto está en **Fase 1 (local)** y todavía no tiene despliegue público ni versiones
publicadas. Se atiende lo que haya en la rama `main`. No hay ramas de mantenimiento ni versiones
anteriores con soporte.

| Versión | Soporte |
|---|---|
| `main` | Sí |
| Cualquier otra rama o fork | No |

## Cómo reportar una vulnerabilidad

**No abras un issue público** para algo explotable.

Usá el aviso de seguridad privado de GitHub en este repositorio:
**Security → Advisories → Report a vulnerability**
(<https://github.com/paltaunkwnow/MICURICHI/security/advisories/new>). El hilo queda entre quien
reporta y quien mantiene el repositorio hasta que haya corrección.

Este proyecto **no tiene todavía una dirección de correo de seguridad ni un contacto municipal
designado**; no se inventa uno aquí. Definirlo es una de las cosas pendientes antes de cualquier
despliegue real, junto con el dominio y la política de retención.

No hay programa de recompensas.

### Qué incluir

- Qué ruta o componente, y con qué rol (anónimo, ciudadano, técnico, administración).
- Los pasos para reproducirlo, con el mínimo de peticiones que haga falta.
- Qué se obtiene: qué dato sale, qué acción se consigue, qué privilegio se gana.
- Versión del árbol (`git rev-parse HEAD`) y cómo lo levantaste.

### Qué NO incluir en el reporte

- **Ubicaciones reales de personas.** Si el problema es de geoprivacidad, describí el método y usá
  un reporte de prueba que hayas creado vos.
- Contraseñas, cookies de sesión o volcados de base de datos con datos de alguien.
- Secretos completos: los primeros caracteres bastan para identificar cuál es.

### Qué esperar

Es un proyecto pequeño y sin equipo dedicado: se responde en cuanto se puede, sin plazo
comprometido. Cuando haya corrección se publica con una nota que describe el fallo y su alcance,
y se acredita a quien lo encontró si quiere.

## Pruebas: qué está permitido

Contra **tu propia instalación local**, todo. Levantar la pila con `docker compose up -d` y
atacarla es la forma esperada de trabajar aquí.

Contra cualquier otra cosa, **nada**: no hay entorno público del proyecto, y no se autoriza probar
contra infraestructura municipal, dominios de terceros ni servicios externos.

## Qué protege el sistema

El modelo completo —qué se protege, de quién y con qué— está en
[`docs/seguridad/modelo-de-seguridad.md`](docs/seguridad/modelo-de-seguridad.md). En resumen:

| Frente | Qué hay |
|---|---|
| **Vista pública vs. técnica** | Rutas distintas (`/api/v1/reportes` y `/api/v1/tecnico/reportes`). El manejador público no mira la sesión: no puede construir una vista técnica aunque llegue una cookie |
| **Ubicación** | Desplazamiento determinista de hasta 30 m con sal secreta en reportes de vivienda; el punto publicable se guarda, así que el filtro por bbox no puede usarse como oráculo |
| **Identidad de quien reporta** | Nunca sale en la vista pública: ni correo, ni nombre, ni identificador de cuenta |
| **Autenticación** | Argon2id, cookie `HttpOnly` + `SameSite=Lax` + `Secure` en producción, doble caducidad, rotación de sesión al entrar, freno de fuerza bruta antes de verificar la contraseña |
| **Autorización** | Rol exigido por ruta. El autor de un reporte sale **siempre** de la sesión; el cuerpo no tiene campo de autor |
| **Abuso** | Cuenta obligatoria para escribir, un reporte por cuenta cada 60 min (atómico en PostgreSQL), límites por IP para reportes, lecturas, login y altas de cuenta, idempotencia |
| **Base de datos** | Tres roles con privilegios mínimos; el rol de la API no puede escribir la columna `rol` de `usuario`, así que el alta pública no puede fabricar un administrador |
| **Fotos** | Tipo por *magic bytes*, límite de megapíxeles leído en la cabecera, cargadores de libvips que no se usan bloqueados, plazo por imagen, EXIF eliminado y verificado |
| **Contenedores** | Solo lectura, sin capabilities, `no-new-privileges`, tope de procesos, base fijada por digest |
| **Secretos** | Solo por variables de entorno; escaneo en pre-commit y en CI (`pnpm secretos`) |

Riesgos residuales aceptados y comprobaciones que **no** se han hecho: están escritos, con nombre
y medida, en [`docs/seguridad/auditoria-2026-09.md`](docs/seguridad/auditoria-2026-09.md). No se
declara que el sistema sea seguro: se declara qué se probó y qué no.

## Gestión de secretos

- Nunca en el repositorio. `.env` está en `.gitignore`; `.env.example` lleva nombres y
  descripciones, jamás valores reales.
- Las sales (`IP_HASH_SAL`, `JITTER_SAL`) tienen longitud mínima obligatoria y el servicio **no
  arranca en producción** con los valores de ejemplo.
- Las contraseñas que aparecen escritas en el repositorio (`curichi-admin-local`,
  `curichi-tecnico-local`, `curichi-vecina-local`) son de desarrollo, están ahí a propósito y los
  seeds se niegan a ejecutarse con `NODE_ENV=production`.

## Antes de cualquier despliegue real

Sin esto, no se despliega:

1. Dominio y TLS; el panel técnico en un host distinto del público (las cookies no distinguen
   puertos, y la cookie nunca lleva `Domain`).
2. `COOKIE_SEGURA=1`, sales generadas, `METRICAS_TOKEN` o `/metrics` sin exponer.
3. Un contacto de seguridad de verdad, que hoy no existe.
4. Política de retención acordada con el municipio y respaldos cifrados.
5. Probar el conjunto detrás del proxy real que se vaya a usar: el *request smuggling* se abordó
   actualizando el runtime, pero no se ha probado una topología proxy → Node concreta.
