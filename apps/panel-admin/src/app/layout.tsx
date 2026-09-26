import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { obtenerCiudad } from '@/lib/ciudad-servidor';
import { Proveedores } from './proveedores';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Panel técnico · Mi Curichi', template: '%s · Panel técnico · Mi Curichi' },
  description:
    'Panel técnico municipal de Mi Curichi: moderación, filtros, exportación e indicadores de reportes de inundación.',
  icons: { icon: '/icono.svg' },
  applicationName: 'Mi Curichi · Panel técnico',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0F2D43',
  width: 'device-width',
  initialScale: 1,
};

/**
 * La ciudad del despliegue se lee en el servidor, al atender la petición, y viaja con el HTML:
 * el mapa abre en su centro y las fechas salen en su zona horaria desde el primer render.
 * `lang` sigue siendo «es»: el locale de la ciudad es para `Intl`; los textos son en español.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const ciudad = await obtenerCiudad();
  return (
    <html lang="es">
      <body>
        <a
          href="#contenido"
          className="btn btn-primario sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
        >
          Ir al contenido
        </a>
        <Proveedores ciudad={ciudad}>{children}</Proveedores>
      </body>
    </html>
  );
}
