'use client';

import { ChevronRight, CloudRain, Hammer, type LucideIcon, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PlanoAnillos } from './PlanoAnillos';

interface Lamina {
  clave: string;
  titulo: string;
  texto: string;
  Icono: LucideIcon;
  velo: string;
  foto?: string;
}

/**
 * Las tres láminas de bienvenida (C-00). El prototipo las ilustraba con fotos de banco de
 * imágenes enlazadas a un servicio externo; acá las dos primeras usan el trazado de anillos y
 * radiales de la ciudad —que ya identifica a Santa Cruz y no depende de nadie— y la tercera, la
 * fotografía de la catedral que viaja con el proyecto.
 */
const LAMINAS: Lamina[] = [
  {
    clave: 'El problema',
    titulo: 'Cuando llueve, medio barrio se inunda y nadie lo anota',
    texto: 'Sin registro de dónde se junta el agua, las obras de drenaje se priorizan a ciegas.',
    Icono: CloudRain,
    velo: 'linear-gradient(180deg,rgba(6,50,74,.75) 0%,rgba(6,50,74,.9) 46%,rgba(10,74,105,.98) 100%)',
  },
  {
    clave: 'Tu parte',
    titulo: 'Marcás el punto en menos de dos minutos',
    texto:
      'Señalás dónde se junta el agua, contás hasta dónde llega y sacás una foto. No hace falta medir nada.',
    Icono: MapPin,
    velo: 'linear-gradient(180deg,rgba(10,74,105,.78) 0%,rgba(10,74,105,.9) 46%,rgba(27,107,56,.98) 100%)',
  },
  {
    clave: 'El resultado',
    titulo: 'La municipalidad prioriza obras con ese mapa',
    texto:
      'Un técnico revisa cada reporte antes de publicarlo. Cuando el municipio resuelve un punto, queda marcado como resuelto.',
    Icono: Hammer,
    velo: 'linear-gradient(180deg,rgba(15,45,67,.34) 0%,rgba(10,74,105,.78) 44%,rgba(27,107,56,.96) 100%)',
    foto: '/santa-cruz-catedral.jpg',
  },
];

export function Bienvenida() {
  const [i, setI] = useState(0);
  const lamina = LAMINAS[i] as Lamina;
  const { Icono } = lamina;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-agua-900">
      {lamina.foto ? (
        // biome-ignore lint/performance/noImgElement: fotografía estática que viaja con el proyecto
        <img
          src={lamina.foto}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: '50% 28%' }}
        />
      ) : (
        <PlanoAnillos opacidad={0.22} />
      )}
      <span className="absolute inset-0" style={{ background: lamina.velo }} aria-hidden="true" />

      <div className="relative z-10 flex flex-1 flex-col px-[26px] pt-10">
        <div className="flex items-center gap-3">
          {/* biome-ignore lint/performance/noImgElement: logo estático de 200 px */}
          <img src="/logo.png" alt="" width={40} height={40} className="rounded-xl" />
          <span className="titular text-[17px] text-white">Mi Curichi</span>
          <Link
            href="/"
            className="ml-auto min-h-[44px] px-1 py-2 text-[14.5px] font-semibold text-white/90 no-underline"
          >
            Saltar
          </Link>
        </div>

        <div className="flex flex-1 flex-col justify-end pt-10">
          <span className="grid h-[52px] w-[52px] place-items-center rounded-2xl bg-white/20 text-white backdrop-blur-[6px]">
            <Icono size={27} aria-hidden="true" />
          </span>
          <p className="mt-[22px] text-[12.5px] font-bold tracking-[0.14em] text-white/90 uppercase">
            {lamina.clave}
          </p>
          <h1 className="titular mt-2.5 text-[31px] leading-[1.08] text-white [text-shadow:0_2px_18px_rgba(6,26,40,.45)]">
            {lamina.titulo}
          </h1>
          <p className="mt-3.5 max-w-[34ch] text-[16.5px] leading-[1.55] text-white/95">
            {lamina.texto}
          </p>
        </div>
      </div>

      <div className="relative z-10 px-[26px] pt-[18px] pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <div className="mb-[18px] flex justify-center gap-[7px]">
          {LAMINAS.map((l, n) => (
            <button
              key={l.clave}
              type="button"
              aria-label={`Lámina ${n + 1} de ${LAMINAS.length}`}
              aria-current={n === i ? 'true' : undefined}
              onClick={() => setI(n)}
              className="h-[9px] rounded-full transition-[width]"
              style={{
                width: n === i ? 26 : 9,
                background: `rgba(255,255,255,${n === i ? 1 : 0.45})`,
              }}
            />
          ))}
        </div>
        {i < LAMINAS.length - 1 ? (
          <button
            type="button"
            className="btn btn-bloque bg-white text-tinta-900 hover:bg-white/90"
            onClick={() => setI(i + 1)}
          >
            Siguiente
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        ) : (
          <div className="grid gap-2.5">
            <Link
              href="/"
              className="btn btn-bloque bg-white text-tinta-900 no-underline hover:bg-white/90"
            >
              Ver el mapa
            </Link>
            <Link
              href="/reportar"
              className="btn btn-bloque bg-white/15 text-white no-underline shadow-[inset_0_0_0_1.5px_rgba(255,255,255,.55)] hover:bg-white/25"
            >
              Reportar un punto
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
