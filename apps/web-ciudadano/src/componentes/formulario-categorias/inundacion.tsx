import {
  BANDAS,
  DEFINICION_INUNDACION,
  type DefinicionCategoriaCualquiera,
  ETIQUETAS,
  PROFUNDIDADES,
  ReporteCrearSchema,
  SUMIDERO_CERCANO,
  SUMIDERO_ESTADOS,
} from 'contracts';
import {
  campoFechaDesdeIso,
  isoDesdeCampoFecha,
  limitesFechaEvento,
  problemaFechaEvento,
  respuestasSumidero,
  type Sumidero,
  type ValoresFormulario,
} from '@/lib/formulario-reporte';
import { ChipSeveridad } from '../ChipSeveridad';
import { MensajeDeCampo, Opcion } from './controles';
import type { AdaptadorFormularioCategoria, PropsCuerpoPaso2, SeveridadPrevia } from './tipos';

/**
 * Adaptador de formulario de Inundaciones (ADR 0021): el paso 2 de hoy —fecha del evento,
 * profundidad, frecuencia y previsualización de severidad— y el bloque de causa y sumidero del
 * paso 3, extraídos del formulario SIN cambios. Con una sola categoría activa el formulario no
 * cambia ni en pantalla ni en el DOM: los mismos `name`, `value`, textos y `data-testid`.
 */

// Mismas listas y orden que el formulario tenía inline (el orden fija el de las opciones en pantalla).
const FRECUENCIAS = [
  'primera_vez',
  'ocasional',
  'cada_lluvia_fuerte',
  'permanente',
  'agua_estancada',
] as const;
const CAUSAS = [
  'desconocida',
  'sumidero_tapado',
  'falta_sumidero',
  'hundimiento_pavimento',
  'contrapendiente',
  'colector_saturado',
  'desborde_cauce',
] as const;

/** Puntaje máximo de la fórmula vigente: el «N/13» del resumen no puede quedarse en otra versión. */
const PUNTAJE_MAX = Math.max(...BANDAS.map((b) => b.max));

/**
 * Previsualización de severidad con la función de la DEFINICIÓN (ADR 0009): el mismo puntaje y la
 * misma banda que antes, ahora por `def.severidad.calcular`. `null` hasta tener profundidad y
 * frecuencia.
 */
function severidadInundacion(
  valores: ValoresFormulario,
  definicion: DefinicionCategoriaCualquiera,
): SeveridadPrevia | null {
  if (!valores.profundidad_estimada || !valores.frecuencia) return null;
  const r = definicion.severidad.calcular({
    profundidad_estimada: valores.profundidad_estimada,
    frecuencia: valores.frecuencia,
  });
  return { banda: r.banda, puntaje: r.puntaje, max: PUNTAJE_MAX };
}

