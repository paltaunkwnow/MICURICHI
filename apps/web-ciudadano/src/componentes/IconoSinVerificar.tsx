import { COLORES_ICONO_SIN_VERIFICAR } from '@/lib/verificacion';

/**
 * Icono de «NO SE HA VERIFICADO». Es el mismo dibujo que `ICONO_SIN_VERIFICAR_SVG`, que usan las
 * pastillas del mapa (MapLibre las arma fuera de React): chip, leyenda y mapa se reconocen entre
 * sí. Decorativo: el texto va siempre al lado.
 */
export function IconoSinVerificar({ size = 14 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className="flex-none"
    >
      <circle
        cx="8"
        cy="8"
        r="7.25"
        fill={COLORES_ICONO_SIN_VERIFICAR.fondo}
        stroke="#ffffff"
        strokeWidth="1.5"
      />
      <rect x="7" y="3.6" width="2" height="5.6" rx="1" fill={COLORES_ICONO_SIN_VERIFICAR.signo} />
      <circle cx="8" cy="11.7" r="1.15" fill={COLORES_ICONO_SIN_VERIFICAR.signo} />
    </svg>
  );
}
