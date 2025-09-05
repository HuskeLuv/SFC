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
      
      // Dados de exemplo para visualização
      const mockData: ReservaOportunidadeData = {
        ativos: [
          {
            id: "1",
            nome: "CDB Banco Inter 110% CDI",
            cotizacaoResgate: "D+0",
            liquidacaoResgate: "D+1",
            vencimento: new Date("2025-06-30"),
            benchmark: "CDI",
            valorInicial: 100000,
            aporte: 10000,
            resgate: 0,
            valorAtualizado: 112000,
            percentualCarteira: 28.5,
            riscoAtivo: 8.2,
            rentabilidade: 12.0,
            observacoes: "Oportunidade de alta rentabilidade com liquidez diária",
          },
          {
            id: "2",
            nome: "LCI Banco Original 105% CDI",
            cotizacaoResgate: "D+0",
            liquidacaoResgate: "D+1",
            vencimento: new Date("2025-12-15"),
            benchmark: "CDI",
            valorInicial: 80000,
            aporte: 5000,
            resgate: 2000,
            valorAtualizado: 85000,
            percentualCarteira: 21.6,
            riscoAtivo: 6.1,
            rentabilidade: 6.25,
            observacoes: "Isento de IR para pessoa física",
          },
          {
            id: "3",
            nome: "Tesouro IPCA+ 2026",
            cotizacaoResgate: "D+1",
            liquidacaoResgate: "D+1",
            vencimento: new Date("2026-08-15"),
            benchmark: "IPCA+",
            valorInicial: 120000,
            aporte: 15000,
            resgate: 0,
            valorAtualizado: 130500,
            percentualCarteira: 33.2,
            riscoAtivo: 9.4,
            rentabilidade: 8.75,
            observacoes: "Proteção contra inflação com rentabilidade atrativa",
          },
          {
            id: "4",
            nome: "Fundo DI BTG Pactual",
            cotizacaoResgate: "D+0",
            liquidacaoResgate: "D+1",
            vencimento: new Date("2024-12-31"),
            benchmark: "CDI",
            valorInicial: 60000,
            aporte: 3000,
            resgate: 1000,
            valorAtualizado: 62000,
            percentualCarteira: 15.8,
            riscoAtivo: 4.4,
            rentabilidade: 3.33,
            observacoes: "Gestão profissional com histórico consistente",
          },
          {
            id: "5",
            nome: "CDB Banco Safra 108% CDI",
            cotizacaoResgate: "D+0",
            liquidacaoResgate: "D+1",
            vencimento: new Date("2025-03-20"),
            benchmark: "CDI",
            valorInicial: 50000,
            aporte: 2000,
            resgate: 0,
            valorAtualizado: 52500,
            percentualCarteira: 13.4,
            riscoAtivo: 3.7,
            rentabilidade: 5.0,
            observacoes: "Curto prazo com boa rentabilidade",
          },
        ],
        resumo: {
          necessidadeAporte: 25000,
          caixaParaInvestir: 50000,
          saldoInicioMes: 400000,
          rendimento: 25000,
          rentabilidade: 7.2,
        },
      };
      
      setData(mockData);
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
