/**
 * Comprobación de la posición del teléfono al crear un reporte (contracts 0.9.0, CLAUDE.md §13).
 *
 * El punto del reporte tiene que estar a `REPORTE_RADIO_DISPOSITIVO_M` o menos de donde el teléfono
 * dice estar, con una precisión y una antigüedad acotadas. Zod solo valida los rangos físicos:
 * los topes van acá para responder con un 422 que la interfaz pueda explicar, no con un 400.
 *
 * Es una comprobación de coherencia, no una prueba de presencia: la posición la informa el
 * teléfono y se puede falsear.
 *
 * La posición del teléfono NO sale de esta función: el resultado lleva solo la distancia y la
 * precisión, que es lo que se guarda. Ni la fila, ni la auditoría, ni la huella de idempotencia,
 * ni el log la ven (§0 regla 8).
 */
import {
  CONFIG_DOMINIO,
  type CodigoUbicacionDispositivo,
  type Dispositivo,
  dentroDelRadio,
  distanciaMetros,
  type PuntoLatLon,
} from 'contracts';

/**
 * Metros que se suman al radio. La interfaz recorta el marcador al círculo sin tolerancia; este
 * medio metro absorbe el redondeo de las coordenadas que manda el cliente (CHANGELOG 0.9.0).
 */
export const TOLERANCIA_RADIO_M = CONFIG_DOMINIO.REPORTE_RADIO_TOLERANCIA_M;

/**
 * Margen mínimo del método `gps`. El margen es la precisión que declara el teléfono: el punto que
 * puso el GPS en el paso 1 y la relectura al enviar difieren varios metros aunque nadie lo mueva,
 * y con un corte fijo de 2 m casi todo salía `manual` (CHANGELOG 0.9.0).
 */
export const DISTANCIA_GPS_MIN_M = 2;

export type RevisionDispositivo =
  | {
      ok: true;
      metodo: 'gps' | 'manual';
      /** Redondeada al metro y nunca mayor que el radio: es lo que se guarda. */
      distanciaM: number;
      precisionM: number;
    }
  | {
      ok: false;
      codigo: CodigoUbicacionDispositivo;
      mensaje: string;
      detalles: Record<string, number>;
    };

/** Distancia medida al milímetro, igual que `dentroDelRadio`. */
const alMilimetro = (m: number) => Math.round(m * 1000) / 1000;

/**
 * Revisa, en el orden del contrato, precisión, antigüedad y radio. `punto` es el del reporte y
 * `dispositivo`, la lectura del teléfono.
 */
export function revisarDispositivo(
  punto: PuntoLatLon,
  dispositivo: Dispositivo,
): RevisionDispositivo {
  const precisionMax = CONFIG_DOMINIO.PRECISION_DISPOSITIVO_MAX_M;
  if (dispositivo.precision_m > precisionMax)
    return {
      ok: false,
      codigo: 'PRECISION_INSUFICIENTE',
      mensaje: `Tu teléfono te ubica con un margen de ${Math.ceil(dispositivo.precision_m)} m y hace falta ${precisionMax} m o menos. Salí a un lugar abierto y volvé a compartir tu ubicación.`,
      detalles: { precision_m: Math.ceil(dispositivo.precision_m), maximo_m: precisionMax },
    };

  const antiguedadMax = CONFIG_DOMINIO.POSICION_ANTIGUEDAD_MAX_S;
  if (dispositivo.antiguedad_s > antiguedadMax)
    return {
      ok: false,
      codigo: 'POSICION_VENCIDA',
      mensaje: `Tu ubicación es de hace más de ${Math.round(antiguedadMax / 60)} minutos. Volvé a compartirla para enviar el reporte.`,
      detalles: { antiguedad_s: Math.round(dispositivo.antiguedad_s), maximo_s: antiguedadMax },
    };

  const radio = CONFIG_DOMINIO.REPORTE_RADIO_DISPOSITIVO_M;
  // Solo lat y lon: `dentroDelRadio` no necesita el resto de la lectura.
  const telefono = { lat: dispositivo.lat, lon: dispositivo.lon };
  const distancia = distanciaMetros(punto, telefono);
  if (!dentroDelRadio(punto, telefono, { radioM: radio, toleranciaM: TOLERANCIA_RADIO_M }))
    return {
      ok: false,
      codigo: 'UBICACION_FUERA_DE_RADIO',
      mensaje: `El punto está a ${Math.round(distancia)} m de donde estás y puede estar a ${radio} m como máximo. Acercalo a tu ubicación y volvé a enviar.`,
      detalles: { distancia_m: Math.round(distancia), maximo_m: radio },
    };

  return {
    ok: true,
    metodo:
      alMilimetro(distancia) <= Math.max(DISTANCIA_GPS_MIN_M, dispositivo.precision_m)
        ? 'gps'
        : 'manual',
    // Con la tolerancia, un punto a 60,5 m entra; se guarda como puesto en el borde y no como
    // 61 m, que diría que el servidor aceptó algo fuera del radio.
    distanciaM: Math.min(Math.round(distancia), radio),
    precisionM: dispositivo.precision_m,
  };
}
