# ADR 0007 — Reportar con ubicación aproximada desde dispositivos sin GPS preciso

- **Estado:** aceptada. Se implementa en la corrida `docs/sdd/2026-10-04-reportar-desde-computadora/`.
- **Fecha:** 2026-10-04
- **Decide:** el usuario. Entre «hacerlo configurable», «dejarlo así» y «permitir computadoras»,
  eligió **«Permitir computadoras»** y aprobó el plan de la corrida tal cual. Descartó ofrecer el camino
  a cualquiera y exigir foto en ese camino.

## Contexto

El ADR 0006 exige compartir la ubicación del dispositivo para reportar: precisión de 50 m o menos,
posición de 600 s o menos y punto a 60 m o menos de esa posición. Un teléfono al aire libre llega sin
problema. Una laptop no: no tiene GPS, se ubica por Wi-Fi o por IP, y declara precisiones de cientos
de metros o de kilómetros. El usuario lo vio en su propia laptop («Precisión actual: 178 m») y no
pudo reportar.

La comprobación de los 60 m es de coherencia, no de presencia: el GPS se puede falsear (§9.4). Lo que
de verdad frena el abuso es la cuenta, el cupo diario, la auditoría y la revisión técnica (§13).

## Decisión

1. **Hay un segundo camino, «ubicación aproximada», y se ofrece solo cuando el dispositivo no llega a
   50 m.**
   - No depende del tipo de aparato: un teléfono con GPS preciso sigue con la regla de los 60 m.
   - El servidor lo hace cumplir: con una precisión de 50 m o menos y `ubicacion_aproximada: true`
     responde `422 UBICACION_PRECISA_DISPONIBLE`, sin gastar cupo.
2. **La ubicación del dispositivo se sigue pidiendo**, aunque sea aproximada.
   - Sigue valiendo que la posición no tenga más de 600 s.
   - Sirve para centrar el mapa.
   - El punto lo pone la persona a mano en cualquier lugar de la cobertura (el point-in-polygon sigue
     exigiéndola). No hay círculo de 60 m.
3. **Qué se guarda:**
   - `ubicacion_metodo = 'aproximada'`, un valor nuevo del enum (migración 0019);
   - la precisión declarada en `precision_gps_m`;
   - la distancia al dispositivo en `NULL`, porque con esa imprecisión no dice nada.
   - La posición del dispositivo sigue **sin guardarse ni registrarse** (§0, regla 8).
4. **Quién lo ve:**
   - los técnicos ven «Ubicación aproximada — sin comprobar con el dispositivo» en la bandeja, el
     detalle, la ficha y la exportación;
   - en el mapa público no cambia nada: sigue «NO SE HA VERIFICADO» hasta que un técnico lo revise;
   - la nota metodológica de toda exportación lo dice.
5. **No cambian:** cupo diario, demora de publicación, antispam, auditoría ni puntos críticos (estos
   solo cuentan reportes verificados).

## Consecuencias

- Se puede reportar desde una computadora o desde un teléfono que no consigue buena señal.
- La coherencia punto–dispositivo deja de valer para esos reportes. Queda a la vista: método
  `aproximada` en el panel y en la nota metodológica.
- Un teléfono con GPS no puede elegir el camino aproximado para saltarse los 60 m: el servidor lo
  rechaza. Igual, la precisión la declara el cliente: como el resto de la comprobación de ubicación,
  es coherencia y no prueba (§9.4).
- Contrato 0.18.0 (sin ruptura), migración 0019 y cambios en las cinco partes. CLAUDE.md §0 regla 8,
  §1, §2, §3.1, §4.3, §7.1, §7.5, §9.4, §13 y §14.1 quedan al día.
