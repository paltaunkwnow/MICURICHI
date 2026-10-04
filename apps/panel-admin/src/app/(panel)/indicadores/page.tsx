'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { SEVERIDADES, type Severidad } from 'contracts';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useMemo } from 'react';
import { Aviso } from '@/componentes/Aviso';
import { CapaAnterior } from '@/componentes/CapaAnterior';
import { ChipSeveridad } from '@/componentes/ChipSeveridad';
import { FiltroSeveridad } from '@/componentes/indicadores/FiltroSeveridad';
import { TortaReportes } from '@/componentes/indicadores/TortaReportes';
import { consultaIndicadores, consultaResumenEjecutivo } from '@/lib/consultas';
import { distritosCapaAnterior } from '@/lib/ejecutivo';
import { alternarEnLista } from '@/lib/filtros';
import { ESTADOS_ORDEN, etiquetaEstado } from '@/lib/formato';
import { kpisIndicadores } from '@/lib/indicadores';
import {
  calcularPorciones,
  type EstadoTorta,
  type ItemConteo,
  leerEstadoTorta,
  paramsIndicadores,
  serializarEstadoTorta,
  urlBandejaUv,
} from '@/lib/indicadores-torta';

function Kpi({
  valor,
  etiqueta,
  testId,
}: {
  valor: number | string;
  etiqueta: string;
  testId: string;
}) {
  return (
    <div className="tarjeta px-4 py-3" data-testid={testId}>
      <p className="titular text-3xl leading-none">{valor}</p>
      <p className="mt-1 text-[13.5px] text-tinta-600">{etiqueta}</p>
    </div>
  );
}

export default function Indicadores() {
  // useSearchParams exige un límite de Suspense para el prerender (igual que la bandeja).
  return (
    <Suspense
      fallback={
        <p className="text-tinta-600" role="status">
          Cargando indicadores…
        </p>
      }
    >
      <ContenidoIndicadores />
    </Suspense>
  );
}

