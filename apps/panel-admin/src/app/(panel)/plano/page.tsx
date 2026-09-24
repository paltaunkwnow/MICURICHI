import { CircleQuestionMark, Download, TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Plano oficial de zonificación' };

/**
 * Los doce distritos urbanos tal como se leen en el Plano de Zonificación y Distritos
 * Municipales. Las ubicaciones y los rangos de unidad vecinal salen de leer la imagen: son
 * EJEMPLOS legibles, no la lista completa, y hay que confirmarlos con la Dirección de
 * Planificación antes de usarlos para nada operativo (CLAUDE.md §0.6).
 */
const DISTRITOS: Array<[string, string, string]> = [
  [
    'DM-11',
    'Casco viejo, dentro del primer anillo. Contiene el centro histórico.',
    'UV-1 a UV-12, UV-21 a UV-23',
  ],
  [
    'DM-1',
    'Oeste del casco, hacia el Piraí. Limita con DM-2, DM-11 y DM-4.',
    'UV-32 a UV-34, UV-55 a UV-58',
  ],
  [
    'DM-2',
    'Norte del casco, entre DM-11 y DM-5. Al este, la zona industrial.',
    'UV-13 a UV-20, UV-36 a UV-47',
  ],
  [
    'DM-3',
    'Sureste del casco. Limita al este con DM-7.',
    'UV-24 a UV-31, UV-48 a UV-51, UV-93 a UV-104',
  ],
  ['DM-4', 'Suroeste del casco, entre el Piraí y DM-10.', 'UV-52 a UV-54, UV-110 a UV-112'],
  [
    'DM-5',
    'Norte. Del cuarto anillo hasta el aeropuerto Viru Viru.',
    'UV-63 a UV-79 y UV-331 a UV-349',
  ],
  [
    'DM-6',
    'Noreste y este. Desde la zona industrial al límite con Cotoca.',
    'UV-196 a UV-212, UV-261 a UV-283, UV-305 a UV-327',
  ],
  ['DM-7', 'Este, entre DM-3 y DM-6.', 'UV-82 a UV-107, UV-140 a UV-158, UV-228 a UV-237'],
  ['DM-8', 'Sureste, al sur de DM-7.', 'UV-148 a UV-168, UV-235 a UV-250'],
  ['DM-9', 'Sur, bajo DM-4 y DM-3.', 'UV-114 a UV-135, UV-171 a UV-186'],
  [
    'DM-10',
    'Suroeste. Del cuarto anillo al límite con La Guardia.',
    'UV-109 a UV-139, UV-189 a UV-191',
  ],
  [
    'DM-12',
    'Extremo sur. Limita con el Parque Regional Lomas de Arenas.',
    'UV-240 a UV-261, UV-297 a UV-300',
  ],
];

/** Las siete capas del plano, tal como las lista su leyenda. */
const CAPAS: Array<[string, string, string]> = [
  [
    '1',
    'Límites legales administrativos',
    'Límite municipal, límite urbano, límite del área de control, área de influencia de PSAD56 y el oleoducto.',
  ],
  [
    '2',
    'Red o sistema vial jerarquizado',
    'Metropolitana, vía férrea, vía urbana troncal y terminal bimodal.',
  ],
  [
    '3',
    'Zonificación primaria',
    'AUE zona urbanizable (con ZUD, zona urbana diferida) y ACU zona no urbanizable (con ACU, zona de control municipal).',
  ],
  [
    '4',
    'Usos de las riberas del río Piraí · Ordenanza Municipal 150/2009',
    'Área de protección, curichi, Z1 zona de uso público, Z2 zona de uso privado, Z3 zona de mayor grado de biodiversidad, Z4 zona de protección del segundo defensivo y el cauce del Piraí.',
  ],
  [
    '5',
    'Usos de suelo',
    'Centro histórico, equipamiento distrital, parque urbano, centro de abastecimiento, educación, salud, social, áreas verdes, industrial y lagunas de oxidación.',
  ],
  ['AP', 'Áreas protegidas', 'Por interés ambiental y por interés histórico.'],
  ['PE', 'Planes especiales', 'Planes especiales de ordenamiento.'],
];

export default function PaginaPlano() {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start gap-4">
        <div>
          <h1 className="text-3xl">Plano oficial de zonificación</h1>
          <p className="mt-1.5 max-w-[76ch] text-tinta-600">
            Plano de Zonificación y Distritos Municipales del Gobierno Autónomo Municipal de Santa
            Cruz de la Sierra, escala 1:30.000. Es la referencia sobre límites de distrito,
            numeración de unidades vecinales y usos de suelo.
          </p>
        </div>
        <a
          href="/plano-zonificacion.jpg"
          download="plano-zonificacion-santa-cruz.jpg"
          className="btn btn-secundario btn-sm ml-auto"
        >
          <Download size={17} aria-hidden="true" />
          Descargar el plano
        </a>
      </header>

      <div className="aviso aviso-alerta">
        <TriangleAlert size={17} aria-hidden="true" className="mt-0.5 shrink-0" />
        <span>
          <b>Este plano y las capas del sistema no son la misma fuente.</b> Los mapas ya dibujan el
          shapefile del municipio (entrega <code>DM_UV_MZ_2025</code>: 16 distritos, 576 unidades
          vecinales y 27.527 manzanas), y es contra ese shapefile —no contra esta imagen— que se
          resuelve el distrito y la unidad vecinal de cada reporte. La imagen es de otra fecha y
          numera <b>doce</b> distritos urbanos; la entrega trae quince numerados más «PI». Cuando
          los dos no coincidan, manda la capa vigente, que es la que se ve en <b>Capas</b>. Calcar
          la imagen tampoco serviría: dejaría bordes aproximados justo donde el vecino reporta la
          esquina de su cuadra.
        </span>
      </div>

      <div className="tarjeta max-h-[520px] overflow-auto bg-white p-0">
        {/* biome-ignore lint/performance/noImgElement: imagen de referencia de 1400 px que se recorre dentro del marco */}
        <img
          src="/plano-zonificacion.jpg"
          alt="Plano de zonificación y distritos municipales de Santa Cruz de la Sierra"
          width={1400}
          className="block max-w-none"
          loading="lazy"
        />
      </div>
      <p className="ayuda">
        Desplazá dentro del marco para recorrer el plano. La descarga entrega esta misma versión.
      </p>

      <h2 className="mt-5 text-xl">Los doce distritos municipales urbanos del plano</h2>
      <p className="max-w-[80ch] text-[15px] leading-[1.55] text-tinta-600">
        DM-1 a DM-12, <b>según esta imagen</b>. Las ubicaciones salen de leerla; los nombres
        populares de cada distrito (Plan Tres Mil, Pampa de la Isla, Villa Primero de Mayo) hay que
        confirmarlos con el municipio antes de mostrarlos al vecino, porque la numeración DM no
        siempre coincide con la que usa la gente. Los rangos de unidad vecinal son ejemplos legibles
        en la imagen, no la lista completa. La capa vigente del sistema tiene más distritos que este
        plano, así que esta tabla sirve para orientarse, no para verificar límites.
      </p>
      <div className="tarjeta overflow-auto">
        <table className="tabla min-w-[720px]">
          <caption className="sr-only">Distritos municipales urbanos según el plano</caption>
          <thead>
            <tr>
              <th scope="col">Distrito</th>
              <th scope="col">Dónde está, según el plano</th>
              <th scope="col">UV que se leen ahí</th>
            </tr>
          </thead>
          <tbody>
            {DISTRITOS.map(([codigo, zona, uv]) => (
              <tr key={codigo}>
                <td className="font-semibold whitespace-nowrap">{codigo}</td>
                <td className="text-[14.5px] text-tinta-600">{zona}</td>
                <td className="text-[14.5px]">{uv}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="aviso aviso-info">
        <CircleQuestionMark size={17} aria-hidden="true" className="mt-0.5 shrink-0" />
        <span>
          La numeración de unidades vecinales crece del centro hacia afuera y{' '}
          <b>no respeta el distrito</b>. El DM-5 es la prueba: reúne las UV-63 a UV-79 <i>y</i> las
          UV-331 a UV-349, dos bloques sin relación numérica. Por eso la relación UV → distrito se
          guarda como dato y nunca se deriva del número.
        </span>
      </div>

      <h2 className="mt-5 text-xl">Las siete capas del plano</h2>
      <p className="max-w-[80ch] text-[15px] leading-[1.55] text-tinta-600">
        El plano no es solo distritos y unidades vecinales. Estas son sus capas tal como las lista
        la leyenda.
      </p>
      <ul className="grid gap-2.5">
        {CAPAS.map(([n, titulo, detalle]) => (
          <li key={n} className="tarjeta grid grid-cols-[34px_minmax(0,1fr)] gap-3.5 px-4 py-3.5">
            <span className="titular grid h-[34px] w-[34px] place-items-center rounded-[10px] bg-agua-100 text-[13px] font-bold text-agua-700">
              {n}
            </span>
            <span className="min-w-0">
              <b className="block text-[15.5px] font-semibold">{titulo}</b>
              <span className="mt-1 block text-[14.5px] leading-[1.45] text-tinta-600">
                {detalle}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <div className="aviso aviso-ok">
        <span>
          <b className="mb-1 block text-[15px]">La capa 4 le da el nombre al proyecto</b>
          La Ordenanza 150/2009 tipifica <b>curichi</b> como categoría propia en las riberas del
          Piraí: humedal que se inunda por estación. Esa capa marca dónde el anegamiento es
          estructural y no un evento. Cruzarla con los reportes es el primer análisis que vale la
          pena hacer cuando existan los polígonos.
        </span>
      </div>

      <div className="av av-tinta">
        <b className="mb-1.5 block text-[15px] text-white">Nota legal del plano</b>
        El municipio advierte que la información del plano es de carácter referencial y no puede
        usarse para esgrimir derecho sobre el territorio. Todo trámite técnico debe pasar por la
        Secretaría Municipal de Planificación.
      </div>
    </div>
  );
}
