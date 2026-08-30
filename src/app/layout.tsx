import { Outfit } from 'next/font/google';
import type { Metadata } from 'next';
import './globals.css';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import 'simplebar-react/dist/simplebar.min.css';
import Providers from './providers';
import CookieConsentBanner from '@/components/legal/CookieConsentBanner';

const outfit = Outfit({
  subsets: ['latin'],
});

// CSP com nonce por request exige render dinâmico em todas as rotas: uma
// página pré-renderizada no build teria scripts inline sem nonce e quebraria.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  icons: {
    icon: '/images/logo/logo-icon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${outfit.className} dark:bg-gray-900`}>
        <Providers>{children}</Providers>
        <CookieConsentBanner />
      </body>
    </html>
  );
}
