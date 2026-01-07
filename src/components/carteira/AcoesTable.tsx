"use client";
import React, { useState } from "react";
import { useAcoes } from "@/hooks/useAcoes";
import { AcaoAtivo, AcaoSecao } from "@/types/acoes";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ComponentCard from "@/components/common/ComponentCard";
import Badge from "@/components/ui/badge/Badge";
import { ChevronDownIcon, ChevronUpIcon, DollarLineIcon } from "@/icons";
import { useCarteiraResumoContext } from "@/context/CarteiraResumoContext";
import { StandardTable, StandardTableHeader, StandardTableHeaderRow, StandardTableHeaderCell, StandardTableRow, StandardTableBodyCell, TableBody } from "@/components/ui/table/StandardTable";

interface AcoesMetricCardProps {
  title: string;
  value: string;
  color?: "primary" | "success" | "warning" | "error";
}

const AcoesMetricCard: React.FC<AcoesMetricCardProps> = ({
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

interface AcoesTableRowProps {
  ativo: AcaoAtivo;
  formatCurrency: (value: number) => string;
  formatPercentage: (value: number) => string;
  formatNumber: (value: number) => string;
  onUpdateObjetivo: (ativoId: string, novoObjetivo: number) => void;
}

const AcoesTableRow: React.FC<AcoesTableRowProps> = ({
  ativo,
  formatCurrency,
  formatPercentage,
  formatNumber,
  onUpdateObjetivo,
}) => {
  const [isEditingObjetivo, setIsEditingObjetivo] = useState(false);
  const [objetivoValue, setObjetivoValue] = useState(ativo.objetivo.toString());

  const handleObjetivoSubmit = () => {
    const novoObjetivo = parseFloat(objetivoValue);
    if (!isNaN(novoObjetivo) && novoObjetivo >= 0) {
      onUpdateObjetivo(ativo.id, novoObjetivo);
      setIsEditingObjetivo(false);
    }
  };

  const handleObjetivoKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleObjetivoSubmit();
    } else if (e.key === 'Escape') {
      setObjetivoValue(ativo.objetivo.toString());
      setIsEditingObjetivo(false);
    }
  };

  const getSetorColor = (setor: string) => {
    const colors = {
      'financeiro': 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
      'energia': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
      'consumo': 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
      'saude': 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
      'tecnologia': 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300',
      'industria': 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300',
      'materiais': 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300',
      'utilidades': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300',
      'outros': 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300',
    };
    return colors[setor as keyof typeof colors] || colors.outros;
  };

  return (
    <StandardTableRow>
      <StandardTableBodyCell align="left">
        <div>
          <div className="font-semibold">{ativo.ticker}</div>
          <div className="text-xs">{ativo.nome}</div>
          {ativo.observacoes && (
            <div className="text-xs mt-1">
              {ativo.observacoes}
            </div>
          )}
        </div>
      </StandardTableBodyCell>
      <StandardTableBodyCell align="center">
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium">
          {ativo.setor.charAt(0).toUpperCase() + ativo.setor.slice(1)}
        </span>
      </StandardTableBodyCell>
      <StandardTableBodyCell align="center">
        {ativo.subsetor}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {formatNumber(ativo.quantidade)}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {formatCurrency(ativo.precoAquisicao)}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {formatCurrency(ativo.valorTotal)}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        <span className="font-medium">
          {formatCurrency(ativo.cotacaoAtual)}
        </span>
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {formatCurrency(ativo.valorAtualizado)}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {formatPercentage(ativo.riscoPorAtivo)}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {formatPercentage(ativo.percentualCarteira)}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {isEditingObjetivo ? (
          <div className="flex items-center space-x-1">
            <input
              type="number"
              step="0.01"
              value={objetivoValue}
              onChange={(e) => setObjetivoValue(e.target.value)}
              onKeyDown={handleObjetivoKeyPress}
              onBlur={handleObjetivoSubmit}
              className="w-16 px-1 py-0.5 text-xs border border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              autoFocus
            />
            <span className="text-xs">%</span>
          </div>
        ) : (
          <div 
            className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 rounded"
            onClick={() => setIsEditingObjetivo(true)}
          >
            {formatPercentage(ativo.objetivo)}
          </div>
        )}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {formatPercentage(ativo.quantoFalta)}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        <span>
          {formatCurrency(ativo.necessidadeAporte)}
        </span>
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {formatPercentage(ativo.rentabilidade)}
      </StandardTableBodyCell>
    </StandardTableRow>
  );
};

