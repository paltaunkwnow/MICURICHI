import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <a
          href="#contenido"
          className="btn btn-primario sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
        >
          Ir al contenido
        </a>
        <Proveedores>{children}</Proveedores>
      </body>
    </html>
  );
}
