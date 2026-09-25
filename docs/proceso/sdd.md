# Proceso SDD: cómo entra un cambio nuevo

Spec-Driven Development: primero la especificación, después las pruebas que fallan, recién
entonces el código, y al final verificación con evidencia. Se ejecuta con el comando `/sdd` de
Claude Code y seis subagentes con rol fijo. El diseño completo está en
[`docs/superpowers/specs/2026-09-25-sdd-verificacion-de-cambios-design.md`](../superpowers/specs/2026-09-25-sdd-verificacion-de-cambios-design.md).

## Uso

```
/sdd quitar el campo direccion_aprox del reporte y de las dos apps
```

Fases y quién las hace:

| Fase | Quién | Salida | Puerta |
|---|---|---|---|
| F0 Clasificar | agente principal | parte, carpeta designada, banderas de riesgo, rama | — |
| F1 Especificar | `sdd-especificador` | `spec.md` | **el usuario aprueba la spec** |
| F2 Pruebas en rojo | `sdd-redactor-de-pruebas` | tests nuevos + `pruebas.md` con la salida del fallo | — |
| F3 Implementar | `sdd-implementador` | código en la carpeta designada | — |
| F4 Verificar (paralelo) | `sdd-revisor`, `sdd-auditor`, `sdd-verificador` | hallazgos + `verificacion.md` | — |
| F5 Cerrar | agente principal | `informe.md`, commit, PR | **el usuario aprueba el cierre** |

Los cuatro artefactos quedan en `docs/sdd/<fecha>-<slug>/` ([convención](../sdd/README.md)).

## Qué verifica cada cambio

Depende de las **banderas de riesgo** que F0 activa por las rutas que se tocan y por palabras de
la descripción: `base` siempre; `contrato`, `privacidad`, `seguridad`, `datos`, `geo`,
`concurrencia`, `ui`, `infra` según el caso. La tabla con los comandos exactos vive en
[`.claude/skills/sdd/matriz-de-riesgo.md`](../../.claude/skills/sdd/matriz-de-riesgo.md) y es la
única fuente; cuando un defecto se escapa, se añade ahí la ruta o palabra que lo habría atrapado.

## Reglas

1. Sin spec aprobada no hay pruebas; sin pruebas en rojo no hay código. Un cambio chico tiene una
   spec chica, no ninguna.
2. El redactor de pruebas y el implementador son agentes distintos y **ninguno ve la descripción
   original**: solo la spec. Así ninguno acomoda las pruebas al código ni interpreta por su cuenta.
3. Un test que pasa antes de implementar es un error de spec o de test.
4. «Verde» sin la salida pegada no cuenta. Lo que no se pudo ejecutar se escribe **no verificado**
   con el motivo (misma regla que `docs/PR_CHECKLIST.md`).
5. Nada fuera de la carpeta designada sin autorización del usuario (CLAUDE.md §5.2). Los
   subagentes se detienen y preguntan; no siguen.
6. Ningún subagente commitea. El agente principal lo hace tras la segunda puerta.
7. Máximo dos vueltas implementador ↔ verificación; a la tercera se consulta al usuario.

## Qué no hace

No reemplaza el CI ni el `PR_CHECKLIST.md`: los usa. No modifica suites existentes. No decide por
el usuario: dos puertas de aprobación por cambio.
