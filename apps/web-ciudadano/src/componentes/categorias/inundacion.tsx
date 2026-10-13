import { CAUSAS_PRESUNTAS, ETIQUETAS, FRECUENCIAS, PROFUNDIDADES } from 'contracts';
import { etiquetaCausa, etiquetaFrecuencia, etiquetaProfundidad } from '@/lib/formato';
import type { PresentadorCategoria, PropsPresentador } from './tipos';

/**
 * Presentador de Inundaciones: el JSX que el detalle y la tarjeta tenían fijo, movido sin cambios
 * (profundidad por referencia corporal, frecuencia, causa presunta). Lee el valor del `detalle` de la
 * respuesta y, si no viene o no es un valor conocido, de los campos planos de siempre.
 */
function valor<T extends string>(
  detalle: Record<string, unknown> | undefined,
  clave: string,
  permitidos: readonly T[],
  plano: T,
): T {
  const v = detalle?.[clave];
  return typeof v === 'string' && (permitidos as readonly string[]).includes(v) ? (v as T) : plano;
}

function CamposDetalleInundacion({ reporte }: PropsPresentador) {
  const p = reporte.properties;
  return (
    <>
      <div>
        <dt>{ETIQUETAS.campos.profundidad}</dt>
        <dd>
          {etiquetaProfundidad(
            valor(p.detalle, 'profundidad_estimada', PROFUNDIDADES, p.profundidad_estimada),
          )}
        </dd>
      </div>
      <div>
        <dt>Frecuencia</dt>
        <dd>{etiquetaFrecuencia(valor(p.detalle, 'frecuencia', FRECUENCIAS, p.frecuencia))}</dd>
      </div>
      <div>
        <dt>Causa presunta</dt>
        <dd>
          {etiquetaCausa(valor(p.detalle, 'causa_presunta', CAUSAS_PRESUNTAS, p.causa_presunta))}
        </dd>
      </div>
    </>
  );
}

function PastillaTarjetaInundacion({ reporte }: PropsPresentador) {
  const p = reporte.properties;
  return (
    <span className="mini">
      {
        etiquetaProfundidad(
          valor(p.detalle, 'profundidad_estimada', PROFUNDIDADES, p.profundidad_estimada),
        ).split(' · ')[0]
      }
    </span>
  );
}

export const PRESENTADOR_INUNDACION: PresentadorCategoria = {
  CamposDetalle: CamposDetalleInundacion,
  PastillaTarjeta: PastillaTarjetaInundacion,
};
