import { CONFIG_DOMINIO, NOTA_METODOLOGICA } from 'contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Cabecera } from '@/componentes/Cabecera';

export const metadata: Metadata = {
  title: 'Cómo funciona',
  description:
    'Cómo se calcula la severidad, cómo se asigna la unidad vecinal y qué hacemos con tus datos.',
};

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="titular text-2xl">{titulo}</h2>
      {children}
    </section>
  );
}

export default function ComoFunciona() {
  return (
    <>
      <Cabecera />
      <main
        id="contenido"
        className="mx-auto max-w-3xl space-y-8 p-4 pb-16 text-[18px] leading-7 md:p-6"
      >
        <h1 className="titular text-4xl">Cómo funciona Mi Curichi</h1>

        <Seccion titulo="Qué es">
          <p>
            Mi Curichi es un inventario de los puntos donde se junta el agua en la ciudad, hecho con
            los reportes de los vecinos. Vos marcás dónde se anega, contás qué ves, y el sistema lo
            ubica en el mapa junto con los demás reportes.
          </p>
        </Seccion>

        <Seccion titulo="Cómo se calcula la severidad">
          <p>
            La severidad no la decide una persona: sale de una fórmula fija a partir de lo que
            reportás. Cada respuesta vale de 1 a 4 puntos y el tirante pesa doble, porque es lo que
            más riesgo trae.
          </p>
          <p className="rounded-2xl bg-tinta-100 p-4 font-semibold">
            puntaje = 2 × tirante + duración + frecuencia + afectación
          </p>
          <table className="w-full text-left text-[16px]">
            <caption className="sr-only">Bandas de severidad según el puntaje</caption>
            <thead>
              <tr className="border-b border-filete">
                <th scope="col" className="py-2">
                  Puntaje
                </th>
                <th scope="col" className="py-2">
                  Severidad
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                ['5 a 8', 'Baja'],
                ['9 a 12', 'Media'],
                ['13 a 16', 'Alta'],
                ['17 a 20', 'Crítica'],
              ].map(([p, s]) => (
                <tr key={p} className="border-b border-filete last:border-0">
                  <td className="py-2">{p}</td>
                  <td className="py-2 font-semibold">{s}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>Además hay tres reglas que solo pueden subir la severidad, nunca bajarla:</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>Si el agua pasa la cintura, el punto es crítico, sin importar lo demás.</li>
            <li>
              Si entra a las viviendas o corta la vía y pasa cada lluvia fuerte, es al menos alta.
            </li>
            <li>Si el agua está siempre, es al menos media: eso indica una falla de drenaje.</li>
          </ul>
        </Seccion>

        <Seccion titulo="Cómo sabemos en qué unidad vecinal está tu punto">
          <p>
            No te lo preguntamos: lo calcula el sistema. Con la coordenada de tu reporte hace una
            operación geométrica (punto en polígono) contra las capas oficiales de distritos y
            unidades vecinales que entrega la municipalidad. Así todos los reportes quedan
            comparables, aunque nadie sepa de memoria en qué unidad vecinal vive.
          </p>
          <p>
            Cuando varios reportes caen a menos de {CONFIG_DOMINIO.RECURRENCIA_RADIO_M} metros entre
            sí, se agrupan como un mismo punto crítico, sin perder ninguno de los reportes
            individuales.
          </p>
        </Seccion>

        <Seccion titulo="Qué pasa después de que reportás">
          <p>
            Tu reporte queda en revisión. Un técnico municipal lo valida, lo rechaza si no
            corresponde, o lo marca como duplicado de otro. Recién cuando lo valida aparece en el
            mapa público.
          </p>
        </Seccion>

        <Seccion titulo="Privacidad">
          <ul className="list-disc space-y-1 pl-6">
            <li>Podés reportar sin dar tu nombre y no mostramos quién reportó.</li>
            <li>
              Si el punto está sobre una vivienda o predio, en el mapa público lo mostramos
              desplazado hasta {CONFIG_DOMINIO.JITTER_PUBLICO_M} metros.
            </li>
            <li>
              A las fotos les quitamos los metadatos, incluida la ubicación que graban las cámaras.
            </li>
          </ul>
        </Seccion>

        <Seccion titulo="Hasta dónde llega esta herramienta">
          <p className="rounded-2xl bg-agua-100 p-4">{NOTA_METODOLOGICA}</p>
        </Seccion>

        <Link href="/reportar" className="btn-primario btn no-underline">
          Reportar un punto
        </Link>
      </main>
    </>
  );
}
