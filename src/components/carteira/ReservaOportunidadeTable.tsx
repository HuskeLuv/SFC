"use client";
import React, { useState, useMemo } from "react";
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

interface ReservaOportunidadeTableRowProps {
  ativo: {
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
  };
  formatCurrency: (value: number) => string;
  formatPercentage: (value: number) => string;
  onUpdateValorAtualizado?: (portfolioId: string, novoValor: number) => void;
}

const ReservaOportunidadeTableRow: React.FC<ReservaOportunidadeTableRowProps> = ({
  ativo,
  formatCurrency,
  formatPercentage,
  onUpdateValorAtualizado,
}) => {
  const [isEditingValor, setIsEditingValor] = useState(false);
  const [valorValue, setValorValue] = useState(ativo.valorAtualizado.toString());

  const handleValorSubmit = () => {
    if (!onUpdateValorAtualizado) return;
    
    const novoValor = parseFloat(valorValue);
    if (!isNaN(novoValor) && novoValor > 0) {
      onUpdateValorAtualizado(ativo.id, novoValor);
      setIsEditingValor(false);
    } else {
      setValorValue(ativo.valorAtualizado.toString());
      setIsEditingValor(false);
    }
  };

  const handleValorKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleValorSubmit();
    } else if (e.key === 'Escape') {
      setValorValue(ativo.valorAtualizado.toString());
      setIsEditingValor(false);
    }
  };

  return (
    <StandardTableRow>
      <StandardTableBodyCell align="left">{ativo.nome}</StandardTableBodyCell>
      <StandardTableBodyCell align="center">{ativo.cotizacaoResgate}</StandardTableBodyCell>
      <StandardTableBodyCell align="center">{ativo.liquidacaoResgate}</StandardTableBodyCell>
      <StandardTableBodyCell align="center">{ativo.vencimento.toLocaleDateString("pt-BR")}</StandardTableBodyCell>
      <StandardTableBodyCell align="center">{ativo.benchmark}</StandardTableBodyCell>
      <StandardTableBodyCell align="right">{formatCurrency(ativo.valorInicial)}</StandardTableBodyCell>
      <StandardTableBodyCell align="right">{formatCurrency(ativo.aporte)}</StandardTableBodyCell>
      <StandardTableBodyCell align="right">{formatCurrency(ativo.resgate)}</StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {isEditingValor ? (
          <div className="flex items-center justify-end space-x-1">
            <input
              type="number"
              step="0.01"
              value={valorValue}
              onChange={(e) => setValorValue(e.target.value)}
              onKeyDown={handleValorKeyPress}
              onBlur={handleValorSubmit}
              className="w-24 px-1 py-0.5 text-xs border border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              autoFocus
            />
          </div>
        ) : (
          <div 
            className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 rounded inline-block"
            onClick={() => onUpdateValorAtualizado && setIsEditingValor(true)}
            tabIndex={0}
            role="button"
            aria-label="Editar valor atual"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onUpdateValorAtualizado && setIsEditingValor(true);
              }
            }}
          >
            {formatCurrency(ativo.valorAtualizado)}
          </div>
        )}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">{formatPercentage(ativo.percentualCarteira)}</StandardTableBodyCell>
      <StandardTableBodyCell align="right">{formatPercentage(ativo.riscoAtivo)}</StandardTableBodyCell>
      <StandardTableBodyCell align="right">{formatPercentage(ativo.rentabilidade)}</StandardTableBodyCell>
      <StandardTableBodyCell align="center">{ativo.observacoes || "-"}</StandardTableBodyCell>
    </StandardTableRow>
  );
};

interface ReservaOportunidadeTableProps {
  totalCarteira?: number;
}

export default function ReservaOportunidadeTable({ totalCarteira = 0 }: ReservaOportunidadeTableProps) {
  const { data, loading, error, updateValorAtualizado } = useReservaOportunidade();

  // Calcular risco para cada ativo: (valorAtualizado / totalCarteira) * 100
  const ativosComRisco = useMemo(() => {
    if (totalCarteira <= 0) return data.ativos;
    
    return data.ativos.map(ativo => ({
      ...ativo,
      riscoAtivo: (ativo.valorAtualizado / totalCarteira) * 100,
    }));
  }, [data.ativos, totalCarteira]);

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

  const totais = ativosComRisco.reduce((acc, ativo) => ({
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
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Risco Por Ativo (Carteira Total)</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Rentab.</StandardTableHeaderCell>
              <StandardTableHeaderCell align="center" headerBgColor="#9E8A58">Observações</StandardTableHeaderCell>
            </StandardTableHeaderRow>
          </StandardTableHeader>
          <TableBody>
            {ativosComRisco.map((ativo) => (
              <ReservaOportunidadeTableRow
                key={ativo.id}
                ativo={ativo}
                formatCurrency={formatCurrency}
                formatPercentage={formatPercentage}
                onUpdateValorAtualizado={updateValorAtualizado}
              />
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
