"use client";
import React, { useState, useMemo } from "react";
import { useMoedasCriptos } from "@/hooks/useMoedasCriptos";
import { MoedaCriptoAtivo, MoedaCriptoSecao } from "@/types/moedas-criptos";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ComponentCard from "@/components/common/ComponentCard";
import { ChevronDownIcon, ChevronUpIcon } from "@/icons";
import { useCarteiraResumoContext } from "@/context/CarteiraResumoContext";
import { BasicTablePlaceholderRows } from "@/components/carteira/shared";

const MIN_PLACEHOLDER_ROWS = 4;
const MOEDAS_CRIPTOS_COLUMN_COUNT = 13;
const MOEDAS_CRIPTOS_SECTION_ORDER = ["moedas", "criptomoedas", "metais_joias"] as const;
const MOEDAS_CRIPTOS_SECTION_NAMES: Record<(typeof MOEDAS_CRIPTOS_SECTION_ORDER)[number], string> = {
  moedas: "Moedas",
  criptomoedas: "Criptomoedas",
  metais_joias: "Metais e Joias",
};

interface MoedasCriptosMetricCardProps {
  title: string;
  value: string;
  color?: "primary" | "success" | "warning" | "error";
}

const MoedasCriptosMetricCard: React.FC<MoedasCriptosMetricCardProps> = ({
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

interface MoedasCriptosTableRowProps {
  ativo: MoedaCriptoAtivo;
  formatCurrency: (value: number, currency?: 'BRL' | 'USD') => string;
  formatPercentage: (value: number) => string;
  formatNumber: (value: number) => string;
  onUpdateObjetivo: (ativoId: string, novoObjetivo: number) => void;
  onUpdateCotacao: (ativoId: string, novaCotacao: number) => void;
}

const MoedasCriptosTableRow: React.FC<MoedasCriptosTableRowProps> = ({
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


  const currency = ativo.regiao === 'estados_unidos' ? 'USD' : 'BRL';

  return (
    <tr className="border-b border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50">
      <td className="px-2 py-2 text-xs text-black">
        <div>
          <div>{ativo.ticker}</div>
          <div className="text-xs text-black">{ativo.nome}</div>
          {ativo.observacoes && (
            <div className="text-xs text-black mt-1">
              {ativo.observacoes}
            </div>
          )}
        </div>
      </td>
      <td className="px-2 py-2 text-center">
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs">
          {ativo.indiceRastreado.charAt(0).toUpperCase() + ativo.indiceRastreado.slice(1).replace('_', ' ')}
        </span>
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatNumber(ativo.quantidade)}
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatCurrency(ativo.precoAquisicao, currency)}
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatCurrency(ativo.valorTotal, currency)}
      </td>
      <td className="px-2 py-2 text-xs text-right">
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
            <span className="text-black">{formatCurrency(ativo.cotacaoAtual, currency)}</span>
          </div>
        )}
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatCurrency(ativo.valorAtualizado, currency)}
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatPercentage(ativo.riscoPorAtivo)}
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatPercentage(ativo.percentualCarteira)}
      </td>
      <td className="px-2 py-2 text-xs text-right border border-black">
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
            <span className="text-xs text-black">%</span>
          </div>
        ) : (
          <div 
            className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 rounded"
            onClick={() => setIsEditingObjetivo(true)}
          >
            <span className="text-black">
              {formatPercentage(ativo.objetivo)}
            </span>
          </div>
        )}
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatPercentage(ativo.quantoFalta)}
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatCurrency(ativo.necessidadeAporte, currency)}
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatPercentage(ativo.rentabilidade)}
      </td>
    </tr>
  );
};

interface MoedasCriptosSectionProps {
  secao: MoedaCriptoSecao;
  formatCurrency: (value: number, currency?: 'BRL' | 'USD') => string;
  formatPercentage: (value: number) => string;
  formatNumber: (value: number) => string;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdateObjetivo: (ativoId: string, novoObjetivo: number) => void;
  onUpdateCotacao: (ativoId: string, novaCotacao: number) => void;
}