/** Paso 2 «¿Hasta dónde llegó y cada cuánto pasa?»: fecha, profundidad, frecuencia y severidad. */
function CuerpoPaso2Inundacion({ form, valores, errores, definicion, ahora }: PropsCuerpoPaso2) {
  const limitesFecha = limitesFechaEvento(ahora);
  const errorFecha = errores.evento_en?.message ?? problemaFechaEvento(valores.evento_en, ahora);
  const severidad = severidadInundacion(valores, definicion);
  return (
    <>
      <div className="mt-5">
        <label htmlFor="evento" className="lbl">
          Fecha del evento (opcional)
        </label>
        {/* Controlado: el paso 2 se desmonta al avanzar, y con un input sin `value` la
            fecha elegida desaparecía de la pantalla al volver aunque siguiera en el
            formulario. Lo mismo al retomar un borrador. Los límites y el valor van en la
            hora local de quien reporta, no en UTC. */}
        <input
          id="evento"
          type="date"
          className="campo"
          min={limitesFecha.min}
          max={limitesFecha.max}
          value={campoFechaDesdeIso(valores.evento_en)}
          aria-invalid={!!errorFecha}
          aria-describedby={errorFecha ? 'ayuda-evento error-evento_en' : 'ayuda-evento'}
          onChange={(e) => {
            form.clearErrors('evento_en');
            form.setValue(
              'evento_en',
              e.target.value ? isoDesdeCampoFecha(e.target.value, new Date()) : null,
            );
          }}
        />
        <p id="ayuda-evento" className="ayuda mt-1.5">
          Si la dejás vacía, tomamos la fecha de hoy.
        </p>
        <MensajeDeCampo campo="evento_en" mensaje={errorFecha} />
      </div>

      <fieldset className="mt-5">
        <legend className="lbl">{ETIQUETAS.campos.profundidad_estimada}</legend>
        <p className="ayuda mb-2.5">
          ¿Hasta dónde llegaba el agua? Tomá tu cuerpo como referencia.
        </p>
        <div className="grid gap-2.5">
          {PROFUNDIDADES.map((p) => (
            <Opcion
              key={p}
              nombre="profundidad_estimada"
              valor={p}
              texto={ETIQUETAS.profundidad[p].corta}
              detalle={ETIQUETAS.profundidad[p].rango}
              marcado={valores.profundidad_estimada === p}
              onCambio={() => {
                form.setValue('profundidad_estimada', p);
                form.clearErrors('profundidad_estimada');
              }}
            />
          ))}
        </div>
        <MensajeDeCampo
          campo="profundidad_estimada"
          mensaje={errores.profundidad_estimada?.message}
        />
      </fieldset>

      <fieldset className="mt-5">
        <legend className="lbl">Frecuencia</legend>
        <div className="grid gap-2.5">
          {FRECUENCIAS.map((f) => (
            <Opcion
              key={f}
              nombre="frecuencia"
              valor={f}
              texto={ETIQUETAS.frecuencia[f]}
              marcado={valores.frecuencia === f}
              onCambio={() => {
                form.setValue('frecuencia', f);
                form.clearErrors('frecuencia');
              }}
            />
          ))}
        </div>
        <MensajeDeCampo campo="frecuencia" mensaje={errores.frecuencia?.message} />
      </fieldset>

      {severidad ? (
        <div className="tarjeta mt-4.5 px-[18px] py-4" aria-live="polite">
          <p className="glbl mt-0">Severidad calculada</p>
          <div className="mt-2.5 flex items-center gap-3">
            <ChipSeveridad severidad={severidad.banda} grande />
            <b className="titular ml-auto text-[22px] tabular-nums">
              {severidad.puntaje}
              <span className="text-[14px] text-tinta-600">/{PUNTAJE_MAX}</span>
            </b>
          </div>
          <p className="mt-2.5 text-[14px] leading-[1.45] text-tinta-600">
            La calcula el sistema con lo que declaraste. El técnico puede corregirla, siempre
            dejando el motivo escrito.
          </p>
        </div>
      ) : null}
    </>
  );
}

/** Bloque opcional del paso 3: causa presunta y sumidero (con su lógica condicional). */
function ExtraPaso3Inundacion({ form, valores, errores }: PropsCuerpoPaso2) {
  /** Respuesta a «¿Hay sumidero cercano?», con las otras dos puestas en regla (contracts 0.6.0). */
  const responderSumidero = (cercano: Sumidero['sumidero_cercano']) => {
    const r = respuestasSumidero(cercano, form.getValues());
    form.setValue('sumidero_cercano', r.sumidero_cercano);
    form.setValue('sumidero_estado', r.sumidero_estado);
    form.setValue('agua_brota_sumidero', r.agua_brota_sumidero);
    form.clearErrors(['sumidero_cercano', 'sumidero_estado', 'agua_brota_sumidero']);
  };
  return (
    <details className="tarjeta mt-4 p-4">
      <summary className="cursor-pointer font-semibold">
        Causa presunta y sumidero <span className="mini ml-1">Opcional</span>
      </summary>
      <div className="mt-4 space-y-4">
        <div>
          <label htmlFor="causa_presunta" className="lbl">
            ¿Por qué creés que pasa?
          </label>
          <select id="causa_presunta" className="campo" {...form.register('causa_presunta')}>
            {CAUSAS.map((c) => (
              <option key={c} value={c}>
                {ETIQUETAS.causa_presunta[c]}
              </option>
            ))}
          </select>
          <MensajeDeCampo campo="causa_presunta" mensaje={errores.causa_presunta?.message} />
        </div>
        {/* Radios y no <select>: «no contestó» tiene que ser `null`, nunca `''`. Con
            los desplegables anteriores, uno sin elegir mandaba la cadena vacía y la
            validación fallaba SIEMPRE que el vecino no los tocaba (TRASPASO §3.8). Aquí
            `setValue` solo escribe un valor del enum o `null`; si algún día vuelve a ser
            un control registrado, necesita `setValueAs` que convierta '' en null. */}
        <fieldset>
          <legend className="lbl">{ETIQUETAS.campos.sumidero_cercano}</legend>
          <div className="grid grid-cols-2 gap-2.5">
            {SUMIDERO_CERCANO.map((v) => (
              <Opcion
                key={v}
                nombre="sumidero_cercano"
                valor={v}
                texto={ETIQUETAS.sumidero_cercano[v]}
                marcado={valores.sumidero_cercano === v}
                onCambio={() => responderSumidero(v)}
              />
            ))}
          </div>
          {valores.sumidero_cercano ? (
            <button
              type="button"
              className="mt-1.5 inline-flex min-h-12 items-center px-0.5 text-[14px] font-bold text-agua-700"
              onClick={() => responderSumidero(null)}
            >
              Dejar sin responder
            </button>
          ) : null}
          <MensajeDeCampo campo="sumidero_cercano" mensaje={errores.sumidero_cercano?.message} />
        </fieldset>
        {valores.sumidero_cercano === 'si' ? (
          <fieldset>
            <legend className="lbl">{ETIQUETAS.campos.sumidero_estado}</legend>
            <div className="grid grid-cols-2 gap-2.5">
              {SUMIDERO_ESTADOS.map((v) => (
                <Opcion
                  key={v}
                  nombre="sumidero_estado"
                  valor={v}
                  texto={ETIQUETAS.sumidero_estado[v]}
                  marcado={valores.sumidero_estado === v}
                  onCambio={() => {
                    form.setValue('sumidero_estado', v);
                    form.clearErrors('sumidero_estado');
                  }}
                />
              ))}
            </div>
          </fieldset>
        ) : null}
        <MensajeDeCampo campo="sumidero_estado" mensaje={errores.sumidero_estado?.message} />
        {/* Controlada y con `null` como «sin contestar»: registrada, react-hook-form le
            escribía `false` al montarla y todo reporte decía que el agua no brotaba. Con
            «No» en el sumidero cercano no se pregunta: no hay de dónde brotar. */}
        {valores.sumidero_cercano !== 'no' ? (
          <label className="opc">
            <input
              type="checkbox"
              name="agua_brota_sumidero"
              checked={valores.agua_brota_sumidero === true}
              onChange={(e) => {
                form.setValue('agua_brota_sumidero', e.target.checked ? true : null);
                form.clearErrors('agua_brota_sumidero');
              }}
            />
            <span>El agua brota del sumidero cuando llueve</span>
          </label>
        ) : null}
        <MensajeDeCampo
          campo="agua_brota_sumidero"
          mensaje={errores.agua_brota_sumidero?.message}
        />
      </div>
    </details>
  );
}

