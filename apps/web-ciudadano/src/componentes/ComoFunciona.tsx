'use client';

import { CONFIG_DOMINIO, NOTA_METODOLOGICA, type Severidad } from 'contracts';
import {
  ChartColumn,
  CircleQuestionMark,
  Layers,
  type LucideIcon,
  MapPin,
  Search,
  TriangleAlert,
  WavesHorizontal,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { colorSeveridad, etiquetaSeveridad, SEVERIDADES_ORDEN } from '@/lib/formato';
import { Aviso } from './Aviso';
import { BarraInferior } from './BarraInferior';

type Pestana = 'pasos' | 'colores' | 'limites';

const PASOS: Array<{ Icono: LucideIcon; agua: boolean; titulo: string; texto: string }> = [
  {
    Icono: MapPin,
    agua: false,
    titulo: '1 · Marcás el punto',
    texto:
      'Señalás dónde se junta el agua y contás hasta dónde llega. Menos de dos minutos, y no hace falta medir nada.',
  },
  {
    Icono: Search,
    agua: true,
    titulo: '2 · Un técnico lo revisa',
    texto:
      'La municipalidad lo verifica antes de publicarlo. Si otro vecino ya lo marcó, los reportes se suman en el mismo punto.',
  },
  {
    Icono: Layers,
    agua: false,
    titulo: '3 · Se publica en el mapa',
    texto:
      'Queda visible para todos con su severidad. Mientras más vecinos lo reporten, más peso tiene.',
  },
  {
    Icono: ChartColumn,
    agua: true,
    titulo: '4 · Sirve para priorizar obras',
    texto:
      'El municipio usa el inventario para decidir dónde intervenir. Cuando se resuelve, el punto queda marcado como resuelto.',
  },
];

const QUE_VE_EL_VECINO: Record<Severidad, string> = {
  baja: 'Molesta al caminar',
  media: 'Cuesta pasar',
  alta: 'No pasan los autos',
  critica: 'Entra a las casas',
};

const LIMITES: Array<{ Icono: LucideIcon; fuerte: string; texto: string; rojo?: boolean }> = [
  {
    Icono: TriangleAlert,
    fuerte: 'No es un canal de emergencia.',
    texto: 'Si hay riesgo para la vida, llamá al 911.',
    rojo: true,
  },
  {
    Icono: WavesHorizontal,
    fuerte: 'No es un estudio hidráulico.',
    texto: 'Son datos de percepción de vecinos, no mediciones de campo.',
  },
  {
    Icono: CircleQuestionMark,
    fuerte: 'Sin puntos no es zona segura.',
    texto: 'Que nadie haya reportado no significa que no se anegue.',
  },
];

/**
 * «Cómo funciona» (C-06 del prototipo): tres pestañas para que ninguna obligue a desplazarse
 * largo en un celular. El contenido es el mismo que ya explicaba la página, reordenado.
 */
export function ComoFunciona() {
  const [pestana, setPestana] = useState<Pestana>('pasos');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto w-full max-w-3xl flex-1 px-5 pt-5 pb-10 md:px-6 md:pt-8">
        <div className="hero hero-azul p-[22px]">
          <div className="flex h-[34px] items-end gap-1.5" aria-hidden="true">
            {[11, 18, 26, 34].map((alto, i) => (
              <span
                key={alto}
                className="w-[13px] rounded-[3px]"
                style={{
                  height: alto,
                  background: `rgba(255,255,255,${[0.55, 0.7, 0.85, 1][i]})`,
                }}
              />
            ))}
          </div>
          <h1 className="titular mt-4 text-[25px] text-white">
            Cuando llueve fuerte, medio barrio se inunda y nadie lo anota
          </h1>
          <p className="mt-2.5 text-[15.5px] leading-[1.5] text-white">
            Sin registro de dónde se junta el agua, las obras de drenaje se priorizan a ciegas.
          </p>
        </div>

        <div className="tabs mt-4" role="tablist" aria-label="Secciones">
          {(
            [
              ['pasos', 'Los pasos'],
              ['colores', 'Los colores'],
              ['limites', 'Qué no es'],
            ] as Array<[Pestana, string]>
          ).map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              role="tab"
              id={`tab-${valor}`}
              aria-selected={pestana === valor}
              aria-controls={`panel-${valor}`}
              onClick={() => setPestana(valor)}
            >
              {texto}
            </button>
          ))}
        </div>

        {pestana === 'pasos' ? (
          <div id="panel-pasos" role="tabpanel" aria-labelledby="tab-pasos" className="mt-4">
            <div className="grid gap-3">
              {PASOS.map(({ Icono, agua, titulo, texto }) => (
                <div
                  key={titulo}
                  className="tarjeta grid grid-cols-[46px_minmax(0,1fr)] items-start gap-3.5 px-[18px] py-4"
                >
                  <span
                    className="grid h-[46px] w-[46px] place-items-center rounded-[14px]"
                    style={{
                      background: agua ? 'var(--color-agua-100)' : 'var(--color-verde-100)',
                      color: agua ? 'var(--color-agua-700)' : 'var(--color-verde-700)',
                    }}
                  >
                    <Icono size={23} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="titular text-[16.5px]">{titulo}</h2>
                    <p className="mt-[7px] text-[14.5px] leading-[1.5] text-tinta-600">{texto}</p>
                  </div>
                </div>
              ))}
            </div>

            <h2 className="glbl">Cómo sabemos en qué unidad vecinal cae tu punto</h2>
            <p className="text-[15.5px] leading-[1.55] text-tinta-600">
              No te lo preguntamos: lo calcula el sistema. Con la coordenada de tu reporte hace una
              operación geométrica (punto en polígono) contra las capas oficiales de distritos y
              unidades vecinales que entrega la municipalidad. Así todos los reportes quedan
              comparables, aunque nadie sepa de memoria en qué unidad vecinal vive. Cuando varios
              caen a menos de {CONFIG_DOMINIO.RECURRENCIA_RADIO_M} metros entre sí, se agrupan como
              un mismo punto crítico sin perder ninguno.
            </p>

            <h2 className="glbl">Privacidad</h2>
            <ul className="grid gap-2.5">
              <li className="fila">
                Para enviar un reporte hace falta una cuenta; para ver el mapa, no. Tu nombre y tu
                correo los ve solo el equipo municipal: el mapa público nunca muestra quién reportó.
              </li>
              <li className="fila">
                Si el punto está sobre una vivienda o predio, el mapa público lo desplaza hasta{' '}
                {CONFIG_DOMINIO.JITTER_PUBLICO_M} metros y no muestra la dirección.
              </li>
              <li className="fila">
                A las fotos les quitamos los metadatos, incluida la ubicación que graba la cámara.
              </li>
            </ul>

            <Link href="/reportar" className="btn btn-bloque mt-4 no-underline">
              Reportar un punto
            </Link>
          </div>
        ) : null}

        {pestana === 'colores' ? (
          <div id="panel-colores" role="tabpanel" aria-labelledby="tab-colores" className="mt-4">
            <p className="mb-3.5 text-[15.5px] leading-[1.5] text-tinta-600">
              Cada punto lleva un color y su nombre escrito. La severidad la calcula el sistema con
              lo que declaró el vecino, no la elige una persona.
            </p>
            <div className="tarjeta grid gap-3.5 px-[18px] py-4">
              {[...SEVERIDADES_ORDEN].reverse().map((s) => {
                const c = colorSeveridad(s);
                return (
                  <div key={s} className="flex items-center gap-3">
                    <span
                      className="flex h-[22px] flex-none items-end gap-[3px]"
                      aria-hidden="true"
                    >
                      {[1, 2, 3, 4].map((i) => (
                        <i
                          key={i}
                          className="block w-[7px] rounded-[2px]"
                          style={{
                            height: i <= c.barras ? 8 + c.barras * 4 : 9,
                            background: i <= c.barras ? c.relleno : '#DCE3DF',
                          }}
                        />
                      ))}
                    </span>
                    <span className="w-[58px] flex-none text-[15.5px] font-semibold">
                      {etiquetaSeveridad(s)}
                    </span>
                    <span className="text-[14.5px] text-tinta-600">{QUE_VE_EL_VECINO[s]}</span>
                  </div>
                );
              })}
            </div>

            <h2 className="glbl">De dónde sale el número</h2>
            <p className="text-[15.5px] leading-[1.55] text-tinta-600">
              Cada respuesta vale de 1 a 4 puntos y el tirante pesa doble, porque es lo que más
              riesgo trae para personas y vehículos.
            </p>
            <p className="mt-2.5 rounded-2xl bg-tinta-100 p-4 text-center font-semibold">
              puntaje = 2 × tirante + duración + frecuencia + afectación
            </p>
            <table className="tabla mt-3">
              <caption className="sr-only">Bandas de severidad según el puntaje</caption>
              <thead>
                <tr>
                  <th scope="col">Puntaje</th>
                  <th scope="col">Severidad</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['5 a 8', 'Baja'],
                  ['9 a 12', 'Media'],
                  ['13 a 16', 'Alta'],
                  ['17 a 20', 'Crítica'],
                ].map(([p, s]) => (
                  <tr key={p}>
                    <td>{p}</td>
                    <td className="font-semibold">{s}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[15px] leading-[1.55] text-tinta-600">
              Hay tres reglas que solo pueden subir la severidad, nunca bajarla: si el agua pasa la
              cintura el punto es crítico; si entra a las viviendas o corta la vía y pasa en cada
              lluvia fuerte es al menos alta; y si el agua está siempre es al menos media, porque
              eso indica una falla de drenaje.
            </p>
            <Aviso tono="info" className="mt-3.5">
              Un punto marcado como resuelto es uno donde el municipio ya intervino.
            </Aviso>
          </div>
        ) : null}

        {pestana === 'limites' ? (
          <div id="panel-limites" role="tabpanel" aria-labelledby="tab-limites" className="mt-4">
            <div className="grid gap-2.5">
              {LIMITES.map(({ Icono, fuerte, texto, rojo }) => (
                <div
                  key={fuerte}
                  className="flex items-center gap-3 rounded-xl px-4 py-3.5"
                  style={{ background: rojo ? '#FBE1DC' : 'var(--color-fondo)' }}
                >
                  <span
                    className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[11px] bg-white"
                    style={{ color: rojo ? '#8A1908' : 'var(--color-tinta-600)' }}
                  >
                    <Icono size={18} aria-hidden="true" />
                  </span>
                  <span
                    className="text-[14.5px] leading-[1.4]"
                    style={{ color: rojo ? '#8A1908' : 'var(--color-tinta-600)' }}
                  >
                    <b>{fuerte}</b> {texto}
                  </span>
                </div>
              ))}
            </div>
            <Aviso tono="tinta" className="mt-4">
              {NOTA_METODOLOGICA}
            </Aviso>
            <h2 className="glbl">Qué pasa después de que reportás</h2>
            <p className="text-[15.5px] leading-[1.55] text-tinta-600">
              Tu reporte queda en revisión. Un técnico municipal lo valida, lo rechaza si no
              corresponde, o lo marca como duplicado de otro. Recién cuando lo valida aparece en el
              mapa público: eso es lo que evita que el inventario se llene de repetidos.
            </p>
          </div>
        ) : null}
      </div>
      <BarraInferior />
    </div>
  );
}
