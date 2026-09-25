'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Aviso } from '@/componentes/Aviso';
import { activarCapa, obtenerVersionesCapas } from '@/lib/api';
import { etiquetaCapa, fechaHora } from '@/lib/formato';
import { useUsuarioActual } from '@/lib/sesion';

export default function Capas() {
  const usuario = useUsuarioActual();
  const cliente = useQueryClient();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const consulta = useQuery({
    queryKey: ['capas-versiones'],
    queryFn: ({ signal }) => obtenerVersionesCapas(signal),
  });

  const activar = useMutation({
    mutationFn: activarCapa,
    onSuccess: (c) => {
      setError(null);
      setMensaje(`Ahora rige la versión ${c.version} de ${etiquetaCapa(c.capa)}.`);
      cliente.invalidateQueries({ queryKey: ['capas-versiones'] });
      cliente.invalidateQueries({ queryKey: ['indicadores'] });
    },
    onError: (e) => {
      setMensaje(null);
      setError(e instanceof Error ? e.message : 'No se pudo activar la versión.');
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="titular text-3xl">Capas administrativas</h1>
        <p className="max-w-3xl text-tinta-600">
          El pipeline de datos carga cada entrega del municipio como una versión nueva. Acá se elige
          cuál rige: los reportes nuevos se ubican contra la versión vigente, y los ya cargados
          conservan la versión con la que se resolvieron.
        </p>
      </div>

      <Aviso tipo="ok">{mensaje}</Aviso>
      <Aviso tipo="error">{error}</Aviso>

      {consulta.isPending ? (
        <p aria-live="polite">Cargando versiones…</p>
      ) : consulta.isError ? (
        <p className="error">No pudimos leer las versiones de capas.</p>
      ) : (
        <table className="w-full text-left">
          <caption className="sr-only">Versiones de capas cargadas</caption>
          <thead>
            <tr className="border-b border-filete text-[13.5px] text-tinta-600">
              <th scope="col" className="py-2">
                Capa
              </th>
              <th scope="col" className="py-2">
                Versión
              </th>
              <th scope="col" className="py-2">
                Fuente
              </th>
              <th scope="col" className="py-2 text-right">
                Features
              </th>
              <th scope="col" className="py-2">
                CRS de origen
              </th>
              <th scope="col" className="py-2">
                Cargada
              </th>
              <th scope="col" className="py-2">
                Estado
              </th>
            </tr>
          </thead>
          <tbody>
            {(consulta.data ?? []).map((c) => (
              <tr key={c.id} className="border-b border-filete last:border-0">
                <td className="py-3 font-semibold">{etiquetaCapa(c.capa)}</td>
                <td className="py-3">{c.version}</td>
                <td className="max-w-xs py-3 text-[13.5px] text-tinta-600">{c.fuente ?? '—'}</td>
                <td className="py-3 text-right">{c.n_features.toLocaleString('es-BO')}</td>
                <td className="py-3 text-[13.5px]">{c.crs_origen ?? '—'}</td>
                <td className="py-3 text-[13.5px] text-tinta-600">{fechaHora(c.cargado_en)}</td>
                <td className="py-3">
                  {c.vigente ? (
                    <span className="rounded-full bg-verde-100 px-3 py-1 font-semibold text-verde-700">
                      Vigente
                    </span>
                  ) : usuario.rol === 'admin' ? (
                    <button
                      type="button"
                      className="btn-secundario btn"
                      disabled={activar.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `¿Activar la versión ${c.version} de ${etiquetaCapa(c.capa)}? Los reportes nuevos se van a ubicar contra esta capa.`,
                          )
                        )
                          activar.mutate(c.id);
                      }}
                    >
                      Activar
                    </button>
                  ) : (
                    <span className="text-[13.5px] text-tinta-600">
                      Solo un administrador puede activarla
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
