import type { DefinicionCategoriaCualquiera, Pregunta } from 'contracts';
import { ReporteCrearSchema, textosDeCategoria } from 'contracts';
import { z } from 'zod';
import type { ValoresFormulario } from '@/lib/formulario-reporte';
import { ChipSeveridad } from '../ChipSeveridad';
import { MensajeDeCampo, Opcion } from './controles';
import type {
  AdaptadorFormularioCategoria,
  FilaRevisionCategoria,
  PropsCuerpoPaso2,
  SeveridadPrevia,
} from './tipos';

/**
 * Renderizador DECLARATIVO del paso 2 (ADR 0021): la categoría sin componente especial dibuja sus
 * `preguntas` (`opcion_unica`, `opcion_multiple`, `booleana`) y arma su revisión y su severidad
 * desde la definición, sin que el código común pregunte por una categoría concreta. El `detalle`
 * vive bajo `detalle.<id>` para no chocar con los campos del núcleo.
 *
 * `textosDeCategoria(def).tituloPaso2` lo usa el armazón para el título del paso; la razón de
 * importarlo acá es que el renderizador declarativo es el dueño de todo lo del paso 2 genérico.
 */

/** El núcleo del formulario como esquema, para validar junto con el `detalle` de la categoría. */
const NUCLEO_SCHEMA = z.object({
  lat: ReporteCrearSchema.shape.lat,
  lon: ReporteCrearSchema.shape.lon,
  ubicacion_tipo: ReporteCrearSchema.shape.ubicacion_tipo,
  descripcion: ReporteCrearSchema.shape.descripcion,
  evento_en: ReporteCrearSchema.shape.evento_en,
  fotos: ReporteCrearSchema.shape.fotos,
  sitio_web: ReporteCrearSchema.shape.sitio_web,
});

/** El `detalle` del formulario como objeto, nunca `undefined`. */
function detalleDe(valores: ValoresFormulario): Record<string, unknown> {
  return (valores.detalle ?? {}) as Record<string, unknown>;
}

/** ¿La pregunta está contestada? (para exigir las obligatorias antes de avanzar del paso 2). */
function respondida(pregunta: Pregunta, detalle: Record<string, unknown>): boolean {
  const v = detalle[pregunta.id];
  if (pregunta.tipo === 'opcion_multiple') return Array.isArray(v) && v.length > 0;
  if (pregunta.tipo === 'booleana') return typeof v === 'boolean';
  return typeof v === 'string' && v !== '';
}

/** Texto de una respuesta para la revisión, o `null` si no hay nada que mostrar. */
function textoDeRespuesta(pregunta: Pregunta, valor: unknown): string | null {
  if (valor === undefined || valor === null || valor === '') return null;
  const deOpcion = (v: unknown) =>
    pregunta.opciones?.find((o) => o.valor === v)?.etiqueta ?? String(v);
  if (Array.isArray(valor)) return valor.length ? valor.map(deOpcion).join(', ') : null;
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  return deOpcion(valor);
}

/** Filas de la revisión armadas desde las preguntas contestadas (todas las de la persona, no solo las públicas). */
function filasRevisionDeclarativas(
  def: DefinicionCategoriaCualquiera,
  detalle: Record<string, unknown>,
): FilaRevisionCategoria[] {
  const filas: FilaRevisionCategoria[] = [];
  for (const pregunta of def.preguntas) {
    const valor = textoDeRespuesta(pregunta, detalle[pregunta.id]);
    if (valor !== null) filas.push({ etiqueta: pregunta.etiqueta, valor, paso: 2 });
  }
  return filas;
}

/** Previsualización de severidad: la banda, si el `detalle` ya pasa el esquema de la categoría. */
function previsualizarSeveridadGenerica(
  def: DefinicionCategoriaCualquiera,
  valores: ValoresFormulario,
): SeveridadPrevia | null {
  const r = def.esquemaDetalle.safeParse(detalleDe(valores));
  if (!r.success) return null;
  return { banda: def.severidad.calcular(r.data).banda };
}

