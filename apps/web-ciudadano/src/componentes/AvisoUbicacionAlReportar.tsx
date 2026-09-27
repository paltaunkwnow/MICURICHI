'use client';

import Link from 'next/link';

/**
 * Lo que responde «Ir a mi ubicación» del mapa cuando el permiso todavía no se dio (plan
 * 2026-09-26, pedido F): la ubicación se pide solo dentro del reporte, así que el botón no
 * dispara el aviso del navegador y lo explica, con el camino para reportar a mano.
 */
export function AvisoUbicacionAlReportar({ alCerrar }: { alCerrar: () => void }) {
  return (
    <div className="tarjeta p-4" role="status" data-testid="aviso-ubicacion-al-reportar">
      <p className="text-[15px] leading-[1.45]">
        <b>Tu ubicación se pide solo al reportar un punto.</b> Así el mapa no te pregunta nada al
        abrirlo. Cuando la compartas en un reporte, este botón te va a llevar a donde estás.
      </p>
      <div className="mt-3 flex flex-wrap gap-2.5">
        <Link href="/reportar" className="btn btn-sm no-underline">
          Reportar un punto
        </Link>
        <button type="button" className="btn btn-fantasma btn-sm" onClick={alCerrar}>
          Entendido
        </button>
      </div>
    </div>
  );
}
