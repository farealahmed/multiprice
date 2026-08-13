import type { Metadata } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';

import './globals.css';

// Self-hosted (not next/font/google) so the production Docker build doesn't
// depend on reaching fonts.gstatic.com — that fetch is flaky in CI/CD and
// previously failed the image build outright.
const marcellus = localFont({
  src: './fonts/marcellus-latin-400.woff2',
  variable: '--font-marcellus',
  weight: '400',
});

const notoSans = localFont({
  src: './fonts/noto-sans-latin-variable.woff2',
  variable: '--font-noto-sans',
  weight: '100 900',
});

const roboto = localFont({
  src: './fonts/roboto-latin-variable.woff2',
  variable: '--font-roboto',
  weight: '400 500',
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
