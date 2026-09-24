'use client';

import { useQueries } from '@tanstack/react-query';
import { Image as IconoImagen, List } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ErrorApi, obtenerReporte, type ReporteFeature } from '@/lib/api';
import { etiquetaSeveridad, fechaCorta, urlFotoRelativa } from '@/lib/formato';
import { leerMisReportes, olvidarReportes, type ReporteLocal } from '@/lib/misReportes';
import { Aviso } from './Aviso';
import { BarraInferior } from './BarraInferior';
import { ChipEstado } from './ChipSeveridad';
import { ErrorDeCarga } from './ErrorDeCarga';
import { useToast } from './Toast';

export interface Seguido {
  local: ReporteLocal;
  publico: ReporteFeature | null;
  /** true mientras no se sabe si está publicado. */
  cargando: boolean;
  /**
   * El servidor respondió 404: el reporte existe pero todavía no se publica (o se rechazó, o se
   * unió a otro). Es una respuesta, no un fallo.
   */
  enRevision: boolean;
  /**
   * No se pudo preguntar (API caída, red cortada, plazo agotado). Hay que decirlo: antes esto
   * se pintaba igual que «en revisión» y el vecino leía un estado que nadie había confirmado.
   */
  error: unknown;
}

/**
 * Consulta el estado real de cada reporte guardado en este dispositivo. Un 404 no es un error:
 * es la respuesta correcta para un reporte que todavía está en revisión, porque la vista pública
 * solo expone los validados y resueltos (moderación previa, CLAUDE.md §7.3). Cualquier OTRO
 * fallo sí lo es, y se distingue.
 */
export function useMisReportes() {
  const [locales, setLocales] = useState<ReporteLocal[] | null>(null);
  useEffect(() => setLocales(leerMisReportes()), []);

  const consultas = useQueries({
    queries: (locales ?? []).map((r) => ({
      queryKey: ['reporte', r.id],
      queryFn: ({ signal }: { signal: AbortSignal }) => obtenerReporte(r.id, signal),
      retry: false,
      staleTime: 60_000,
    })),
  });

  const seguidos: Seguido[] = (locales ?? []).map((local, i) => {
    const c = consultas[i];
    const enRevision = c?.error instanceof ErrorApi && c.error.estado === 404;
    return {
      local,
      publico: c?.data ?? null,
      cargando: !!c?.isPending,
      enRevision,
      error: enRevision ? null : (c?.error ?? null),
    };
  });

  const reintentar = () => {
    for (const c of consultas) if (c.isError) c.refetch();
  };

  return { seguidos, listo: locales !== null, reintentar };
}

export function MisReportes() {
  const { seguidos, listo, reintentar } = useMisReportes();
  const toast = useToast();
  const [version, setVersion] = useState(0);

  const publicados = seguidos.filter((s) => s.publico).length;
  const enRevision = seguidos.filter((s) => s.enRevision).length;
  const fallidos = seguidos.filter((s) => s.error);

  return (
    <div className="flex min-h-0 flex-1 flex-col" key={version}>
      <div className="mx-auto w-full max-w-3xl flex-1 px-5 pt-5 pb-8 md:px-6 md:pt-8">
        <h1 className="titular text-[22px]">Mis reportes</h1>

        {!listo ? (
          <p className="ayuda mt-4" aria-live="polite">
            Buscando los reportes de este dispositivo…
          </p>
        ) : seguidos.length === 0 ? (
          <div className="grid place-items-center px-2.5 py-10 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-fondo text-tinta-300">
              <List size={26} aria-hidden="true" />
            </div>
            <h2 className="titular mt-4 text-xl">Todavía no enviaste ninguno</h2>
            <p className="mt-2.5 max-w-[30ch] text-[15.5px] leading-[1.5] text-tinta-600">
              Cuando reportes un punto, acá vas a poder seguir su estado.
            </p>
            <Link href="/reportar" className="btn mt-4.5 no-underline">
              Reportar un punto
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-3.5 mb-3.5 flex flex-wrap gap-2">
              <span className="mini">Todos · {seguidos.length}</span>
              <span className="mini">En revisión · {enRevision}</span>
              <span className="mini">Publicados · {publicados}</span>
              {fallidos.length ? (
                <span className="mini">Sin consultar · {fallidos.length}</span>
              ) : null}
            </div>

            {fallidos.length ? (
              <ErrorDeCarga
                className="mb-3.5"
                error={fallidos[0]?.error}
                que={
                  fallidos.length === seguidos.length
                    ? 'el estado de tus reportes'
                    : `el estado de ${fallidos.length} de tus reportes`
                }
                alReintentar={reintentar}
                testId="error-mis-reportes"
              />
            ) : null}

            <ul className="grid gap-2.5">
              {seguidos.map(({ local, publico, cargando, error }) => {
                const p = publico?.properties;
                const foto = p?.fotos[0];
                return (
                  <li key={local.id}>
                    <Link
                      href={`/mis-reportes/${local.id}`}
                      className="tarjeta grid w-full grid-cols-[58px_minmax(0,1fr)] gap-3 p-3 text-left no-underline"
                    >
                      <span className="foto h-[58px]">
                        {foto ? (
                          // biome-ignore lint/performance/noImgElement: foto servida por api-core
                          <img src={urlFotoRelativa(foto)} alt="" loading="lazy" />
                        ) : (
                          <span className="placeholder-foto">
                            <IconoImagen size={21} aria-hidden="true" />
                          </span>
                        )}
                      </span>
                      <span className="min-w-0">
                        {cargando ? (
                          <span className="mini">Consultando…</span>
                        ) : error ? (
                          <span className="mini">Estado desconocido</span>
                        ) : (
                          <ChipEstado estado={p?.estado ?? 'nuevo'} />
                        )}
                        <span className="titular mt-[7px] block text-[16px]">
                          {p?.direccion_aprox ?? local.titulo}
                        </span>
                        <span className="mt-1 block text-[14px] text-tinta-600">
                          {p
                            ? `${fechaCorta(p.creado_en)} · severidad ${etiquetaSeveridad(p.severidad).toLowerCase()}`
                            : error
                              ? `Enviado el ${fechaCorta(local.enviado_en)} · no pudimos consultar su estado`
                              : `Enviado el ${fechaCorta(local.enviado_en)} · esperando revisión`}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <Aviso tono="tinta" className="mt-4.5">
              <b className="mb-1 block text-[14.5px] text-white">Esta lista vive en tu teléfono</b>
              Esta lista la recuerda tu navegador: si borrás sus datos o cambiás de dispositivo, se
              pierde. El código de seguimiento de cada reporte sí es permanente. En el mapa público
              nunca aparece quién reportó cada punto.
            </Aviso>

            <button
              type="button"
              className="btn btn-fantasma btn-sm mt-3"
              onClick={() => {
                olvidarReportes();
                setVersion((v) => v + 1);
                toast('Lista borrada de este dispositivo');
              }}
            >
              Borrar esta lista del dispositivo
            </button>
          </>
        )}
      </div>
      <BarraInferior />
    </div>
  );
}
