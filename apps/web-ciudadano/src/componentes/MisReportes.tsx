'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MiReporte, MiReporteFeature } from 'contracts';
import { Image as IconoImagen, List } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { obtenerMisReportes } from '@/lib/api';
import { useCiudad } from '@/lib/ciudad-contexto';
import { esSesionCaducada } from '@/lib/errores';
import { etiquetaSeveridad, fechaCorta, urlFotoRelativa } from '@/lib/formato';
import {
  claveMisReportes,
  resumenDeMisReportes,
  type SituacionAutor,
  situacionDelAutor,
} from '@/lib/misReportes';
import { formatoCuenta } from '@/lib/publicacion';
import { refrescarSesion, useSesion } from '@/lib/sesion';
import { AccesoRequerido } from './AccesoRequerido';
import { Aviso } from './Aviso';
import { BarraInferior } from './BarraInferior';
import { ChipEnEspera, ChipEstado } from './ChipSeveridad';
import { useSegundosQueFaltan } from './CuentaRegresiva';
import { ErrorDeCarga } from './ErrorDeCarga';

/**
 * Los reportes de la cuenta, en la vista del autor (`GET /api/v1/mis-reportes`). La consulta
 * lleva la cuenta en la clave: si en el mismo navegador entra otra persona, nunca ve la lista de
 * la anterior. Sin opciones de refresco propias: se pide al abrir la pantalla y cuando la app
 * sabe que cambió (después de enviar un reporte).
 */
export function useMisReportes() {
  const sesion = useSesion();
  const cliente = useQueryClient();
  const usuarioId = sesion.usuario?.id ?? null;
  const consulta = useQuery({
    queryKey: claveMisReportes(usuarioId ?? ''),
    queryFn: ({ signal }) => obtenerMisReportes(signal),
    enabled: usuarioId !== null,
    retry: false,
  });
  // 401: la sesión venció después de la última consulta a /auth/yo. Se vuelve a preguntar, y
  // la pantalla pasa a pedir que entre.
  const caducada = esSesionCaducada(consulta.error);
  useEffect(() => {
    if (caducada) void refrescarSesion(cliente);
  }, [caducada, cliente]);
  return {
    sesion,
    consulta,
    caducada,
    reportes: consulta.data?.features ?? [],
    /** Cuándo llegó la lista: la cuenta regresiva de cada reporte en espera corre desde ahí. */
    recibidoEn: consulta.dataUpdatedAt,
  };
}

const ESTADO_DE_SITUACION: Record<Exclude<SituacionAutor, 'en-espera'>, MiReporte['estado']> = {
  'sin-verificar': 'nuevo',
  verificado: 'validado',
  resuelto: 'resuelto',
  retirado: 'rechazado',
  sumado: 'duplicado',
};

/**
 * El estado de un reporte propio. Mientras espera su publicación cuenta hacia atrás; después
 * lleva la misma etiqueta que ve cualquiera en el mapa («NO SE HA VERIFICADO», «Verificado»,
 * «Resuelto»), o dice que lo retiraron o lo sumaron a otro punto.
 */
export function EstadoDelAutor({
  reporte,
  recibidoEn,
}: {
  reporte: MiReporte;
  recibidoEn: number;
}) {
  const faltan = useSegundosQueFaltan(reporte.segundos_para_publicar, recibidoEn);
  const situacion = situacionDelAutor(reporte, faltan);
  if (situacion === 'en-espera')
    return <ChipEnEspera texto={`Se publica en ${formatoCuenta(faltan)}`} />;
  return <ChipEstado estado={ESTADO_DE_SITUACION[situacion]} />;
}

/** Lo que la pantalla muestra mientras no hay lista: sesión, acceso, carga o fallo. */
export function PuertaMisReportes({
  datos,
  volver,
}: {
  datos: ReturnType<typeof useMisReportes>;
  volver: string;
}) {
  const { sesion, consulta, caducada } = datos;
  if (sesion.cargando)
    return (
      <p className="ayuda mt-4" role="status">
        Comprobando la sesión…
      </p>
    );
  if (sesion.errorDeCarga)
    return (
      <ErrorDeCarga
        className="mt-4"
        error={sesion.errorDeCarga}
        que="tu sesión"
        alReintentar={sesion.reintentar}
        reintentando={sesion.reintentando}
        testId="error-sesion"
      />
    );
  if (!sesion.usuario || caducada) return <AccesoRequerido para="mis-reportes" volver={volver} />;
  if (consulta.isPending)
    return (
      <p className="ayuda mt-4" aria-live="polite">
        Buscando tus reportes…
      </p>
    );
  if (consulta.isError)
    return (
      <ErrorDeCarga
        className="mt-4"
        error={consulta.error}
        que="tus reportes"
        alReintentar={() => consulta.refetch()}
        reintentando={consulta.isFetching}
        testId="error-mis-reportes"
      />
    );
  return null;
}

function tituloDe(p: MiReporte): string {
  return p.unidad_vecinal?.nombre || 'Punto reportado';
}

export function MisReportes() {
  const datos = useMisReportes();
  const { reportes, recibidoEn } = datos;
  const ciudad = useCiudad();
  const puerta = <PuertaMisReportes datos={datos} volver="/mis-reportes" />;
  const listos = datos.consulta.isSuccess && !!datos.sesion.usuario && !datos.caducada;
  const resumen = resumenDeMisReportes(reportes.map((f) => f.properties));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto w-full max-w-3xl flex-1 px-5 pt-5 pb-8 md:px-6 md:pt-8">
        <h1 className="titular text-[22px]">Mis reportes</h1>

        {!listos ? (
          puerta
        ) : reportes.length === 0 ? (
          <div
            className="grid place-items-center px-2.5 py-10 text-center"
            data-testid="mis-reportes-vacio"
          >
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
            <div className="mt-3.5 mb-3.5 flex flex-wrap gap-2" data-testid="resumen-mis-reportes">
              <span className="mini">Todos · {resumen.todos}</span>
              {resumen.enEspera ? (
                <span className="mini">Por publicarse · {resumen.enEspera}</span>
              ) : null}
              <span className="mini">Sin verificar · {resumen.sinVerificar}</span>
              <span className="mini">Verificados · {resumen.verificados}</span>
              {resumen.retirados ? (
                <span className="mini">Retirados del mapa · {resumen.retirados}</span>
              ) : null}
            </div>

            <ul className="grid gap-2.5">
              {reportes.map((f: MiReporteFeature) => {
                const p = f.properties;
                const foto = p.fotos[0];
                return (
                  <li key={p.id}>
                    <Link
                      href={`/mis-reportes/${p.id}`}
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
                        <EstadoDelAutor reporte={p} recibidoEn={recibidoEn} />
                        <span className="titular mt-[7px] block text-[16px]">{tituloDe(p)}</span>
                        <span className="mt-1 block text-[14px] text-tinta-600">
                          Enviado el {fechaCorta(p.creado_en, ciudad)} · severidad{' '}
                          {etiquetaSeveridad(p.severidad).toLowerCase()}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <Aviso tono="tinta" className="mt-4.5">
              <b className="mb-1 block text-[14.5px] text-white">Son los reportes de tu cuenta</b>
              Los ves desde cualquier teléfono en el que entres con ella. En el mapa público nunca
              aparece quién reportó cada punto. Los que un técnico retiró del mapa quedan acá para
              que sepas qué pasó con ellos.
            </Aviso>
          </>
        )}
      </div>
      <BarraInferior />
    </div>
  );
}
