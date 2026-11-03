# Baches — definición del piloto M6

**Decisión del 2026-10-18, ADR 0024.** Especificación aprobada para implementación y piloto
local; consultar la [corrida M6](../sdd/2026-10-18-baches-piloto/plan.md) para su estado de ejecución.
No es una norma de pavimentos, una medición de riesgo ni una validación municipal.

## Datos que declara la persona

Los datos comunes siguen siendo los del reporte: ubicación, tipo de lugar, descripción,
fecha opcional y fotos de cámara opcionales. `categoria` vale `bache`.

| Subtipo obligatorio | Texto y referencia |
|---|---|
| `bache` | Bache: pozo en el asfalto |
| `hundimiento_calzada` | Hundimiento de calzada: la calle cedió |
| `tapa_alcantarilla_faltante` | Tapa de alcantarilla faltante: pozo abierto |
| `asfalto_levantado` | Asfalto levantado: capa suelta o rota |
| `calle_tierra_intransitable` | Calle de tierra intransitable: barro o zanjas |

El subtipo vive fuera de `detalle`. El detalle v1 exige dos claves y rechaza extras:

| Clave | Valores en orden de menor a mayor |
|---|---|
| `gravedad_declarada` | `se_puede_pasar` («Molesta, pero se puede pasar»), `hay_que_esquivar` («Hay que esquivarlo»), `peligroso` («Es peligroso, sobre todo de noche»), `causo_accidente` («Ya causó un accidente») |
| `tamano` | `plato` («Como un plato»), `rueda` («Como una rueda»), `medio_carril` («Medio carril»), `todo_el_carril` («Todo el carril») |

Las referencias de tamaño no tienen intervalos numéricos: el prototipo deja un hueco entre
60 cm y 1 m y no se completó con umbrales supuestos. La gravedad y el tamaño son estimaciones;
«Ya causó un accidente» es una declaración ciudadana, no un parte de accidente comprobado.
No se piden profundidad, cantidad, posición en la vía o identidad de personas afectadas.

## Severidad v1

Con índices `g` y `t` de 0 a 3 en los órdenes anteriores, `s=g+t+2`.
Banda combinada por s: 2–3 baja, 4 media, 5–6 alta, 7–8 crítica. La banda final nunca baja
de la gravedad declarada. El servidor guarda `puntaje=s`, modelo v1, y su banda final:

| Gravedad / tamaño | Plato | Rueda | Medio carril | Todo el carril |
|---|---|---|---|---|
| Se puede pasar | baja | baja | media | alta |
| Hay que esquivarlo | media | media | alta | alta |
| Peligroso | alta | alta | alta | crítica |
| Causó un accidente | crítica | crítica | crítica | crítica |

El piso puede producir distinta banda para el mismo índice. La banda almacenada es la salida
del cálculo completo; no deducirla exclusivamente del puntaje. No comparar ese puntaje con
Inundaciones ni utilizarlo como diagnóstico de pavimento o criterio de inversión.

## Recurrencia, privacidad y atención

Radio de puntos críticos: 10 m, dentro de Baches y solo con verificados. El encadenamiento
de DBSCAN puede superar ese diámetro; advertencia cuando excede 40 m. No es el radio de
60 m del dispositivo ni el clustering visual del mapa. Inundaciones conserva 25 m/100 m.

Vía pública por defecto; no se elimina el tipo vivienda/predio ni su degradación pública.
Se conservan cuenta, ubicación aproximada, permisos dentro del flujo, fotos de cámara y
etiqueta «NO SE HA VERIFICADO». No se almacena la posición del dispositivo.

La nota metodológica debe explicar percepción, error de ubicación, sesgo de participación,
revisión técnica pendiente y necesidad de estudio para intervenir. El subtipo y ambas respuestas
son públicos; no se añaden datos personales ni datos de agua ficticios. CSV los conserva en
categoría/subtipo/detalle JSON; GeoJSON conserva esas propiedades.

No existe una derivación municipal confirmada para prometer «Lo atiende…». Validar el modelo
con la dirección municipal correspondiente antes de producción. El piloto no cambia estados,
roles, cuota configurable de reportes por categoría ni cuota global de fotos.