export const ADAPTADOR_INUNDACION: AdaptadorFormularioCategoria = {
  slug: 'inundacion',
  CuerpoPaso2: CuerpoPaso2Inundacion,
  ExtraPaso3: ExtraPaso3Inundacion,
  valoresIniciales: () => ({
    causa_presunta: 'desconocida',
    sumidero_cercano: null,
    sumidero_estado: null,
    agua_brota_sumidero: null,
  }),
  // El `detalle` que se envía, con la MISMA normalización que `reportePlanoACategoria` del contrato:
  // `respuestasSumidero` deja coherente el sumidero y `causa_presunta` cae en «desconocida».
  aDetalle: (valores) => ({
    profundidad_estimada: valores.profundidad_estimada,
    frecuencia: valores.frecuencia,
    causa_presunta: valores.causa_presunta ?? 'desconocida',
    ...respuestasSumidero(valores.sumidero_cercano ?? null, valores),
  }),
  puedeAvanzarPaso2: (valores, ahora) =>
    !!valores.profundidad_estimada &&
    !!valores.frecuencia &&
    !problemaFechaEvento(valores.evento_en, ahora),
  pasoDeCampo: {
    profundidad_estimada: 2,
    frecuencia: 2,
    causa_presunta: 3,
    sumidero_cercano: 3,
    sumidero_estado: 3,
    agua_brota_sumidero: 3,
  },
  filasRevision: (valores) => [
    {
      etiqueta: ETIQUETAS.campos.profundidad,
      valor: valores.profundidad_estimada
        ? `${ETIQUETAS.profundidad[valores.profundidad_estimada].corta} · ${ETIQUETAS.profundidad[valores.profundidad_estimada].rango}`
        : '—',
      paso: 2,
    },
    {
      etiqueta: 'Frecuencia',
      valor: valores.frecuencia ? ETIQUETAS.frecuencia[valores.frecuencia] : '—',
      paso: 2,
    },
  ],
  previsualizarSeveridad: (valores) => severidadInundacion(valores, DEFINICION_INUNDACION),
  // Inundaciones valida el formulario con el contrato plano de siempre (núcleo + sus seis campos).
  esquemaFormulario: ReporteCrearSchema,
  prepararParaValidar: (valores) => ({
    ...valores,
    ...respuestasSumidero(valores.sumidero_cercano ?? null, valores),
  }),
};
