"use client";
import React from "react";
import { useReservaOportunidade } from "@/hooks/useReservaOportunidade";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ComponentCard from "@/components/common/ComponentCard";
import { StandardTable, StandardTableHeader, StandardTableHeaderRow, StandardTableHeaderCell, StandardTableBodyCell, StandardTableRow } from "@/components/ui/table/StandardTable";
import { TableBody } from "@/components/ui/table";

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
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-3">
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
              <h3 className="text-lg font-semibold text-black mb-2">
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
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-3">
        <ReservaOportunidadeMetricCard
          title="Saldo Início do Mês"
          value={formatCurrency(data.saldoInicioMes)}
        />
        <ReservaOportunidadeMetricCard
          title="Rendimento"
          value={formatCurrency(data.rendimento)}
          color="success"
        />
        <ReservaOportunidadeMetricCard
          title="Rentabilidade"
          value={formatPercentage(data.rentabilidade)}
          color="success"
        />
      </div>

      {/* Tabela principal */}
      <ComponentCard title="Reserva de Oportunidade - Detalhamento">
        <StandardTable>
          <StandardTableHeader sticky headerBgColor="#9E8A58">
            <StandardTableHeaderRow headerBgColor="#9E8A58">
              <StandardTableHeaderCell align="left" headerBgColor="#9E8A58">Nome dos Ativos</StandardTableHeaderCell>
              <StandardTableHeaderCell align="center" headerBgColor="#9E8A58">Cot. Resgate</StandardTableHeaderCell>
              <StandardTableHeaderCell align="center" headerBgColor="#9E8A58">Liq. Resgate</StandardTableHeaderCell>
              <StandardTableHeaderCell align="center" headerBgColor="#9E8A58">Vencimento</StandardTableHeaderCell>
              <StandardTableHeaderCell align="center" headerBgColor="#9E8A58">Benchmark</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Valor Inicial</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Aporte</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Resgate</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Valor Atual</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">% Carteira</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Risco</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Rentab.</StandardTableHeaderCell>
              <StandardTableHeaderCell align="center" headerBgColor="#9E8A58">Observações</StandardTableHeaderCell>
            </StandardTableHeaderRow>
          </StandardTableHeader>
          <TableBody>
            {data.ativos.map((ativo) => (
              <StandardTableRow key={ativo.id}>
                <StandardTableBodyCell align="left">{ativo.nome}</StandardTableBodyCell>
                <StandardTableBodyCell align="center">{ativo.cotizacaoResgate}</StandardTableBodyCell>
                <StandardTableBodyCell align="center">{ativo.liquidacaoResgate}</StandardTableBodyCell>
                <StandardTableBodyCell align="center">{ativo.vencimento.toLocaleDateString("pt-BR")}</StandardTableBodyCell>
                <StandardTableBodyCell align="center">{ativo.benchmark}</StandardTableBodyCell>
                <StandardTableBodyCell align="right">{formatCurrency(ativo.valorInicial)}</StandardTableBodyCell>
                <StandardTableBodyCell align="right">{formatCurrency(ativo.aporte)}</StandardTableBodyCell>
                <StandardTableBodyCell align="right">{formatCurrency(ativo.resgate)}</StandardTableBodyCell>
                <StandardTableBodyCell align="right">{formatCurrency(ativo.valorAtualizado)}</StandardTableBodyCell>
                <StandardTableBodyCell align="right">{formatPercentage(ativo.percentualCarteira)}</StandardTableBodyCell>
                <StandardTableBodyCell align="right">{formatPercentage(ativo.riscoAtivo)}</StandardTableBodyCell>
                <StandardTableBodyCell align="right">{formatPercentage(ativo.rentabilidade)}</StandardTableBodyCell>
                <StandardTableBodyCell align="center">{ativo.observacoes || "-"}</StandardTableBodyCell>
              </StandardTableRow>
            ))}

            {/* Linha de totalização */}
            <StandardTableRow isTotal>
              <StandardTableBodyCell align="left" isTotal>TOTAL GERAL</StandardTableBodyCell>
              <StandardTableBodyCell align="center" isTotal>-</StandardTableBodyCell>
              <StandardTableBodyCell align="center" isTotal>-</StandardTableBodyCell>
              <StandardTableBodyCell align="center" isTotal>-</StandardTableBodyCell>
              <StandardTableBodyCell align="center" isTotal>-</StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal>{formatCurrency(totais.valorInicial)}</StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal>{formatCurrency(totais.aporte)}</StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal>{formatCurrency(totais.resgate)}</StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal>{formatCurrency(totais.valorAtualizado)}</StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal>100.00%</StandardTableBodyCell>
              <StandardTableBodyCell align="center" isTotal>-</StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal>{formatPercentage(rentabilidadeTotal)}</StandardTableBodyCell>
              <StandardTableBodyCell align="center" isTotal>-</StandardTableBodyCell>
            </StandardTableRow>
          </TableBody>
        </StandardTable>
      </ComponentCard>
    </div>
  );
}
