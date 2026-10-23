import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@edunet/auth';

export const metadata: Metadata = {
  title: 'EduNet - Education Platform',
  description: 'Production-grade, modular, secure, scalable education platform',
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
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