interface AcoesSectionProps {
  secao: AcaoSecao;
  formatCurrency: (value: number) => string;
  formatPercentage: (value: number) => string;
  formatNumber: (value: number) => string;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdateObjetivo: (ativoId: string, novoObjetivo: number) => void;
}

const AcoesSection: React.FC<AcoesSectionProps> = ({
  secao,
  formatCurrency,
  formatPercentage,
  formatNumber,
  isExpanded,
  onToggle,
  onUpdateObjetivo,
}) => {
  const getEstrategiaColor = (estrategia: string) => {
    const colors = {
      'value': 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
      'growth': 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
      'risk': 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
    };
    return colors[estrategia as keyof typeof colors] || colors.value;
  };

  return (
    <>
      {/* Cabeçalho da seção */}
      <StandardTableRow 
        className="bg-gray-100 dark:bg-gray-800 cursor-pointer"
        onClick={onToggle}
      >
        <StandardTableBodyCell align="left">
          <div className="flex items-center space-x-2">
            {isExpanded ? (
              <ChevronUpIcon className="w-4 h-4" />
            ) : (
              <ChevronDownIcon className="w-4 h-4" />
            )}
            <span className="font-bold">{secao.nome}</span>
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium">
              {secao.estrategia.toUpperCase()}
            </span>
            {secao.ativos.length} {secao.ativos.length === 1 ? 'ação' : 'ações'}
          </div>
        </StandardTableBodyCell>
        <StandardTableBodyCell align="center">-</StandardTableBodyCell>
        <StandardTableBodyCell align="center">-</StandardTableBodyCell>
        <StandardTableBodyCell align="right" className="font-semibold">
          {formatNumber(secao.totalQuantidade)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="center">-</StandardTableBodyCell>
        <StandardTableBodyCell align="right" className="font-semibold">
          {formatCurrency(secao.totalValorAplicado)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="center">-</StandardTableBodyCell>
        <StandardTableBodyCell align="right" className="font-semibold">
          {formatCurrency(secao.totalValorAtualizado)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right">
          {formatPercentage(secao.totalRisco)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right">
          {formatPercentage(secao.totalPercentualCarteira)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right">
          {formatPercentage(secao.totalObjetivo)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right">
          {formatPercentage(secao.totalQuantoFalta)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right" className="font-semibold">
          <span>
            {formatCurrency(secao.totalNecessidadeAporte)}
          </span>
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right">
          {formatPercentage(secao.rentabilidadeMedia)}
        </StandardTableBodyCell>
      </StandardTableRow>

      {/* Ativos da seção */}
      {isExpanded && secao.ativos.map((ativo) => (
        <AcoesTableRow
          key={ativo.id}
          ativo={ativo}
          formatCurrency={formatCurrency}
          formatPercentage={formatPercentage}
          formatNumber={formatNumber}
          onUpdateObjetivo={onUpdateObjetivo}
        />
      ))}
    </>
  );
};

export default function AcoesTable() {
  const { data, loading, error, formatCurrency, formatPercentage, formatNumber, updateObjetivo } = useAcoes();
  const { necessidadeAporteMap } = useCarteiraResumoContext();
  const necessidadeAporteTotalCalculada = necessidadeAporteMap.acoes ?? data?.resumo?.necessidadeAporteTotal ?? 0;
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['value', 'growth', 'risk'])
  );

  const toggleSection = (estrategia: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(estrategia)) {
      newExpanded.delete(estrategia);
    } else {
      newExpanded.add(estrategia);
    }
    setExpandedSections(newExpanded);
  };

  const handleUpdateObjetivo = async (ativoId: string, novoObjetivo: number) => {
    await updateObjetivo(ativoId, novoObjetivo);
  };

  if (loading) {
    return <LoadingSpinner text="Carregando dados Ações..." />;
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

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <AcoesMetricCard
            title="Necessidade de Aporte Total"
            value={formatCurrency(necessidadeAporteTotalCalculada)}
            color="warning"
          />
          <AcoesMetricCard
            title="Caixa para Investir"
            value={formatCurrency(0)}
            color="success"
          />
          <AcoesMetricCard
            title="Saldo Início do Mês"
            value={formatCurrency(0)}
          />
          <AcoesMetricCard
            title="Valor Atualizado"
            value={formatCurrency(0)}
          />
          <AcoesMetricCard
            title="Rendimento"
            value={formatCurrency(0)}
            color="success"
          />
          <AcoesMetricCard
            title="Rentabilidade"
            value={formatPercentage(0)}
            color="success"
          />
        </div>

        <ComponentCard title="Ações - Detalhamento">
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
              <DollarLineIcon className="w-8 h-8 text-gray-400" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-black mb-2">
                Nenhuma ação encontrada
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
                Adicione ações para começar a acompanhar sua carteira de ações.
              </p>
            </div>
          </div>
        </ComponentCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cards de resumo */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <AcoesMetricCard
          title="Necessidade de Aporte Total"
          value={formatCurrency(necessidadeAporteTotalCalculada)}
          color="warning"
        />
        <AcoesMetricCard
          title="Caixa para Investir"
          value={formatCurrency(data.resumo.caixaParaInvestir)}
          color="success"
        />
        <AcoesMetricCard
          title="Saldo Início do Mês"
          value={formatCurrency(data.resumo.saldoInicioMes)}
        />
        <AcoesMetricCard
          title="Valor Atualizado"
          value={formatCurrency(data.resumo.valorAtualizado)}
        />
        <AcoesMetricCard
          title="Rendimento"
          value={formatCurrency(data.resumo.rendimento)}
          color="success"
        />
        <AcoesMetricCard
          title="Rentabilidade"
          value={formatPercentage(data.resumo.rentabilidade)}
          color="success"
        />
      </div>

      {/* Tabela principal */}
      <ComponentCard title="Ações - Detalhamento">
        <StandardTable>
          <StandardTableHeader sticky headerBgColor="#9E8A58">
            <StandardTableHeaderRow headerBgColor="#9E8A58">
              <StandardTableHeaderCell align="left" headerBgColor="#9E8A58">Nome do Ativo</StandardTableHeaderCell>
              <StandardTableHeaderCell align="center" headerBgColor="#9E8A58">Setor</StandardTableHeaderCell>
              <StandardTableHeaderCell align="center" headerBgColor="#9E8A58">Subsetor</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Quantidade</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Preço Médio</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Valor Total</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Cotação Atual</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Valor Atualizado</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Risco por Ativo</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">% da Carteira</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Objetivo</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Quanto Falta</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Nec. Aporte R$</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Rentabilidade</StandardTableHeaderCell>
            </StandardTableHeaderRow>
          </StandardTableHeader>
          <TableBody>
              {data.secoes.map((secao) => (
                <AcoesSection
                  key={secao.estrategia}
                  secao={secao}
                  formatCurrency={formatCurrency}
                  formatPercentage={formatPercentage}
                  formatNumber={formatNumber}
                  isExpanded={expandedSections.has(secao.estrategia)}
                  onToggle={() => toggleSection(secao.estrategia)}
                  onUpdateObjetivo={handleUpdateObjetivo}
                />
              ))}

              {/* Linha de totalização */}
              <StandardTableRow isTotal>
                <StandardTableBodyCell align="left" isTotal>
                  TOTAL GERAL
                </StandardTableBodyCell>
                <StandardTableBodyCell align="center" isTotal>-</StandardTableBodyCell>
                <StandardTableBodyCell align="center" isTotal>-</StandardTableBodyCell>
                <StandardTableBodyCell align="right" isTotal>
                  {formatNumber(data.totalGeral.quantidade)}
                </StandardTableBodyCell>
                <StandardTableBodyCell align="center" isTotal>-</StandardTableBodyCell>
                <StandardTableBodyCell align="right" isTotal>
                  {formatCurrency(data.totalGeral.valorAplicado)}
                </StandardTableBodyCell>
                <StandardTableBodyCell align="center" isTotal>-</StandardTableBodyCell>
                <StandardTableBodyCell align="right" isTotal>
                  {formatCurrency(data.totalGeral.valorAtualizado)}
                </StandardTableBodyCell>
                <StandardTableBodyCell align="right" isTotal>
                  {formatPercentage(data.totalGeral.risco)}
                </StandardTableBodyCell>
                <StandardTableBodyCell align="right" isTotal>
                  100.00%
                </StandardTableBodyCell>
                <StandardTableBodyCell align="right" isTotal>
                  {formatPercentage(data.totalGeral.objetivo)}
                </StandardTableBodyCell>
                <StandardTableBodyCell align="right" isTotal>
                  {formatPercentage(data.totalGeral.quantoFalta)}
                </StandardTableBodyCell>
                <StandardTableBodyCell align="right" isTotal>
                  <span>
                    {formatCurrency(data.totalGeral.necessidadeAporte)}
                  </span>
                </StandardTableBodyCell>
                <StandardTableBodyCell align="right" isTotal>
                  {formatPercentage(data.totalGeral.rentabilidade)}
                </StandardTableBodyCell>
              </StandardTableRow>
            </TableBody>
        </StandardTable>
      </ComponentCard>
    </div>
  );
}
