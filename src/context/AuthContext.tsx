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

/** Tempo máximo de cada etapa do logout antes de seguir para o /signin mesmo assim. */
const LOGOUT_ETAPA_TIMEOUT_MS = 3000;

/** Espera a promessa ou `ms`, o que vier primeiro. Nunca lança por causa do tempo. */
function ateNoMaximo<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  return Promise.race([promise, limite]).finally(() => clearTimeout(timer));
}

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

/**
 * Só 401/403 significam sessão recusada. 429 (rate limit de /api/auth/me) e 5xx são
 * falhas passageiras: sem usuário na tela, tenta de novo algumas vezes; com usuário,
 * mantém a sessão e a próxima checagem decide.
 */
const TRANSIENT_RETRIES = 2;
const MAX_RETRY_DELAY_MS = 5000;

function isSessionRejected(status: number): boolean {
  return status === 401 || status === 403;
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers?.get('Retry-After'));
  const ms = retryAfter > 0 ? retryAfter * 1000 : 1000 * (attempt + 1);
  return Math.min(ms, MAX_RETRY_DELAY_MS);
}

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
  // Usuário atual para o checkAuth (estável) decidir se uma falha passageira derruba a sessão.
  const userRef = useRef<User | null>(null);
  userRef.current = user;

  // Verificar se o usuário está autenticado
  const checkAuth = useCallback(async (opts?: CheckAuthOptions) => {
    // Cancel any in-flight request
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    lastCheckRef.current = Date.now();

    try {
      if (!opts?.silent) setLoading(true);
      let response: Response;
      for (let attempt = 0; ; attempt++) {
        // Usar cache: 'no-store' para garantir que sempre busque dados atualizados
        response = await fetch('/api/auth/me', {
          cache: 'no-store',
          credentials: 'include',
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (response.ok || isSessionRejected(response.status)) break;

        // Falha passageira com usuário na tela: não derruba a sessão.
        if (userRef.current) {
          setError('Falha temporária ao verificar autenticação');
          setLoading(false);
          return;
        }
        if (attempt >= TRANSIENT_RETRIES) break;
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs(response, attempt)));
        if (controller.signal.aborted) return;
      }

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
      // Chamar API de logout para limpar o cookie no servidor. Com teto: no app instalado
      // (Android) a resposta já ficou presa sem nunca resolver e o "Sair" não fazia nada.
      await ateNoMaximo(
        fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'include',
        }),
        LOGOUT_ETAPA_TIMEOUT_MS,
      );
    } catch (err) {
      logger.error('Erro ao fazer logout:', err);
      // Mesmo em caso de erro, limpar o estado local, os caches e redirecionar
    }

    // Limpar estado local
    setUser(null);
    setActingClient(null);

    // PWA: nada do app fica no aparelho depois do logout (a página offline fica). Também com
    // teto: a limpeza do CacheStorage nunca pode segurar a saída para o /signin.
    postClearCachesMessage();
    await ateNoMaximo(clearAppCaches(), LOGOUT_ETAPA_TIMEOUT_MS);

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
