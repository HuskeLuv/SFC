'use client';
import React, { useState, useMemo } from 'react';
import { formatPct } from '@/utils/format';
import { usePrevidenciaSeguros } from '@/hooks/usePrevidenciaSeguros';
import { PrevidenciaSegurosAtivo } from '@/types/previdencia-seguros';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ComponentCard from '@/components/common/ComponentCard';
import { useCarteiraResumoContext } from '@/context/CarteiraResumoContext';
import { BasicTablePlaceholderRows, metricColorBySign } from '@/components/carteira/shared';
import CaixaParaInvestirCard from '@/components/carteira/shared/CaixaParaInvestirCard';
import AssetNameLink from '@/components/carteira/AssetNameLink';
import PlanejadoNameCell from '@/components/carteira/shared/PlanejadoNameCell';
import { quantoFaltaClass } from '@/components/carteira/shared/quantoFaltaClass';
import { useQueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { invalidatePortfolioDerivedQueries } from '@/lib/invalidatePortfolio';
import { logger } from '@/lib/logger';
import {
  TABLE_STYLES,
  TABLE_HEADER_STYLE,
  TABLE_HIGHLIGHT_HEADER_STYLE,
  TABLE_SECTION_STYLE,
} from '@/components/ui/table/tableStyles';

const MIN_PLACEHOLDER_ROWS = 4;
const PREVIDENCIA_SEGUROS_COLUMN_COUNT = 17;

interface PrevidenciaSegurosMetricCardProps {
  title: string;
  value: string;
  color?: 'primary' | 'success' | 'warning' | 'error';
}

const PrevidenciaSegurosMetricCard: React.FC<PrevidenciaSegurosMetricCardProps> = ({
  title,
  value,
  color = 'primary',
}) => {
  const colorClasses = {
    primary: 'bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-100',
    success: 'bg-green-50 text-green-900 dark:bg-green-900/20 dark:text-green-100',
    warning: 'bg-yellow-50 text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-100',
    error: 'bg-red-50 text-red-900 dark:bg-red-900/20 dark:text-red-100',
  };

  return (
    <div className={`rounded-lg p-4 ${colorClasses[color]}`}>
      <p className="text-xs font-medium opacity-80 mb-1">{title}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
};

interface PrevidenciaSegurosTableRowProps {
  ativo: PrevidenciaSegurosAtivo;
  formatCurrency: (value: number, currency?: 'BRL' | 'USD') => string;
  formatPercentage: (value: number) => string;
  formatNumber: (value: number) => string;
  onUpdateObjetivo: (ativoId: string, novoObjetivo: number) => void;
  onRemovePlanejado: (planejadoId: string) => void;
}

const PrevidenciaSegurosTableRow: React.FC<PrevidenciaSegurosTableRowProps> = ({
  ativo,
  formatCurrency,
  formatPercentage,
  formatNumber,
  onUpdateObjetivo,
  onRemovePlanejado,
}) => {
  // Ativo PLANEJADO (sem posição, 16/09/2026): só objetivo / quanto falta /
  // necessidade de aporte mostram valor — o resto vira traço (como no
  // GenericAssetTable das outras abas).
  const planejado = !!ativo.planejado;
  const traco = <span className="text-gray-400">—</span>;
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

  return (
    <tr
      className={`${TABLE_STYLES.row} ${TABLE_STYLES.rowHover}`}
      data-planejado={planejado ? 'true' : undefined}
    >
      <td className={TABLE_STYLES.compact.td}>
        {planejado ? (
          <PlanejadoNameCell ticker={ativo.nome} onRemove={() => onRemovePlanejado(ativo.id)} />
        ) : (
          <div>
            <AssetNameLink portfolioId={ativo.id} ticker={ativo.nome} nomeComoPrincipal />
            {ativo.observacoes && (
              <div className="text-xs text-gray-900 dark:text-white mt-1">{ativo.observacoes}</div>
            )}
          </div>
        )}
      </td>
      <td className={`${TABLE_STYLES.compact.td} text-center`}>
        {planejado ? traco : `${ativo.carencia} meses`}
      </td>
      <td className={`${TABLE_STYLES.compact.td} text-center`}>
        {planejado ? traco : formatPercentage(ativo.cotacaoResgate * 100)}
      </td>
      <td className={`${TABLE_STYLES.compact.td} text-center`}>
        {planejado ? traco : `${ativo.liquidacaoResgate} dias`}
      </td>
      <td className={`${TABLE_STYLES.compact.td} text-center`}>
        {planejado ? (
          traco
        ) : (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs">
            {ativo.modalidade.charAt(0).toUpperCase() + ativo.modalidade.slice(1)}
          </span>
        )}
      </td>
      <td className={`${TABLE_STYLES.compact.td} text-center`}>
        {planejado ? (
          traco
        ) : (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs">
            {ativo.subclasse.charAt(0).toUpperCase() + ativo.subclasse.slice(1).replace('_', ' ')}
          </span>
        )}
      </td>
      <td className={`${TABLE_STYLES.compact.td} text-right`}>
        {planejado ? traco : formatNumber(ativo.quantidade)}
      </td>
      <td className={`${TABLE_STYLES.compact.td} text-right`}>
        {planejado ? traco : formatCurrency(ativo.precoAquisicao)}
      </td>
      <td className={`${TABLE_STYLES.compact.td} text-right`}>
        {planejado ? traco : formatCurrency(ativo.valorTotal)}
      </td>
      <td className={`${TABLE_STYLES.compact.td} text-right`}>
        {planejado && !(ativo.cotacaoAtual > 0) ? (
          traco
        ) : (
          <span className="text-gray-900 dark:text-white">
            {formatCurrency(ativo.cotacaoAtual)}
          </span>
        )}
      </td>
      <td className={`${TABLE_STYLES.compact.td} text-right`}>
        {planejado ? traco : formatCurrency(ativo.valorAtualizado)}
      </td>
      <td className={`${TABLE_STYLES.compact.td} text-right`}>
        {planejado ? traco : formatPercentage(ativo.riscoPorAtivo)}
      </td>
      <td className={`${TABLE_STYLES.compact.td} text-right`}>
        {formatPercentage(ativo.percentualCarteira)}
      </td>
      <td
        className={`${TABLE_STYLES.compact.td} ${TABLE_STYLES.highlightTd} text-right font-semibold`}
      >
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
            <span className="text-xs text-gray-900 dark:text-white">%</span>
          </div>
        ) : (
          <div
            className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 rounded"
            onClick={() => setIsEditingObjetivo(true)}
          >
            <span className="text-gray-900 dark:text-white">
              {formatPercentage(ativo.objetivo)}
            </span>
          </div>
        )}
      </td>
      <td className={`${TABLE_STYLES.compact.td} text-right`}>
        <span className={quantoFaltaClass(ativo.quantoFalta)}>
          {formatPercentage(ativo.quantoFalta)}
        </span>
      </td>
      <td className={`${TABLE_STYLES.compact.td} text-right`}>
        {formatCurrency(ativo.necessidadeAporte)}
      </td>
      <td className={`${TABLE_STYLES.compact.td} text-right`}>
        {planejado ? traco : formatPercentage(ativo.rentabilidade)}
      </td>
    </tr>
  );
};

