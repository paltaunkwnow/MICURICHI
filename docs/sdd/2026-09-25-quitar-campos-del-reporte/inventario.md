# Inventario de referencias (F0) — quitar campos del reporte

Generado el 2026-09-25 con ripgrep, excluyendo `node_modules`, `dist`, `.next`, `data/`, `docs/`
y `CLAUDE.md`. Cada implementador usa **solo** la sección de su carpeta designada.

Ítems: **DA** = `direccion_aprox` · **DU** = `duracion_estimada` · **AF** = `afectacion` ·
**MZ** = `manzana` / `manzana_id`. «En el mapa público se ve» (`apps/panel-admin/.../reportes/[id]/page.tsx:154`)
**se conserva** por decisión del usuario.

## packages/contracts
- `openapi/openapi.yaml` — generado; se regenera con `pnpm contracts:build` (DA 6, DU 8, AF 8, MZ 14).
- `src/esquemas/reporte.ts:41,81` DU · `:43,83` AF · `:76` MZ (`manzana_id`) · `:77` DA · `:4` import `AFECTACIONES`.
- `src/dominio/severidad.ts:1,13,18,21,35,37,59,61,63` DU/AF (fórmula 2·T + D + F + A).
- `src/dominio/enums.ts:20,26,89` AF (`AFECTACIONES`, tipo, etiquetas) · `:66,127` MZ (`TIPOS_CAPA`, etiqueta; **se conservan**: la capa sigue existiendo).
- `src/esquemas/geo.ts:13` MZ (`manzana` en la respuesta de `/resolver`).
- `src/openapi.ts:342,373` MZ (texto y enum de capa; el enum se conserva).
- `scripts/generar.ts:29` AF (`dominio.json`).
- `test/severidad.test.ts:2,74–153` DU/AF · `test/esquemas.test.ts:17,19` DU/AF.

## packages/db
- `migraciones/0001_inicial.sql:9,11,140,146,149,151` — **intacta**; la nueva migración `0010_*` hace `DROP COLUMN` de `manzana_id`, `direccion_aprox`, `duracion_estimada`, `afectacion` y `DROP TYPE` de los enums si nada más los usa.
- `migraciones/0008_privilegios_minimos.sql:69,70,81,82` MZ — se conserva (la tabla `geo.manzana` sigue).
- `src/esquema/index.ts:31,43,179,185,188,190` DU/AF/MZ/DA en `reporte_inundacion`; `:122` tabla `manzana` **se conserva**.
- `src/seeds/samples.ts:90,214,216,224,225,230,236,250,252` DU/AF/MZ en la generación de reportes; `:32,53,137` carga de la capa manzana **se conserva**.
- `src/test-utils.ts:95` DU/AF en el INSERT de reportes de prueba; `:4,41,73,76` capa manzana **se conserva**.
- `banco-puntos-criticos.ts:31` DU/AF.
- `test/puntos-criticos-entorno.test.ts:36,221` DU/AF.
- `src/cli/verificar-privilegios.mjs:45,61` MZ — se conserva.

## services/api-core
- `src/vistas.ts:26,32,35,37,61–63,137–145,149,151` DA/DU/AF/MZ (tipo de fila, SELECT y serialización pública/técnica).
- `src/rutas/reportes.ts:184–185,199,212,214` INSERT con `manzana_id`, `duracion_estimada`, `afectacion`; `geo.manzana?.id`.
- `src/rutas/admin.ts:70,75,77,83` columnas de exportación CSV.
- `test/seguridad.test.ts:98,104,107,109,135,156` · `test/resiliencia.test.ts:191,193` · `test/privacidad-ubicacion.test.ts:15,137–180,196` (10 asserts sobre `manzana_id`) · `test/ayudas.ts:23,93,95`.

## services/geo-service
- `src/resolver.ts:21,34,95` MZ — PIP de manzana en `/resolver`. Decisión mínima: dejar de devolver `manzana` (quitar la consulta y el campo).
- `src/capas.ts:31` comentario · `README.md:3` texto · `test/geo-service.test.ts:48–50,102,228` (test «punto dentro de la manzana la informa» y capa en lista).

## pipelines/geodata-etl
- Solo MZ, toda la capa (`config/capas.yaml`, `pipeline.ts`, `normalizar.ts`, `samples/generar.ts`, `shapefile.ts`, `config.ts`, tests). **Se conserva íntegro**: fuera de esta corrida.

## apps/web-ciudadano
- `src/lib/formato.ts:23,29–30,56` DU/AF/DA (`etiquetaDuracion`, `etiquetaAfectacion`, título por dirección) · `src/lib/formato.test.ts:20,34` DA.
- `src/componentes/FormularioReporte.tsx:65,364,421–434,467,469,744–748,794–801,1069,1079–1080` DU/AF/DA (constantes, estado, validación, pasos del formulario).
- `src/componentes/HojaDetalle.tsx:7,99,106–107` DU/AF.
- `src/componentes/VistaMapa.tsx:135` DA · `SeguimientoReporte.tsx:55` DA · `MisReportes.tsx:156` DA.
- `src/componentes/ComoFunciona.tsx:229` texto de la fórmula de severidad.
- `src/componentes/Mapa.tsx:749,768,781,795,845,877,908,944` MZ — capa `capa-manzana` dibujada; dejar de dibujarla.
- `src/lib/sw.test.ts:266,273,274` URLs de teselas de manzana (caché del service worker; revisar si siguen teniendo sentido).

## apps/panel-admin
- `src/app/(panel)/reportes/[id]/page.tsx:17,139,146,166,168` MZ/DA/DU/AF (`<Dato>` Manzana, Dirección aproximada, Duración, Afectación). **`:154` se conserva.**
- `src/componentes/FactoresSeveridad.tsx:15,17,48` DU/AF (desglose del puntaje; pasa a T y F).
- `src/lib/formato.ts:2,50–51` AF.
- `src/componentes/Mapa.tsx:314,320,324,338,360` MZ — capa dibujada; dejar de dibujarla.
- `src/app/(panel)/plano/page.tsx:117` texto informativo con «27.527 manzanas» (se conserva: describe la entrega).

## e2e
- `tests/ayudas.ts:36,38` DU/AF en `reporteValido` · `tests/recorrido-completo.spec.ts:51,56` · `tests/resiliencia-interfaz.spec.ts:109` (radios del formulario) · `tests/navegacion.spec.ts:54` texto de la fórmula · `tests/api-contratos.spec.ts:99` MZ en lista de capas (se conserva) · `tests/datos-reales.spec.ts:222–244` teselas de manzana (se conserva).

## Raíz (Parte 5)
- `scripts/banco-datos.mjs:142,156,158` DU/AF · `scripts/banco-consultas.mjs:34,36,37` DA/DU/AF/MZ · `scripts/banco-concurrencia.mjs:29,31` DU/AF · `scripts/banco-carga.mjs:65–66`, `banco-sostenido.mjs:51` teselas de manzana (se conservan).
- `README.md:89` DA · `CLAUDE.md` §7.1, §9.1 (con autorización del usuario) · `.env.example:236`, `docker-compose.yml:301` (se conservan).
