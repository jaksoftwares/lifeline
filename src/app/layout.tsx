import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: { default: 'Afyaline', template: '%s · Afyaline' },
  description:
    'Afyaline connects hospitals and ambulance providers to move patients between facilities faster, safer and at a known cost.',
};

export const viewport: Viewport = {
  themeColor: '#0d8a76',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
