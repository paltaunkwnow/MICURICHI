# Drenaje, pavimento y anegamiento

Notas de dominio que respaldan los campos opcionales del reporte (`causa_presunta`,
`sumidero_cercano`, `sumidero_estado`, `agua_brota_sumidero`). Salieron de `CLAUDE.md` el
2026-10-03 para que el manual quede corto; no cambian ninguna regla. Nada de valores normativos sin
fuente verificable: lo no verificado se escribe `<a confirmar>`.

## Vocabulario

| Término | Definición |
|---|---|
| Escorrentía | Fracción de la lluvia que no infiltra y corre por la superficie hacia el drenaje. |
| Sumidero (boca de tormenta, rejilla) | Toma el agua de la calle y la lleva al colector. Capacidad limitada; si está tapado o es insuficiente, el agua se acumula. |
| Cuneta | Canal al borde de la calzada que lleva el agua a los sumideros; necesita pendiente longitudinal. |
| Colector | Tubería o canal principal. Si se satura, el agua deja de entrar e incluso brota por los sumideros. |
| Bombeo (pendiente transversal) | Inclinación de la calzada hacia los bordes. Si se pierde, el agua queda en el carril. |
| Contrapendiente | Tramo donde la pendiente se invierte y crea un punto bajo sin salida por gravedad. |
| Hundimiento | Asentamiento localizado del pavimento que forma una depresión. |
| Ahuellamiento | Deformación en las huellas de los neumáticos que retiene agua. |
| Bache | Pérdida de material de la carpeta; el agua acelera su crecimiento. |
| PCI | *Pavement Condition Index* (ASTM D6433), 0–100. Solo referencia; el sistema no lo calcula. |
| IRI | *International Roughness Index* (m/km). Solo referencia. |
| Curva IDF, período de retorno | Intensidad–duración–frecuencia de lluvia e intervalo medio entre eventos. Referencia para fases futuras. |
| Método racional | Q = C · i · A (caudal pico). Referencia para fases futuras. |

## Causas presuntas y cómo se reconocen

| Causa presunta | Mecanismo | Lo que puede ver el vecino | Campos que la sugieren |
|---|---|---|---|
| Contrapendiente / punto bajo | El punto está más bajo que su salida; el agua se va solo por infiltración o evaporación. | El agua queda mucho después de la lluvia; no hay sumidero cerca o está más alto. | `frecuencia = permanente` o `agua_estancada`, `sumidero_cercano = no` |
| Sumidero insuficiente o tapado | El caudal supera la captación de la rejilla, o está obstruida. | Se acumula durante la lluvia y drena rápido al terminar; rejilla con basura. | `sumidero_cercano = si`, `sumidero_estado = tapado` |
| Colector saturado | La red aguas abajo está llena; el agua no entra y hasta sube por los sumideros. | Agua que brota de la rejilla; el charco crece aunque el sumidero esté limpio. | `agua_brota_sumidero = true` |
| Desborde de cauce o canal | Un canal o arroyo cercano supera su capacidad. | Extensión grande, agua con sedimento, coincide con crecidas. | `causa_presunta = desborde_cauce` |

## Pavimento

| Patología | Por qué atrapa agua | Relación con el reporte |
|---|---|---|
| Hundimiento | Subrasante débil o lavado de finos por fuga de tubería: depresión cerrada. | `causa_presunta = hundimiento_pavimento`, a menudo con agua permanente. |
| Ahuellamiento | Canales longitudinales en las huellas. | Charcos alargados en la huella. |
| Pérdida de bombeo | La calzada ya no lleva el agua a la cuneta. | Charcos en el centro del carril con cuneta seca. |
| Baches | Retienen agua y el agua los agranda. | Muchos reportes chicos de `profundidad = tobillo` que se repiten. |

Los umbrales de intervención (PCI, IRI, pendiente transversal mínima) dependen de la normativa
local `<a confirmar>`. Un punto crítico con muchos reportes es un buen candidato para levantar
PCI/IRI en campo, no un sustituto de ese levantamiento. El método racional, las curvas IDF y la
capacidad de los sumideros requieren topografía, inventario de red y un estudio hidráulico formal:
el sistema solo aporta el **dónde** y el **cuánto se repite**.
