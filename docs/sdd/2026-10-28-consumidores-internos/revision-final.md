# M10.4 — Evidencia independiente

Original SHA256 `f880ea57aac905c608de2a03f0c49a3ae262f7c6bc32d9f4c8735ed0c5b15e94`; copia documental con vínculos adaptados. Ejecuciones y lectura pertenecen al agente autor del informe; el principal integra su evidencia.

# M10.4 — Revisión final estática de P5, documentación y alcance

**CONFORME ESTÁTICO CON LÍMITES; GATE DEL VERIFICADOR PENDIENTE.** Cero hallazgos de producto o alcance atribuibles al delta revisado. Este dictamen no cierra M10.4: faltan el full DB limpio, API posterior y los controles dependientes del verificador independiente. No se atribuye resultado a sus comandos en curso.

P4 se reutiliza sin repetir su revisión: [dictamen anterior](../../../.turbo/m10-4-2026-10-28/revision/revisión-parte4.md), SHA `e6385e1c049ca14e85e4e15f60dddeec989a78a60fe4309fda3cc4dc890e1352`. Sus 13 fuentes siguen iguales al freeze `dc68903bad3e12c087625f12c363a85d9deaa511b4078da79ad1361028880cbc`. P5 coincide con `1984a1f69aa41814afb76f91ad536a5f2c7f749868265e52587355a689d9e417`. Las **18/18 fuentes** coinciden antes y después de esta revisión.

Se comparó contra F0 y sus copias, sin usar HEAD como baseline. Este revisor hizo únicamente lectura, copias dentro de `revision/`, parseo estático y hashes; el único comando Git fue `status` con `--no-optional-locks`. **Cero suites, builds, SQL, HTTP o CLI de producto ejecutados por el revisor.** Los 19 casos Node son evidencia reutilizada del trabajador raíz P5.

## Revisión de los cinco archivos P5

| Archivo y referencia | Comprobación y resultado |
|---|---|
| `scripts/banco-datos.mjs:50`, `:219`, `:253` | Fábrica importable; no se exige URL ni se crea pool al importar. Guardas de producción/URL antes de crear pool y entrada directa protegida. Mantiene argumentos, default 10000, lotes de 20000, cierre/liberación y código de error del generador. |
| `scripts/banco-datos.mjs:133`, `:172` | Generación literal idéntica a F0 salvo tabla/categoría explícita. No cambian distribución espacial, orden, RNG, modos temporal/correlacionado, proporciones, precisión, geometrías, estados ni publicación. ANALYZE y VACUUM usan la tabla física. Los cuatro conteos de reportes filtran flood; tamaño etiquetado de todas las categorías y PC/capas globales conservados. |
| `scripts/banco-datos.mjs:192`, `:198` | Corrección preexistente aprobada: DELETE de muestras flood y DELETE exterior de PC solo flood, con miembros buscados en toda `reporte`. El negativo usa las otras tres categorías con la misma marca y fotos; conserva flood sin marca, PC ajeno vacío y PC flood con miembro ajeno. Tiene eliminación positiva del reporte/PC flood de muestra. |
| `scripts/banco-consultas.mjs:23`, `:47` | Diez SQL conservan joins, cálculos, bbox, parámetros, estados y límites históricos. Los seis alias leen `detalle`, cinco como texto/NULL y el booleano con cast que conserva `false`; guardia de categoría. Las pruebas usan ausencia, JSON NULL, true/false y desacople de columnas planas solo en fixture. |
| `scripts/banco-consultas.mjs:105`, `:131`, `:134`, `:139` | Filtro de categoría en el ON del LEFT JOIN; no elimina UV vacías o con solo otros temas. Vecinos filtra origen, vecino y selección de semilla. Negativos concretos y vecino flood positivo. |
| `scripts/banco-consultas.mjs:111`, `:181`, `:219` | PC por bbox sigue global. El benchmark sigue histórico: validado/resuelto, sin `publicar_en`, mismos límites y mediciones EXPLAIN. No se convierte en SQL HTTP actual. Se conserva el exit0 histórico ante errores por consulta; el comparador rechaza ERROR, incluso comparado consigo mismo. Importación/guardas/cierre comprobables mediante fábricas ficticias. |
| `scripts/sembrar-30-puntos.sql:4` | Las 30 tuplas conservan expresiones, geometrías, valores, NULL, false y BEGIN/COMMIT; solo tabla/categoría cambian. El manual F0 embebido es byteidéntico al original, SHA `241f000cf89424d88a2bd8e6ff5b40f8f25c80f84ed33e5b7227972e60e75274`. |
| `scripts/bancos-internos.test.mjs:95`, `:295`, `:395`, `:791` | Arnés portable: no contiene referencia a `.turbo` ni requiere dist/tsx. Carga migraciones vigentes en PGlite `memory://`, con PostGIS y capas/validador ficticios. Bloquea conexiones y comprueba imports en hijo con entorno reducido, pool bloqueado y exit interceptado. F0 está embebido como literales; 24/24 SQL embebidos corresponden a las fuentes F0 congeladas. |
| `scripts/bancos-internos.test.mjs:446`, `:573`, `:674`, `:714` | Ejecuta SQL literal en fixture: generador, diez consultas, limpieza y manual completo. El wrapper RNG de fixture llama al PostGIS real con semilla y no reescribe SQL de producto. Fecha del manual normalizada por ancla de cada transacción. Hay positivos no vacíos: 100 filas generadas, 30 manuales, técnico 5, vecino flood, PC global 4 y página profunda con 2 filas. |
| `.github/workflows/ci.yml:305`, `:312`, `:317`, `:495` | Reconstrucción byte a byte desde F0 de exactamente tres lecturas de humo y una línea del arnés. El resto del workflow, otros jobs y pasos de respaldos es idéntico. Los tests extraen el SQL literal de CI: sin flood y con otras tres categorías falla; flood pasa; UV obligatoria, fail-closed e invalidez mantienen positivos/negativos sin contaminación. |

