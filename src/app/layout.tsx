import { Outfit } from 'next/font/google';
import type { Metadata, Viewport } from 'next';
import './globals.css';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import 'simplebar-react/dist/simplebar.min.css';
import Providers from './providers';
import CookieConsentBanner from '@/components/legal/CookieConsentBanner';
import ServiceWorkerRegistrar from '@/components/pwa/ServiceWorkerRegistrar';

const outfit = Outfit({
  subsets: ['latin'],
});

// CSP com nonce por request exige render dinâmico em todas as rotas: uma
// página pré-renderizada no build teria scripts inline sem nonce e quebraria.
export const dynamic = 'force-dynamic';

// Splash do iOS (PWA fase 0): um PNG por tela de iPhone, em retrato.
const APPLE_SPLASHES = [
  { w: 1290, h: 2796, dw: 430, dh: 932, dpr: 3 },
  { w: 1179, h: 2556, dw: 393, dh: 852, dpr: 3 },
  { w: 1170, h: 2532, dw: 390, dh: 844, dpr: 3 },
  { w: 1125, h: 2436, dw: 375, dh: 812, dpr: 3 },
  { w: 828, h: 1792, dw: 414, dh: 896, dpr: 2 },
  { w: 750, h: 1334, dw: 375, dh: 667, dpr: 2 },
];

export const metadata: Metadata = {
  applicationName: 'My Finance',
  icons: {
    icon: [
      { url: '/images/logo/logo-icon.svg', type: 'image/svg+xml' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'My Finance',
    statusBarStyle: 'default',
    startupImage: APPLE_SPLASHES.map(({ w, h, dw, dh, dpr }) => ({
      url: `/icons/splash/apple-splash-${w}x${h}.png`,
      media: `(device-width: ${dw}px) and (device-height: ${dh}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`,
    })),
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)', color: '#18181b' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${outfit.className} dark:bg-gray-900`}>
        <Providers>{children}</Providers>
        <ServiceWorkerRegistrar />
        <CookieConsentBanner />
      </body>
    </html>
  );
}
