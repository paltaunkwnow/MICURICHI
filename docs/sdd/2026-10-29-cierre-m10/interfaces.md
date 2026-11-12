# Interfaces internas del cierre M10

Diseño coordinado dentro del [plan aprobado](plan.md). **No es todavía un dictamen de
verificación ni autorización para operar instalaciones.** P4 entrega los SHA y las pruebas
que convierten estas interfaces en una versión estable; sus consumidores no inventan otra.

| Productor → consumidor | Acuerdo |
|---|---|
| Runner DB → CLI/local/fixtures | `autorizarContraccionCompatible?: boolean`, false por defecto; bandera `--autorizar-contraccion-compatible`. Independiente del consentimiento0015. Rechazo de0022 pendiente antes de mutar; no-op ya aplicado no exige permiso otra vez. |
| Runner → SQL0022 | Misma transacción: `curichi.autorizar_contraccion_compatible='si'` y `curichi.autorizar_contraccion_compatible_tx=txid_current()::text`, locales. La herencia de otra sesión/tx no autoriza. |
| SQL DB → arranque API | `SELECT version, integro FROM public.estado_esquema_m10()`: exactamente una fila, versión integer22 e integridad booleantrue. Cero/dos filas, forma inválida, error, ausencia de función, versión antigua/futura o integridadfalse rechazan antes de listen/escritores/mantenimiento. |
| Seguridad de esa consulta | Función SQLSTABLE SECURITYDEFINER con ruta fija `pg_catalog,pg_temp` y referencias privadas cualificadas; revocar PUBLIC y conceder únicamente EXECUTE de esa función al rol API. No conceder SELECT de `_migraciones` ni elevar roles globalmente. Pruebas reales de fixture sobre privilegios/estructura/historial, no solo mocks. |
| Estado22 íntegro | Historial válido, estructuras y campos críticos de escritor/lector, cuatro CHECK de detalle, archivo restringido con cinco campos/PK válidos y ausencia de vista/planos/trigger/funciones/ENUM retirados. Una fila futura en historial sin cambiar tablas, o renombrar un campo crítico de reporte/archivo, no puede conservar un resultado de integridad aceptable. |
| Writer API → almacenamiento |25argumentos en lugar de31, retirando solo los seis planos. JSONpersistido Inundaciones reproduce0020: tres obligatorios, opcionalesNULL omitidos, false conservado. Detalle validado para severidad/huella/RF-01 separado e intacto; otras categorías mantienen detalle completo. |
| Archivo DB → respaldo/reversa | `resguardo_m10.cuota_reporte_diaria`: usuario_id,dia,reportes_n,fotos_n,actualizado_en y PK original, dueño exclusivo, sinFK/limpieza/sobrescritura. Copia existente únicamente si igualdad exacta; divergencia/usuarios necesarios ausentes bloquean la operación que los exige. |
| Mantenimiento → API | `cuotasDiariasBorradas=0` obsoleto, sin reciclarlo como contador; `cupoContadorBorrado` y las demás limpiezas conservan significado. |
| Backup Node/Bash | Perfiles19/21/22 explícitos, sellos/blobs históricos conservados y evidencia22 versionada. Comparar datos completos por categoría, seis planos reconstruidos, campos comunes, auxiliares y archivo; FK efectivas e índices por intención/definición. No simple intersección o conteos. |
| Actualización/recuperación | Seleccionar y comprobar código+dependencias+esquema+estado como conjunto, incluidos datos aceptados durante22. La cápsula dist21 sola no demuestra un release ejecutable aislado. No resolver sus imports hacia DBdist22 ni sobrescribir carpetas ajenas para simular recuperación. |

Protocolo de pruebas y límites en [protocolo-verificacion.md](protocolo-verificacion.md).
El ensayo/actualización reales se concretarán tras código y verificación independiente;
requieren aprobación aparte. `ARRANCAR.md` es una guía solicitada, sin comandos ejecutados.
