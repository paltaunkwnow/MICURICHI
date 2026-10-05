# Plan — reportar desde una computadora (dispositivo sin GPS preciso)

Pedido del usuario (2026-10-04), con captura del paso 1 en la laptop: «Precisión actual: 178 m», «no me
deja reportar de forma normal desde mi laptop». Entre «hacerlo configurable», «dejarlo así» y
«permitir computadoras», eligió **«Permitir computadoras»**: desde un dispositivo sin GPS preciso se
reporta con ubicación aproximada, con el punto puesto a mano, y el reporte queda marcado para los
técnicos como «sin comprobar».

- Toca las mismas carpetas que la corrida `2026-10-04-arreglos-chicos`, así que **arranca cuando esa
  corrida cierra**. Línea base propia antes de tocar.
- Verificación SDD de CLAUDE.md §12.4.3. Este plan hace de spec y sus metas `C-n.m` son los criterios.
- Banderas previstas: `base`, `contrato`, `privacidad`, `seguridad`, `datos`, `api`, `ui`.
- **Aprobado por el usuario el 2026-10-04**, tal cual («Aprobado»; descartó ofrecerlo a cualquiera y
  exigir foto).

## Decisiones

1. El camino «ubicación aproximada» se ofrece solo cuando el dispositivo no llega a 50 m o menos. No
   depende del tipo de aparato: un teléfono con GPS sigue con la regla de los 60 m. El servidor lo
   hace cumplir: si se pide el camino aproximado con una precisión de 50 m o menos, responde `422`.
2. La ubicación se sigue pidiendo, aunque sea aproximada, y sirve para centrar el mapa. El punto se
   pone a mano en cualquier lugar de la cobertura, que el point-in-polygon sigue exigiendo. No hay
   círculo de 60 m.
3. Se guardan `ubicacion_metodo = 'aproximada'` y la precisión declarada. La distancia al dispositivo
   no se guarda: con esa imprecisión no dice nada. La posición del dispositivo sigue sin guardarse ni
   registrarse (§0.8).
4. Para los técnicos aparece «Ubicación aproximada — sin comprobar con el dispositivo» en la bandeja, el
   detalle, la ficha y la exportación. En el mapa público no cambia nada: sigue «NO SE HA VERIFICADO».
5. Cupo diario, demora de publicación, antispam y auditoría quedan iguales.
6. Cambia una regla del manual: CLAUDE.md §0 regla 8, §1, §2, §3.1, §4.3, §7.1, §7.5, §9.4, §13 y §14.1,
   y se escribe el ADR 0007. El usuario lo autorizó al elegir esta opción.

## Tareas

Orden: contrato → base → API → web, panel y E2E en paralelo → documentación.

### C1 — contracts (cambio anunciado) · custodia Parte 3 · raíz · Opus 4.8

- **C-1.1** `UBICACION_METODOS` suma `aproximada`.
- **C-1.2** `ReporteCrearSchema` suma `ubicacion_aproximada: boolean` (por defecto `false`). Nuevo código
  `422 UBICACION_PRECISA_DISPONIBLE`, para cuando se pide el camino aproximado con una precisión de
  50 m o menos.
- **C-1.3** `NOTA_METODOLOGICA` suma que hay reportes con ubicación aproximada, puesta a mano desde
  dispositivos sin GPS, marcados como tales.
- **C-1.4** Versión 0.18.0, con `CHANGELOG` y OpenAPI regenerado sin diferencias.

### C2 — packages/db · Parte 4 · raíz · Opus 4.8

- **C-2.1** Migración `0019`: `ALTER TYPE ubicacion_metodo ADD VALUE IF NOT EXISTS 'aproximada'`, con el
  patrón de la 0017. Lleva su prueba `migracion-0019-*`, desde cero e idempotente.

### C3 — api-core · Parte 3 · raíz · Opus 4.8

- **C-3.1** `POST /reportes` con `ubicacion_aproximada: true`:
  - sigue exigiendo `dispositivo` y una antigüedad de 600 s o menos;
  - exige una precisión de más de 50 m (si no, `422 UBICACION_PRECISA_DISPONIBLE`, sin gastar cupo);
  - no comprueba el radio;
  - guarda método `aproximada`, la precisión declarada y la distancia en `null`.
- **C-3.2** Sin `ubicacion_aproximada` todo sigue igual: los `422` de precisión, antigüedad y radio, y
  el método `gps`/`manual`.
- **C-3.3** La auditoría registra el método y nunca la posición del dispositivo, que pino sigue
  redactando. Siguen verdes las pruebas de privacidad, la tabla de visibilidad y las de idempotencia.

### C4 — web-ciudadano · Parte 1 · raíz (flujo central y privacidad) · Opus 4.8

- **C-4.1** Con una lectura de más de 50 m, el paso 1 ofrece «¿Estás en una computadora o sin GPS?
  Reportá con ubicación aproximada». Explica que el punto lo pone la persona y que los técnicos lo ven
  como sin comprobar.
- **C-4.2** En ese camino:
  - el mapa se centra en la posición aproximada;
  - el marcador se mueve libre dentro de la ciudad, con arrastre, flechas, «mover 5 m» y coordenadas;
  - no hay círculo de 60 m;
  - la revisión lo dice;
  - se envía `ubicacion_aproximada: true`.
- **C-4.3** El camino normal no cambia. Accesible según §14.1.

### C5 — panel-admin · Parte 2 · estándar · Sonnet 5.5

- **C-5.1** La etiqueta «Ubicación aproximada — sin comprobar con el dispositivo» aparece en la bandeja,
  el detalle y la ficha; `etiquetaMetodo` cubre el caso.

### C6 — e2e · Parte 5 · estándar · Sonnet 5.5

- **C-6.1** Spec nueva: GPS simulado con 300 m → camino aproximado → reporte creado con método
  `aproximada` → el panel lo marca.
- **C-6.2** Ajustar `ubicacion-obligatoria.spec.ts` donde espere que con mala precisión no se pueda
  seguir.

### C7 — documentación · agente principal

- **C-7.1** ADR 0007 y CLAUDE.md según la decisión 6.
- **C-7.2** Agregado durante la corrida: la matriz SDD (`.claude/skills/sdd/matriz-de-riesgo.md`) suma
  `ubicacion-aproximada` a G3, a la pantalla `/reportar` y a la bandera `privacidad` (spec y prueba
  nuevas). Además se corrige su G4, que ya estaba desactualizado: le faltaban
  `panel-indicadores-tortas` y `panel-mapa-reactivo`.

## Fuera de alcance

- Detectar el tipo de aparato.
- Una cola o un filtro especial para reportes aproximados en el panel.
- La decisión D2 (el botón «Usar ubicación de prueba» en producción).
