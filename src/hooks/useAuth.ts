import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
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
        setError(null);
      } else {
        setUser(null);
        setError('Não autenticado');
      }
    } catch {
      setUser(null);
      setError('Erro ao verificar autenticação');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fazer logout
  const logout = useCallback(async () => {
    try {
      // Limpar o cookie do token
      document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      setUser(null);
      router.push('/signin');
    } catch (err) {
      console.error('Erro ao fazer logout:', err);
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
    isAuthenticated,
    isLoading,
    error,
    logout,
    requireAuth,
    checkAuth,
    clearError: () => setError(null),
  };
}; 