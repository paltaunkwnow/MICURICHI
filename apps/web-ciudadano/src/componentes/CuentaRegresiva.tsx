'use client';

import { useEffect, useState } from 'react';
import { segundosQueFaltan, textoCuentaRegresiva } from '@/lib/publicacion';
import { TEXTO_SIN_VERIFICAR } from '@/lib/verificacion';

/**
 * Segundos que faltan para la publicación, actualizados cada segundo mientras falte algo.
 *
 * Parte de los segundos que calculó el servidor (`segundos_para_publicar`) en el momento en que
 * llegó la respuesta (`recibidoEn`), y usa el reloj del teléfono solo como cronómetro: con la
 * hora del teléfono mal puesta, comparar contra `publicar_en` diría cualquier cosa.
 */
export function useSegundosQueFaltan(segundos: number, recibidoEn: number): number {
  const [ahora, setAhora] = useState(() => Date.now());
  const faltan = segundosQueFaltan(segundos, recibidoEn, ahora);
  const terminada = faltan <= 0;

  // Un solo intervalo mientras dura la cuenta; al llegar a cero se apaga solo.
  useEffect(() => {
    if (terminada) return;
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(reloj);
  }, [terminada]);

  return faltan;
}

/**
 * «Se publica en 3:59», y al llegar a cero «Ya está publicado · recargá el mapa para verlo».
 *
 * El texto cambia cada segundo, así que NO va en una región viva (un lector de pantalla lo leería
 * sin parar): `role="timer"` es justamente eso. El aviso de «ya está publicado» sí se anuncia, una
 * vez, en su propia región.
 */
export function CuentaRegresiva({
  segundos,
  recibidoEn,
  className = '',
}: {
  segundos: number;
  recibidoEn: number;
  className?: string;
}) {
  const faltan = useSegundosQueFaltan(segundos, recibidoEn);
  return (
    <span className={className} data-testid="cuenta-regresiva" data-faltan={faltan}>
      {faltan > 0 ? (
        // `aria-live="off"` explícito: puede estar dentro de una región viva (la confirmación).
        <span role="timer" aria-live="off">
          {textoCuentaRegresiva(faltan)}
        </span>
      ) : (
        <span role="status">{textoCuentaRegresiva(0)}</span>
      )}
    </span>
  );
}

/**
 * Lo que pasa con el reporte recién enviado, debajo de la cuenta. «Hasta entonces no aparece en el
 * mapa» vale solo mientras falta algo: con la demora en 0, o ya cumplida, contradiría el «Ya está
 * publicado» de arriba. Sin los segundos del servidor (`null`) se avisa la espera sin cifra.
 */
export function TextoTrasEnviar({
  segundos,
  recibidoEn,
}: {
  segundos: number | null;
  recibidoEn: number;
}) {
  const faltan = useSegundosQueFaltan(segundos ?? 0, recibidoEn);
  const publicado = segundos !== null && faltan <= 0;
  return (
    <>
      {segundos === null ? 'Se publica en el mapa en unos minutos. ' : ''}
      {publicado ? 'Se ve' : 'Hasta entonces no aparece en el mapa. Después se ve'} con la marca{' '}
      <b>«{TEXTO_SIN_VERIFICAR}»</b> hasta que un técnico municipal lo revise: si corresponde queda
      «Verificado», y si no, lo retira del mapa.
    </>
  );
}
