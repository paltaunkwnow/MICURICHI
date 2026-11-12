/**
 * Esquema del detalle de Inundaciones (ADR 0009). Los campos de dominio de inundación con sus mismas
 * reglas, DERIVADOS de `ReporteCrearSchema`: se toman sus definiciones de campo de `.shape` (misma
 * lista de enums, mismos defaults y nulabilidad), sin duplicar ninguna lista. La prueba de
 * equivalencia (contrato-0-19) comprueba que acepta y rechaza lo mismo que `ReporteCrearSchema` en
 * estos campos.
 */

import { z } from 'zod';
import { ReporteCrearSchema } from '../../esquemas/reporte.js';

// `ReporteCrearSchema` está refinado (regla del sumidero) y Zod 4 no deja `.pick()` sobre un objeto
// con refinamientos, pero sí expone `.shape` con cada campo. Así el detalle reutiliza las
// definiciones exactas (enums, defaults, nulabilidad) sin repetir ninguna lista.
const forma = {
  profundidad_estimada: ReporteCrearSchema.shape.profundidad_estimada,
  frecuencia: ReporteCrearSchema.shape.frecuencia,
  causa_presunta: ReporteCrearSchema.shape.causa_presunta,
  sumidero_cercano: ReporteCrearSchema.shape.sumidero_cercano,
  sumidero_estado: ReporteCrearSchema.shape.sumidero_estado,
  agua_brota_sumidero: ReporteCrearSchema.shape.agua_brota_sumidero,
};

// `strictObject` (desde 0.20.0): el detalle rechaza claves de más (13.2 §5; api-core valida el
// `detalle` de un reporte por categoría con este Zod). No cambia la equivalencia de contrato-0-19:
// `ReporteCrearSchema` descarta las claves sobrantes y ninguno de sus casos trae claves de más en
// estos seis campos, así que ambos siguen aceptando y rechazando exactamente lo mismo.
export const DetalleInundacionSchema = z.strictObject(forma).superRefine((v, ctx) => {
  // La MISMA regla del sumidero que `ReporteCrearSchema`: sin sumidero cercano no hay nada que esté
  // tapado ni de dónde brote el agua. Se reescribe porque esa regla está embebida en el superRefine
  // de `ReporteCrearSchema`, que no se exporta ni se toca (el cambio de esta corrida es aditivo); la
  // prueba de equivalencia garantiza que las dos coincidan.
  if (v.sumidero_cercano !== 'no') return;
  if (v.sumidero_estado != null)
    ctx.addIssue({
      code: 'custom',
      path: ['sumidero_estado'],
      message: 'Indicaste que no hay sumidero cercano: no se puede decir si está tapado.',
    });
  if (v.agua_brota_sumidero === true)
    ctx.addIssue({
      code: 'custom',
      path: ['agua_brota_sumidero'],
      message: 'Indicaste que no hay sumidero cercano: el agua no puede brotar de él.',
    });
});
export type DetalleInundacion = z.infer<typeof DetalleInundacionSchema>;
