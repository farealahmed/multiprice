import type { Metadata } from 'next';
import { Marcellus, Noto_Sans, Roboto } from 'next/font/google';
import type { ReactNode } from 'react';

import './globals.css';

const marcellus = Marcellus({
  subsets: ['latin'],
  variable: '--font-marcellus',
  weight: '400',
});

const notoSans = Noto_Sans({
  subsets: ['latin'],
  variable: '--font-noto-sans',
});

const roboto = Roboto({
  subsets: ['latin'],
  variable: '--font-roboto',
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: 'Tallymark',
  description: 'Multi-rate pricing workspace',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${marcellus.variable} ${notoSans.variable} ${roboto.variable}`}>
      <body>{children}</body>
    </html>
  );
}
