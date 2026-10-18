# Línea base — <título corto del cambio>

- **Corrida:** `docs/sdd/<aaaa-mm-dd>-<slug>/` · **Medida el:** <fecha y hora> · **Por:** `sdd-verificador` (modo línea base)
- **Foto:** `refs/sdd/<slug>` = `<hash>` · **HEAD:** `<hash>` · **Rama:** `…`
- **Banderas:** … · **Alcance:** `--filter=...<paquete>` (paquetes que entran: …)
- **Condiciones:** RAM libre <MB> de <MB> · procesos pesados de otras sesiones: <n> · pila Docker: sí/no (healthy: …) · `next dev` local: sí/no · túneles `cloudflared`: <n> · `--concurrency=1`

## Cambios ajenos (no son de esta corrida)

Decisión del usuario en F0: ninguno | commitearlos antes | declararlos y dejarlos | apartarlos.

| Archivo | Estado (`M` / `??`) | sha256 (solo `??`) |
|---|---|---|

La corrida no edita estos archivos. Si necesita alguno, para y pregunta.

## Resultado por comando

| # | Comando exacto | Bandera | Salida | Duración | Veredicto |
|---|---|---|---|---|---|
| 1 | `npx -y pnpm@12.4.1 lint` | base | 0 | 3 s | verde |

Veredictos: `verde` · `verde (cache hit)` · `verde (imagen Docker al día)` · `rojo` ·
`no verificado: <motivo>` (los que exigen permiso, hasta la puerta 1: `pendiente de permiso`).

## Rojos que ya estaban (lista exacta: F4 compara contra esto)

### <n>. `<comando>`

```
<una línea por fallo, tal como la imprime la herramienta:
 vitest/playwright: archivo > describe > test
 biome: archivo con diagnóstico
 tsc: archivo(línea,col): error TSxxxx>
```

Recuento: <n> verdes · <n> rojos · <n> omitidos.

## Pila en vivo (solo con `ui`, `api` o `infra`; foto sin tocar nada)

| Servicio | Imagen | Creada (UTC) | Archivo más nuevo de su contexto (UTC) | ¿Al día? |
|---|---|---|---|---|

| Comprobación | Resultado |
|---|---|
| `curl -sk -o /dev/null -w "%{http_code}" https://localhost/` | |
| `curl -sk --resolve panel.localhost:443:127.0.0.1 -o /dev/null -w "%{http_code}" https://panel.localhost/login` | |
| `curl -skI https://localhost/<ruta que toca la spec>` (cabeceras) | |
| Navegador `http://localhost:3000\|3100/<pantalla>`: errores de consola | ninguno / <lista> |
| Captura (descripción de lo visto) | |

## E2E sobre el árbol sin tocar (después de la puerta 1, solo con la ventana autorizada)

| Grupo | Specs | Pasaron | Fallaron (lista exacta) | Veredicto |
|---|---|---|---|---|

## Decisiones de la puerta 1 (las copia el agente principal)

- Rojos que ya estaban: seguir como conocidos | ampliar la spec | parar
- Ventana E2E: sí/no/no aplica · En vivo (reconstruir y reemplazar su pila): sí/no/no aplica
- Migrar `curichi` tras `pg_dump`: sí/no/no aplica · Túnel temporal: sí/no/no aplica
