import type { EstadoReporte, Severidad } from 'contracts';
import { colorSeveridad, etiquetaEstado, etiquetaSeveridad } from '@/lib/formato';

/** Severidad siempre con color + texto + barras (nunca solo color, CLAUDE.md §14.4). */
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
      className={`inline-flex items-center gap-2 rounded-full font-semibold ${
        grande ? 'px-4 py-2 text-base' : 'px-3 py-1 text-sm'
      }`}
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

const ESTILOS_ESTADO: Record<EstadoReporte, { bg: string; fg: string }> = {
  nuevo: { bg: '#fbf1dc', fg: '#8a5a00' },
  validado: { bg: '#e6f2ea', fg: '#1b6b38' },
  resuelto: { bg: '#e3eef5', fg: '#0a4a69' },
  duplicado: { bg: '#e8edf1', fg: '#3e5468' },
  rechazado: { bg: '#fbe1dc', fg: '#b3200a' },
};

/** Estado de moderación con el texto oficial de contracts ("Nuevo", "Validado", …). */
export function ChipEstado({
  estado,
  grande = false,
  ...resto
}: { estado: EstadoReporte; grande?: boolean } & Record<`data-${string}`, string>) {
  const e = ESTILOS_ESTADO[estado];
  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold ${
        grande ? 'px-4 py-2 text-base' : 'px-3 py-1 text-sm'
      }`}
      style={{ background: e.bg, color: e.fg }}
      {...resto}
    >
      {etiquetaEstado(estado)}
    </span>
  );
}
