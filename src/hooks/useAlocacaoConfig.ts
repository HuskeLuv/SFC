import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { queryKeys } from '@/lib/queryKeys';
import { invalidatePortfolioDerivedQueries } from '@/lib/invalidatePortfolio';

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
  updateConfiguracao: (
    categoria: string,
    field: AlocacaoConfigField,
    valor: number | string,
  ) => void;
  saveChanges: () => Promise<boolean>;
  startEditing: (categoria: string, field: AlocacaoConfigField) => void;
  stopEditing: () => void;
  isEditing: (categoria: string, field: AlocacaoConfigField) => boolean;
  totalTargets: number;
  refetch: () => Promise<void>;
}

export const useAlocacaoConfig = (): UseAlocacaoConfigReturn => {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.alocacao.config();

  const [editingCell, setEditingCell] = useState<{
    categoria: string;
    field: AlocacaoConfigField;
  } | null>(null);

  // Local overrides for unsaved edits
  const [localEdits, setLocalEdits] = useState<AlocacaoConfig[] | null>(null);

  const {
    data: serverConfiguracoes = [],
    isLoading: loading,
    error: queryError,
    refetch: queryRefetch,
  } = useQuery<AlocacaoConfig[]>({
    queryKey,
    queryFn: async () => {
      const response = await fetch('/api/carteira/configuracao', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Erro ao buscar configurações');

      const data = await response.json();
      return data.configuracoes;
    },
  });

  const configuracoes = localEdits ?? serverConfiguracoes;

  const updateConfiguracao = useCallback(
    (categoria: string, field: AlocacaoConfigField, valor: number | string) => {
      const base = localEdits ?? serverConfiguracoes;
      const novasConfiguracoes = base.map((config) =>
        config.categoria === categoria ? { ...config, [field]: valor } : config,
      );
      setLocalEdits(novasConfiguracoes);
    },
    [localEdits, serverConfiguracoes],
  );

  const saveChanges = useCallback(async () => {
    try {
      const response = await csrfFetch('/api/carteira/configuracao', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configuracoes }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao salvar configurações');
      }

      // Sync cache with saved data and clear local edits
      queryClient.setQueryData<AlocacaoConfig[]>(queryKey, configuracoes);
      setLocalEdits(null);
      // Alocação afeta necessidadeAporte/quantoFalta agregados em CarteiraTabs +
      // qualquer view derivada da target alocação.
      invalidatePortfolioDerivedQueries(queryClient);
      return true;
    } catch (err) {
      console.error('Erro ao salvar configurações:', err);
      return false;
    }
  }, [configuracoes, csrfFetch, queryClient, queryKey]);

  const startEditing = useCallback((categoria: string, field: AlocacaoConfigField) => {
    setEditingCell({ categoria, field });
  }, []);

  const stopEditing = useCallback(() => {
    setEditingCell(null);
  }, []);

  const isEditing = useCallback(
    (categoria: string, field: AlocacaoConfigField) => {
      return editingCell?.categoria === categoria && editingCell?.field === field;
    },
    [editingCell],
  );

  const totalTargets = configuracoes
    .filter(
      (config) => config.categoria !== 'reservaEmergencia' && config.categoria !== 'imoveisBens',
    )
    .reduce((sum, config) => sum + config.target, 0);

  const refetch = useCallback(async () => {
    setLocalEdits(null);
    await queryRefetch();
  }, [queryRefetch]);

  return {
    configuracoes,
    loading,
    error: queryError ? (queryError as Error).message : null,
    updateConfiguracao,
    saveChanges,
    startEditing,
    stopEditing,
    isEditing,
    totalTargets,
    refetch,
  } satisfies UseAlocacaoConfigReturn;
};
