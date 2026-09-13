'use client';

import { ESTADOS_REPORTE, SEVERIDADES } from 'contracts';
import { FilterX } from 'lucide-react';
import { useMemo } from 'react';
import type { UnidadGeo } from '@/lib/api';
import { alternarEnLista, type FiltrosReportes, hayFiltros } from '@/lib/filtros';
import { colorSeveridad, etiquetaEstado, etiquetaSeveridad } from '@/lib/formato';

export function FiltrosDeReportes({
  filtros,
  distritos,
  unidadesVecinales,
  onCambiar,
}: {
  filtros: FiltrosReportes;
  distritos: UnidadGeo[];
  unidadesVecinales: UnidadGeo[];
  onCambiar: (cambios: Partial<FiltrosReportes>) => void;
}) {
  const uvsVisibles = useMemo(
    () =>
      filtros.distrito_id
        ? unidadesVecinales.filter((u) => u.distrito_id === filtros.distrito_id)
        : unidadesVecinales,
    [unidadesVecinales, filtros.distrito_id],
  );

  return (
    <div className="tarjeta flex flex-col gap-4 p-4 lg:p-5">
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 font-semibold">Estado</legend>
        <div className="flex flex-wrap gap-2">
          {ESTADOS_REPORTE.map((e) => (
            <button
              key={e}
              type="button"
              name="estado"
              value={e}
              className="chip"
              aria-pressed={filtros.estado.includes(e)}
              onClick={() => onCambiar({ estado: alternarEnLista(filtros.estado, e) })}
            >
              {etiquetaEstado(e)}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 font-semibold">Severidad</legend>
        <div className="flex flex-wrap gap-2">
          {SEVERIDADES.map((s) => (
            <button
              key={s}
              type="button"
              name="severidad"
              value={s}
              className="chip"
              aria-pressed={filtros.severidad.includes(s)}
              onClick={() => onCambiar({ severidad: alternarEnLista(filtros.severidad, s) })}
            >
              <span
                className="punto"
                style={{ background: colorSeveridad(s).relleno }}
                aria-hidden="true"
              />
              {etiquetaSeveridad(s)}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <label htmlFor="distrito_id" className="mb-1 block font-semibold">
            Distrito
          </label>
          <select
            id="distrito_id"
            name="distrito_id"
            className="campo"
            value={filtros.distrito_id}
            onChange={(ev) => {
              const distrito_id = ev.target.value;
              const uvActual = unidadesVecinales.find((u) => u.id === filtros.unidad_vecinal_id);
              const conservaUv = !distrito_id || uvActual?.distrito_id === distrito_id;
              onCambiar({
                distrito_id,
                unidad_vecinal_id: conservaUv ? filtros.unidad_vecinal_id : '',
              });
            }}
          >
            <option value="">Todos los distritos</option>
            {distritos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre === d.codigo ? `Distrito ${d.codigo}` : `${d.codigo} · ${d.nombre}`}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="unidad_vecinal_id" className="mb-1 block font-semibold">
            Unidad vecinal
          </label>
          <select
            id="unidad_vecinal_id"
            name="unidad_vecinal_id"
            className="campo"
            value={filtros.unidad_vecinal_id}
            onChange={(ev) => onCambiar({ unidad_vecinal_id: ev.target.value })}
          >
            <option value="">Todas las unidades vecinales</option>
            {uvsVisibles.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre === u.codigo ? `UV ${u.codigo}` : `${u.codigo} · ${u.nombre}`}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="desde" className="mb-1 block font-semibold">
            Desde
          </label>
          <input
            id="desde"
            name="desde"
            type="date"
            className="campo"
            value={filtros.desde}
            max={filtros.hasta || undefined}
            onChange={(ev) => onCambiar({ desde: ev.target.value })}
          />
        </div>

        <div>
          <label htmlFor="hasta" className="mb-1 block font-semibold">
            Hasta
          </label>
          <input
            id="hasta"
            name="hasta"
            type="date"
            className="campo"
            value={filtros.hasta}
            min={filtros.desde || undefined}
            onChange={(ev) => onCambiar({ hasta: ev.target.value })}
          />
        </div>
      </div>

      {hayFiltros(filtros) && (
        <div>
          <button
            type="button"
            className="btn btn-secundario"
            onClick={() =>
              onCambiar({
                estado: [],
                severidad: [],
                distrito_id: '',
                unidad_vecinal_id: '',
                desde: '',
                hasta: '',
              })
            }
          >
            <FilterX size={18} aria-hidden="true" />
            Limpiar filtros
          </button>
        </div>
      )}
    </div>
  );
}
