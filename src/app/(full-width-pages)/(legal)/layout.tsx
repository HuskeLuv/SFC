import { ThemeProvider } from '@/context/ThemeContext';
import Image from 'next/image';
import Link from 'next/link';
import React from 'react';
import LegalFooter from '@/components/legal/LegalFooter';

/**
 * Layout das páginas legais (Política de Privacidade, Termos de Uso,
 * Subprocessadores). Acessível sem login — usuário precisa ler antes de
 * aceitar/cadastrar.
 *
 * Header simples com logo + link "Entrar"; conteúdo centralizado; footer
 * com links cruzados entre as páginas legais e contato do DPO.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <div className="flex min-h-screen flex-col bg-white dark:bg-gray-900">
        <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/95">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/images/logo/logo-icon.svg" alt="Logo" width={32} height={32} />
              <span className="text-sm font-semibold text-gray-900 dark:text-white">MyFinance</span>
            </Link>
            <Link
              href="/signin"
              className="text-sm font-medium text-brand-500 hover:text-brand-600 dark:hover:text-brand-400"
            >
              Entrar
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">{children}</main>
        <LegalFooter />
      </div>
    </ThemeProvider>
  );
}
