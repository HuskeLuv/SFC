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
      
      // TODO: Substituir por chamada real da API
      // const response = await fetch('/api/carteira/reserva-emergencia');
      // const data = await response.json();
      
      // Dados de exemplo para visualização
      const mockData: ReservaEmergenciaData = {
        ativos: [
          {
            id: "1",
            nome: "CDB Banco do Brasil 100% CDI",
            cotizacaoResgate: "D+0",
            liquidacaoResgate: "D+1",
            vencimento: new Date("2024-12-31"),
            benchmark: "CDI",
            valorInicial: 50000,
            aporte: 5000,
            resgate: 0,
            valorAtualizado: 55250,
            percentualCarteira: 35.2,
            riscoAtivo: 5.0,
            rentabilidade: 10.5,
          },
          {
            id: "2",
            nome: "LCI Banco Inter 95% CDI",
            cotizacaoResgate: "D+0",
            liquidacaoResgate: "D+1",
            vencimento: new Date("2025-03-15"),
            benchmark: "CDI",
            valorInicial: 30000,
            aporte: 2000,
            resgate: 1000,
            valorAtualizado: 31800,
            percentualCarteira: 20.3,
            riscoAtivo: 3.0,
            rentabilidade: 6.0,
          },
          {
            id: "3",
            nome: "Tesouro Selic 2029",
            cotizacaoResgate: "D+1",
            liquidacaoResgate: "D+1",
            vencimento: new Date("2029-03-01"),
            benchmark: "SELIC",
            valorInicial: 40000,
            aporte: 3000,
            resgate: 0,
            valorAtualizado: 41200,
            percentualCarteira: 26.3,
            riscoAtivo: 2.0,
            rentabilidade: 5.5,
          },
          {
            id: "4",
            nome: "Fundo DI Itaú",
            cotizacaoResgate: "D+0",
            liquidacaoResgate: "D+1",
            vencimento: new Date("2024-12-31"),
            benchmark: "CDI",
            valorInicial: 25000,
            aporte: 1000,
            resgate: 500,
            valorAtualizado: 25500,
            percentualCarteira: 16.3,
            riscoAtivo: 4.0,
            rentabilidade: 2.0,
          },
          {
            id: "5",
            nome: "Poupança Caixa",
            cotizacaoResgate: "D+0",
            liquidacaoResgate: "D+0",
            vencimento: new Date("2024-12-31"),
            benchmark: "Poupança",
            valorInicial: 10000,
            aporte: 500,
            resgate: 0,
            valorAtualizado: 10100,
            percentualCarteira: 6.4,
            riscoAtivo: 1.0,
            rentabilidade: 1.0,
          },
        ],
        saldoInicioMes: 150000,
        rendimento: 1850,
        rentabilidade: 6.8,
      };
      
      setData(mockData);
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
