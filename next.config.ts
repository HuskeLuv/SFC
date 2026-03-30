import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Desabilita source maps em produção para reduzir tamanho do bundle
  productionBrowserSourceMaps: false,

  // Remove o header X-Powered-By por segurança
  poweredByHeader: false,

  // Habilita strict mode do React
  reactStrictMode: true,

  // Otimização de imagens
  images: {
    formats: ['image/avif', 'image/webp'],
  },

  // Configurações para resolver problemas de build no Vercel
  experimental: {
    // Configurações experimentais válidas para Next.js 15
    optimizePackageImports: [
      'lucide-react',
      'tailwind-merge',
      'framer-motion',
      '@fullcalendar/core',
    ],
    // Desabilita avisos de enumeração de params (necessário para ApexCharts)
    dynamicIO: false,
  },

  // Configurações de build
  typescript: {
    // Ignora erros de TypeScript durante o build (útil para deploy)
    ignoreBuildErrors: false,
  },

  // Configurações de ESLint
  eslint: {
    // Ignora erros de ESLint durante o build
    ignoreDuringBuilds: false,
  },

  // Configurações de webpack
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ['@svgr/webpack'],
    });

    // Resolve problemas de módulos
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };

    return config;
  },

  // Configurações de headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
