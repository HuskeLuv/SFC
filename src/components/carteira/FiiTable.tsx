"use client";
import React, { useState, useMemo } from "react";
import { useFii } from "@/hooks/useFii";
import { FiiAtivo, FiiSecao } from "@/types/fii";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ComponentCard from "@/components/common/ComponentCard";
import PieChartFiiSegmento from "@/components/charts/pie/PieChartFiiSegmento";
import PieChartFiiAtivo from "@/components/charts/pie/PieChartFiiAtivo";
import { ChevronDownIcon, ChevronUpIcon, DollarLineIcon } from "@/icons";
import { useCarteiraResumoContext } from "@/context/CarteiraResumoContext";
import { StandardTable, StandardTableHeader, StandardTableHeaderRow, StandardTableHeaderCell, StandardTableRow, StandardTableBodyCell, TableBody } from "@/components/ui/table/StandardTable";

interface FiiMetricCardProps {
  title: string;
  value: string;
  color?: "primary" | "success" | "warning" | "error";
}

const FiiMetricCard: React.FC<FiiMetricCardProps> = ({
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

interface FiiTableRowProps {
  ativo: FiiAtivo;
  formatCurrency: (value: number) => string;
  formatPercentage: (value: number) => string;
  formatNumber: (value: number) => string;
  onUpdateObjetivo: (ativoId: string, novoObjetivo: number) => void;
  onUpdateCotacao: (ativoId: string, novaCotacao: number) => void;
}

const FiiTableRow: React.FC<FiiTableRowProps> = ({
  ativo,
  formatCurrency,
  formatPercentage,
  formatNumber,
  onUpdateObjetivo,
  onUpdateCotacao,
}) => {
  const [isEditingObjetivo, setIsEditingObjetivo] = useState(false);
  const [isEditingCotacao, setIsEditingCotacao] = useState(false);
  const [objetivoValue, setObjetivoValue] = useState(ativo.objetivo.toString());
  const [cotacaoValue, setCotacaoValue] = useState(ativo.cotacaoAtual.toString());

  const handleObjetivoSubmit = () => {
    const novoObjetivo = parseFloat(objetivoValue);
    if (!isNaN(novoObjetivo) && novoObjetivo >= 0) {
      onUpdateObjetivo(ativo.id, novoObjetivo);
      setIsEditingObjetivo(false);
    }
  };

  const handleCotacaoSubmit = () => {
    const novaCotacao = parseFloat(cotacaoValue);
    if (!isNaN(novaCotacao) && novaCotacao > 0) {
      onUpdateCotacao(ativo.id, novaCotacao);
      setIsEditingCotacao(false);
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

  const handleCotacaoKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCotacaoSubmit();
    } else if (e.key === 'Escape') {
      setCotacaoValue(ativo.cotacaoAtual.toString());
      setIsEditingCotacao(false);
    }
  };


  return (
    <StandardTableRow>
      <StandardTableBodyCell align="left" className="min-w-[220px] w-3/12">
        <div>
          <div>{ativo.ticker}</div>
          <div className="text-xs">{ativo.nome}</div>
          {ativo.observacoes && (
            <div className="text-xs mt-1">
              {ativo.observacoes}
            </div>
          )}
        </div>
      </StandardTableBodyCell>
      <StandardTableBodyCell align="center">
        {ativo.mandato}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="center">
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs">
          {ativo.segmento.charAt(0).toUpperCase() + ativo.segmento.slice(1)}
        </span>
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right" className="w-[80px]">
        {formatNumber(ativo.quantidade)}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {formatCurrency(ativo.precoAquisicao)}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {formatCurrency(ativo.valorTotal)}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {isEditingCotacao ? (
          <div className="flex items-center space-x-1">
            <input
              type="number"
              step="0.01"
              value={cotacaoValue}
              onChange={(e) => setCotacaoValue(e.target.value)}
              onKeyDown={handleCotacaoKeyPress}
              onBlur={handleCotacaoSubmit}
              className="w-20 px-1 py-0.5 text-xs border border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              autoFocus
            />
          </div>
        ) : (
          <div 
            className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 rounded"
            onClick={() => setIsEditingCotacao(true)}
          >
            <span>{formatCurrency(ativo.cotacaoAtual)}</span>
          </div>
        )}
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

interface FiiSectionProps {
  secao: FiiSecao;
  formatCurrency: (value: number) => string;
  formatPercentage: (value: number) => string;
  formatNumber: (value: number) => string;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdateObjetivo: (ativoId: string, novoObjetivo: number) => void;
  onUpdateCotacao: (ativoId: string, novaCotacao: number) => void;
}

const FiiSection: React.FC<FiiSectionProps> = ({
  secao,
  formatCurrency,
  formatPercentage,
  formatNumber,
  isExpanded,
  onToggle,
  onUpdateObjetivo,
  onUpdateCotacao,
}) => {
  return (
    <>
      {/* Cabeçalho da seção */}
      <StandardTableRow 
        className="bg-[#808080] cursor-pointer"
        onClick={onToggle}
      >
        <StandardTableBodyCell align="left" className="min-w-[220px] w-3/12 bg-[#808080] text-white font-bold">
          <div className="flex items-center space-x-2">
            {isExpanded ? (
              <ChevronUpIcon className="w-4 h-4" />
            ) : (
              <ChevronDownIcon className="w-4 h-4" />
            )}
            <span className="font-bold">{secao.nome}</span>
          </div>
        </StandardTableBodyCell>
        <StandardTableBodyCell align="center" className="bg-[#808080] text-white font-bold">-</StandardTableBodyCell>
        <StandardTableBodyCell align="center" className="bg-[#808080] text-white font-bold">-</StandardTableBodyCell>
        <StandardTableBodyCell align="right" className="w-[80px] bg-[#808080] text-white font-bold">
          {formatNumber(secao.totalQuantidade)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="center" className="bg-[#808080] text-white font-bold">-</StandardTableBodyCell>
        <StandardTableBodyCell align="right" className="bg-[#808080] text-white font-bold">
          {formatCurrency(secao.totalValorAplicado)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="center" className="bg-[#808080] text-white font-bold">-</StandardTableBodyCell>
        <StandardTableBodyCell align="right" className="bg-[#808080] text-white font-bold">
          {formatCurrency(secao.totalValorAtualizado)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right" className="bg-[#808080] text-white font-bold">
          {formatPercentage(secao.totalRisco)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right" className="bg-[#808080] text-white font-bold">
          {formatPercentage(secao.totalPercentualCarteira)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right" className="bg-[#808080] text-white font-bold">
          {formatPercentage(secao.totalObjetivo)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right" className="bg-[#808080] text-white font-bold">
          {formatPercentage(secao.totalQuantoFalta)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right" className="bg-[#808080] text-white font-bold">
          <span>
            {formatCurrency(secao.totalNecessidadeAporte)}
          </span>
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right" className="bg-[#808080] text-white font-bold">
          {formatPercentage(secao.rentabilidadeMedia)}
        </StandardTableBodyCell>
      </StandardTableRow>

      {/* Ativos da seção */}
      {isExpanded && secao.ativos.map((ativo) => (
        <FiiTableRow
          key={ativo.id}
          ativo={ativo}
          formatCurrency={formatCurrency}
          formatPercentage={formatPercentage}
          formatNumber={formatNumber}
          onUpdateObjetivo={onUpdateObjetivo}
          onUpdateCotacao={onUpdateCotacao}
        />
      ))}
    </>
  );
};

interface FiiTableProps {
  totalCarteira?: number;
}

export default function FiiTable({ totalCarteira = 0 }: FiiTableProps) {
  const { data, loading, error, formatCurrency, formatPercentage, formatNumber, updateObjetivo, updateCotacao } = useFii();
  const { necessidadeAporteMap } = useCarteiraResumoContext();
  const necessidadeAporteTotalCalculada = necessidadeAporteMap.fiis ?? data?.resumo?.necessidadeAporteTotal ?? 0;
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['fof', 'tvm', 'ijol', 'hibrido', 'renda'])
  );

  // Calcular risco (carteira total) e percentual da carteira da aba
  const dataComRisco = useMemo(() => {
    if (!data) return data;

    const totalTabValue = data.totalGeral?.valorAtualizado || 0;
    const shouldCalculateRisco = totalCarteira > 0;

    const secoesComRisco = data.secoes.map(secao => {
      const totalPercentualCarteira = totalTabValue > 0
        ? (secao.totalValorAtualizado / totalTabValue) * 100
        : 0;

      return {
        ...secao,
        ativos: secao.ativos.map(ativo => ({
          ...ativo,
          riscoPorAtivo: shouldCalculateRisco ? (ativo.valorAtualizado / totalCarteira) * 100 : 0,
          percentualCarteira: totalTabValue > 0 ? (ativo.valorAtualizado / totalTabValue) * 100 : 0,
        })),
        totalPercentualCarteira,
        totalRisco: secao.ativos.reduce(
          (sum, ativo) => sum + (shouldCalculateRisco ? (ativo.valorAtualizado / totalCarteira) * 100 : 0),
          0
        ),
      };
    });

    const totalGeralRisco = secoesComRisco.reduce(
      (sum, secao) => sum + secao.ativos.reduce((s, ativo) => s + ativo.riscoPorAtivo, 0),
      0
    );

    return {
      ...data,
      secoes: secoesComRisco,
      totalGeral: {
        ...data.totalGeral,
        risco: totalGeralRisco,
        percentualCarteira: totalTabValue > 0 ? 100 : 0,
      },
    };
  }, [data, totalCarteira]);

  const toggleSection = (tipo: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(tipo)) {
      newExpanded.delete(tipo);
    } else {
      newExpanded.add(tipo);
    }
    setExpandedSections(newExpanded);
  };

  const handleUpdateObjetivo = async (ativoId: string, novoObjetivo: number) => {
    await updateObjetivo(ativoId, novoObjetivo);
  };

  const handleUpdateCotacao = async (ativoId: string, novaCotacao: number) => {
    await updateCotacao(ativoId, novaCotacao);
  };

  if (loading) {
    return <LoadingSpinner text="Carregando dados FIIs..." />;
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
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          <FiiMetricCard
            title="Necessidade de Aporte Total"
            value={formatCurrency(necessidadeAporteTotalCalculada)}
            color="warning"
          />
          <FiiMetricCard
            title="Caixa para Investir"
            value={formatCurrency(0)}
            color="success"
          />
          <FiiMetricCard
            title="Saldo Início do Mês"
            value={formatCurrency(0)}
          />
          <FiiMetricCard
            title="Rendimento"
            value={formatCurrency(0)}
            color="success"
          />
          <FiiMetricCard
            title="Rentabilidade"
            value={formatPercentage(0)}
            color="success"
          />
        </div>

        <ComponentCard title="FIIs - Detalhamento">
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
              <DollarLineIcon className="w-8 h-8 text-gray-400" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-black mb-2">
                Nenhum FII encontrado
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
                Adicione FIIs para começar a acompanhar seus fundos imobiliários.
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
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <FiiMetricCard
          title="Necessidade de Aporte Total"
          value={formatCurrency(necessidadeAporteTotalCalculada)}
          color="warning"
        />
        <FiiMetricCard
          title="Caixa para Investir"
          value={formatCurrency(data.resumo.caixaParaInvestir)}
          color="success"
        />
        <FiiMetricCard
          title="Saldo Início do Mês"
          value={formatCurrency(data.resumo.saldoInicioMes)}
        />
        <FiiMetricCard
          title="Rendimento"
          value={formatCurrency(data.resumo.rendimento)}
          color="success"
        />
        <FiiMetricCard
          title="Rentabilidade"
          value={formatPercentage(data.resumo.rentabilidade)}
          color="success"
        />
      </div>

      {/* Tabela principal */}
      <ComponentCard title="FIIs - Detalhamento">
        <StandardTable>
          <StandardTableHeader sticky headerBgColor="#9E8A58">
            <StandardTableHeaderRow headerBgColor="#9E8A58">
              <StandardTableHeaderCell align="center" className="min-w-[220px] w-3/12" headerBgColor="#9E8A58">
                Nome do Ativo
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="center" headerBgColor="#9E8A58">
                Mandato
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="center" headerBgColor="#9E8A58">
                Segmento
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="center" className="w-[80px]" headerBgColor="#9E8A58">
                Quantidade
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="center" headerBgColor="#9E8A58">
                Preço Médio
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="center" headerBgColor="#9E8A58">
                Valor Total
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="center" headerBgColor="#9E8A58">
                Cotação Atual
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="center" headerBgColor="#9E8A58">
                Valor Atualizado
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="center" headerBgColor="#9E8A58">
                <span className="block">Risco Por Ativo</span>
                <span className="block">(Carteira Total)</span>
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="center" headerBgColor="#9E8A58">
                % da Carteira
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="center" headerBgColor="#9E8A58">
                Objetivo
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="center" headerBgColor="#9E8A58">
                Quanto Falta
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="center" headerBgColor="#9E8A58">
                Nec. Aporte R$
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="center" headerBgColor="#9E8A58">
                Rentabilidade
              </StandardTableHeaderCell>
            </StandardTableHeaderRow>
          </StandardTableHeader>
          <TableBody>
              {dataComRisco?.secoes.map((secao) => (
                <FiiSection
                  key={secao.tipo}
                  secao={secao}
                  formatCurrency={formatCurrency}
                  formatPercentage={formatPercentage}
                  formatNumber={formatNumber}
                  isExpanded={expandedSections.has(secao.tipo)}
                  onToggle={() => toggleSection(secao.tipo)}
                  onUpdateObjetivo={handleUpdateObjetivo}
                  onUpdateCotacao={handleUpdateCotacao}
                />
              ))}

              {/* Linha de totalização */}
              <StandardTableRow isTotal className="bg-[#808080]">
              <StandardTableBodyCell align="left" isTotal className="min-w-[220px] w-3/12 bg-[#808080] text-white font-bold">
                  TOTAL GERAL
                </StandardTableBodyCell>
              <StandardTableBodyCell align="center" isTotal className="bg-[#808080] text-white font-bold">-</StandardTableBodyCell>
              <StandardTableBodyCell align="center" isTotal className="bg-[#808080] text-white font-bold">-</StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal className="w-[80px] bg-[#808080] text-white font-bold">
                  {formatNumber(dataComRisco?.totalGeral?.quantidade || 0)}
                </StandardTableBodyCell>
              <StandardTableBodyCell align="center" isTotal className="bg-[#808080] text-white font-bold">-</StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal className="bg-[#808080] text-white font-bold">
                  {formatCurrency(dataComRisco?.totalGeral?.valorAplicado || 0)}
                </StandardTableBodyCell>
              <StandardTableBodyCell align="center" isTotal className="bg-[#808080] text-white font-bold">-</StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal className="bg-[#808080] text-white font-bold">
                  {formatCurrency(dataComRisco?.totalGeral?.valorAtualizado || 0)}
                </StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal className="bg-[#808080] text-white font-bold">
                  {formatPercentage(dataComRisco?.totalGeral?.risco || 0)}
                </StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal className="bg-[#808080] text-white font-bold">
                  100.00%
                </StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal className="bg-[#808080] text-white font-bold">
                  {formatPercentage(dataComRisco?.totalGeral?.objetivo || 0)}
                </StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal className="bg-[#808080] text-white font-bold">
                  {formatPercentage(dataComRisco?.totalGeral?.quantoFalta || 0)}
                </StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal className="bg-[#808080] text-white font-bold">
                  <span>
                    {formatCurrency(dataComRisco?.totalGeral?.necessidadeAporte || 0)}
                  </span>
                </StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal className="bg-[#808080] text-white font-bold">
                  {formatPercentage(dataComRisco?.totalGeral?.rentabilidade || 0)}
                </StandardTableBodyCell>
              </StandardTableRow>
            </TableBody>
        </StandardTable>
      </ComponentCard>

      {/* Gráficos e tabela auxiliar */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-6">
          <ComponentCard title="Alocação por Segmento">
            <PieChartFiiSegmento data={data.alocacaoSegmento} />
          </ComponentCard>
        </div>
        <div className="xl:col-span-6">
          <ComponentCard title="Alocação por Ativo">
            <PieChartFiiAtivo data={data.alocacaoAtivo} />
          </ComponentCard>
        </div>
      </div>

      {/* Tabela auxiliar */}
      <ComponentCard title="Resumo de Aportes">
        <StandardTable>
          <StandardTableHeader headerBgColor="#9E8A58">
            <StandardTableHeaderRow headerBgColor="#9E8A58">
              <StandardTableHeaderCell align="left" headerBgColor="#9E8A58">Ticker</StandardTableHeaderCell>
              <StandardTableHeaderCell align="left" headerBgColor="#9E8A58">Nome</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Cotação Atual</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Necessidade Aporte</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Lote Aproximado</StandardTableHeaderCell>
            </StandardTableHeaderRow>
          </StandardTableHeader>
          <TableBody>
            {data.tabelaAuxiliar.map((item, index) => (
              <StandardTableRow key={index}>
                <StandardTableBodyCell align="left">{item.ticker}</StandardTableBodyCell>
                <StandardTableBodyCell align="left">{item.nome}</StandardTableBodyCell>
                <StandardTableBodyCell align="right">
                  {formatCurrency(item.cotacaoAtual)}
                </StandardTableBodyCell>
                <StandardTableBodyCell align="right">
                  <span>
                    {formatCurrency(item.necessidadeAporte)}
                  </span>
                </StandardTableBodyCell>
                <StandardTableBodyCell align="right">
                  {formatNumber(item.loteAproximado)}
                </StandardTableBodyCell>
              </StandardTableRow>
            ))}
          </TableBody>
        </StandardTable>
      </ComponentCard>
    </div>
  );
}