const MoedasCriptosSection: React.FC<MoedasCriptosSectionProps> = ({
  secao,
  formatCurrency,
  formatPercentage,
  formatNumber,
  isExpanded,
  onToggle,
  onUpdateObjetivo,
  onUpdateCotacao,
}) => {
  const placeholderCount = Math.max(0, MIN_PLACEHOLDER_ROWS - secao.ativos.length);
  const currency = secao.regiao === 'estados_unidos' ? 'USD' : 'BRL';

  return (
    <>
      {/* Cabeçalho da seção */}
      <tr 
        className="bg-[#808080] cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-2 py-2 text-xs bg-[#808080] text-white font-bold">
          <div className="flex items-center space-x-2">
            {isExpanded ? (
              <ChevronUpIcon className="w-4 h-4" />
            ) : (
              <ChevronDownIcon className="w-4 h-4" />
            )}
            <span>{secao.nome}</span>
          </div>
        </td>
        <td className="px-2 py-2 text-xs text-center bg-[#808080] text-white font-bold">-</td>
        <td className="px-2 py-2 text-xs text-right bg-[#808080] text-white font-bold">
          {formatNumber(secao.totalQuantidade)}
        </td>
        <td className="px-2 py-2 text-xs text-center bg-[#808080] text-white font-bold">-</td>
        <td className="px-2 py-2 text-xs text-right bg-[#808080] text-white font-bold">
          {formatCurrency(secao.totalValorAplicado, currency)}
        </td>
        <td className="px-2 py-2 text-xs text-center bg-[#808080] text-white font-bold">-</td>
        <td className="px-2 py-2 text-xs text-right bg-[#808080] text-white font-bold">
          {formatCurrency(secao.totalValorAtualizado, currency)}
        </td>
        <td className="px-2 py-2 text-xs text-right bg-[#808080] text-white font-bold">
          {formatPercentage(secao.totalRisco)}
        </td>
        <td className="px-2 py-2 text-xs text-right bg-[#808080] text-white font-bold">
          {formatPercentage(secao.totalPercentualCarteira)}
        </td>
        <td className="px-2 py-2 text-xs text-right bg-[#808080] text-white font-bold">
          {formatPercentage(secao.totalObjetivo)}
        </td>
        <td className="px-2 py-2 text-xs text-right bg-[#808080] text-white font-bold">
          {formatPercentage(secao.totalQuantoFalta)}
        </td>
        <td className="px-2 py-2 text-xs text-right bg-[#808080] text-white font-bold">
          {formatCurrency(secao.totalNecessidadeAporte, currency)}
        </td>
        <td className="px-2 py-2 text-xs text-right bg-[#808080] text-white font-bold">
          {formatPercentage(secao.rentabilidadeMedia)}
        </td>
      </tr>

      {/* Ativos da seção */}
      {isExpanded && secao.ativos.map((ativo) => (
        <MoedasCriptosTableRow
          key={ativo.id}
          ativo={ativo}
          formatCurrency={formatCurrency}
          formatPercentage={formatPercentage}
          formatNumber={formatNumber}
          onUpdateObjetivo={onUpdateObjetivo}
          onUpdateCotacao={onUpdateCotacao}
        />
      ))}
      {isExpanded && (
        <BasicTablePlaceholderRows
          count={placeholderCount}
          colSpan={MOEDAS_CRIPTOS_COLUMN_COUNT}
        />
      )}
    </>
  );
};

interface MoedasCriptosTableProps {
  totalCarteira?: number;
}

