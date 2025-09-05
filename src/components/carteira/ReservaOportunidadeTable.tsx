"use client";
import React from "react";
import { useReservaOportunidade } from "@/hooks/useReservaOportunidade";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ComponentCard from "@/components/common/ComponentCard";
import Badge from "@/components/ui/badge/Badge";

interface ReservaOportunidadeMetricCardProps {
  title: string;
  value: string;
  color?: "primary" | "success" | "warning" | "error";
}

const ReservaOportunidadeMetricCard: React.FC<ReservaOportunidadeMetricCardProps> = ({
  title,
  value,
  color = "primary",
}) => {
  const colorClasses = {
    primary: "bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-100",
    success: "bg-green-50 text-green-900 dark:bg-green-900/20 dark:text-green-100",
    warning: "bg-yellow-50 text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-100",
    error: "bg-red-50 text-red-900 dark:bg-red-900/20 dark:text-red-100",
  };

  return (
    <div className={`rounded-lg p-4 ${colorClasses[color]}`}>
      <p className="text-xs font-medium opacity-80 mb-1">{title}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
};

export default function ReservaOportunidadeTable() {
  const { data, loading, error } = useReservaOportunidade();

  const formatCurrency = (value: number): string => {
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const formatPercentage = (value: number): string => {
    return `${value.toFixed(2)}%`;
  };

  if (loading) {
    return <LoadingSpinner text="Carregando dados de reserva de oportunidade..." />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
            Erro ao carregar dados
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!data || data.ativos.length === 0) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          <ReservaOportunidadeMetricCard
            title="Necessidade de Aporte"
            value={formatCurrency(0)}
            color="warning"
          />
          <ReservaOportunidadeMetricCard
            title="Caixa para Investir"
            value={formatCurrency(0)}
            color="success"
          />
          <ReservaOportunidadeMetricCard
            title="Saldo Início do Mês"
            value={formatCurrency(0)}
          />
          <ReservaOportunidadeMetricCard
            title="Rendimento"
            value={formatCurrency(0)}
            color="success"
          />
          <ReservaOportunidadeMetricCard
            title="Rentabilidade"
            value={formatPercentage(0)}
            color="success"
          />
        </div>

        <ComponentCard title="Reserva de Oportunidade - Detalhamento">
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Nenhum investimento encontrado
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Adicione seus primeiros investimentos de reserva de oportunidade para começar.
              </p>
            </div>
          </div>
        </ComponentCard>
      </div>
    );
  }

  const totais = data.ativos.reduce((acc, ativo) => ({
    valorInicial: acc.valorInicial + ativo.valorInicial,
    aporte: acc.aporte + ativo.aporte,
    resgate: acc.resgate + ativo.resgate,
    valorAtualizado: acc.valorAtualizado + ativo.valorAtualizado,
  }), { valorInicial: 0, aporte: 0, resgate: 0, valorAtualizado: 0 });

  const rentabilidadeTotal = totais.valorInicial > 0 
    ? ((totais.valorAtualizado - totais.valorInicial) / totais.valorInicial) * 100 
    : 0;

  return (
    <div className="space-y-4">
      {/* Cards de resumo */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <ReservaOportunidadeMetricCard
          title="Necessidade de Aporte"
          value={formatCurrency(data.resumo.necessidadeAporte)}
          color="warning"
        />
        <ReservaOportunidadeMetricCard
          title="Caixa para Investir"
          value={formatCurrency(data.resumo.caixaParaInvestir)}
          color="success"
        />
        <ReservaOportunidadeMetricCard
          title="Saldo Início do Mês"
          value={formatCurrency(data.resumo.saldoInicioMes)}
        />
        <ReservaOportunidadeMetricCard
          title="Rendimento"
          value={formatCurrency(data.resumo.rendimento)}
          color="success"
        />
        <ReservaOportunidadeMetricCard
          title="Rentabilidade"
          value={formatPercentage(data.resumo.rentabilidade)}
          color="success"
        />
      </div>

      {/* Tabela principal */}
      <ComponentCard title="Reserva de Oportunidade - Detalhamento">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Nome dos Ativos
                </th>
                <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Cot. Resgate
                </th>
                <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Liq. Resgate
                </th>
                <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Vencimento
                </th>
                <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Benchmark
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Valor Inicial
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Aporte
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Resgate
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Valor Atual
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  % Carteira
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Risco
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Rentab.
                </th>
                <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Observações
                </th>
              </tr>
            </thead>
            <tbody>
              {data.ativos.map((ativo) => (
                <tr key={ativo.id} className="border-b border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50">
                  <td className="px-2 py-2 text-xs font-medium text-gray-900 dark:text-white">
                    {ativo.nome}
                  </td>
                  <td className="px-2 py-2 text-xs text-center text-gray-700 dark:text-gray-300">
                    {ativo.cotizacaoResgate}
                  </td>
                  <td className="px-2 py-2 text-xs text-center text-gray-700 dark:text-gray-300">
                    {ativo.liquidacaoResgate}
                  </td>
                  <td className="px-2 py-2 text-xs text-center text-gray-700 dark:text-gray-300">
                    {ativo.vencimento.toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-2 py-2 text-xs text-center text-gray-700 dark:text-gray-300">
                    {ativo.benchmark}
                  </td>
                  <td className="px-2 py-2 text-xs text-right font-medium text-gray-900 dark:text-white">
                    {formatCurrency(ativo.valorInicial)}
                  </td>
                  <td className="px-2 py-2 text-xs text-right font-medium text-green-600 dark:text-green-400">
                    {formatCurrency(ativo.aporte)}
                  </td>
                  <td className="px-2 py-2 text-xs text-right font-medium text-red-600 dark:text-red-400">
                    {formatCurrency(ativo.resgate)}
                  </td>
                  <td className="px-2 py-2 text-xs text-right font-semibold text-gray-900 dark:text-white">
                    {formatCurrency(ativo.valorAtualizado)}
                  </td>
                  <td className="px-2 py-2 text-xs text-right">
                    <Badge 
                      color={ativo.percentualCarteira > 25 ? "warning" : "primary"} 
                      size="sm"
                    >
                      {formatPercentage(ativo.percentualCarteira)}
                    </Badge>
                  </td>
                  <td className="px-2 py-2 text-xs text-right">
                    <Badge 
                      color={ativo.riscoAtivo > 20 ? "error" : "primary"} 
                      size="sm"
                    >
                      {formatPercentage(ativo.riscoAtivo)}
                    </Badge>
                  </td>
                  <td className="px-2 py-2 text-xs text-right">
                    <Badge 
                      color={ativo.rentabilidade >= 3 ? "success" : "primary"} 
                      size="sm"
                    >
                      {formatPercentage(ativo.rentabilidade)}
                    </Badge>
                  </td>
                  <td className="px-2 py-2 text-xs text-center text-gray-700 dark:text-gray-300">
                    {ativo.observacoes || "-"}
                  </td>
                </tr>
              ))}

              {/* Linha de totalização */}
              <tr className="bg-gray-50 dark:bg-gray-800 border-t-2 border-gray-300 dark:border-gray-600">
                <td className="px-2 py-2 text-xs font-bold text-gray-900 dark:text-white">
                  TOTAL GERAL
                </td>
                <td className="px-2 py-2 text-xs text-center">-</td>
                <td className="px-2 py-2 text-xs text-center">-</td>
                <td className="px-2 py-2 text-xs text-center">-</td>
                <td className="px-2 py-2 text-xs text-center">-</td>
                <td className="px-2 py-2 text-xs text-right font-bold text-gray-900 dark:text-white">
                  {formatCurrency(totais.valorInicial)}
                </td>
                <td className="px-2 py-2 text-xs text-right font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(totais.aporte)}
                </td>
                <td className="px-2 py-2 text-xs text-right font-bold text-red-600 dark:text-red-400">
                  {formatCurrency(totais.resgate)}
                </td>
                <td className="px-2 py-2 text-xs text-right font-bold text-gray-900 dark:text-white">
                  {formatCurrency(totais.valorAtualizado)}
                </td>
                <td className="px-2 py-2 text-xs text-right">
                  <Badge color="primary" size="sm">100.00%</Badge>
                </td>
                <td className="px-2 py-2 text-xs text-center">-</td>
                <td className="px-2 py-2 text-xs text-right">
                  <Badge 
                    color={rentabilidadeTotal >= 3 ? "success" : "primary"} 
                    size="sm"
                  >
                    {formatPercentage(rentabilidadeTotal)}
                  </Badge>
                </td>
                <td className="px-2 py-2 text-xs text-center">-</td>
              </tr>
            </tbody>
          </table>
        </div>
      </ComponentCard>
    </div>
  );
}
