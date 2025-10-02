"use client";
import { useState, useEffect } from "react";

export interface ReservaEmergenciaAtivo {
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
}

export interface ReservaEmergenciaData {
  ativos: ReservaEmergenciaAtivo[];
  saldoInicioMes: number;
  rendimento: number;
  rentabilidade: number;
}

export const useReservaEmergencia = () => {
  const [data, setData] = useState<ReservaEmergenciaData>({
    ativos: [],
    saldoInicioMes: 0,
    rendimento: 0,
    rentabilidade: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReservaEmergencia = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Retornar dados vazios por enquanto
      const emptyData: ReservaEmergenciaData = {
        ativos: [],
        saldoInicioMes: 0,
        rendimento: 0,
        rentabilidade: 0,
      };
      
      setData(emptyData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReservaEmergencia();
  }, []);

  return {
    data,
    loading,
    error,
    refetch: fetchReservaEmergencia,
  };
};
