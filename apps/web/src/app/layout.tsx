import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@edunet/auth';
import { LocaleProvider } from '@/lib/i18n';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import { OfflineBanner } from '@/components/OfflineBanner';

export const metadata: Metadata = {
  title: 'EduNet - Education Platform',
  description: 'Production-grade, modular, secure, scalable education platform',
  applicationName: 'EduNet',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0284c7',
};

// Applies the theme class before paint to avoid a flash of the wrong theme.
const themeInitScript = `(function(){try{var t=localStorage.getItem('edunet-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');var l=localStorage.getItem('edunet-lang');if(l&&(l==='en'||l==='bn'))document.documentElement.lang=l;}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;600&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <LocaleProvider>
          <OfflineBanner />
          <AuthProvider>{children}</AuthProvider>
          <ServiceWorkerRegister />
        </LocaleProvider>
      </body>
    </html>
  );
}