function ContenidoIndicadores() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Severidades elegidas y distrito seleccionado viven en la URL (?severidad=…&distrito=…), para
  // poder compartir el enlace y para que el sondeo de 10 s siga pidiendo lo mismo.
  const estado = useMemo(() => leerEstadoTorta(new URLSearchParams(sp.toString())), [sp]);
  const paramsBase = useMemo(() => paramsIndicadores(estado.severidades), [estado.severidades]);
  // La torta de UV se acota al distrito elegido con una segunda consulta (`distrito_id`), que solo
  // sale cuando hay un distrito seleccionado.
  const paramsDistrito = useMemo(
    () => paramsIndicadores(estado.severidades, estado.distrito || undefined),
    [estado.severidades, estado.distrito],
  );

  const navegar = useCallback(
    (nuevo: EstadoTorta) => {
      const q = serializarEstadoTorta(nuevo).toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router],
  );
  const alternarSeveridad = useCallback(
    (s: Severidad) =>
      navegar({ ...estado, severidades: alternarEnLista([...estado.severidades], s) }),
    [estado, navegar],
  );
  const alternarDistrito = useCallback(
    (id: string) => navegar({ ...estado, distrito: estado.distrito === id ? '' : id }),
    [estado, navegar],
  );

  const consulta = useQuery({
    ...consultaIndicadores(paramsBase),
    placeholderData: keepPreviousData,
  });
  const resumen = useQuery(consultaResumenEjecutivo());
  const consultaUvDistrito = useQuery({
    ...consultaIndicadores(paramsDistrito),
    placeholderData: keepPreviousData,
    enabled: estado.distrito !== '',
  });

  const capaAnterior = resumen.data ? distritosCapaAnterior(resumen.data) : [];
  const d = consulta.data;

  const porcionesDistrito = useMemo(
    () =>
      calcularPorciones(
        (d?.por_distrito ?? []).map(
          (x): ItemConteo => ({ id: x.distrito_id, nombre: x.nombre ?? x.distrito_id, n: x.n }),
        ),
        { etiquetaOtros: 'Otros distritos' },
      ),
    [d],
  );

  // Fuente de la torta de UV: la consulta acotada si hay distrito; si no, la base (toda la ciudad).
  const datosUv = estado.distrito ? consultaUvDistrito.data : d;
  const porcionesUv = useMemo(
    () =>
      calcularPorciones(
        (datosUv?.por_unidad_vecinal ?? []).map(
          (x): ItemConteo => ({
            id: x.unidad_vecinal_id,
            nombre: x.nombre ?? x.unidad_vecinal_id,
            n: x.n,
          }),
        ),
        { etiquetaOtros: 'Otras UV' },
      ),
    [datosUv],
  );

  const nombreDistritoSel = estado.distrito
    ? (d?.por_distrito.find((x) => x.distrito_id === estado.distrito)?.nombre ?? estado.distrito)
    : null;
  const uvCargando =
    estado.distrito !== '' && consultaUvDistrito.isPending && !consultaUvDistrito.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="titular text-3xl">Indicadores</h1>
        <p className="text-tinta-600">
          Conteos sobre los reportes cargados. Son datos de percepción ciudadana, no mediciones de
          campo.
        </p>
        <p className="text-tinta-600">
          El total, la severidad, los distritos y las unidades vecinales cuentan los reportes
          vigentes (nuevos, validados y resueltos). Rechazados y duplicados se ven en «Por estado».
        </p>
      </div>

      <FiltroSeveridad seleccionadas={estado.severidades} onAlternar={alternarSeveridad} />

      <Aviso tipo="alerta" testId="indicadores-sin-actualizar">
        {d && consulta.error
          ? 'No se pudieron actualizar los indicadores. Se muestran los últimos datos recibidos.'
          : null}
      </Aviso>

      {consulta.isPending ? (
        <p aria-live="polite">Calculando indicadores…</p>
      ) : !d ? (
        <p className="error" aria-live="polite">
          No pudimos calcular los indicadores.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {kpisIndicadores(d).map((k) => (
              <Kpi key={k.testId} valor={k.valor} etiqueta={k.etiqueta} testId={k.testId} />
            ))}
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
            <p className="text-[15px] text-tinta-600">
              Todos los reportes recibidos, también los rechazados y los duplicados.
            </p>
            <div className="flex flex-wrap gap-3">
              {ESTADOS_ORDEN.map((e) => (
                <div key={e} className="tarjeta px-4 py-3">
                  <p className="titular text-2xl leading-none">{d.por_estado[e] ?? 0}</p>
                  <p className="text-[13.5px] text-tinta-600">{etiquetaEstado(e)}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <TortaReportes
              testId="torta-distrito"
              titulo="Reportes por distrito"
              subtitulo="Tocá un distrito para ver sus unidades vecinales."
              porciones={porcionesDistrito}
              unidadCentro="reportes"
              vacioTexto="No hay reportes con estas severidades."
              accion={{
                modo: 'seleccion',
                seleccionado: estado.distrito || null,
                onActivar: (p) => alternarDistrito(p.id),
                pista: 'Mostrar sus unidades vecinales',
              }}
            />

            {uvCargando ? (
              <figure className="tarjeta m-0 p-5" data-testid="torta-uv-cargando">
                <figcaption className="titular text-xl">Reportes por unidad vecinal</figcaption>
                <p className="mt-4 text-tinta-600" role="status">
                  Cargando unidades vecinales…
                </p>
              </figure>
            ) : (
              <TortaReportes
                testId="torta-uv"
                titulo="Reportes por unidad vecinal"
                subtitulo={nombreDistritoSel ? `En ${nombreDistritoSel}` : 'En toda la ciudad'}
                porciones={porcionesUv}
                unidadCentro="reportes"
                vacioTexto="No hay reportes con estas severidades."
                accion={{
                  modo: 'enlace',
                  href: (p) => urlBandejaUv(p.id, estado.severidades),
                  pista: 'Abrir la bandeja filtrada por esta unidad vecinal',
                }}
              />
            )}
          </div>

          {estado.distrito && consultaUvDistrito.error ? (
            <Aviso tipo="error">
              No se pudieron cargar las unidades vecinales del distrito elegido.
            </Aviso>
          ) : null}

          {capaAnterior.length ? <CapaAnterior filas={capaAnterior} /> : null}
        </>
      )}
    </div>
  );
}
