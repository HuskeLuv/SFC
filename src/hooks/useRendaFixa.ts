import { useState, useEffect } from 'react';
import { RendaFixaData } from '@/types/rendaFixa';

export const useRendaFixa = () => {
  const [data, setData] = useState<RendaFixaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Por enquanto, vamos usar dados mockados
      // TODO: Implementar API real
      const mockData: RendaFixaData = {
        resumo: {
          necessidadeAporte: 5000,
          caixaParaInvestir: 12000,
          saldoInicioMes: 85000,
          saldoAtual: 87500,
          rendimento: 2500,
          rentabilidade: 2.94
        },
        secoes: [
          {
            tipo: 'pos-fixada',
            nome: 'Pós-fixada',
            ativos: [
              {
                id: '1',
                nome: 'CDB Banco do Brasil',
                percentualRentabilidade: 102.5,
                cotizacaoResgate: 'D+0',
                liquidacaoResgate: 'D+1',
                vencimento: new Date('2024-12-31'),
                benchmark: 'CDI',
                valorInicialAplicado: 15000,
                aporte: 2000,
                resgate: 0,
                valorAtualizado: 17500,
                percentualCarteira: 20.0,
                riscoPorAtivo: 15.5,
                rentabilidade: 3.2,
                observacoes: 'Liquidez diária',
                tipo: 'pos-fixada'
              },
              {
                id: '2',
                nome: 'LCI Itaú',
                percentualRentabilidade: 98.0,
                cotizacaoResgate: 'D+90',
                liquidacaoResgate: 'D+1',
                vencimento: new Date('2025-06-15'),
                benchmark: 'CDI',
                valorInicialAplicado: 25000,
                aporte: 0,
                resgate: 3000,
                valorAtualizado: 23800,
                percentualCarteira: 27.2,
                riscoPorAtivo: 22.1,
                rentabilidade: 2.8,
                observacoes: 'Isento de IR',
                tipo: 'pos-fixada'
              }
            ],
            totalValorAplicado: 40000,
            totalAporte: 2000,
            totalResgate: 3000,
            totalValorAtualizado: 41300,
            percentualTotal: 47.2,
            rentabilidadeMedia: 3.0
          },
          {
            tipo: 'prefixada',
            nome: 'Prefixada',
            ativos: [
              {
                id: '3',
                nome: 'Tesouro Prefixado 2027',
                percentualRentabilidade: 11.5,
                cotizacaoResgate: 'D+0',
                liquidacaoResgate: 'D+1',
                vencimento: new Date('2027-01-01'),
                benchmark: 'Prefixado',
                valorInicialAplicado: 20000,
                aporte: 1000,
                resgate: 0,
                valorAtualizado: 22100,
                percentualCarteira: 25.3,
                riscoPorAtivo: 20.8,
                rentabilidade: 4.5,
                observacoes: 'Marcação a mercado',
                tipo: 'prefixada'
              }
            ],
            totalValorAplicado: 20000,
            totalAporte: 1000,
            totalResgate: 0,
            totalValorAtualizado: 22100,
            percentualTotal: 25.3,
            rentabilidadeMedia: 4.5
          },
          {
            tipo: 'hibrida',
            nome: 'Híbrida',
            ativos: [
              {
                id: '4',
                nome: 'Tesouro IPCA+ 2029',
                percentualRentabilidade: 5.8,
                cotizacaoResgate: 'D+0',
                liquidacaoResgate: 'D+1',
                vencimento: new Date('2029-05-15'),
                benchmark: 'IPCA + 5.80%',
                valorInicialAplicado: 18000,
                aporte: 500,
                resgate: 1000,
                valorAtualizado: 19100,
                percentualCarteira: 21.8,
                riscoPorAtivo: 18.2,
                rentabilidade: 3.8,
                observacoes: 'Proteção inflacionária',
                tipo: 'hibrida'
              }
            ],
            totalValorAplicado: 18000,
            totalAporte: 500,
            totalResgate: 1000,
            totalValorAtualizado: 19100,
            percentualTotal: 21.8,
            rentabilidadeMedia: 3.8
          }
        ],
        totalGeral: {
          valorAplicado: 78000,
          aporte: 3500,
          resgate: 4000,
          valorAtualizado: 82500,
          rentabilidade: 3.4
        }
      };

      setData(mockData);
    } catch (err) {
      console.error('Erro ao buscar dados de renda fixa:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number): string => {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  const formatPercentage = (value: number): string => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  useEffect(() => {
    fetchData();
  }, []);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
    formatCurrency,
    formatPercentage,
  };
};
