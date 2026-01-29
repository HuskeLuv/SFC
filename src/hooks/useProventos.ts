import { useState, useEffect } from 'react';

export interface ProventoData {
  id: string;
  data: string;
  symbol: string;
  ativo: string;
  tipo: string;
  classe?: string;
  valor: number;
  quantidade: number;
  valorUnitario: number;
  status: 'realizado' | 'a_receber';
}

export interface GroupedProventoData {
  total: number;
  count: number;
  items: ProventoData[];
  invested?: number;
  currentValue?: number;
  dividendYield?: number;
  yoc?: number;
}

export interface SummaryBucket {
  total: number;
  count: number;
}

interface UseProventosResult {
  proventos: ProventoData[];
  grouped: Record<string, GroupedProventoData>;
  monthly: Record<string, SummaryBucket>;
  yearly: Record<string, SummaryBucket>;
  total: number;
  media: number;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export const useProventos = (
  startDate?: string,
  endDate?: string,
  groupBy: 'ativo' | 'classe' | 'tipo' = 'ativo'
): UseProventosResult => {
  const [proventos, setProventos] = useState<ProventoData[]>([]);
  const [grouped, setGrouped] = useState<Record<string, GroupedProventoData>>({});
  const [monthly, setMonthly] = useState<Record<string, SummaryBucket>>({});
  const [yearly, setYearly] = useState<Record<string, SummaryBucket>>({});
  const [total, setTotal] = useState(0);
  const [media, setMedia] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProventos = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      params.append('groupBy', groupBy);
      
      const response = await fetch(`/api/analises/proventos?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('Erro ao buscar dados de proventos');
      }
      
      const data = await response.json();
      setProventos(data.proventos || []);
      setGrouped(data.grouped || {});
      setMonthly(data.monthly || {});
      setYearly(data.yearly || {});
      setTotal(data.total || 0);
      setMedia(data.media || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      setProventos([]);
      setGrouped({});
      setMonthly({});
      setYearly({});
      setTotal(0);
      setMedia(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchProventos();
  }, [startDate, endDate, groupBy]);

  return {
    proventos,
    grouped,
    monthly,
    yearly,
    total,
    media,
    loading,
    error,
    refetch: fetchProventos,
  };
};


