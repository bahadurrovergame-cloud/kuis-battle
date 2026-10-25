import type { Metadata, Viewport } from 'next';
import './globals.css';
import ThemeInitializer from '@/components/ThemeInitializer';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: 'resizes-content',
};

export const metadata: Metadata = {
  title: 'Kuis Battle Panggung - Cerdas Cermat Realtime',
  description: 'Aplikasi Kuis Cepat Tepat Realtime Multi-Device untuk Panggung Lomba',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className="h-full antialiased dark" suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100">
        <ThemeInitializer />
        {children}
      </body>
    </html>
  );
}
