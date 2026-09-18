# Plataformas de detección, alerta y reporte ciudadano de riesgo urbano

> Relevamiento documental del **2026-09-18** sobre fuentes públicas (sitios oficiales, prensa boliviana, documentación técnica).
> Acompaña a la infografía `docs/dominio/infografia-plataformas-riesgo.html`.
> Propósito: ubicar a Mi Curichi frente a lo que ya existe, en Bolivia y afuera, antes de cerrar la Fase 1.
> **Este documento no verifica en terreno el funcionamiento de cada sistema**: resume lo que cada fuente declara de sí misma.

---

## 1. Resumen ejecutivo

1. **En Bolivia el riesgo se observa desde arriba.** SENAMHI, VIDECI, SIMB, la ABE y SEARPI operan detección satelital e hidrológica y alerta descendente. Ninguna captura el reporte georreferenciado de un vecino como dato del sistema.
2. **El único antecedente directo de Mi Curichi en Santa Cruz es un chatbot de WhatsApp** para baches (línea 78096126): foto + ubicación GPS → mapa interno. Sin mapa público, sin máquina de estados, sin exportación.
3. **El referente boliviano más cercano es `Alertas La Paz`** (GAMLP), que abrió un canal de reporte ciudadano dentro de un sistema de alerta temprana municipal.
4. **La región ya resolvió el patrón**: SIATA (Medellín) combina sensores propios con "sensor ciudadano"; `Ciudadano` (México) y `Cochabamba Reporta` implementan el ciclo de vida del reporte urbano.
5. **Internacionalmente hay dos familias distintas**: plataformas de *reporte ciudadano* (PetaBencana, Ushahidi, FixMyStreet, SeeClickFix) que resuelven el mismo problema, y plataformas de *observación* (FIRMS, Flood Hub, GDACS, Copernicus EMS) que son capas a consumir, no competencia.
6. **Nadie acumula recurrencia por punto.** FixMyStreet y SeeClickFix trazan el *ticket*: un charco que se repite veinte veces son veinte tickets. El punto crítico por DBSCAN (§9.2 de `CLAUDE.md`) es la diferencia real de Mi Curichi frente a un 311 clásico.
7. **Ninguna plataforma relevada expone la identidad del reportante.** El jitter público y el reporte anónimo (§13) son el mínimo de la categoría, no cautela excesiva.

---

## 2. Bolivia — nivel nacional

| Plataforma | Organismo | Amenaza | Qué hace | Enlace |
|---|---|---|---|---|
| **SENAMHI — Alertas** | Servicio Nacional de Meteorología e Hidrología | Inundación, meteorología | Avisos meteorológicos e hidrológicos; SAT hidrológico con red de estaciones que vigila lluvia y nivel de ríos, con pronóstico de hasta 5 días | https://senamhi.gob.bo/index.php/alertas |
| **VIDECI / Defensa Civil** | Viceministerio de Defensa Civil, Min. de Defensa | Multiamenaza | Cabeza del SISRADE; seguimiento de alertas, reportes de eventos por municipio y sistema Dewetra | https://defensacivil.gob.bo/ |
| **SIMB** | Sistema de Información y Monitoreo de Bosques, Min. de Planificación | Incendio | Geovisor oficial de focos de calor, incendios activos, cicatrices de quema y deforestación; actualización satelital cada 3 h, reportes 09:00 y 16:00 | https://simb.planificacion.gob.bo/simb/ |
| **SOTS** | Agencia Boliviana Espacial (ABE) — LPAIS | Incendio | Plataforma satelital de monitoreo de focos de calor y áreas quemadas casi en tiempo real, operación 24 h | https://sots.abe.bo/ |
| **ABT** | Autoridad de Fiscalización y Control Social de Bosques y Tierra | Incendio | Fiscaliza quemas y desmontes; publica el Plan de Acción de Gestión del Fuego | https://www.abt.gob.bo/ |

**Lectura.** Cobertura satelital madura y alerta descendente sólida. El flujo ascendente (vecino → sistema) no existe a nivel nacional.

---

## 3. Bolivia — departamental y municipal

