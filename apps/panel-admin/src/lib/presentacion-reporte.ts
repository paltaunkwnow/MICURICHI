import {
  ETIQUETAS,
  NOTA_METODOLOGICA,
  REGISTRO_CATEGORIAS,
  type RegistroCategorias,
} from 'contracts';
import {
  etiquetaCausa,
  etiquetaFrecuencia,
  etiquetaProfundidad,
  etiquetaSiNo,
  etiquetaSumideroCercano,
  etiquetaSumideroEstado,
} from './formato';
import type { PropiedadesReportePanel } from './reportes-panel';

const NOTA_COMUN =
  'Inventario de reportes ciudadanos: datos de percepción, no mediciones de campo. La ausencia de reportes no significa ausencia del problema. «NO SE HA VERIFICADO» indica que no hubo revisión técnica. Toda intervención requiere un estudio técnico. La ubicación aproximada no se comprobó con el dispositivo.';

/** Presentación local: valida el detalle recibido; nunca llama al cálculo del modelo. */
export function presentarReporte(
  p: PropiedadesReportePanel,
  registro: RegistroCategorias = REGISTRO_CATEGORIAS,
) {
  const slug = p.categoria ?? 'inundacion';
  const def = registro.obtener(slug);
  const comun = slug === 'inundacion' ? NOTA_METODOLOGICA : NOTA_COMUN;
  const nota =
    def?.notaMetodologica && def.notaMetodologica !== comun
      ? `${comun} ${def.notaMetodologica}`
      : comun;
  const versiones = def
    ? `Versiones de la definición disponible: detalle ${def.detalleVersion}, severidad ${def.severidad.version}. La API no informa las versiones históricas usadas por este reporte.`
    : 'Definición no disponible. La API no informa las versiones históricas usadas por este reporte.';
  const base = {
    nombre: def?.nombre ?? `Categoría: ${slug}`,
    campos: [] as { etiqueta: string; valor: string }[],
    aviso: null as string | null,
    inundacion: false,
    nota: NOTA_COMUN,
    versiones,
    subtipo: '',
  };
  if (!def)
    return {
      ...base,
      aviso:
        'No hay definición disponible para interpretar el detalle. Se muestran los datos comunes.',
    };
  // Compatibilidad de fixtures/respuestas anteriores sin detalle; no rescata un detalle explícito inválido.
  const detalle =
    p.detalle !== undefined
      ? p.detalle
      : slug === 'inundacion'
        ? {
            profundidad_estimada: p.profundidad_estimada,
            frecuencia: p.frecuencia,
            causa_presunta: p.causa_presunta,
            sumidero_cercano: p.sumidero_cercano ?? null,
            sumidero_estado: p.sumidero_estado ?? null,
            agua_brota_sumidero: p.agua_brota_sumidero ?? null,
          }
        : undefined;
  const validado = def.esquemaDetalle.safeParse(detalle);
  if (
    !validado.success ||
    !validado.data ||
    typeof validado.data !== 'object' ||
    Array.isArray(validado.data)
  )
    return {
      ...base,
      aviso:
        'El detalle es incompatible con la definición disponible. Se muestran los datos comunes.',
    };
  const datos = validado.data as Record<string, unknown>;
  const subtipo = p.subtipo ? def.subtipos?.find((s) => s.valor === p.subtipo)?.etiqueta : '';
  if (p.subtipo && !subtipo)
    return {
      ...base,
      aviso:
        'El subtipo es incompatible con la definición disponible. Se muestran los datos comunes.',
    };
  if (slug === 'inundacion') {
    const d = { ...p, ...datos } as PropiedadesReportePanel;
    return {
      ...base,
      subtipo: subtipo ?? '',
      inundacion: true,
      nota,
      campos: [
        {
          etiqueta: ETIQUETAS.campos.profundidad_estimada,
          valor: etiquetaProfundidad(d.profundidad_estimada),
        },
        { etiqueta: 'Frecuencia', valor: etiquetaFrecuencia(d.frecuencia) },
        { etiqueta: 'Causa presunta', valor: etiquetaCausa(d.causa_presunta) },
        {
          etiqueta: ETIQUETAS.campos.sumidero_cercano,
          valor: d.sumidero_cercano ? etiquetaSumideroCercano(d.sumidero_cercano) : 'Sin dato',
        },
        {
          etiqueta: ETIQUETAS.campos.sumidero_estado,
          valor: d.sumidero_estado ? etiquetaSumideroEstado(d.sumidero_estado) : 'Sin dato',
        },
        { etiqueta: 'Agua brota del sumidero', valor: etiquetaSiNo(d.agua_brota_sumidero) },
      ],
    };
  }
  const campos: typeof base.campos = [];
  for (const pregunta of def.preguntas) {
    const valor = datos[pregunta.id];
    if (valor == null) {
      campos.push({ etiqueta: pregunta.etiqueta, valor: 'Sin dato' });
      continue;
    }
    const opcion = (v: unknown) => pregunta.opciones?.find((o) => o.valor === v)?.etiqueta;
    const texto =
      pregunta.tipo === 'booleana'
        ? typeof valor === 'boolean'
          ? etiquetaSiNo(valor)
          : undefined
        : pregunta.tipo === 'opcion_multiple'
          ? Array.isArray(valor) && valor.every((v) => opcion(v))
            ? valor.map(opcion).join(', ') || 'Ninguna'
            : undefined
          : opcion(valor);
    if (texto === undefined)
      return {
        ...base,
        aviso:
          'Las respuestas son incompatibles con las preguntas disponibles. Se muestran los datos comunes.',
      };
    campos.push({ etiqueta: pregunta.etiqueta, valor: texto });
  }
  return { ...base, subtipo: subtipo ?? '', campos, nota };
}
