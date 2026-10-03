# Proceso SDD: cómo entra un cambio nuevo

Spec-Driven Development: primero se mide cómo está todo, después la especificación, las pruebas
que fallan, recién entonces el código, y al final verificación con evidencia: contra la línea base,
en la pila Docker que usás y, si corresponde, por el túnel con el que la compartís. Se ejecuta con
el comando `/sdd` de Claude Code y seis subagentes con rol fijo, todos en Opus 4.8. El diseño
completo está en
[`docs/superpowers/specs/2026-09-25-sdd-verificacion-de-cambios-design.md`](../superpowers/specs/2026-09-25-sdd-verificacion-de-cambios-design.md)
(con la enmienda §13 del 2026-10-03).

## Uso

```
/sdd quitar el campo direccion_aprox del reporte y de las dos apps
```

Fases y quién las hace:

| Fase | Quién | Salida | Puerta |
|---|---|---|---|
| F0 Clasificar | agente principal | parte, carpeta, banderas, rama, cambios ajenos declarados, foto `refs/sdd/<slug>` | si hay cambios ajenos, **el usuario decide qué se hace con ellos** |
| FB Línea base (en paralelo con F1) | `sdd-verificador` | `linea-base.md`: cómo está todo antes de tocar nada | va a la puerta 1 |
| F1 Especificar | `sdd-especificador` | `spec.md` | **el usuario aprueba la spec, los rojos que ya estaban y los permisos sobre su pila** |
| F2 Pruebas en rojo | `sdd-redactor-de-pruebas` | preflight, tests nuevos y `pruebas.md` | — |
| F3 Implementar | `sdd-implementador` | preflight, código y `implementacion.md` | — |
| F4a Verificar (paralelo) | `sdd-revisor`, `sdd-auditor`, `sdd-verificador` | hallazgos y `verificacion.md` con la comparación contra la línea base | — |
| F4b En vivo | `sdd-verificador` | tu pila Docker reconstruida y probada; túnel si corresponde | — |
| F5 Cerrar | agente principal | `informe.md`, commit solo con lo de la corrida | **el usuario aprueba el cierre** |

Los artefactos quedan en `docs/sdd/<fecha>-<slug>/` ([convención](../sdd/README.md)).

## Qué verifica cada cambio

Depende de las **banderas de riesgo** que F0 activa por las rutas que se tocan y por palabras de
la descripción: `base` siempre; `contrato`, `privacidad`, `seguridad`, `datos`, `geo`,
`concurrencia`, `api`, `ui`, `infra`, `compartir` y `lanzadores` según el caso. La tabla con los
comandos exactos, la ventana E2E, el procedimiento en vivo y el modo túnel viven en
[`.claude/skills/sdd/matriz-de-riesgo.md`](../../.claude/skills/sdd/matriz-de-riesgo.md), que es la
única fuente; cuando un defecto se escapa, se añade ahí la ruta o palabra que lo habría atrapado.

## Reglas

1. Sin spec aprobada y línea base medida no hay pruebas; sin pruebas en rojo no hay código. Un
   cambio chico tiene una spec chica, no ninguna.
2. El redactor de pruebas y el implementador son agentes distintos y **ninguno ve la descripción
   original**: solo la spec. Así ninguno acomoda las pruebas al código ni interpreta por su cuenta.
3. Un test que pasa antes de implementar es un error de spec o de test.
4. «Verde» sin la salida pegada no cuenta. Lo que no se pudo ejecutar se escribe **no verificado**
   con el motivo (misma regla que `docs/PR_CHECKLIST.md`).
5. Nada fuera de la carpeta designada sin autorización del usuario (CLAUDE.md §5.2). Los
   subagentes se detienen y preguntan; no siguen.
6. Ningún subagente commitea. El agente principal lo hace tras la segunda puerta, y el commit
   lleva solo lo de la corrida.
7. Máximo dos vueltas implementador ↔ verificación; a la tercera se consulta al usuario.
8. **Primero se mide, después se toca.** Antes de F2 hay una línea base con los mismos comandos
   que F4. Si ya está en rojo, se registra y decide el usuario; nadie lo arregla de pasada.
9. **Regresión = bloqueante.** Lo que estaba verde en la línea base y queda rojo, comparado por
   nombre de test, frena el cierre.
10. **Cada escritor prueba antes y después.** El redactor y el implementador corren la suite del
    paquete antes de su primera edición y después de cada criterio, con la salida pegada.
11. **Lo que usás es lo que se prueba.** Con `ui`, `api` o `infra`, el cambio se verifica en tu
    pila Docker reconstruida, con permiso y con vuelta atrás. Si toca sesión, cookies, CORS, CSP,
    proxy o URLs, también por el túnel con el que la compartís (sin mandar contraseñas por él: lo
    que exige sesión lo probás vos desde el celular con una lista corta).
12. **Una cosa pesada a la vez.** Lo que lee va en paralelo; lo que ejecuta va en fila y mira antes
    la memoria libre.
13. **Lo ajeno no se toca.** Los cambios que ya estaban en el árbol antes de la corrida no se
    revisan como propios, no se arreglan y no se commitean.

## Qué no hace

No reemplaza el CI ni el `PR_CHECKLIST.md`: los usa. No modifica suites existentes. No decide por
el usuario: dos puertas de aprobación por cambio. No reemplaza tu pila, no migra tu base ni abre
túneles sin tu permiso. No arregla los rojos que ya estaban: los registra y te pregunta.
