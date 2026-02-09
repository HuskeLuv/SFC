import { useState, useEffect, useCallback } from 'react';

export interface AlocacaoConfig {
  categoria: string;
  minimo: number;
  maximo: number;
  target: number;
  descricao?: string;
}

export type AlocacaoConfigField = 'minimo' | 'maximo' | 'target' | 'descricao';

export interface UseAlocacaoConfigReturn {
  configuracoes: AlocacaoConfig[];
  loading: boolean;
  error: string | null;
  updateConfiguracao: (categoria: string, field: AlocacaoConfigField, valor: number | string) => void;
  saveChanges: () => Promise<boolean>;
  startEditing: (categoria: string, field: AlocacaoConfigField) => void;
  stopEditing: () => void;
  isEditing: (categoria: string, field: AlocacaoConfigField) => boolean;
  totalTargets: number;
  refetch: () => Promise<void>;
}

export const useAlocacaoConfig = (): UseAlocacaoConfigReturn => {
  const [configuracoes, setConfiguracoes] = useState<AlocacaoConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{
    categoria: string;
    field: AlocacaoConfigField;
  } | null>(null);

  // Buscar configurações do servidor
  const fetchConfiguracoes = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/carteira/configuracao', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erro ao buscar configurações');
      }

      const data = await response.json();
      setConfiguracoes(data.configuracoes);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, []);

  // Salvar configurações no servidor
  const saveConfiguracoes = useCallback(async (novasConfiguracoes: AlocacaoConfig[]) => {
    try {
      const response = await fetch('/api/carteira/configuracao', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ configuracoes: novasConfiguracoes }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao salvar configurações');
      }

      setConfiguracoes(novasConfiguracoes);
      setError(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      return false;
    }
  }, []);

  // Atualizar uma configuração específica
  const updateConfiguracao = useCallback((categoria: string, field: AlocacaoConfigField, valor: number | string) => {
    const novasConfiguracoes = configuracoes.map(config => 
      config.categoria === categoria 
        ? { ...config, [field]: valor }
        : config
    );
    setConfiguracoes(novasConfiguracoes);
  }, [configuracoes]);

  // Salvar alterações
  const saveChanges = useCallback(async () => {
    return await saveConfiguracoes(configuracoes);
  }, [configuracoes, saveConfiguracoes]);

  // Funções de edição
  const startEditing = useCallback((categoria: string, field: AlocacaoConfigField) => {
    setEditingCell({ categoria, field });
  }, []);

  const stopEditing = useCallback(() => {
    setEditingCell(null);
  }, []);

  const isEditing = useCallback((categoria: string, field: AlocacaoConfigField) => {
    return editingCell?.categoria === categoria && editingCell?.field === field;
  }, [editingCell]);

  // Buscar configurações na inicialização
  useEffect(() => {
    fetchConfiguracoes();
  }, [fetchConfiguracoes]);

  // Calcular total de targets (excluindo reservaEmergencia e imoveisBens)
  const totalTargets = configuracoes
    .filter((config) => config.categoria !== 'reservaEmergencia' && config.categoria !== 'imoveisBens')
    .reduce((sum, config) => sum + config.target, 0);

  return {
    configuracoes,
    loading,
    error,
    updateConfiguracao,
    saveChanges,
    startEditing,
    stopEditing,
    isEditing,
    totalTargets,
    refetch: fetchConfiguracoes,
  } satisfies UseAlocacaoConfigReturn;
}; 