| Plataforma | Organismo | Amenaza | Reporte ciudadano | Qué hace | Enlace |
|---|---|---|---|---|---|
| **SEARPI** | Gobernación de Santa Cruz | Inundación | No | SAT de las cuencas Piraí, Ichilo, Yapacaní, Surutú y Parapetí; alertas por nivel de río difundidas vía los COEM municipales | https://searpi.gob.bo/ |
| **Alertas La Paz** | GAM de La Paz (app iOS/Android) | Multiamenaza | **Sí** | Sensores, estaciones y satélite → alertas de deslizamiento, inundación y sismo. El "quinto pilar" del SAT abrió un espacio en la app para que la población reporte eventos de emergencia | https://apps.apple.com/us/app/alertas-la-paz/id6738353943 |
| **Chatbot de baches** | GAM de Santa Cruz de la Sierra | Vía pública | **Sí** | WhatsApp 78096126: foto + ubicación GPS → el sistema incorpora el reporte a un mapa | https://eldeber.com.bo/santa-cruz/alcaldia-habilita-chatbot-vecino-pueda-reportar-baches-capital-crucena_1781200584 |
| **Línea 800-12-5050** | GAM de Santa Cruz de la Sierra | Multiamenaza | **Sí** (voz) | Canal telefónico gratuito de emergencias; se satura en cada temporal (>100 emergencias por lluvias en abril de 2026). Sin georreferencia ni histórico consultable | https://www.gmsantacruz.gob.bo/ |
| **Tunari Sin Fuego** | Plataforma ciudadana / voluntarios, Cochabamba | Incendio | **Sí** | Difunde alerta temprana de incendios en el Parque Nacional Tunari y coordina despliegue de voluntarios. En varios incendios de 2026 la alerta salió antes de acá que del Estado | https://www.reduno.com.bo/noticias/alerta-en-cochabamba-incendio-afecta-el-parque-tunari-y-el-humo-llega-a-la-ciudad-2026719173234 |
| **Cochabamba Reporta** | Proyecto abierto (GitHub) | Vía pública | **Sí** | Reporte de baches, basura, alumbrado e infraestructura con foto y ubicación exacta, y trazabilidad de estados: reportado → verificación → asignación → resuelto, con notificación en cada cambio | https://github.com/dgschahvqvc17/Cochabamba-Reporta |

**Lectura.** Acá aparece el vecino como emisor. Ningún caso boliviano combina las cinco capacidades del MVP (captura GPS + mapa público + moderación previa + recurrencia por punto + exportación).

---

## 4. América Latina

| Plataforma | País | Amenaza | Reporte ciudadano | Qué aporta | Enlace |
|---|---|---|---|---|---|
| **SIATA** | Colombia (Medellín / Valle de Aburrá) | Inundación, deslizamiento, incendio, rayos, aire | **Sí** ("sensor ciudadano") | El mejor modelo regional: radar, red de sensores y drones para 2,5 M de habitantes, 24/7, app pública, y figura explícita de sensor ciudadano integrada al sistema técnico | https://siata.gov.co/ |
| **CEMADEN** | Brasil | Inundación, deslizamiento | No | Monitoreo geo-hidrometeorológico nacional y alertas; mapa interactivo público. Creado tras la tragedia de la Região Serrana (2011) | https://mapainterativo.cemaden.gov.br/ |
| **SENAPRED** | Chile | Multiamenaza | No | Sucesor de ONEMI (Ley 21.364/2021); coordina la gestión del riesgo y difunde el SAE directo a celulares del área afectada | https://senapred.cl/ |
| **Alertas Ecuador** | Ecuador | Multiamenaza | No | Portal único de alertas por amenaza con vista por provincia y cantón. Buen ejemplo de comunicación pública sobre división administrativa | https://alertasecuador.gob.ec/ |
| **SkyAlert** | México | Sismo | No | Red **privada** de sensores sísmicos, >10 M de usuarios, aviso en <2 s. Demuestra que un actor no estatal puede sostener infraestructura de alerta a escala nacional | https://skyalert.mx/ |
| **Ciudadano** | México | Vía pública, inundación | **Sí** | Reporte de problemas urbanos (baches, fugas, apagones, inundaciones) con foto y ubicación, vendido como producto que el municipio adopta | https://www.ciudadano.app/ |

---

## 5. Internacional

### 5.1 Reporte ciudadano (mismo problema que Mi Curichi)

