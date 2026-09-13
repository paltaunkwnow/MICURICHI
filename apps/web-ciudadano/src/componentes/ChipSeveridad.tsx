import type { Severidad } from 'contracts';
import { colorSeveridad, etiquetaSeveridad } from '@/lib/formato';

/** Severidad siempre con color + texto + barras (nunca solo color). */
export function ChipSeveridad({
  severidad,
  grande = false,
}: {
  severidad: Severidad;
  grande?: boolean;
}) {
  const c = colorSeveridad(severidad);
  const critica = severidad === 'critica';
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full font-semibold ${grande ? 'px-4 py-2 text-base' : 'px-3 py-1 text-sm'}`}
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
      <span className="flex gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="inline-block h-3 w-1.5 rounded-sm"
            style={{
              background: i <= c.barras ? c.relleno : critica ? 'rgba(255,255,255,.25)' : '#d7dfda',
            }}
          />
        ))}
      </span>
    </span>
  );
}

export function ChipEstado({
  estado,
}: {
  estado: 'nuevo' | 'validado' | 'duplicado' | 'rechazado' | 'resuelto';
}) {
  const estilos: Record<string, { bg: string; fg: string; texto: string }> = {
    nuevo: { bg: '#fbf1dc', fg: '#8a5a00', texto: 'En revisión' },
    validado: { bg: '#e6f2ea', fg: '#1b6b38', texto: 'Validado' },
    resuelto: { bg: '#e3eef5', fg: '#0a4a69', texto: 'Resuelto' },
    duplicado: { bg: '#e8edf1', fg: '#3e5468', texto: 'Duplicado' },
    rechazado: { bg: '#fbe1dc', fg: '#b3200a', texto: 'Rechazado' },
  };
  const e = estilos[estado] ?? estilos.nuevo!;
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold"
      style={{ background: e.bg, color: e.fg }}
    >
      {e.texto}
    </span>
  );
}