El cotejo independiente de las diez consultas elimina únicamente las transformaciones autorizadas de tabla/filtro/alias y obtiene el SQL F0 normalizado en los diez casos. Hace el mismo cotejo para el generador y las 30 adiciones de categoría del manual. No se importó producto para hacerlo: se analizaron literales con el parser instalado.

Evidencia propia de lectura: [análisis estático](../../../.turbo/m10-4-2026-10-28/revision/final-analisis-estatico.json), [F0 embebido extraído](../../../.turbo/m10-4-2026-10-28/revision/p5-f0-embebido-extraido.json), fuentes completas en `p5-fuente/` y deltas disponibles en `final-delta/`. El análisis de SQL normaliza formato/comentarios; la revisión manual anterior cubre parámetros, control de flujo, fixtures y negativos.

## Documentación y alcance

- AGENTS.md y CLAUDE.md son exactamente iguales a F0 al excluir únicamente fecha y las secciones autorizadas §1, §4.8 y fila §16.7. En particular no cambian reglas, permisos, puertas ni §7. Los textos observados mantienen M10.4 en ejecución y M10/Fase1/producción abiertos.
- `services/api-core/README.md:65` cambia exclusivamente el párrafo de cuota: no reserva cupos desde M3b, pero mantiene datos/permisos/limpieza. El resto del archivo es idéntico.
- Plan: el delta sobre su copia F0 registra aprobación humana, sin ampliar inventario. Baseline/implementación distinguen los intentos incompletos, el consolidado DB entre dos ejecuciones y los resultados P5 de la verificación independiente pendiente. Índices, roadmap §5 y contexto consultados conservan ese estado provisional. El inventario/cierre final lo actualizará el principal después del gate.
- El manifest F0 tiene 990 entradas: 964 siguen con el mismo SHA; las 24 diferencias pertenecen a los archivos de producto/documentación autorizados. Se excluyeron **sin abrirlos** `data/raw/DM_UV_MZ_2025/MANIFEST.md` y `data/raw/README.md`. No corresponde afirmar 990 archivos íntegramente comprobados.
- El status Git de solo lectura agrega nueve rutas respecto al manifest: siete documentos de esta corrida y las dos pruebas autorizadas. No se detectan fuentes nuevas ajenas. Sin diferencias atribuibles en API/contracts/apps/geo, mantenimiento, migraciones, ACL o fuentes de respaldos.
- Para `docs/README.md`, `docs/sdd/README.md` y roadmap14, F0 conserva SHA pero no una preimagen completa. Se revisaron su ruta autorizada y contenido actual; **no se certifica igualdad seccional contra una preimagen inexistente**. Esto limita esa parte documental, sin señalar un defecto de producto. Las notas de cierre posteriores tampoco quedan cubiertas anticipadamente.