/** Una pregunta declarativa, dibujada según su tipo. */
function PreguntaDeclarativa({
  pregunta,
  detalle,
  setDetalle,
}: {
  pregunta: Pregunta;
  detalle: Record<string, unknown>;
  setDetalle: (id: string, valor: unknown) => void;
}) {
  const valor = detalle[pregunta.id];
  if (pregunta.tipo === 'booleana') {
    return (
      <label className="opc mt-5">
        <input
          type="checkbox"
          name={`detalle.${pregunta.id}`}
          checked={valor === true}
          onChange={(e) => setDetalle(pregunta.id, e.target.checked)}
        />
        <span>{pregunta.etiqueta}</span>
      </label>
    );
  }
  if (pregunta.tipo === 'opcion_multiple') {
    const seleccion = Array.isArray(valor) ? (valor as string[]) : [];
    return (
      <fieldset className="mt-5">
        <legend className="lbl">{pregunta.etiqueta}</legend>
        {pregunta.ayuda ? <p className="ayuda mb-2.5">{pregunta.ayuda}</p> : null}
        <div className="grid gap-2.5">
          {(pregunta.opciones ?? []).map((o) => (
            <label key={o.valor} className="opc">
              <input
                type="checkbox"
                name={`detalle.${pregunta.id}`}
                value={o.valor}
                checked={seleccion.includes(o.valor)}
                onChange={(e) =>
                  setDetalle(
                    pregunta.id,
                    e.target.checked
                      ? [...seleccion, o.valor]
                      : seleccion.filter((v) => v !== o.valor),
                  )
                }
              />
              <span>{o.etiqueta}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  return (
    <fieldset className="mt-5">
      <legend className="lbl">{pregunta.etiqueta}</legend>
      {pregunta.ayuda ? <p className="ayuda mb-2.5">{pregunta.ayuda}</p> : null}
      <div className="grid gap-2.5">
        {(pregunta.opciones ?? []).map((o) => (
          <Opcion
            key={o.valor}
            nombre={`detalle.${pregunta.id}`}
            valor={o.valor}
            texto={o.etiqueta}
            detalle={o.ayuda}
            marcado={valor === o.valor}
            onCambio={() => setDetalle(pregunta.id, o.valor)}
          />
        ))}
      </div>
    </fieldset>
  );
}

function CuerpoPaso2Generico({ form, valores, errores, definicion }: PropsCuerpoPaso2) {
  const detalle = detalleDe(valores);
  // `setValue`/`clearErrors` con una ruta anidada `detalle.<id>`: se afloja el tipo de la ruta, que
  // react-hook-form no puede inferir para un `Record` abierto.
  const setDetalle = (id: string, valor: unknown) => {
    (form.setValue as (n: string, v: unknown) => void)(`detalle.${id}`, valor);
    (form.clearErrors as (n: string) => void)(`detalle.${id}`);
  };
  const severidad = previsualizarSeveridadGenerica(definicion, valores);
  const errorDetalle = (errores.detalle as Record<string, { message?: string }> | undefined) ?? {};
  return (
    <>
      {definicion.preguntas.map((pregunta) => (
        <div key={pregunta.id}>
          <PreguntaDeclarativa pregunta={pregunta} detalle={detalle} setDetalle={setDetalle} />
          <MensajeDeCampo
            campo={`detalle.${pregunta.id}`}
            mensaje={errorDetalle[pregunta.id]?.message}
          />
        </div>
      ))}
      {severidad ? (
        <div className="tarjeta mt-4.5 px-[18px] py-4" aria-live="polite">
          <p className="glbl mt-0">Severidad calculada</p>
          <div className="mt-2.5 flex items-center gap-3">
            <ChipSeveridad severidad={severidad.banda} grande />
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * Adaptador declarativo para una categoría sin componente especial (ADR 0021). Se crea desde su
 * definición: dibuja sus `preguntas`, valida el núcleo más su `detalle` con `def.esquemaDetalle` y
 * arma su revisión y su severidad desde la definición.
 */
export function crearAdaptadorGenerico(
  def: DefinicionCategoriaCualquiera,
): AdaptadorFormularioCategoria {
  return {
    slug: def.slug,
    CuerpoPaso2: CuerpoPaso2Generico,
    valoresIniciales: () => ({ detalle: {} }),
    aDetalle: (valores) => detalleDe(valores),
    puedeAvanzarPaso2: (valores) =>
      def.preguntas.filter((p) => p.obligatoria).every((p) => respondida(p, detalleDe(valores))),
    pasoDeCampo: { detalle: 2 },
    filasRevision: (valores) => filasRevisionDeclarativas(def, detalleDe(valores)),
    previsualizarSeveridad: (valores) => previsualizarSeveridadGenerica(def, valores),
    esquemaFormulario: NUCLEO_SCHEMA.extend({ detalle: def.esquemaDetalle }),
    prepararParaValidar: (valores) => ({
      ubicacion_tipo: valores.ubicacion_tipo,
      descripcion: valores.descripcion,
      evento_en: valores.evento_en,
      fotos: valores.fotos,
      sitio_web: valores.sitio_web,
      detalle: detalleDe(valores),
    }),
  };
}

/** El título del paso 2 de una categoría (el armazón lo pone encima del cuerpo declarativo). */
export function tituloPaso2De(def: DefinicionCategoriaCualquiera): string {
  return textosDeCategoria(def).tituloPaso2;
}
