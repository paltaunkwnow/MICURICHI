import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Proveedores } from './proveedores';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Mi Curichi', template: '%s · Mi Curichi' },
  description:
    'Reporte ciudadano de puntos de inundación. Marcá dónde se junta el agua en tu barrio.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icono.svg', apple: '/icono.svg' },
  applicationName: 'Mi Curichi',
  appleWebApp: { capable: true, title: 'Mi Curichi', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#0F2D43',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 btn btn-primario"
        >
          Ir al contenido
        </a>
        <Proveedores>{children}</Proveedores>
      </body>
    </html>
  );
}