| Plataforma | Origen | Amenaza | Qué aporta | Enlace |
|---|---|---|---|---|
| **PetaBencana.id** | Indonesia (CogniCity), avalada por la BNPB | Inundación | Referente mundial del mapa de inundación colaborativo. Bot conversacional pide altura del agua, ubicación y foto; cruza reportes con alertas oficiales y sensores hidráulicos. **Adoptada como plataforma oficial por la agencia nacional de desastres** | https://petabencana.id/ |
| **Ushahidi** | Kenia, código abierto | Multiamenaza | Inventó el crowdmapping de crisis (>3.500 eventos mapeados en el terremoto de Haití). Aporta el patrón de verificación de reportes de fuentes heterogéneas | https://www.ushahidi.com/ |
| **FixMyStreet** | Reino Unido (mySociety), código abierto | Vía pública | ~20 años reportando baches y luminarias. Su aporte es el **ciclo**: enrutado al organismo competente, reporte público, estado auditable | https://www.fixmystreet.com/ |
| **SeeClickFix / CivicPlus 311 CRM** | Estados Unidos | Vía pública | El 311 como producto: foto + GPS desde el lugar, y del otro lado un CRM municipal con cola de trabajo | https://seeclickfix.com/ |
| **Waze** | Google | Vía pública, inundación | Mayor base de reportes viales del mundo; *Waze for Cities* devuelve datos al municipio. El reporte es **efímero**: sirve para esquivar hoy, no para inventariar | https://www.waze.com/ |

### 5.2 Observación y alerta (capas a consumir, no competencia)

| Plataforma | Origen | Amenaza | Qué aporta | Enlace |
|---|---|---|---|---|
| **Watch Duty** | EE.UU., ONG 501(c)(3) | Incendio, inundación | Alertas en tiempo real verificadas por bomberos y despachadores retirados que escuchan frecuencias de radio. Tesis: la alerta oficial llega tarde; la verificación humana es el producto | https://www.watchduty.org/ |
| **NASA FIRMS** | NASA | Incendio | Focos de calor MODIS/VIIRS casi en tiempo real, descargables, con suscripción por área. **Alimenta al SIMB boliviano** | https://firms.modaps.eosdis.nasa.gov/map/ |
| **Global Forest Watch** | WRI + Google Earth Engine | Incendio, deforestación | Alertas de fuego sobre imágenes Landsat, áreas protegidas y uso del suelo | https://www.globalforestwatch.org/ |
| **Google Flood Hub** | Google Research | Inundación | Pronóstico fluvial con IA en >240.000 puntos de ~150 países (**toda Sudamérica desde 2024**), hasta 7 días. Cubre el río, no la calle | https://sites.research.google/floods/ |
| **GDACS** | ONU + Comisión Europea | Multiamenaza | Alertas globales con estimación automática de población afectada | https://www.gdacs.org/ |
| **Copernicus EMS** | Unión Europea | Inundación, incendio | Cartografía satelital rápida activable por un Estado tras un desastre; incluye EFAS y GloFAS | https://emergency.copernicus.eu/ |
| **HOT** | Humanitarian OpenStreetMap Team | Multiamenaza | Mapeo colaborativo de zonas sin datos geográficos. Es la razón por la que Mi Curichi puede usar capa base libre con atribución | https://www.hotosm.org/ |
| **Check for flooding** | Environment Agency, GOV.UK | Inundación | Consulta de riesgo por dirección + avisos por SMS/correo/llamada. Referencia de accesibilidad y lenguaje claro | https://check-for-flooding.service.gov.uk/ |
| **Yahoo! 防災速報** | Japón | Multiamenaza, inundación | Avisos para la ubicación actual y hasta 3 zonas elegidas. El patrón "mis zonas" es el de unidad vecinal seguida | https://play.google.com/store/apps/details?id=jp.co.yahoo.android.emg |
| **Vaisala RoadAI / RoadBotics** | Finlandia / EE.UU. | Vía pública | Detección automática de baches, fisuras y ahuellamiento filmando con celular montado en vehículo, puntaje por segmento de 10 m. Alternativa **objetiva** al reporte humano | https://www.vaisala.com/en/products/road-ai |

---

## 6. Matriz comparativa (solo plataformas con reporte ciudadano)

