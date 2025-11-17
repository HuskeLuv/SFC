import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'consultant' | 'admin';
  avatarUrl?: string;
}

interface ActingClient {
  id: string;
  name: string;
  email: string;
}

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [actingClient, setActingClient] = useState<ActingClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Verificar se o usuário está autenticado
  const checkAuth = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/auth/me');
      
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        setActingClient(userData.actingClient ?? null);
        setError(null);
      } else {
        setUser(null);
        setActingClient(null);
        setError('Não autenticado');
      }
    } catch {
      setUser(null);
      setActingClient(null);
      setError('Erro ao verificar autenticação');
    } finally {
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
      
      // Limpar estado local
      setUser(null);
      setActingClient(null);
      
      // Redirecionar para a tela de login
      router.push('/signin');
    } catch (err) {
      console.error('Erro ao fazer logout:', err);
      // Mesmo em caso de erro, limpar o estado local e redirecionar
      setUser(null);
      setActingClient(null);
      router.push('/signin');
    }
  }, [router]);

  // Verificar autenticação na inicialização
  useEffect(() => {
    checkAuth();
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

  return {
    user,
    actingClient,
    isAuthenticated,
    isLoading,
    error,
    logout,
    requireAuth,
    checkAuth,
    clearError: () => setError(null),
  };
}; 