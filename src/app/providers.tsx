'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { getQueryClient } from '@/lib/queryClient';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';
import { SidebarProvider } from '@/context/SidebarContext';
import { ValoresOcultosProvider } from '@/context/ValoresOcultosContext';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import { AssinaturasChaveContext } from '@/hooks/usePlano';

const VALORES_OCULTOS_DESLIGADO = { habilitado: false, inicial: false };

export default function Providers({
  children,
  valoresOcultos = VALORES_OCULTOS_DESLIGADO,
  assinaturasHabilitadas = false,
}: {
  children: React.ReactNode;
  /** Esconder valores: flag e cookie lidos no RootLayout (preferência do aparelho). */
  valoresOcultos?: { habilitado: boolean; inicial: boolean };
  /** Chave ASSINATURAS_HABILITADAS lida no RootLayout; desligada = usePlano sem /me ('adv'). */
  assinaturasHabilitadas?: boolean;
}) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <AssinaturasChaveContext.Provider value={assinaturasHabilitadas}>
        <ThemeProvider>
          {/* Fora do AuthProvider: a preferência é do aparelho e vale na personificação. */}
          <ValoresOcultosProvider
            habilitado={valoresOcultos.habilitado}
            inicial={valoresOcultos.inicial}
          >
            <AuthProvider>
              <SidebarProvider>
                <ErrorBoundary>{children}</ErrorBoundary>
              </SidebarProvider>
            </AuthProvider>
          </ValoresOcultosProvider>
        </ThemeProvider>
      </AssinaturasChaveContext.Provider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
