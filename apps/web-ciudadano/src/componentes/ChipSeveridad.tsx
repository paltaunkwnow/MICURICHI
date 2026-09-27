import type { EstadoReporte, Severidad } from 'contracts';
import { BadgeCheck, CircleCheck, Clock, EyeOff, type LucideIcon, Merge } from 'lucide-react';
import { colorSeveridad, etiquetaSeveridad } from '@/lib/formato';
import { ESTILO_ESTADO } from '@/lib/verificacion';
import { IconoSinVerificar } from './IconoSinVerificar';

/**
 * Severidad siempre con color + nombre escrito + barras (CLAUDE.md §14.4): quien no distingue
 * los colores tiene las otras dos señales.
 */
export function ChipSeveridad({
  severidad,
  grande = false,
}: {
  severidad: Severidad;
  grande?: boolean;
}) {
  const c = colorSeveridad(severidad);
  const critica = severidad === 'critica';
  const vacia = critica ? 'rgba(255,255,255,.25)' : '#d7dfda';
  return (
    <span
      className={`sev ${grande ? 'sev-grande' : ''}`}
      style={{
        background: critica ? '#0F2D43' : `var(--color-sev-${severidad}-fondo)`,
        color: critica ? '#fff' : c.texto,
      }}
    >
      <span className="punto" style={{ background: c.relleno }} aria-hidden="true" />
      <span>
        {grande
          ? `Severidad ${etiquetaSeveridad(severidad).toLowerCase()}`
          : etiquetaSeveridad(severidad)}
      </span>
      <span className="barras" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <i key={i} style={{ background: i <= c.barras ? c.relleno : vacia }} />
        ))}
      </span>
    </span>
  );
}

const ICONOS: Record<Exclude<EstadoReporte, 'nuevo'>, LucideIcon> = {
  validado: BadgeCheck,
  resuelto: CircleCheck,
  rechazado: EyeOff,
  duplicado: Merge,
};

/**
 * Estado del reporte con texto visible, icono y contraste AA (CLAUDE.md §14.1): nunca solo color.
 * `nuevo` dice exactamente «NO SE HA VERIFICADO» (contracts 0.11.0) en el mapa, las tarjetas, el
 * detalle y «Mis reportes»: el autor ve su reporte con la misma etiqueta que todos. `rechazado` y
 * `duplicado` solo aparecen en «Mis reportes».
 */
export function ChipEstado({ estado }: { estado: EstadoReporte }) {
  const e = ESTILO_ESTADO[estado] ?? ESTILO_ESTADO.nuevo;
  const Icono = estado === 'nuevo' ? null : ICONOS[estado];
  return (
    <span
      className="mini"
      data-estado={estado}
      style={{ background: e.fondo, color: e.texto, fontWeight: 700 }}
    >
      {Icono ? <Icono size={14} strokeWidth={2.4} aria-hidden="true" /> : <IconoSinVerificar />}
      {e.etiqueta}
    </span>
  );
}

/**
 * El reporte llegó pero todavía no se ve en el mapa: espera su `publicar_en`. Solo lo ve su
 * autor, en «Mis reportes» y en la confirmación.
 */
export function ChipEnEspera({ texto = 'Todavía no se publicó' }: { texto?: string }) {
  return (
    <span
      className="mini"
      data-estado="en-espera"
      style={{ background: '#E3EEF5', color: '#0A4A69', fontWeight: 700 }}
    >
      <Clock size={14} strokeWidth={2.4} aria-hidden="true" />
      {texto}
    </span>
  );
}
