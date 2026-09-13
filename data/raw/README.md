# data/raw — INMUTABLE

Los shapefiles oficiales entran en `<capa>/<version>/` con su conjunto completo (`.shp`, `.shx`, `.dbf`, `.prj`, `.cpg`) y un `MANIFEST.md`. Nunca se renombran, corrigen ni sobrescriben; una corrección es una versión nueva.

Capas esperadas: `distrito_municipal`, `unidad_vecinal`. Versión: `AAAA-MM` (p. ej. `2026-09`).

Si falta `.prj`, el ETL se detiene y pregunta el CRS. No se adivina.

## Plantilla de `MANIFEST.md`

```markdown
# MANIFEST — <capa> <version>

- Fuente oficial: <organismo / oficina>
- Entregado por: <persona u oficina>
- Fecha de recepción: AAAA-MM-DD
- Fecha de vigencia declarada: AAAA-MM-DD o <a confirmar>
- CRS declarado: EPSG:xxxxx (según .prj) o <a confirmar>
- Licencia / condiciones de uso: <a confirmar>

| Archivo | sha256 |
|---|---|
| unidad_vecinal.shp | ... |
| unidad_vecinal.shx | ... |
| unidad_vecinal.dbf | ... |
| unidad_vecinal.prj | ... |
| unidad_vecinal.cpg | ... |
```

Generar los hashes con `shasum -a 256 *` dentro de la carpeta de la versión.
