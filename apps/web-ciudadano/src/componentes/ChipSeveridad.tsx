import type { EstadoReporte, Severidad } from 'contracts';
import { colorSeveridad, etiquetaSeveridad } from '@/lib/formato';

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

/**
 * Estado del reporte con las palabras del vecino, no las del técnico: «Publicado» dice más que
 * «validado» a quien mandó el reporte y no conoce la máquina de estados.
 */
const ESTADOS: Record<EstadoReporte, { fondo: string; texto: string; etiqueta: string }> = {
  nuevo: { fondo: '#FBF1DC', texto: '#8A5A00', etiqueta: 'En revisión' },
  validado: { fondo: '#E6F2EA', texto: '#1B6B38', etiqueta: 'Publicado' },
  resuelto: { fondo: '#E3EEF5', texto: '#0A4A69', etiqueta: 'Resuelto' },
  rechazado: { fondo: '#FBE1DC', texto: '#B3200A', etiqueta: 'No publicado' },
  duplicado: { fondo: '#E8EDF1', texto: '#3E5468', etiqueta: 'Sumado a otro punto' },
};

export function ChipEstado({ estado }: { estado: EstadoReporte }) {
  const e = ESTADOS[estado] ?? ESTADOS.nuevo;
  return (
    <span className="mini" style={{ background: e.fondo, color: e.texto, fontWeight: 700 }}>
      {e.etiqueta}
    </span>
  );
}

export function etiquetaEstadoVecino(estado: EstadoReporte): string {
  return (ESTADOS[estado] ?? ESTADOS.nuevo).etiqueta;
}
