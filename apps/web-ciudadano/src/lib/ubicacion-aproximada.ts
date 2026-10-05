import { CONFIG_DOMINIO } from 'contracts';
import type { EstadoUbicacionDispositivo } from './ubicacion-dispositivo';

/**
 * El camino de «ubicación aproximada» (ADR 0007), sin React: cuándo se ofrece y cuándo está
 * activo. Un dispositivo sin GPS preciso (una computadora ubicada por Wi-Fi o IP) declara
 * precisiones de cientos de metros y no puede reportar por el camino normal (radio de 60 m). Con
 * este camino el punto lo pone la persona a mano en cualquier lugar de la cobertura y api-core no
 * comprueba el radio; el reporte queda marcado como «sin comprobar con el dispositivo».
 *
 * La pantalla (`PedirUbicacion.tsx` y `FormularioReporte.tsx`) solo aplica estas reglas.
 */

const PRECISION_MAX_M = CONFIG_DOMINIO.PRECISION_DISPOSITIVO_MAX_M;

/**
 * ¿Ofrecer «Reportar con ubicación aproximada»? Solo cuando ya llegó una lectura del dispositivo y
 * su precisión pasa de los `PRECISION_MAX_M` m. Vale ya en la primera lectura imprecisa (fase
 * «buscando»), sin esperar los 30 s del plazo, y también cuando el plazo venció («imprecisa»). Con
 * `PRECISION_MAX_M` m o menos el controlador se ancla solo por el camino normal y no hay nada que
 * ofrecer; sin ninguna lectura no habría dónde centrar el mapa.
 */
export function ofreceUbicacionAproximada(estado: EstadoUbicacionDispositivo): boolean {
  const ultima = estado.fase === 'buscando' || estado.fase === 'imprecisa' ? estado.ultima : null;
  return ultima !== null && ultima.precisionM > PRECISION_MAX_M;
}

/**
 * ¿El reporte va por el camino aproximado? El controlador lo marca al anclarse a una posición
 * imprecisa (`ControladorUbicacion.aproximar()`). De acá salen todas las diferencias del paso 1:
 * sin círculo de 60 m, movimiento libre del punto y `ubicacion_aproximada: true` en el envío.
 */
export function esModoAproximado(estado: EstadoUbicacionDispositivo): boolean {
  return estado.fase === 'lista' && estado.aproximada === true;
}
