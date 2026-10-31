import { type Metadata, type Viewport } from 'next';
import { Inter, Manrope } from 'next/font/google';
import { type ReactNode } from 'react';
import { Providers } from '@/lib/providers';
import './globals.css';

// next/font downloads the fonts at build time and serves them from this app (no runtime calls to Google).
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Lifeline', template: '%s · Lifeline' },
  description: 'Healthcare Referral & Transfer Coordination',
  manifest: '/manifest.webmanifest',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#12304A',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-KE" className={`${inter.variable} ${manrope.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