export default function MoedasCriptosTable({ totalCarteira = 0 }: MoedasCriptosTableProps) {
  const { data, loading, error, formatCurrency, formatPercentage, formatNumber, updateObjetivo, updateCotacao } = useMoedasCriptos();
  const { necessidadeAporteMap } = useCarteiraResumoContext();
  const necessidadeAporteTotalCalculada = necessidadeAporteMap.moedasCriptos ?? data?.resumo?.necessidadeAporteTotal ?? 0;
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(MOEDAS_CRIPTOS_SECTION_ORDER)
  );

  const ativosComRisco = useMemo(() => {
    if (!data) return [];

    const ativos = data.secoes.flatMap((secao) => secao.ativos);
    const totalTabValue = ativos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
    const shouldCalculateRisco = totalCarteira > 0;

    return ativos.map((ativo) => ({
      ...ativo,
      riscoPorAtivo: shouldCalculateRisco ? (ativo.valorAtualizado / totalCarteira) * 100 : 0,
      percentualCarteira: totalTabValue > 0 ? (ativo.valorAtualizado / totalTabValue) * 100 : 0,
    }));
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

  const normalizedSections = useMemo(() => {
    const resolveSectionRegion = (ativos: MoedaCriptoAtivo[]) => {
      const hasUs = ativos.some((ativo) => ativo.regiao === "estados_unidos");
      const hasBr = ativos.some((ativo) => ativo.regiao === "brasil");
      if (hasUs && hasBr) return "internacional";
      if (hasUs) return "estados_unidos";
      return "brasil";
    };

    const buildSection = (
      tipo: (typeof MOEDAS_CRIPTOS_SECTION_ORDER)[number],
      nome: string,
      ativos: MoedaCriptoAtivo[]
    ): MoedaCriptoSecao => {
      const totalQuantidade = ativos.reduce((sum, ativo) => sum + ativo.quantidade, 0);
      const totalValorAplicado = ativos.reduce((sum, ativo) => sum + ativo.valorTotal, 0);
      const totalValorAtualizado = ativos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
      const totalRisco = ativos.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0);
      const totalPercentualCarteira = ativos.reduce((sum, ativo) => sum + ativo.percentualCarteira, 0);
      const totalObjetivo = ativos.reduce((sum, ativo) => sum + ativo.objetivo, 0);
      const totalQuantoFalta = ativos.reduce((sum, ativo) => sum + ativo.quantoFalta, 0);
      const totalNecessidadeAporte = ativos.reduce((sum, ativo) => sum + ativo.necessidadeAporte, 0);
      const rentabilidadeMedia = ativos.length
        ? ativos.reduce((sum, ativo) => sum + ativo.rentabilidade, 0) / ativos.length
        : 0;

      return {
        tipo,
        nome,
        regiao: resolveSectionRegion(ativos),
        ativos,
        totalQuantidade,
        totalValorAplicado,
        totalValorAtualizado,
        totalRisco,
        totalPercentualCarteira,
        totalObjetivo,
        totalQuantoFalta,
        totalNecessidadeAporte,
        rentabilidadeMedia,
      };
    };

    const grouped = {
      moedas: [] as MoedaCriptoAtivo[],
      criptomoedas: [] as MoedaCriptoAtivo[],
      metais_joias: [] as MoedaCriptoAtivo[],
    };

    ativosComRisco.forEach((ativo) => {
      if (ativo.tipo === "moeda") {
        grouped.moedas.push(ativo);
        return;
      }
      if (ativo.tipo === "criptomoeda") {
        grouped.criptomoedas.push(ativo);
        return;
      }
      if (ativo.tipo === "metal") {
        grouped.metais_joias.push(ativo);
        return;
      }
      grouped.metais_joias.push(ativo);
    });

    return MOEDAS_CRIPTOS_SECTION_ORDER.map((tipo) => {
      const nome = MOEDAS_CRIPTOS_SECTION_NAMES[tipo];
      return buildSection(tipo, nome, grouped[tipo]);
    });
  }, [ativosComRisco]);

  if (loading) {
    return <LoadingSpinner text="Carregando dados de moedas e criptomoedas..." />;
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

  return (
    <div className="space-y-4">
      {/* Cards de resumo */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <MoedasCriptosMetricCard
          title="Necessidade de Aporte Total"
          value={formatCurrency(necessidadeAporteTotalCalculada)}
          color="warning"
        />
        <MoedasCriptosMetricCard
          title="Caixa para Investir"
          value={formatCurrency(data?.resumo?.caixaParaInvestir ?? 0)}
          color="success"
        />
        <MoedasCriptosMetricCard
          title="Saldo Início do Mês"
          value={formatCurrency(data?.resumo?.saldoInicioMes ?? 0)}
        />
        <MoedasCriptosMetricCard
          title="Valor Atualizado"
          value={formatCurrency(data?.resumo?.valorAtualizado ?? 0)}
        />
        <MoedasCriptosMetricCard
          title="Rendimento"
          value={formatCurrency(data?.resumo?.rendimento ?? 0)}
          color="success"
        />
        <MoedasCriptosMetricCard
          title="Rentabilidade"
          value={formatPercentage(data?.resumo?.rentabilidade ?? 0)}
          color="success"
        />
      </div>

      {/* Tabela principal */}
      <ComponentCard title="Moedas, Criptomoedas & Outros - Detalhamento">
        <div className="overflow-x-auto">
          <table className="w-full text-xs [&_td]:h-6 [&_td]:leading-6 [&_td]:py-0 [&_th]:h-6 [&_th]:leading-6 [&_th]:py-0">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700" style={{ backgroundColor: '#9E8A58' }}>
                <th className="px-2 py-2 font-bold text-black text-xs text-left cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Nome do Ativo
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Índice Rastreado
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Quantidade
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Preço Aquisição
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Valor Total
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Cotação em Tempo Real
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Valor Atualizado
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  <span className="block">Risco Por Ativo</span>
                  <span className="block">(Carteira Total)</span>
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  % da Carteira
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Objetivo
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Quanto Falta
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Nec. Aporte $
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Rentabilidade
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Linha de totalização */}
              <tr className="bg-[#404040] border-t-2 border-gray-300">
                <td className="px-2 py-2 text-xs text-white font-bold">
                  TOTAL GERAL
                </td>
                <td className="px-2 py-2 text-xs text-center text-white font-bold">-</td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatNumber(data?.totalGeral?.quantidade || 0)}
                </td>
                <td className="px-2 py-2 text-xs text-center text-white font-bold">-</td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatCurrency(data?.totalGeral?.valorAplicado || 0)}
                </td>
                <td className="px-2 py-2 text-xs text-center text-white font-bold">-</td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatCurrency(data?.totalGeral?.valorAtualizado || 0)}
                </td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatPercentage(data?.totalGeral?.risco || 0)}
                </td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  100.00%
                </td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatPercentage(data?.totalGeral?.objetivo || 0)}
                </td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatPercentage(data?.totalGeral?.quantoFalta || 0)}
                </td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatCurrency(data?.totalGeral?.necessidadeAporte || 0)}
                </td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatPercentage(data?.totalGeral?.rentabilidade || 0)}
                </td>
              </tr>

              {normalizedSections.map((secao) => (
                <MoedasCriptosSection
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
            </tbody>
          </table>
        </div>
      </ComponentCard>

    </div>
  );
}
