import { BadgeCheck } from 'lucide-react';
import { COLOR_UV_SIN_VERIFICAR, ESTILO_ESTADO, TEXTO_SIN_VERIFICAR } from '@/lib/verificacion';
import { IconoSinVerificar } from './IconoSinVerificar';

/**
 * Leyenda del mapa público: qué significa el icono de las pastillas y por qué hay barrios grises.
 * Los reportes se publican sin revisión previa (contracts 0.11.0), así que distinguir lo
 * verificado de lo que no es parte de leer el mapa, no un detalle.
 */
export function LeyendaMapa({ className = '' }: { className?: string }) {
  return (
    <section
      /*
       * Puramente informativa (sin botones ni enlaces adentro): con los pines en pastilla del
       * mapa público, esta tarjeta flotante podía caer justo encima de un reporte real y lo
       * dejaba imposible de tocar para siempre, tanto con el dedo como con el mouse —no un
       * defecto de la prueba, el pin quedaba atrapado debajo de la leyenda en la pantalla real—.
       * `pointer-events-none` deja pasar el clic al mapa; mismo patrón que `PlanoAnillos.tsx`
       * para overlays decorativos.
       */
      className={`tarjeta pointer-events-none grid gap-1 px-3 py-2 text-[13px] leading-[1.35] ${className}`}
      aria-label="Leyenda del mapa"
      data-testid="leyenda-mapa"
    >
      <span
        className="flex items-center gap-1.5 font-bold"
        style={{ color: ESTILO_ESTADO.nuevo.texto }}
      >
        <IconoSinVerificar />
        {TEXTO_SIN_VERIFICAR}
      </span>
      <span className="text-tinta-600">todavía no lo revisó un técnico</span>
      <span
        className="flex items-center gap-1.5 font-bold"
        style={{ color: ESTILO_ESTADO.validado.texto }}
      >
        <BadgeCheck size={14} strokeWidth={2.4} aria-hidden="true" />
        {ESTILO_ESTADO.validado.etiqueta}
      </span>
      <span className="flex items-center gap-1.5 text-tinta-600">
        <i
          className="block h-3 w-3 flex-none rounded-[3px]"
          style={{ background: COLOR_UV_SIN_VERIFICAR }}
          aria-hidden="true"
        />
        Barrio en gris: sin reportes verificados
      </span>
    </section>
  );
}
