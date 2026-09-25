# Checklist antes de abrir un Pull Request

Lista completa para cerrar un PR de Mi Curichi. La parte estrictamente de seguridad de código está
desarrollada en [`docs/seguridad/checklist-pr.md`](seguridad/checklist-pr.md); esto de aquí es el
recorrido entero, incluida la infraestructura y la documentación.

Los comandos son los reales del `package.json`. Si alguno no existe, el que sobra es el comando de
esta lista, no el `package.json`.

---

## Código

```bash
pnpm typecheck     # tsc --noEmit en los 9 paquetes
pnpm lint          # Biome: formato y reglas (incluidas las de accesibilidad)
pnpm test          # Vitest en todo el monorepo
pnpm build         # build de los 7 paquetes que lo tienen
```

- [ ] `pnpm typecheck` sin errores.
- [ ] `pnpm lint` limpio. Si hiciste `pnpm lint:fix`, revisá el diff que dejó.
- [ ] `pnpm test` en verde, sin pruebas omitidas nuevas y sin `.only` olvidado.
- [ ] `pnpm build` sin warnings nuevos.
- [ ] Cada corrección trae una prueba que **falla sin el arreglo**.
- [ ] Sin `console.log` de depuración, sin `any` sin justificar, sin `@ts-ignore`.
- [ ] Nada fuera de la carpeta designada de la parte (o con la autorización anotada en el PR).

### E2E

```bash
pnpm test:e2e      # Playwright; necesita la pila levantada y sembrada
```

- [ ] `pnpm test:e2e` en verde.
- [ ] Si tocaste una pantalla, el recorrido que la usa sigue pasando (`recorrido-completo`,
      `cuenta-ciudadana`, `mapa-publico`, `navegacion`, `accesibilidad`).

---

## Seguridad

```bash
pnpm secretos      # escaneo de secretos sobre el árbol
pnpm auditoria     # pnpm audit --audit-level high
pnpm privilegios   # matriz real de privilegios contra la documentada (PostgreSQL real)
```

- [ ] `pnpm secretos` sin hallazgos. Mirá también fixtures, pruebas y capturas.
- [ ] `pnpm auditoria` sin vulnerabilidades altas ni críticas.
- [ ] Toda variable de entorno nueva está en `.env.example`, **sin valor real** y con su etiqueta
      (`[OBLIGATORIA]`, `[PRODUCCIÓN]`, `[OPCIONAL]`, `[SOLO DESARROLLO]`, `[SENSIBLE]`).

### Autenticación y sesión

- [ ] Ninguna ruta nueva de escritura quedó sin `requerirRol`.
- [ ] La cookie de sesión sigue siendo `HttpOnly` + `SameSite=Lax` + `Secure` en producción.
- [ ] Ningún token en `localStorage`, `sessionStorage`, URL ni parámetros de consulta.
- [ ] Los mensajes de error de login y de alta **no** permiten saber qué cuentas existen.

### Autorización

- [ ] El identificador de usuario sale **siempre** de la sesión; ningún esquema de entrada tiene
      campo de autor, de rol o de estado.
- [ ] Un rol `ciudadano` sigue recibiendo 403 en `/api/v1/tecnico/*`, `/api/v1/exportar`,
      `/api/v1/indicadores` y `/api/v1/admin/*`.
- [ ] Probado a mano o en test: enviar `rol`, `autor_id`, `estado` o `creado_en` en el cuerpo no
      cambia nada.

### Límites de uso

- [ ] La cuota por cuenta se sigue aplicando con el UPDATE condicional, dentro de la transacción.
- [ ] El límite por IP sigue existiendo y es independiente del de la cuenta.
- [ ] Si tocaste la cuota o la idempotencia: la prueba de concurrencia real pasa.
      `DATABASE_URL_PG_REAL=... pnpm --filter api-core exec vitest run test/cuota-concurrencia-pg.test.ts`

### Privilegios de base de datos

- [ ] `pnpm privilegios` dice «privilegios correctos».
- [ ] Si añadiste una tabla, la matriz de `verificar-privilegios.mjs` la contempla (aunque sea con
      lista vacía: cerrada por defecto).
- [ ] Ningún `GRANT ... ON ALL TABLES` ni `ALTER DEFAULT PRIVILEGES`.

### Caché y privacidad

- [ ] Ninguna ruta nueva devuelve datos distintos según quién pregunta desde la **misma** URL.
- [ ] Las respuestas que dependen de la sesión salen con `private, no-store` (es el valor por
      defecto: solo hay que comprobar que nadie lo pisó).
- [ ] Ningún campo nuevo derivado de la geometría exacta sale por una ruta pública.
- [ ] La vista pública sigue sin `autor_id`, sin correo y sin `ip_hash`.

---

## Infraestructura

- [ ] `docker compose up -d` deja los cuatro contenedores `healthy`.
- [ ] `curl -s http://127.0.0.1:3001/ready` devuelve `"ok": true`.
- [ ] Las migraciones aplican **sobre una base vacía**: `docker compose down -v && docker compose up -d && pnpm db:migrate`.
- [ ] Y **sobre una base que ya existe**, sin perder datos: `pnpm db:migrate` sobre la instalación anterior.
- [ ] `pnpm db:seed:samples` funciona y crea las tres cuentas de desarrollo.
- [ ] Ninguna migración anterior fue editada.

---

## Documentación

- [ ] `README.md` refleja el estado real: nada que diga «hecho» y no lo esté.
- [ ] Los comandos del README se probaron **en este árbol**, no de memoria.
- [ ] `.env.example` completo.
- [ ] `SECURITY.md` al día si cambió algo del modelo de seguridad.
- [ ] `CONTRIBUTING.md` al día si cambió una regla de trabajo.
- [ ] Si la decisión fue discutible, hay un ADR en `docs/decisiones/`.
- [ ] Cambio de contrato anotado en `packages/contracts/CHANGELOG.md`.

---

## Higiene del PR

Archivos que **no** pueden entrar. Comprobá con `git status --short` antes de añadir nada:

```
.env  .env.local  *.pem  *.key  *.p12      credenciales y certificados
node_modules/  dist/  .next/  .turbo/      artefactos de build
data/raw/  data/processed/                 pesados y con licencia propia
infra/.storage/  infra/.pglite/            almacenamiento local
*.log  *.sql.gz  *.dump                    logs y volcados de base de datos
playwright-report/  test-results/          salidas de pruebas
diag.txt  poc-*.mjs  *.tmp                 restos de depuración
```

- [ ] `git status --short` no muestra nada de lo anterior.
- [ ] `pnpm secretos` limpio (lo repite el hook de pre-commit y el CI).
- [ ] `pnpm-lock.yaml` incluido si cambiaron dependencias, y solo entonces.
- [ ] Commits con Conventional Commits en español y scope (`feat(api-core): ...`).
- [ ] Título del PR con la parte y la carpeta: `[P3 api-core] ...`.
- [ ] La plantilla de `.github/PULL_REQUEST_TEMPLATE.md` rellenada, hallazgos fuera de la carpeta
      incluidos.

---

## Lo que no hay que hacer

- No mergear en rojo, ni «solo esta vez».
- No quitar una protección para que pase un test.
- No declarar seguro lo que no se probó. Si no lo pudiste ejecutar, escribí «no verificado» y por
  qué: eso vale más que un PASS inventado.
