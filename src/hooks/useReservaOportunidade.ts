"use client";
import { useState, useEffect } from "react";

export interface ReservaOportunidadeAtivo {
  id: string;
  nome: string;
  cotizacaoResgate: string;
  liquidacaoResgate: string;
  vencimento: Date;
  benchmark: string;
  valorInicial: number;
  aporte: number;
  resgate: number;
  valorAtualizado: number;
  percentualCarteira: number;
  riscoAtivo: number;
  rentabilidade: number;
  observacoes?: string;
}

export interface ReservaOportunidadeData {
  ativos: ReservaOportunidadeAtivo[];
  resumo: {
    necessidadeAporte: number;
    caixaParaInvestir: number;
    saldoInicioMes: number;
    rendimento: number;
    rentabilidade: number;
  };
}

export const useReservaOportunidade = () => {
  const [data, setData] = useState<ReservaOportunidadeData>({
    ativos: [],
    resumo: {
      necessidadeAporte: 0,
      caixaParaInvestir: 0,
      saldoInicioMes: 0,
      rendimento: 0,
      rentabilidade: 0,
    },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReservaOportunidade = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Retornar dados vazios por enquanto
      const emptyData: ReservaOportunidadeData = {
        ativos: [],
        resumo: {
          necessidadeAporte: 0,
          caixaParaInvestir: 0,
          saldoInicioMes: 0,
          rendimento: 0,
          rentabilidade: 0,
        },
      };
      
      setData(emptyData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReservaOportunidade();
  }, []);

  return {
    data,
    loading,
    error,
    refetch: fetchReservaOportunidade,
  };
};