Captura y clasificación de SHA: [final-captura.json](../../../.turbo/m10-4-2026-10-28/revision/final-captura.json). Documentos observados conservados en `final-docs-observados/` y `final-docs-snapshot/`; status en [final-git-status-ro.txt](../../../.turbo/m10-4-2026-10-28/revision/final-git-status-ro.txt). Los documentos capturados permanecieron iguales al sellar esta lectura.

## Cápsula M10.3

Se usó exclusivamente el freeze correctivo `implementador/correccion-gpg/freeze8.json` contra `cierre/fuente-operacion/`: **8/8 coinciden antes y después**. En las ocho rutas actuales, las siete ajenas al CI siguen iguales; el CI actual cambia únicamente por las cuatro ediciones autorizadas demostradas arriba. La copia histórica del CI dentro de la cápsula sigue intacta.

No se operaron bases, bancos, diarios, GPG, respaldos o restauraciones. Los 93 casos de respaldos no se repitieron. La comprobación de integridad de la cápsula no equivale a una nueva restauración ni a certificar sus operadores. Copia del freeze consultado: [m10-3-freeze8-correctivo.json](../../../.turbo/m10-4-2026-10-28/revision/m10-3-freeze8-correctivo.json).

## Evidencia de ejecución reutilizada y gate pendiente

Productor: Popper, trabajador raíz P5. Control, stdout, resultado y comparación copiados por SHA en `p5-evidencia/`. El revisor no produjo estas ejecuciones.

| Evidencia P5 | Resultado registrado |
|---|---|
| Rojo de cobertura nueva | 16 FAIL / 1 PASS, 17 casos |
| Final | 19 PASS / 0 FAIL / 0 SKIP; 17 anteriores conservados, 2 añadidos, 0 retirados |
| Comando Node exacto de CI, ejecutado localmente | `node --test scripts/bancos-internos.test.mjs`: 19 PASS, exit0 |
| Sintaxis de 3 scripts / Biome 3 / YAML 7 jobs | exit0 |

Los incidentes intermedios permanecen identificados: fallos de fixture de RNG y alta de volumen, control incompleto por timeout/SIGTERM y formato inicial. No se cuentan como PASS ni se borran. Sus correcciones de fixture no sustituyen operadores reales ni relajan las aserciones finales revisadas.

**Gate aún pendiente en este dictamen:** full DB limpio de 361 casos, API posterior conservando sus casos/12 omisiones, controles del grafo consumidor y demás comprobaciones asignadas al verificador raíz. No se certifica su estado por archivos parciales. P4 conserva el incidente full02 exit1 y dirigido03 9/9; no se reetiqueta como full verde. Las 12 omisiones PG/S3 siguen sin verificar.

No se acredita CI remoto, PostgreSQL/roles reales, Docker, S3, HTTP operativo, latencia de producción o SQL HTTP actual. Los cambios documentales finales, posteriores al resultado del gate, requieren el cotejo de estado correspondiente antes del cierre de M10.4. M10 completo, Fase1 y producción mantienen sus puertas.

Resultado estructurado: [revisión-final.json](../../../.turbo/m10-4-2026-10-28/revision/revisión-final.json). SHA de las 18 fuentes y de los ocho archivos de cápsula antes/después: [final-hashes-despues.json](../../../.turbo/m10-4-2026-10-28/revision/final-hashes-despues.json). Si alguno cambia, este dictamen solo cubre su versión congelada; con SHA iguales se reutilizan ambas revisiones y no se repite P4.