interface PrevidenciaSegurosTableProps {
  totalCarteira?: number;
}

export default function PrevidenciaSegurosTable({
  totalCarteira = 0,
}: PrevidenciaSegurosTableProps) {
  const {
    data,
    loading,
    error,
    formatCurrency,
    formatPercentage,
    formatNumber,
    updateObjetivo,
    updateCaixaParaInvestir,
  } = usePrevidenciaSeguros();
  const { necessidadeAporteMap } = useCarteiraResumoContext();
  const necessidadeAporteTotalCalculada =
    necessidadeAporteMap.previdenciaSeguros ?? data?.resumo?.necessidadeAporteTotal ?? 0;
  const queryClient = useQueryClient();
  const { csrfFetch } = useCsrf();
  const [removendoPlanejado, setRemovendoPlanejado] = useState<string | null>(null);
  // Desistir de um ativo planejado (sem posição): DELETE + invalida as abas.
  const handleRemovePlanejado = async (planejadoId: string) => {
    if (removendoPlanejado) return;
    setRemovendoPlanejado(planejadoId);
    try {
      const res = await csrfFetch(`/api/carteira/planejados/${planejadoId}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        logger.error('Erro ao remover ativo planejado:', body?.error ?? res.status);
        return;
      }
      invalidatePortfolioDerivedQueries(queryClient);
    } catch (error) {
      logger.error('Erro ao remover ativo planejado:', error);
    } finally {
      setRemovendoPlanejado(null);
    }
  };
  // Aba vazia (só planejados): base = valor-alvo da classe (ver GenericAssetTable).
  const alvoClasse = necessidadeAporteMap.previdenciaSeguros ?? 0;
  const ativosComRisco = useMemo(() => {
    if (!data) return [];

    const ativos = data.secoes.flatMap((secao) => secao.ativos);
    const totalTabValue = ativos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
    const baseAporte = totalTabValue > 0 ? totalTabValue : alvoClasse;
    const shouldCalculateRisco = totalCarteira > 0;

    return ativos.map((ativo) => {
      // Percentual daquele tipo de ativo (não da carteira total)
      const percentualCarteira =
        totalTabValue > 0 ? (ativo.valorAtualizado / totalTabValue) * 100 : 0;
      const objetivo = ativo.objetivo || 0;
      // Quanto falta = diferença entre % atual e objetivo (em %)
      const quantoFalta = objetivo - percentualCarteira;
      // Necessidade de aporte = valor em R$ referente à porcentagem de "quanto falta" (calculado sobre o total daquele tipo de ativo)
      const necessidadeAporte =
        baseAporte > 0 && quantoFalta > 0 ? (quantoFalta / 100) * baseAporte : 0;

      return {
        ...ativo,
        riscoPorAtivo: shouldCalculateRisco
          ? Math.min(100, (ativo.valorAtualizado / totalCarteira) * 100)
          : 0,
        percentualCarteira,
        quantoFalta,
        necessidadeAporte,
      };
    });
  }, [data, totalCarteira, alvoClasse]);

  // Seções da API (Previdência = fundos marcados, automático; Seguros =
  // adições manuais) com os ativos enriquecidos pelo cálculo de risco acima.
  const secoesComRisco = useMemo(() => {
    if (!data) return [];
    const enrichedById = new Map(ativosComRisco.map((a) => [a.id, a]));
    return data.secoes.map((secao) => ({
      ...secao,
      ativos: secao.ativos.map((a) => enrichedById.get(a.id) ?? a),
    }));
  }, [data, ativosComRisco]);

  const handleUpdateObjetivo = async (ativoId: string, novoObjetivo: number) => {
    await updateObjetivo(ativoId, novoObjetivo);
  };

  if (loading) {
    return <LoadingSpinner text="Carregando dados de previdência e seguros..." />;
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
        <PrevidenciaSegurosMetricCard
          title="Necessidade de Aporte Total"
          value={formatCurrency(necessidadeAporteTotalCalculada)}
          color="warning"
        />
        <CaixaParaInvestirCard
          value={data?.resumo?.caixaParaInvestir ?? 0}
          formatCurrency={(value) => formatCurrency(value ?? 0)}
          onSave={updateCaixaParaInvestir}
          color="success"
        />
        <PrevidenciaSegurosMetricCard
          title="Saldo Início do Mês"
          value={formatCurrency(data?.resumo?.saldoInicioMes ?? 0)}
        />
        <PrevidenciaSegurosMetricCard
          title="Valor Atualizado"
          value={formatCurrency(data?.resumo?.valorAtualizado ?? 0)}
        />
        <PrevidenciaSegurosMetricCard
          title="Rendimento"
          value={formatCurrency(data?.resumo?.rendimento ?? 0)}
          color={metricColorBySign(data?.resumo?.rendimento ?? 0)}
        />
        <PrevidenciaSegurosMetricCard
          title="Rentabilidade"
          value={formatPercentage(data?.resumo?.rentabilidade ?? 0)}
          color={metricColorBySign(data?.resumo?.rentabilidade ?? 0)}
        />
      </div>

      {/* Tabela principal */}
      <ComponentCard title="Previdência e Seguros - Detalhamento">
        <div className={TABLE_STYLES.wrapper}>
          <table className={TABLE_STYLES.table}>
            <thead>
              <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
                <th className={`${TABLE_STYLES.compact.th} text-left`}>Nome do Ativo</th>
                <th className={`${TABLE_STYLES.compact.th} text-center`}>Carência</th>
                <th className={`${TABLE_STYLES.compact.th} text-center`}>Cotação de Resgate</th>
                <th className={`${TABLE_STYLES.compact.th} text-center`}>Liquidação de Resgate</th>
                <th className={`${TABLE_STYLES.compact.th} text-center`}>Modalidade</th>
                <th className={`${TABLE_STYLES.compact.th} text-center`}>Subclasse</th>
                <th className={`${TABLE_STYLES.compact.th} text-right`}>Quantidade</th>
                <th className={`${TABLE_STYLES.compact.th} text-right`}>Preço Aquisição</th>
                <th className={`${TABLE_STYLES.compact.th} text-right`}>Valor Total</th>
                <th className={`${TABLE_STYLES.compact.th} text-right`}>Cotação em Tempo Real</th>
                <th className={`${TABLE_STYLES.compact.th} text-right`}>Valor Atualizado</th>
                <th className={`${TABLE_STYLES.compact.th} text-right`}>
                  <span className="block">Risco Por Ativo</span>
                  <span className="block">(Carteira Total)</span>
                </th>
                <th className={`${TABLE_STYLES.compact.th} text-right`}>% da Aba</th>
                <th
                  className={`${TABLE_STYLES.compact.th} text-right`}
                  style={TABLE_HIGHLIGHT_HEADER_STYLE}
                >
                  Objetivo
                </th>
                <th className={`${TABLE_STYLES.compact.th} text-right`}>Quanto Falta</th>
                <th className={`${TABLE_STYLES.compact.th} text-right`}>Nec. Aporte $</th>
                <th className={`${TABLE_STYLES.compact.th} text-right`}>Rentabilidade</th>
              </tr>
            </thead>
            <tbody>
              {/* Linha de totalização */}
              <tr className={TABLE_STYLES.totalRow}>
                <td className={TABLE_STYLES.compact.td}>TOTAL GERAL</td>
                <td className={`${TABLE_STYLES.compact.td} text-center`}>-</td>
                <td className={`${TABLE_STYLES.compact.td} text-center`}>-</td>
                <td className={`${TABLE_STYLES.compact.td} text-center`}>-</td>
                <td className={`${TABLE_STYLES.compact.td} text-center`}>-</td>
                <td className={`${TABLE_STYLES.compact.td} text-center`}>-</td>
                <td className={`${TABLE_STYLES.compact.td} text-right`}>
                  {formatNumber(data?.totalGeral?.quantidade || 0)}
                </td>
                <td className={`${TABLE_STYLES.compact.td} text-center`}>-</td>
                <td className={`${TABLE_STYLES.compact.td} text-right`}>
                  {formatCurrency(data?.totalGeral?.valorAplicado || 0)}
                </td>
                <td className={`${TABLE_STYLES.compact.td} text-center`}>-</td>
                <td className={`${TABLE_STYLES.compact.td} text-right`}>
                  {formatCurrency(data?.totalGeral?.valorAtualizado || 0)}
                </td>
                <td className={`${TABLE_STYLES.compact.td} text-right`}>
                  {formatPercentage(data?.totalGeral?.risco || 0)}
                </td>
                <td className={`${TABLE_STYLES.compact.td} text-right`}>
                  {ativosComRisco.length > 0 ? formatPct(100) : '—'}
                </td>
                <td className={`${TABLE_STYLES.compact.td} text-right`}>
                  {formatPercentage(data?.totalGeral?.objetivo || 0)}
                </td>
                <td className={`${TABLE_STYLES.compact.td} text-right`}>
                  <span className={quantoFaltaClass(data?.totalGeral?.quantoFalta || 0)}>
                    {formatPercentage(data?.totalGeral?.quantoFalta || 0)}
                  </span>
                </td>
                <td className={`${TABLE_STYLES.compact.td} text-right`}>
                  {formatCurrency(data?.totalGeral?.necessidadeAporte || 0)}
                </td>
                <td className={`${TABLE_STYLES.compact.td} text-right`}>
                  {formatPercentage(data?.totalGeral?.rentabilidade || 0)}
                </td>
              </tr>

              {/* Seções separadas por divisória: Previdência (automática, dos
                  fundos marcados) e Seguros (manuais) — 4 placeholders cada,
                  mesmo padrão das demais abas. */}
              {secoesComRisco.map((secao) => (
                <React.Fragment key={secao.tipo}>
                  <tr className={TABLE_STYLES.sectionRow} style={TABLE_SECTION_STYLE}>
                    <td className={`${TABLE_STYLES.compact.td} text-white`}>{secao.nome}</td>
                    <td className={`${TABLE_STYLES.compact.td} text-center text-white`} colSpan={5}>
                      -
                    </td>
                    <td className={`${TABLE_STYLES.compact.td} text-right text-white`}>
                      {formatNumber(secao.ativos.reduce((s, a) => s + a.quantidade, 0))}
                    </td>
                    <td className={`${TABLE_STYLES.compact.td} text-center text-white`}>-</td>
                    <td className={`${TABLE_STYLES.compact.td} text-right text-white`}>
                      {formatCurrency(secao.ativos.reduce((s, a) => s + a.valorTotal, 0))}
                    </td>
                    <td className={`${TABLE_STYLES.compact.td} text-center text-white`}>-</td>
                    <td className={`${TABLE_STYLES.compact.td} text-right text-white`}>
                      {formatCurrency(secao.ativos.reduce((s, a) => s + a.valorAtualizado, 0))}
                    </td>
                    <td className={`${TABLE_STYLES.compact.td} text-right text-white`}>
                      {formatPercentage(secao.ativos.reduce((s, a) => s + a.riscoPorAtivo, 0))}
                    </td>
                    <td className={`${TABLE_STYLES.compact.td} text-right text-white`}>
                      {formatPercentage(secao.ativos.reduce((s, a) => s + a.percentualCarteira, 0))}
                    </td>
                    <td className={`${TABLE_STYLES.compact.td} text-right text-white`}>
                      {formatPercentage(secao.ativos.reduce((s, a) => s + a.objetivo, 0))}
                    </td>
                    <td className={`${TABLE_STYLES.compact.td} text-right text-white`}>
                      {formatPercentage(secao.ativos.reduce((s, a) => s + a.quantoFalta, 0))}
                    </td>
                    <td className={`${TABLE_STYLES.compact.td} text-right text-white`}>
                      {formatCurrency(secao.ativos.reduce((s, a) => s + a.necessidadeAporte, 0))}
                    </td>
                    <td className={`${TABLE_STYLES.compact.td} text-right text-white`}>
                      {secao.ativos.length > 0
                        ? formatPercentage(
                            secao.ativos.reduce((s, a) => s + a.rentabilidade, 0) /
                              secao.ativos.length,
                          )
                        : '-'}
                    </td>
                  </tr>
                  {secao.ativos.map((ativo) => (
                    <PrevidenciaSegurosTableRow
                      key={ativo.id}
                      ativo={ativo}
                      formatCurrency={formatCurrency}
                      formatPercentage={formatPercentage}
                      formatNumber={formatNumber}
                      onUpdateObjetivo={handleUpdateObjetivo}
                      onRemovePlanejado={handleRemovePlanejado}
                    />
                  ))}
                  <BasicTablePlaceholderRows
                    count={Math.max(0, MIN_PLACEHOLDER_ROWS - secao.ativos.length)}
                    colSpan={PREVIDENCIA_SEGUROS_COLUMN_COUNT}
                  />
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </ComponentCard>
    </div>
  );
}
