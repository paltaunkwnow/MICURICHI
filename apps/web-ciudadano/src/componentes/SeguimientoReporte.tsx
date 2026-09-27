'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useCiudad } from '@/lib/ciudad-contexto';
import {
  etiquetaDistrito,
  etiquetaSeveridad,
  etiquetaUnidadVecinal,
  fechaCorta,
  urlFotoRelativa,
} from '@/lib/formato';
import { situacionDelAutor } from '@/lib/misReportes';
import { textoCuentaRegresiva } from '@/lib/publicacion';
import { TEXTO_SIN_VERIFICAR } from '@/lib/verificacion';
import { Aviso } from './Aviso';
import { ChipSeveridad } from './ChipSeveridad';
import { useSegundosQueFaltan } from './CuentaRegresiva';
import { EstadoDelAutor, PuertaMisReportes, useMisReportes } from './MisReportes';

interface Hito {
  titulo: string;
  detalle: string;
  hecho: boolean;
}

/**
 * Seguimiento de un reporte propio (C-17 del prototipo). La línea de tiempo es la devolución que
 * el municipio le debe al vecino: dice en qué punto del circuito está su reporte sin obligarlo a
 * entender la máquina de estados. Sale de la vista del autor (`GET /api/v1/mis-reportes`), así
 * que se ve igual mientras espera su publicación y si lo retiraron.
 */
