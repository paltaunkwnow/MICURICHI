# M10.5 — Línea base propia

Medida el29/10/2026 por Hume antes de editar los siete archivos del
[plan aprobado](plan.md). F0 propio: `.turbo/m10-5-2026-10-29/f0/manifest.json`,
1006archivos, rama `codex/cuatro-categorias`, HEAD
`59b80781030707b8c3334bfbfd40f80000c60a57`. HEAD no es el antes de la corrida:
hay cambios locales de varias fases, conservados como ajenos.

| Control ejecutado | Resultado propio y alcance |
|---|---|
| Suite DB completa | **361/361 PASS**,31archivos,0FAIL/0SKIP, exit0; inicio11:01:36.383Z, fin11:06:59.965Z. RAM3647→4530MiB. |
| Tipos DB | exit0,11:08:52.486Z→11:08:55.876Z, RAM4537→4491MiB. |

Hora local America/La_Paz = UTC−4. Salida literal y controles conservados en
`.turbo/m10-5-2026-10-29/parte4/`:

- `baseline-db.{stdout.log,stderr.log,control.json,vitest.json,casos.json}`.
- `baseline-typecheck.{stdout.log,stderr.log,control.json}`.
- `ast-antes.json`: mapa estructural de casos, hooks y expectativas de los seis TS,
  para cotejar significado además de recuentos al finalizar.
- `inicio.json`, `status-antes.txt` y copia inicial del ejecutor/entorno de pruebas.

Comandos de paquete, ejecutados con el pnpm ya instalado y sin instalaciones:

```text
pnpm.exe --config.verify-deps-before-run=false --filter db test --config <corrida>/parte4/vitest.config.mjs --reporter=verbose --reporter=json --outputFile.json=<corrida>/parte4/baseline-db.vitest.json
pnpm.exe --config.verify-deps-before-run=false --filter db typecheck
```

El control registra los argumentos completos. Configuración temporal de corrida:
entorno hijo con lista permitida de variables de sistema más NODE_ENV=test/CI;
sin PG*, DATABASE/POSTGRES, S3 ni URLs/credenciales heredadas. PGlite/fixtures,
transporte HTTP original de la suite solo entre fixtures loopback propias.
Sin PostgreSQL real, Docker, S3, bases/HTTP de demo o bancos retenidos.

No hubo rojos previos en estos dos controles. La intermitencia histórica de setup DB de
M10.4 no se reprodujo en esta línea base y no se borra de su informe. Los12SKIP de API,
audit/lint globales y E2E de fases anteriores conservan su fecha y alcance: no son
ejecuciones de M10.5 y no se repiten sin cambio de dependencia o problema nuevo.
