import { useFormato } from '@/lib/ciudad-contexto';
import type { FilaCapaAnterior } from '@/lib/ejecutivo';

/**
 * Distritos que solo existen en una capa anterior (Indicadores). No tienen polígono en la capa
 * vigente y su código acortado puede repetir el de uno vigente, así que van aparte y con el
 * código completo. En el panel ejecutivo sus activas cuentan dentro de «Otros».
 */
export function CapaAnterior({ filas }: { filas: FilaCapaAnterior[] }) {
  const { numero } = useFormato();
  return (
    <section
      className="space-y-3"
      aria-labelledby="titulo-capa-anterior"
      data-testid="indicadores-capa-anterior"
    >
      <h2 id="titulo-capa-anterior" className="titular text-2xl">
        De una capa anterior
      </h2>
      <p className="text-[15px] text-tinta-600">
        Distritos que ya no están en la capa oficial vigente: sus reportes se ubicaron con una
        versión anterior. En el panel ejecutivo cuentan dentro de «Otros».
      </p>
      <div className="overflow-x-auto">
        <table className="tabla">
          <caption className="sr-only">Distritos de una capa anterior</caption>
          <thead>
            <tr>
              <th scope="col">Distrito</th>
              <th scope="col" className="numero">
                Inundaciones activas
              </th>
              <th scope="col" className="numero">
                En revisión
              </th>
              <th scope="col" className="numero">
                Validados
              </th>
              <th scope="col" className="numero">
                Resueltos
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((d) => (
              <tr key={d.distrito_id}>
                <th scope="row">{`${d.codigo} · ${d.nombre}`}</th>
                <td className="numero">{numero(d.activas)}</td>
                <td className="numero">{numero(d.por_estado.nuevo)}</td>
                <td className="numero">{numero(d.por_estado.validado)}</td>
                <td className="numero">{numero(d.por_estado.resuelto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