export function SeguimientoReporte({ id }: { id: string }) {
  const ciudad = useCiudad();
  const datos = useMisReportes();
  const { reportes, recibidoEn } = datos;
  const encontrado = reportes.find((f) => f.properties.id === id) ?? null;
  const p = encontrado?.properties ?? null;
  // Se llama siempre (regla de los hooks); sin reporte, no hay nada que contar.
  const faltan = useSegundosQueFaltan(p?.segundos_para_publicar ?? 0, recibidoEn);
  const listos = datos.consulta.isSuccess && !!datos.sesion.usuario && !datos.caducada;

  const cabecera = (
    <div className="cab px-0">
      <Link href="/mis-reportes" className="atras no-underline" aria-label="Volver a mis reportes">
        <ChevronLeft size={19} aria-hidden="true" />
      </Link>
      <h1 className="titular text-xl">Mi reporte</h1>
    </div>
  );

  if (!listos)
    return (
      <div className="mx-auto w-full max-w-2xl px-5 pt-4 pb-10 md:px-6">
        {cabecera}
        <PuertaMisReportes datos={datos} volver={`/mis-reportes/${id}`} />
      </div>
    );

  /**
   * La API no lo devuelve entre los reportes de la cuenta: otra cuenta, un código inventado o uno
   * más viejo que los últimos que trae la lista. Antes esta pantalla dibujaba la línea de tiempo
   * entera para cualquier identificador; lo honesto es decir que no se encontró.
   */
  if (!p)
    return (
      <div className="mx-auto w-full max-w-2xl px-5 pt-4 pb-10 md:px-6">
        {cabecera}
        <div className="mt-4" data-testid="seguimiento-desconocido">
          <Aviso tono="alerta">
            <b className="mb-1 block text-[15px]">No encontramos ese reporte</b>
            No está entre los reportes de tu cuenta. Si lo enviaste con otra cuenta, entrá con esa
            para seguirlo.
          </Aviso>
          <Link href="/mis-reportes" className="btn btn-fantasma mt-3.5 no-underline">
            Volver a mis reportes
          </Link>
        </div>
      </div>
    );

  const situacion = situacionDelAutor(p, faltan);
  const publicado = faltan <= 0 && situacion !== 'retirado' && situacion !== 'sumado';
  const revisado = situacion === 'verificado' || situacion === 'resuelto';
  const titulo = p.unidad_vecinal?.nombre || 'Tu reporte';

  const hitos: Hito[] = [
    { titulo: 'Lo enviaste', detalle: fechaCorta(p.creado_en, ciudad), hecho: true },
    {
      titulo: 'Se publicó en el mapa',
      detalle:
        situacion === 'retirado' || situacion === 'sumado'
          ? 'Ya no está en el mapa'
          : faltan > 0
            ? textoCuentaRegresiva(faltan)
            : revisado
              ? 'Visible para todos'
              : `Visible para todos, con la marca «${TEXTO_SIN_VERIFICAR}»`,
      hecho: faltan <= 0,
    },
    {
      titulo: 'Un técnico lo revisó',
      detalle: revisado
        ? `Severidad ${etiquetaSeveridad(p.severidad).toLowerCase()} confirmada`
        : situacion === 'retirado'
          ? 'Lo retiró del mapa'
          : situacion === 'sumado'
            ? 'Lo sumó a otro punto'
            : 'Pendiente',
      hecho: revisado || situacion === 'retirado' || situacion === 'sumado',
    },
    {
      titulo: 'El municipio lo resolvió',
      detalle: situacion === 'resuelto' ? 'El punto quedó marcado como resuelto' : 'Pendiente',
      hecho: situacion === 'resuelto',
    },
  ];

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-4 pb-10 md:px-6">
      {cabecera}

      {p.fotos.length ? (
        <div className="foto h-[148px]">
          {/* biome-ignore lint/performance/noImgElement: foto servida por api-core */}
          <img src={urlFotoRelativa(p.fotos[0] as string)} alt={`Foto en ${titulo}`} />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <EstadoDelAutor reporte={p} recibidoEn={recibidoEn} />
        <ChipSeveridad severidad={p.severidad} />
      </div>

      <h2 className="titular mt-2.5 text-[21px]">{titulo}</h2>
      <p className="mt-1 text-[14.5px] text-tinta-600">
        {etiquetaUnidadVecinal(p.unidad_vecinal?.codigo)}
        {' · '}
        {etiquetaDistrito(p.distrito?.codigo)}
        {' · código '}
        {id.slice(0, 8).toUpperCase()}
      </p>

      <ol className="mt-4 grid list-none p-0">
        {hitos.map((h, i) => (
          <li key={h.titulo} className="grid grid-cols-[26px_minmax(0,1fr)] gap-3">
            <span className="flex flex-col items-center">
              <i
                className="mt-1 block h-[13px] w-[13px] flex-none rounded-full"
                style={{ background: h.hecho ? 'var(--color-verde-500)' : '#D3DBD6' }}
              />
              {i < hitos.length - 1 ? (
                <span className="block w-0.5 flex-1 bg-[#DCE3DF]" aria-hidden="true" />
              ) : null}
            </span>
            <span className="block pb-[18px]">
              <b className={`block text-[15.5px] font-semibold ${h.hecho ? '' : 'text-tinta-300'}`}>
                {h.titulo}
              </b>
              <span className="mt-0.5 block text-[14px] leading-[1.45] text-tinta-600">
                {h.detalle}
              </span>
            </span>
          </li>
        ))}
      </ol>

      {situacion === 'retirado' ? (
        <Aviso tono="info" data-testid="aviso-retirado">
          Un técnico lo revisó y lo retiró del mapa: ya no se ve en el mapa público.
        </Aviso>
      ) : situacion === 'sumado' ? (
        <Aviso tono="info" data-testid="aviso-retirado">
          Un técnico lo sumó a otro punto que reportaba lo mismo: en el mapa se ve ese punto.
        </Aviso>
      ) : situacion === 'sin-verificar' ? (
        <Aviso tono="info">
          Se ve en el mapa con la marca «{TEXTO_SIN_VERIFICAR}» hasta que un técnico municipal lo
          revise.
        </Aviso>
      ) : null}
      {publicado ? (
        <Link href={`/reporte/${id}`} className="btn btn-bloque mt-2 no-underline">
          Verlo en el mapa público
        </Link>
      ) : null}
    </div>
  );
}
