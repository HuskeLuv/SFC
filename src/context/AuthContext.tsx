'use client';

import { logger } from '@/lib/logger';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { useRouter } from 'next/navigation';
import { clearAppCaches, postClearCachesMessage } from '@/lib/pwa/swClient';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'consultant' | 'admin';
  avatarUrl?: string;
}

export interface CheckAuthOptions {
  /** Revalida sem ligar o isLoading (volta ao app após muito tempo em segundo plano). */
  silent?: boolean;
}

/** Ao voltar para o app depois deste tempo em segundo plano, revalida a sessão (renovação). */
const REVALIDATE_AFTER_HIDDEN_MS = 6 * 60 * 60 * 1000;

interface ActingClient {
  id: string;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  actingClient: ActingClient | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  logout: () => Promise<void>;
  requireAuth: () => boolean;
  checkAuth: (opts?: CheckAuthOptions) => Promise<void>;
  updateActingClient: (client: ActingClient | null) => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [actingClient, setActingClient] = useState<ActingClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastCheckRef = useRef(0);

  // Verificar se o usuário está autenticado
  const checkAuth = useCallback(async (opts?: CheckAuthOptions) => {
    // Cancel any in-flight request
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    lastCheckRef.current = Date.now();

    try {
      if (!opts?.silent) setLoading(true);
      // Usar cache: 'no-store' para garantir que sempre busque dados atualizados
      const response = await fetch('/api/auth/me', {
        cache: 'no-store',
        credentials: 'include',
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      if (response.ok) {
        const userData = await response.json();

        if (controller.signal.aborted) return;

        // Só atualizar o estado se os dados realmente mudaram
        // Isso evita re-renders desnecessários e loops infinitos
        setUser((prevUser) => {
          if (
            prevUser?.id === userData.id &&
            prevUser?.email === userData.email &&
            prevUser?.name === userData.name &&
            prevUser?.role === userData.role &&
            prevUser?.avatarUrl === userData.avatarUrl
          ) {
            return prevUser; // Retornar o mesmo objeto se nada mudou
          }
          return userData;
        });

        setActingClient((prevActingClient) => {
          const newActingClient = userData.actingClient ?? null;
          if (
            prevActingClient?.id === newActingClient?.id &&
            prevActingClient?.name === newActingClient?.name &&
            prevActingClient?.email === newActingClient?.email
          ) {
            return prevActingClient; // Retornar o mesmo objeto se nada mudou
          }
          return newActingClient;
        });

        setError(null);
        setLoading(false);
      } else {
        setUser(null);
        setActingClient(null);
        setError('Não autenticado');
        setLoading(false);
      }
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      // Revalidação silenciosa sem rede (app voltou do segundo plano offline): mantém a
      // sessão da tela; a próxima checagem decide.
      if (opts?.silent) return;
      setUser(null);
      setActingClient(null);
      setError('Erro ao verificar autenticação');
      setLoading(false);
    }
  }, []);

  // Fazer logout
  const logout = useCallback(async () => {
    try {
      // Chamar API de logout para limpar o cookie no servidor
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      logger.error('Erro ao fazer logout:', err);
      // Mesmo em caso de erro, limpar o estado local, os caches e redirecionar
    }

    // Limpar estado local
    setUser(null);
    setActingClient(null);

    // PWA: nada do app fica no aparelho depois do logout (a página offline fica).
    await clearAppCaches();
    postClearCachesMessage();

    // replace (e não router.push): recarga completa, sem estado em memória nem
    // voltar para a tela autenticada pelo histórico.
    window.location.replace('/signin');
  }, []);

  // Função para atualizar actingClient diretamente (útil após personificação)
  const updateActingClient = useCallback((client: ActingClient | null) => {
    setActingClient(client);
  }, []);

  // Verificar autenticação na inicialização
  useEffect(() => {
    checkAuth();
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [checkAuth]);

  // App aberto de novo depois de muito tempo em segundo plano (PWA): revalida em
  // silêncio — é o gatilho da renovação deslizante da sessão em /api/auth/me.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastCheckRef.current <= REVALIDATE_AFTER_HIDDEN_MS) return;
      void checkAuth({ silent: true });
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [checkAuth]);

  const isAuthenticated = !!user;
  const isLoading = loading;

  const requireAuth = useCallback(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/signin');
      return false;
    }
    return true;
  }, [isAuthenticated, isLoading, router]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      actingClient,
      isAuthenticated,
      isLoading,
      error,
      logout,
      requireAuth,
      checkAuth,
      updateActingClient,
      clearError,
    }),
    [
      user,
      actingClient,
      isAuthenticated,
      isLoading,
      error,
      logout,
      requireAuth,
      checkAuth,
      updateActingClient,
      clearError,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

/**
 * Como useAuth, mas devolve undefined fora do provider — para hooks que só
 * usam o user como conveniência (ex.: chave de localStorage) e precisam ser
 * testáveis isolados.
 */
export function useAuthOptional(): AuthContextType | undefined {
  return useContext(AuthContext);
}
