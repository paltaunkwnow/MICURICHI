# Cómo trabajar en Mi Curichi

Esta guía es para quien acaba de clonar el repositorio y va a tocar código. Lo que **manda** es
[`CLAUDE.md`](CLAUDE.md): dominio, arquitectura, reglas de carpetas, pipeline de datos, seguridad
y fases. Esto es el resumen operativo.

---

## 1. Levantarlo

Ver [`README.md`](README.md#arranque). En resumen, sin Docker:

```bash
corepack enable && pnpm install
cp .env.example .env    # editá al menos las contraseñas
pnpm db:local           # dejar abierta: PostGIS en 127.0.0.1:5433
pnpm db:seed:samples
pnpm dev
```

---

## 2. La regla que más sorprende: carpetas designadas

El trabajo está repartido en **cinco partes** y cada tarea se asigna a **una**, con **una carpeta**
donde puede crear, editar y borrar. Fuera de esa carpeta, **no se toca**.

| Parte | Carpeta | Qué hace |
|---|---|---|
| 1 | `apps/web-ciudadano/` | Mapa público, detalle, formulario de reporte, PWA |
| 2 | `apps/panel-admin/` | Moderación, filtros, exportación, indicadores |
| 3 | `services/api-core/` | API, reglas de negocio, auth, fotos, auditoría |
| 4 | `packages/db/`, `services/geo-service/` | Esquema, migraciones, PIP, capas, puntos críticos |
| 5 | `pipelines/geodata-etl/`, `infra/`, `e2e/`, `.github/`, `data/processed/`, `data/samples/`, raíz | ETL, Docker, CI, seguridad, calidad |

Excepciones, y solo dos:

- **`packages/contracts/`**: cualquier parte puede tocarlo cuando el cambio es de contrato **y lo
  anuncia en el plan de la tarea**. La Parte 3 lo revisa. Ningún paquete define por su cuenta un
  tipo que viaje entre partes.
- **`docs/decisiones/`**: el ADR de la propia tarea.

Si ves un fallo fuera de tu carpeta: **documentalo y avisá, no lo arregles**. Archivo, línea,
síntoma y riesgo, en el resumen de la tarea o en el PR.

Y dos cosas que no se tocan nunca sin autorización explícita: `data/raw/` (es inmutable: si algo
del origen está mal, es una entrega nueva con su `MANIFEST.md`) y `CLAUDE.md`.

---

## 3. El ciclo

```
plan corto → aprobación → código → pruebas → resumen
```

Sin excepciones. El plan dice a qué parte pertenece la tarea, qué carpeta toca y si hay cambio de
contrato.

---

## 4. Antes de abrir un PR

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm secretos      # escaneo de secretos en el árbol
pnpm auditoria     # dependencias con CVE conocido
pnpm test:e2e      # recorridos completos (necesita la pila levantada y sembrada)
```

Y si tocaste base de datos, con PostgreSQL de verdad levantado:

```bash
pnpm privilegios   # la matriz real contra la documentada
```

La lista completa está en [`docs/PR_CHECKLIST.md`](docs/PR_CHECKLIST.md).

---

## 5. Convenciones de código

- **TypeScript `strict`.** Sin `any` salvo con comentario que lo justifique; sin `@ts-ignore`.
- **Biome** es la única fuente de formato y lint (`pnpm lint:fix`). Nada se mergea en rojo.
- **Nombres del dominio en español** (`reporte`, `unidad_vecinal`, `severidad`); lo técnico
  genérico en inglés (`handler`, `middleware`). Nunca mezclados dentro del mismo identificador.
- Columnas y campos de API en `snake_case`; variables TS en `camelCase`, con mapeo explícito en la
  capa de datos.
- **Todo texto visible en español**, sin anglicismos evitables y con voseo («contanos qué ves»).
- Comentarios solo donde el **porqué** no se ve en el código. Nada que repita lo que el código ya
  dice. Sí, en cambio, todo lo que explique una decisión rara: casi todos los comentarios largos
  de este repositorio están donde están porque algo falló ahí y no queremos que vuelva.
- Funciones de dominio (severidad, máquina de estados) **puras**, en `contracts` o en el
  `dominio/` del servicio: sin red y sin base de datos.

---

## 6. Reglas que no se negocian

Si tu cambio choca con alguna de estas, paralo y preguntá.

1. **La ruta pública no mira la sesión.** `GET /api/v1/reportes` devuelve lo mismo a todo el
   mundo. Si necesitás datos distintos según quién pregunta, hacé **dos rutas**, no una con un
   `if`. Esto cierra el hallazgo A-01 y no se reabre.
2. **El autor sale de la sesión, nunca del cuerpo.** Ningún esquema de entrada lleva un campo de
   autor, de rol ni de estado.
3. **La cuota de reportes se aplica con un UPDATE condicional atómico**, dentro de la misma
   transacción que inserta. Un `SELECT` seguido de un `INSERT` tiene una carrera justo donde
   importa.
4. **`GRANT` uno a uno.** Nada de `GRANT ... ON ALL TABLES` ni `ALTER DEFAULT PRIVILEGES`: una
   tabla nueva tiene que empezar sin permisos y fallar a la vista.
5. **Ningún secreto en el repositorio.** `.env.example` lleva nombres, nunca valores.
6. **La ubicación exacta no sale de la vista técnica.** Si añadís un campo derivado de la
   geometría, pensá si se puede cruzar con el punto desplazado.
7. **No se quita una protección para que pase un test.** Si un test estorba, o el test está mal o
   la protección está mal: se decide cuál, se arregla y se explica en el comentario.
8. **`data/raw/` es de solo lectura.** Para todas las partes, incluida la 5.

---

## 7. Migraciones

Viven en `packages/db/migraciones/`, en SQL, numeradas y en orden. Se crean con
`pnpm db:generate` y se aplican con `pnpm db:migrate`.

- **Una migración ya aplicada no se edita.** Si hay que corregirla, va otra encima.
- Tienen que poder aplicarse **desde cero sobre una base vacía** y **sobre una base que ya
  existe**. Las dos cosas se prueban antes del PR.
- Si conceden privilegios, la matriz de `packages/db/src/cli/verificar-privilegios.mjs` se
  actualiza en el mismo PR, y `pnpm privilegios` tiene que pasar.
- Una migración que dependa de roles que pueden no existir (el modo local sin Docker corre sobre
  PGlite, que es de un solo usuario) se salta a sí misma con un `NOTICE`, como la 0008 y la 0009.

---

## 8. Pruebas

| Dónde | Qué cubre |
|---|---|
| `services/*/test/`, `packages/*/test/` | Unitarias e integración, con Vitest sobre PGlite |
| `apps/*/src/**/*.test.ts` | Lógica de interfaz |
| `e2e/tests/` | Recorridos completos con Playwright, contra la pila levantada |

Dos cosas que conviene saber antes de pelearse con una prueba rara:

- **PGlite es de una sola conexión** y multiplexa las sesiones sobre ella (ADR 0003). Sirve para
  probar lógica; **no** sirve para probar bloqueos de fila ni concurrencia alta: una transacción
  que espera un bloqueo deja al motor entero esperando. Lo que necesita concurrencia real vive en
  `services/api-core/test/cuota-concurrencia-pg.test.ts`, que se omite salvo que le pases
  `DATABASE_URL_PG_REAL`.
- **Cada cuenta puede crear un reporte por hora.** Una prueba que necesite varios usa
  `liberarCuota` (que adelanta el reloj de esa cuenta, no apaga el límite) o se crea una cuenta
  por caso. El límite sigue aplicándose en todas.

Si corregís un fallo, el PR trae la prueba que falla sin el arreglo. Si es de seguridad, además:
**volvé a ejecutar el ataque original**. Que el código parezca correcto no es evidencia.

---

## 9. Git

- **Conventional Commits en español, con scope**:
  `feat(api-core): exigir cuenta para crear un reporte`
  `fix(web-ciudadano): no perder el borrador al iniciar sesión`
  Tipos: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `perf`, `build`.
  Scopes: `web-ciudadano`, `panel-admin`, `api-core`, `geo-service`, `db`, `geodata-etl`,
  `contracts`, `infra`, `e2e`, `docs`, `repo`, `claude`.
- Una rama por paquete y fase: `feat/<scope>/<descripcion-corta>`, `fix/<scope>/<...>`.
- **Nada directo a `main`.** Solo por PR con CI en verde.
- Husky verifica el formato del mensaje y pasa Biome sobre lo que se va a commitear.

Título del PR con la parte y la carpeta: `[P3 api-core] Cuota de reportes por cuenta`.

---

## 10. Qué NO cambiar sin pensarlo dos veces

- El **contrato de la API** (`packages/contracts`): es *breaking* por defecto. Se versiona, se
  anota en el `CHANGELOG.md` del paquete y las partes consumidoras se adaptan en sus propias
  tareas.
- La **tabla de severidad** (§9.1): es reproducible a propósito y cada reporte guarda con qué
  versión se calculó.
- El **jitter y su sal**: cambiar la sal mueve todos los puntos publicados de sitio.
- El **radio de recurrencia** (25 m): cambia qué reportes se agrupan y, con ello, los puntos
  críticos que ya existen.
- Los **límites antiabuso**. Bajarlos o quitarlos es una decisión de seguridad, no de comodidad.

---

## 11. Licencia

El repositorio **no tiene licencia declarada**, y este documento no le pone una: es una decisión
de quien es dueño del proyecto. Mientras no exista un archivo `LICENSE`, se aplica el derecho de
autor por defecto y no hay permiso implícito para usar, copiar ni redistribuir el código.

Aparte, las **capas geográficas del municipio** (`data/raw/`) tienen sus propias condiciones de
uso, que no se han documentado todavía y que hay que confirmar con quien las entregó. No se
versionan en el repositorio.
