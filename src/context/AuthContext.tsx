"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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

interface AuthContextType {
  user: User | null;
  actingClient: ActingClient | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  logout: () => Promise<void>;
  requireAuth: () => boolean;
  checkAuth: () => Promise<void>;
  updateActingClient: (client: ActingClient | null) => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [actingClient, setActingClient] = useState<ActingClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Verificar se o usuário está autenticado
  const checkAuth = useCallback(async () => {
    try {
      setLoading(true);
      // Usar cache: 'no-store' para garantir que sempre busque dados atualizados
      const response = await fetch('/api/auth/me', {
        cache: 'no-store',
        credentials: 'include',
      });
      
      if (response.ok) {
        const userData = await response.json();
        
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
      } else {
        setUser((prevUser) => {
          if (prevUser === null) return null; // Já está null, não precisa atualizar
          return null;
        });
        setActingClient((prevActingClient) => {
          if (prevActingClient === null) return null; // Já está null, não precisa atualizar
          return null;
        });
        setError('Não autenticado');
      }
    } catch {
      setUser((prevUser) => {
        if (prevUser === null) return null; // Já está null, não precisa atualizar
        return null;
      });
      setActingClient((prevActingClient) => {
        if (prevActingClient === null) return null; // Já está null, não precisa atualizar
        return null;
      });
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

  // Função para atualizar actingClient diretamente (útil após personificação)
  const updateActingClient = useCallback((client: ActingClient | null) => {
    setActingClient(client);
  }, []);

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

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

