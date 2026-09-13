'use client';

import { useQuery } from '@tanstack/react-query';
import { SEVERIDADES } from 'contracts';
import { ChipSeveridad } from '@/componentes/ChipSeveridad';
import { obtenerIndicadores } from '@/lib/api';
import { ESTADOS_ORDEN, etiquetaCapa, etiquetaEstado } from '@/lib/formato';

function Kpi({ valor, etiqueta }: { valor: number | string; etiqueta: string }) {
  return (
    <div className="tarjeta px-4 py-3">
      <p className="titular text-3xl leading-none">{valor}</p>
      <p className="mt-1 text-[13.5px] text-tinta-600">{etiqueta}</p>
    </div>
  );
}

function Barra({ n, total }: { n: number; total: number }) {
  const pct = total ? Math.round((n / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-tinta-100">
        <div className="h-full rounded-full bg-agua-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 text-right text-[13.5px] text-tinta-600">{pct}%</span>
    </div>
  );
}

export default function Indicadores() {
  const consulta = useQuery({ queryKey: ['indicadores'], queryFn: obtenerIndicadores });
  const d = consulta.data;
  const maxDistrito = Math.max(1, ...(d?.por_distrito ?? []).map((x) => x.n));
  const maxUv = Math.max(1, ...(d?.por_unidad_vecinal ?? []).map((x) => x.n));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="titular text-3xl">Indicadores</h1>
        <p className="text-tinta-600">
          Conteos sobre los reportes cargados. Son datos de percepción ciudadana, no mediciones de
          campo.
        </p>
      </div>

      {consulta.isPending ? (
        <p aria-live="polite">Calculando indicadores…</p>
      ) : consulta.isError ? (
        <p className="error" aria-live="polite">
          No pudimos calcular los indicadores.
        </p>
      ) : d ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi valor={d.total} etiqueta="reportes en total" />
            <Kpi valor={d.por_estado.validado ?? 0} etiqueta="validados" />
            <Kpi valor={d.por_estado.nuevo ?? 0} etiqueta="esperando revisión" />
            <Kpi
              valor={d.puntos_criticos_recurrentes}
              etiqueta="puntos críticos con 2 o más reportes"
            />
          </div>

          <section className="space-y-3">
            <h2 className="titular text-2xl">Por severidad</h2>
            <div className="flex flex-wrap gap-3">
              {SEVERIDADES.map((s) => (
                <div key={s} className="tarjeta flex items-center gap-3 px-4 py-3">
                  <ChipSeveridad severidad={s} />
                  <span className="titular text-2xl">{d.por_severidad[s] ?? 0}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="titular text-2xl">Por estado</h2>
            <div className="flex flex-wrap gap-3">
              {ESTADOS_ORDEN.map((e) => (
                <div key={e} className="tarjeta px-4 py-3">
                  <p className="titular text-2xl leading-none">{d.por_estado[e] ?? 0}</p>
                  <p className="text-[13.5px] text-tinta-600">{etiquetaEstado(e)}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="titular text-2xl">Reportes por distrito</h2>
            <table className="w-full text-left">
              <caption className="sr-only">Cantidad de reportes por distrito municipal</caption>
              <thead>
                <tr className="border-b border-filete text-[13.5px] text-tinta-600">
                  <th scope="col" className="py-2">
                    Distrito
                  </th>
                  <th scope="col" className="py-2 text-right">
                    Reportes
                  </th>
                  <th scope="col" className="py-2">
                    Proporción
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.por_distrito.map((x) => (
                  <tr key={x.distrito_id} className="border-b border-filete last:border-0">
                    <td className="py-2 font-semibold">{x.nombre ?? x.distrito_id}</td>
                    <td className="py-2 text-right">{x.n}</td>
                    <td className="w-1/2 py-2">
                      <Barra n={x.n} total={maxDistrito} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="space-y-3">
            <h2 className="titular text-2xl">Unidades vecinales con más reportes</h2>
            <table className="w-full text-left">
              <caption className="sr-only">Cantidad de reportes por unidad vecinal</caption>
              <thead>
                <tr className="border-b border-filete text-[13.5px] text-tinta-600">
                  <th scope="col" className="py-2">
                    Unidad vecinal
                  </th>
                  <th scope="col" className="py-2">
                    Distrito
                  </th>
                  <th scope="col" className="py-2 text-right">
                    Reportes
                  </th>
                  <th scope="col" className="py-2">
                    Proporción
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.por_unidad_vecinal.map((x) => (
                  <tr key={x.unidad_vecinal_id} className="border-b border-filete last:border-0">
                    <td className="py-2 font-semibold">{x.nombre ?? x.unidad_vecinal_id}</td>
                    <td className="py-2 text-tinta-600">{x.distrito_id ?? '—'}</td>
                    <td className="py-2 text-right">{x.n}</td>
                    <td className="w-2/5 py-2">
                      <Barra n={x.n} total={maxUv} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="space-y-2">
            <h2 className="titular text-2xl">Capas vigentes</h2>
            <ul className="flex flex-wrap gap-2">
              {Object.entries(d.capas_vigentes).map(([capa, version]) => (
                <li key={capa} className="chip-suave chip">
                  {etiquetaCapa(capa)}: {version ?? 'sin versión activa'}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