| Plataforma | Captura GPS + foto | Mapa público | Moderación previa | Historial/recurrencia por punto | Exportación / datos abiertos |
|---|---|---|---|---|---|
| PetaBencana.id | Sí | Sí | Parcial (confirmación por ventana de tiempo) | No, el reporte expira | Sí, API abierta |
| Ushahidi | Sí | Sí | Sí | No nativo | Sí |
| FixMyStreet | Sí | Sí | Parcial (posterior) | Por reporte, no por punto | Sí, código abierto |
| SeeClickFix | Sí | Sí | Sí | Por ticket | Según el municipio |
| SIATA | Parcial (sensor ciudadano) | Sí | Sí | Sí, serie histórica | Sí |
| Cochabamba Reporta | Sí | Sí | Sí, con estados | No | Sin definir |
| Alertas La Paz | Parcial (reporte de emergencia) | Parcial (alertas, no reportes) | Sí, personal municipal | No | No |
| Chatbot baches GAMSCS | Sí, por WhatsApp | No, mapa interno | Interna | No | No |
| **Mi Curichi (Misión 1)** | **Sí** | **Sí, con precisión degradada** | **Sí, nada se publica en `nuevo`** | **Sí, DBSCAN 25 m** | **Sí, CSV y GeoJSON con nota metodológica** |

---

## 7. Implicaciones para el proyecto

### 7.1 Confirman decisiones ya tomadas en `CLAUDE.md`

- **Moderación previa** (§7.3: nada se publica en `nuevo`) — coincide con PetaBencana, Ushahidi y SeeClickFix.
- **Privacidad del reportante** (§13: jitter, reporte anónimo) — ninguna plataforma relevada expone identidad en el mapa público.
- **Capa base libre con atribución** (§14.3) — viable gracias a OSM/HOT; ninguna de las plataformas relevadas depende de un servicio propietario de pago.
- **Punto crítico por DBSCAN** (§9.2) — es la capacidad que **ninguna** otra plataforma de reporte tiene, y por lo tanto el argumento principal frente al municipio.
- **Exportación con nota metodológica** (§9.5) — SIATA publica datos crudos; FixMyStreet es código abierto. Es práctica de la categoría, no un extra.

### 7.2 Abren preguntas para el usuario (no se implementa nada sin aprobación)

1. **Aval institucional.** PetaBencana escaló cuando la BNPB la adoptó como plataforma oficial; SIATA existe porque el Área Metropolitana la sostiene. ¿Hay interlocutor en el GAMSCS o en SEARPI? Es más determinante que cualquier funcionalidad.
2. **WhatsApp como segunda vía de entrada.** El chatbot de baches ya educó el gesto en Santa Cruz. Hoy está **fuera del alcance de la Misión 1** (§3.2); queda como candidato de backlog (§15).
3. **Consumo de capas externas.** FIRMS, GFW, Flood Hub y GloFAS son gratuitas y cubren Bolivia. Relevante para el ítem de backlog "cruce con lluvia registrada" (§15); no toca la Misión 1.
4. **Coexistencia con SEARPI.** Si SEARPI expone su nivel de río por API, el reporte ciudadano podría contextualizarse con el estado de la cuenca. `<a confirmar: existencia de API pública en SEARPI>`.

### 7.3 A confirmar con contacto directo

- Estado operativo real y alcance del chatbot de baches del GAMSCS.
- Existencia de API o datos abiertos en SEARPI y en el SIMB.
- Si `Alertas La Paz` publica los reportes ciudadanos que recibe o solo los usa internamente.

---

## 8. Nota sobre logotipos en la infografía

El entorno de publicación bloquea la carga de imágenes de terceros, y reproducir logotipos ajenos en un documento del proyecto abriría una cuestión de marcas innecesaria. Las marcas de la infografía son **tipográficas**, dibujadas con el color institucional aproximado de cada plataforma; el logotipo oficial de cada una está en su propio enlace.

---

## 9. Ubicación de este documento

Carpeta elegida: `docs/dominio/` (notas técnicas de dominio, §5.1 de `CLAUDE.md`). Esta tarea es de investigación y no está asignada a ninguna de las 5 partes; no se tocó código, ni `data/`, ni configuración raíz.
