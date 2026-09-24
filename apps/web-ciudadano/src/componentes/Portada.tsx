'use client';

import { useQuery } from '@tanstack/react-query';
import { ChartColumn, Layers, type LucideIcon, MapPin, Search } from 'lucide-react';
import Link from 'next/link';
import { obtenerCapas, obtenerReportes } from '@/lib/api';
import { useEsEscritorio } from '@/lib/useEsEscritorio';
import { Aviso } from './Aviso';
import { MapaDiferido } from './MapaDiferido';
import { PlanoAnillos } from './PlanoAnillos';

const PASOS: Array<{ n: number; titulo: string; texto: string; Icono: LucideIcon; agua: boolean }> =
  [
    {
      n: 1,
      titulo: 'Marcás el punto',
      texto: 'Señalás dónde se junta el agua y contás hasta dónde llega. No hace falta medir nada.',
      Icono: MapPin,
      agua: false,
    },
    {
      n: 2,
      titulo: 'Un técnico lo revisa',
      texto:
        'La municipalidad lo verifica antes de publicarlo. Si otro vecino ya lo marcó, se suman.',
      Icono: Search,
      agua: true,
    },
    {
      n: 3,
      titulo: 'Se publica en el mapa',
      texto: 'Queda visible con su severidad. Mientras más vecinos lo reporten, más peso tiene.',
      Icono: Layers,
      agua: false,
    },
    {
      n: 4,
      titulo: 'Sirve para priorizar',
      texto: 'El municipio decide dónde intervenir. Cuando se resuelve, el punto queda marcado.',
      Icono: ChartColumn,
      agua: true,
    },
  ];

/**
 * Portada pública (W-00 del prototipo): explica el sistema antes de pedir nada. El mapa sigue
 * siendo la entrada de la app —`/` no cambia—, así que esta página es para quien llega de fuera
 * y necesita saber qué es Mi Curichi.
 *
 * Las tres cifras del encabezado son datos reales: los puntos publicados salen del listado y el
 * número de distritos y de unidades vecinales, de las capas vigentes que sirve geo-service.
 */
export function Portada() {
  // En el celular esta portada está oculta por CSS pero React la monta igual. Sin esta condición
  // el mapa se inicializaba en un contenedor de tamaño cero y estas dos consultas salían para
  // nada, en el dispositivo donde menos sobra el ancho de banda.
  const visible = useEsEscritorio();
  const reportes = useQuery({
    queryKey: ['reportes', { limite: '60' }],
    queryFn: ({ signal }) => obtenerReportes({ limite: '60' }, signal),
    staleTime: 60_000,
    enabled: visible,
  });
  const capas = useQuery({
    queryKey: ['capas'],
    queryFn: ({ signal }) => obtenerCapas(signal),
    staleTime: 10 * 60_000,
    enabled: visible,
  });

  const distritos = capas.data?.find((c) => c.capa === 'distrito_municipal');
  const unidades = capas.data?.find((c) => c.capa === 'unidad_vecinal');
  const cifras: Array<[string | number, string]> = [
    [reportes.data?.total ?? '—', 'puntos publicados'],
    [distritos?.n_features ?? '—', 'distritos municipales'],
    [unidades?.n_features ?? '—', 'unidades vecinales'],
  ];

  return (
    <div className="bg-fondo">
      <section className="relative grid items-center gap-10 overflow-hidden bg-[linear-gradient(140deg,#06324A_0%,#0A4A69_48%,#1B6B38_100%)] px-6 py-12 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:px-11 md:py-[52px]">
        <PlanoAnillos opacidad={0.2} />
        <div className="relative z-10">
          <p className="text-[12.5px] font-bold tracking-[0.14em] text-white/80 uppercase">
            Santa Cruz de la Sierra
          </p>
          <h1 className="titular mt-3.5 text-[34px] leading-[1.05] text-white md:text-[44px]">
            Dónde se junta el agua cuando llueve fuerte
          </h1>
          <p className="mt-4 max-w-[46ch] text-[17px] leading-[1.55] text-white/95 md:text-[18px]">
            Un mapa hecho por los vecinos. Marcás el punto en dos minutos, un técnico lo revisa y la
            municipalidad usa el inventario para priorizar obras de drenaje.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/" className="btn bg-white text-tinta-900 no-underline hover:bg-white/90">
              Ver el mapa
            </Link>
            <Link
              href="/reportar"
              className="btn bg-transparent text-white no-underline shadow-[inset_0_0_0_1.5px_rgba(255,255,255,.55)] hover:bg-white/10"
            >
              Reportar un punto
            </Link>
          </div>
          <dl className="mt-8 flex flex-wrap gap-7">
            {cifras.map(([n, t]) => (
              <div key={t}>
                <dd className="titular text-[27px] font-bold text-white">{n}</dd>
                <dt className="text-[13.5px] text-white/80">{t}</dt>
              </div>
            ))}
          </dl>
        </div>
        <div className="relative z-10 h-[300px] overflow-hidden rounded-[20px] shadow-[0_8px_20px_rgba(15,45,67,.12),0_30px_70px_rgba(15,45,67,.18)]">
          {visible ? (
            <MapaDiferido
              className="map"
              ariaLabel="Vista general de los puntos publicados"
              reportes={reportes.data?.features ?? []}
              capas={capas.data ?? []}
              zoom={12}
              fijo
            />
          ) : null}
        </div>
      </section>

      <section className="px-6 py-10 md:px-11 md:py-12">
        <h2 className="titular text-[26px]">Cómo funciona</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(230px,1fr))]">
          {PASOS.map(({ n, titulo, texto, Icono, agua }) => (
            <div key={n} className="tarjeta px-[26px] py-6">
              <span
                className="grid h-[46px] w-[46px] place-items-center rounded-[14px]"
                style={{
                  background: agua ? 'var(--color-agua-100)' : 'var(--color-verde-100)',
                  color: agua ? 'var(--color-agua-700)' : 'var(--color-verde-700)',
                }}
              >
                <Icono size={23} aria-hidden="true" />
              </span>
              <p className="mt-4 text-[12.5px] font-bold tracking-[0.12em] text-tinta-600 uppercase">
                Paso {n}
              </p>
              <h3 className="titular mt-1.5 text-[19px]">{titulo}</h3>
              <p className="mt-2.5 text-[15.5px] leading-[1.55] text-tinta-600">{texto}</p>
            </div>
          ))}
        </div>

        <Aviso tono="tinta" className="mt-8">
          <b className="mb-1.5 block text-[15.5px] text-white">No es un canal de emergencia</b>
          Si hay riesgo para la vida, llamá al 911. Mi Curichi registra dónde se junta el agua para
          planificar obras; los reportes se revisan en días, no en minutos.
        </Aviso>
      </section>
    </div>
  );
}
