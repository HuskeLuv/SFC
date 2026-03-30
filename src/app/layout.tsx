import { Outfit } from 'next/font/google';
import type { Metadata } from 'next';
import './globals.css';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import 'simplebar-react/dist/simplebar.min.css';
import Providers from './providers';

const outfit = Outfit({
  subsets: ['latin'],
});

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
      </body>
    </html>
  );
}
