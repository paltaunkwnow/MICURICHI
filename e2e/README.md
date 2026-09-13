# e2e — Parte 5

Pruebas end-to-end **transversales** con Playwright. Cubren el recorrido completo:

1. Un ciudadano crea un reporte (GPS simulado o selección manual) con foto.
2. Un técnico inicia sesión, lo filtra por UV y lo valida.
3. El punto aparece en el mapa público con distrito y UV.
4. La exportación GeoJSON contiene el reporte.

Se implementa en la **tarea 9** de la Fase 1, cuando existan las cinco partes. Hasta entonces `pnpm test:e2e` solo informa que está pendiente.

Los E2E propios de cada app (`apps/web-ciudadano`, `apps/panel-admin`) viven dentro de cada app; aquí va solo lo que cruza partes.
