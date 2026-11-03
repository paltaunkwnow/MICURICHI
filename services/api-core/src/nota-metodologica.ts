import {
  CATEGORIA_TODAS,
  CONFIG_DOMINIO,
  ETIQUETAS,
  type FiltroCategoria,
  NOTA_METODOLOGICA,
  type RegistroCategorias,
  SLUGS_CATEGORIA,
} from 'contracts';

/** Limitaciones comunes sin atribuir campos de agua a las demás categorías. */
const NOTA_COMUN =
  'Mi Curichi es un inventario de reportes ciudadanos. Los datos son de percepción, no mediciones. ' +
  'La ubicación tiene el error del GPS del celular o de la mano de la persona. ' +
  'No es un modelo hidráulico, un estudio de drenaje ni un diagnóstico técnico de pavimento. ' +
  'Cualquier decisión de inversión u obra requiere estudio técnico formal. ' +
  'La ausencia de reportes en una zona no significa ausencia del problema (sesgo de participación). ' +
  `Los reportes marcados «${ETIQUETAS.estado_publico.nuevo}» no fueron revisados por un técnico y pueden ser erróneos. ` +
  `El radio de ${CONFIG_DOMINIO.REPORTE_RADIO_DISPOSITIVO_M} m no prueba que el vecino estuviera en el lugar: ` +
  'el GPS del teléfono se puede falsear. ' +
  'Algunos reportes se cargaron desde dispositivos sin GPS preciso, como computadoras: su ubicación ' +
  'la puso la persona a mano, figura como «aproximada» y no se comprobó con el dispositivo.';

const ORDEN = new Map<string, number>(SLUGS_CATEGORIA.map((slug, indice) => [slug, indice]));

/**
 * La selección Flood conserva su nota exacta, incluso vacía. En Todas las notas describen las
 * categorías incluidas en el archivo, no las filas omitidas por paginación o truncamiento.
 */
export function notaMetodologicaParaExportar(
  seleccion: FiltroCategoria,
  presentes: readonly string[],
  registro: RegistroCategorias,
): string {
  if (seleccion === 'inundacion') return NOTA_METODOLOGICA;
  const todas = seleccion === CATEGORIA_TODAS;
  const categorias = todas
    ? [...new Set(presentes)].sort(
        (a, b) =>
          (ORDEN.get(a) ?? ORDEN.size) - (ORDEN.get(b) ?? ORDEN.size) || a.localeCompare(b, 'es'),
      )
    : [seleccion];
  const notas = categorias.map((slug) => {
    const def = registro.obtener(slug);
    if (!def)
      return `${slug}: definición no disponible; no se pueden describir los campos ni las reglas históricas de esta categoría.`;
    return `${def.nombre}: ${def.notaMetodologica}`;
  });
  return [NOTA_COMUN, ...(todas ? ['Categorías incluidas en este archivo.'] : []), ...notas].join(
    ' ',
  );
}
