import type { Metadata } from 'next';
import './globals.css';

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
    <html lang="id" className="h-full antialiased dark">
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100">{children}</body>
    </html>
  );
}
