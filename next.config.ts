import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Configurações para resolver problemas de build no Vercel
  experimental: {
    // Configurações experimentais válidas para Next.js 15
    optimizePackageImports: ["lucide-react", "tailwind-merge"],
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
      use: ["@svgr/webpack"],
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
