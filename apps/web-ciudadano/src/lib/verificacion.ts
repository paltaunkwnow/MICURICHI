import {
  type AgregadoUv,
  ESTADOS_VERIFICADOS,
  type EstadoReporte,
  ETIQUETAS,
  SEVERIDADES,
  type Severidad,
} from 'contracts';
import { colorSeveridad, etiquetaSeveridad } from './formato';

/**
 * Publicación sin moderación previa (contracts 0.11.0): un reporte `nuevo` se ve en el mapa con el
 * texto EXACTO «NO SE HA VERIFICADO» hasta que un técnico lo revisa. Decisión del usuario: no se
 * traduce, no se abrevia y va con icono, no solo con color.
 */
export const TEXTO_SIN_VERIFICAR = ETIQUETAS.estado_publico.nuevo;

/**
 * ¿Lo revisó un técnico? Lo dice `verificado` (obligatorio desde contracts 0.15.0); sin él, como
 * en la respuesta de un api-core anterior, vale el estado.
 */
export function estaVerificado(p: { estado: string; verificado?: boolean | null }): boolean {
  if (typeof p.verificado === 'boolean') return p.verificado;
  return (ESTADOS_VERIFICADOS as readonly string[]).includes(p.estado);
}

/**
 * Cómo se ve cada estado en un chip: texto visible, color de fondo y de letra con contraste AA
 * (una prueba lo mide). Los tres públicos usan las palabras del contrato; `rechazado` y
 * `duplicado` solo los ve el autor en «Mis reportes».
 */
export const ESTILO_ESTADO: Record<
  EstadoReporte,
  { fondo: string; texto: string; etiqueta: string }
> = {
  nuevo: { fondo: '#FBF1DC', texto: '#6E4600', etiqueta: ETIQUETAS.estado_publico.nuevo },
  validado: { fondo: '#E6F2EA', texto: '#1B6B38', etiqueta: ETIQUETAS.estado_publico.validado },
  resuelto: { fondo: '#E3EEF5', texto: '#0A4A69', etiqueta: ETIQUETAS.estado_publico.resuelto },
  rechazado: { fondo: '#FBE1DC', texto: '#8A1908', etiqueta: 'Retirado del mapa' },
  duplicado: { fondo: '#E8EDF1', texto: '#3E5468', etiqueta: 'Sumado a otro punto' },
};

/**
 * Icono de «NO SE HA VERIFICADO»: un círculo ámbar oscuro con un signo de admiración blanco. Es el
 * mismo en el chip, en la leyenda y en la pastilla del mapa, que MapLibre arma a mano y por eso
 * lo recibe como texto (`ICONO_SIN_VERIFICAR_SVG`). El círculo lleva un filete blanco para que se
 * distinga también sobre la pastilla elegida, que es oscura.
 */
export const COLORES_ICONO_SIN_VERIFICAR = { fondo: '#8A5A00', signo: '#ffffff' } as const;

export const ICONO_SIN_VERIFICAR_SVG =
  `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">` +
  `<circle cx="8" cy="8" r="7.25" fill="${COLORES_ICONO_SIN_VERIFICAR.fondo}" stroke="#ffffff" stroke-width="1.5"/>` +
  `<rect x="7" y="3.6" width="2" height="5.6" rx="1" fill="${COLORES_ICONO_SIN_VERIFICAR.signo}"/>` +
  `<circle cx="8" cy="11.7" r="1.15" fill="${COLORES_ICONO_SIN_VERIFICAR.signo}"/>` +
  '</svg>';

/** Nombre accesible de una pastilla del mapa: la severidad y si se verificó. */
export function ariaPastilla(severidad: Severidad, estado: string, verificado?: boolean): string {
  const base = `Punto de severidad ${etiquetaSeveridad(severidad).toLowerCase()}`;
  if (estado === 'resuelto') return `${base}, resuelto`;
  return estaVerificado({ estado, verificado })
    ? `${base}, verificado`
    : `${base}, no se ha verificado`;
}

/* ─────────────────────────────── Coropleta ─────────────────────────────── */

/**
 * Color de una unidad vecinal sin reportes verificados: neutro. La gravedad pública por barrio se
 * arma solo con lo verificado (§9.2): un reporte falso de más de 70 cm pintaría de crítica una UV
 * entera.
 */
export const COLOR_UV_SIN_VERIFICAR = '#8C9AA5';

export interface EstadoUv {
  /** Reportes publicados, sin verificar incluidos: da la intensidad del relleno. */
  n: number;
  nVerificados: number;
  /** Severidad máxima de lo verificado; `null` pinta neutro. */
  sev: Severidad | null;
}

/**
 * Lo que la coropleta toma de un agregado. Con un geo-service anterior a 0.11.0, que no manda
 * `n_verificados` ni `severidad_max_verificada`, todo queda neutro: `severidad_max` incluye lo
 * no verificado y no se usa nunca.
 */
export function estadoDeUv(a: AgregadoUv): EstadoUv {
  const nVerificados = typeof a.n_verificados === 'number' ? a.n_verificados : 0;
  const sev = nVerificados > 0 ? (a.severidad_max_verificada ?? null) : null;
  return { n: a.n_reportes, nVerificados, sev };
}

/**
 * Relleno de las unidades vecinales: el color de la severidad verificada (`feature-state` `sev`)
 * y neutro si no hay. Es una expresión de MapLibre, que se evalúa en la GPU sin rehacer la capa.
 */
export function expresionColorUv(): unknown[] {
  const pares = SEVERIDADES.flatMap((s) => [s, colorSeveridad(s).relleno]);
  return ['match', ['coalesce', ['feature-state', 'sev'], ''], ...pares, COLOR_UV_SIN_VERIFICAR];
}

/** «UV 57 · 2 reportes», con la marca cuando ninguno de esos reportes se verificó todavía. */
export function etiquetaDeUv(nombre: string, e: Pick<EstadoUv, 'n' | 'nVerificados'>): string {
  if (e.n <= 0) return nombre;
  const base = `${nombre} · ${e.n} ${e.n === 1 ? 'reporte' : 'reportes'}`;
  return e.nVerificados > 0 ? base : `${base} · ${TEXTO_SIN_VERIFICAR}`;
}

/* ─────────────────────────────── Contraste ─────────────────────────────── */

function luminancia(hex: string): number {
  const limpio = hex.replace('#', '');
  const completo =
    limpio.length === 3
      ? limpio
          .split('')
          .map((c) => c + c)
          .join('')
      : limpio;
  const canal = (i: number) => {
    const v = Number.parseInt(completo.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
}

/** Relación de contraste de WCAG 2 entre dos colores `#rrggbb`. */
export function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (claro + 0.05) / (oscuro + 0.05);
}
