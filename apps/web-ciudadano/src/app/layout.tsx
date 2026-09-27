import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { BarraSuperior } from '@/componentes/BarraSuperior';
import { obtenerCiudad } from '@/lib/ciudad-servidor';
import { Proveedores } from './proveedores';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Mi Curichi', template: '%s · Mi Curichi' },
  description:
    'Reporte ciudadano de puntos de inundación. Marcá dónde se junta el agua en tu barrio.',
  manifest: '/manifest.webmanifest',
  // El único PNG que queda: iOS no acepta WebP como apple-touch-icon. En la interfaz el logo va en
  // WebP (`/logo.webp`).
  icons: { icon: '/icono.svg', apple: '/logo.png' },
  applicationName: 'Mi Curichi',
  appleWebApp: { capable: true, title: 'Mi Curichi', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#0F2D43',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/**
 * Armazón de la app. La barra superior solo existe en escritorio; en móvil navega la barra
 * inferior, que cada pantalla coloca porque no todas la llevan (el flujo de reporte, por
 * ejemplo, ocupa la pantalla entera a propósito).
 *
 * La ciudad de la instalación se lee aquí, en el servidor y antes del primer HTML, y se reparte por
 * contexto: ninguna pantalla puede enseñar otra ciudad ni un instante. Leerla obliga a generar las
 * páginas al pedirlas y no al compilar (ver `ciudad-servidor.ts`).
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const ciudad = await obtenerCiudad();
  return (
    <html lang="es">
      <body>
        <a
          href="#contenido"
          className="btn sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
        >
          Ir al contenido
        </a>
        <Proveedores ciudad={ciudad}>
          {/* Altura definida, no mínima: el mapa necesita que su contenedor sepa cuánto mide para
              poder ocuparlo entero. Con `min-h-dvh` la cadena de flex se resolvía por contenido y
              la columna del mapa crecía hasta la altura de la lista, dejando el mapa sin sitio.
              Lo que desplaza es `main`, así que las pantallas de texto siguen haciendo scroll. */}
          <div className="flex h-dvh flex-col">
            <BarraSuperior />
            <main id="contenido" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {children}
            </main>
          </div>
        </Proveedores>
      </body>
    </html>
  );
}
