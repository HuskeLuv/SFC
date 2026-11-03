'use client';
import { Sensivel, ValorVisivel } from '@/components/common/valores/Sensivel';
import React from 'react';
import { quantoFaltaClass } from '@/components/carteira/shared/quantoFaltaClass';
import { formatBRL, formatPct, formatUSD } from '@/utils/format';
import { useEtf } from '@/hooks/useEtf';
import { EtfAtivo, EtfSecao } from '@/types/etf';
import {
  GenericAssetTable,
  ColumnDef,
  MetricCardConfig,
  EditableObjetivoCell,
  BasicTablePlaceholderRows,
  metricColorBySign,
} from '@/components/carteira/shared';
import AssetNameLink from '@/components/carteira/AssetNameLink';
import ComponentCard from '@/components/common/ComponentCard';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { ResumoAportesCards } from '@/components/carteira/shared/AssetCardSections';
import { TABLE_STYLES, TABLE_HEADER_STYLE } from '@/components/ui/table/tableStyles';
import PieChartEtfAtivo from '@/components/charts/pie/PieChartEtfAtivo';
import { ValorUsdComBrl, linhaCambio } from '@/components/carteira/shared/AbaEuaUsd';

const SECTION_ORDER = ['brasil', 'estados_unidos'] as const;
const SECTION_NAMES: Record<string, string> = {
  brasil: 'Brasil',
  estados_unidos: 'EUA',
};
const MIN_PLACEHOLDER_ROWS = 4;

/**
 * ETF americano em US$ (nov/2026, ticket 86e3fq1yh): a moeda é da LINHA (moedaRegistro), NUNCA
 * da região/seção — o IVVB11 na seção EUA é da B3 e fica em R$. Na linha USD os campos base da
 * rota já estão em R$ (somas, %, aporte, rentabilidade) e os *USD são só de exibição: US$ com
 * o R$ embaixo. A cotação do ETF manual fica congelada no preço médio (sem cotação automática).
 */
const emDolar = (a: EtfAtivo): boolean => a.moedaRegistro === 'USD';

/** Selo "US$" ao lado do ticker (paleta My Finance, igual ao chip das abas EUA). */
const SELO_USD =
  'inline-flex shrink-0 items-center rounded-full border border-[#DCE6F2] bg-white px-1.5 py-px text-[10px] font-semibold leading-4 text-[#314666] dark:border-[#6E9DC4]/40 dark:bg-transparent dark:text-[#6E9DC4]';

/** Valor da linha USD: US$ com o R$ embaixo (ambos em <Sensivel>); sem câmbio, só o US$. */
function ValorLinhaUsd({ usd, brl, a }: { usd: number | undefined; brl: number; a: EtfAtivo }) {
  if (a.semCambio) {
    return (
      <span className="inline-flex flex-col items-end">
        <ValorUsdComBrl usd={usd ?? 0} brl={null} />
        <span className="text-[11px] font-normal text-gray-500 dark:text-gray-400">sem câmbio</span>
      </span>
    );
  }
  return <ValorUsdComBrl usd={usd ?? 0} brl={brl} />;
}

/** Cotação da linha USD: dado de mercado, visível com o olho fechado (coluna 'visivel'). */
function CotacaoLinhaUsd({ a }: { a: EtfAtivo }) {
  return (
    <span className="inline-flex flex-col items-end">
      <span className="tabular-nums">
        <ValorVisivel>{formatUSD(a.cotacaoAtualUSD ?? 0)}</ValorVisivel>
      </span>
      {!a.semCambio && (
        <span className="text-[11px] font-normal text-gray-500 tabular-nums dark:text-gray-400">
          <ValorVisivel>{formatBRL(a.cotacaoAtual)}</ValorVisivel>
        </span>
      )}
      <span className="text-[11px] font-normal text-gray-500 dark:text-gray-400">congelada</span>
    </span>
  );
}

/** Faixa do câmbio acima dos cards — só quando a aba tem ETF em US$ (em qualquer seção). */
function FaixaCambioEtf({
  cotacaoDolar,
  taxaData,
  posicoesSemCambio,
}: {
  cotacaoDolar?: number | null;
  taxaData?: string | null;
  posicoesSemCambio?: number;
}) {
  const cambio = linhaCambio({ cotacaoDolar, taxaData });
  const semCambio = posicoesSemCambio ?? 0;
  return (
    <div
      role="note"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[#DCE6F2] bg-[#EDF2F8] px-4 py-2.5 text-sm text-gray-700 dark:border-gray-700 dark:bg-white/5 dark:text-gray-300"
    >
      <span className={SELO_USD}>US$</span>
      {cambio ? (
        <>
          <span>
            ETFs com o selo US$ estão em <b className="font-semibold">dólar</b>, com o equivalente
            em reais embaixo. Os totais são em reais:
          </span>
          <span className="font-semibold text-gray-900 tabular-nums dark:text-white">
            <ValorVisivel>{cambio}</ValorVisivel>
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">câmbio de mercado</span>
        </>
      ) : (
        <span>
          ETFs com o selo US$ estão em <b className="font-semibold">dólar</b>. Sem a cotação do
          dólar agora: o equivalente em reais fica indisponível.
        </span>
      )}
      <span className="w-full text-xs text-gray-500 dark:text-gray-400">
        A cotação do ETF americano fica congelada no preço médio (sem cotação automática); o valor
        em reais só muda com o câmbio.
      </span>
      {semCambio > 0 ? (
        <span className="w-full text-xs font-medium text-[#D92D20] dark:text-[#F97066]">
          {semCambio === 1
            ? '1 ETF em dólar ficou fora do total por falta da cotação do dólar.'
            : `${semCambio} ETFs em dólar ficaram fora do total por falta da cotação do dólar.`}
        </span>
      ) : null}
    </div>
  );
}

interface EtfTableProps {
  totalCarteira?: number;
}

export default function EtfTable({ totalCarteira = 0 }: EtfTableProps) {
  const {
    data,
    loading,
    error,
    formatCurrency,
    formatPercentage,
    formatNumber,
    updateObjetivo,
    updateCaixaParaInvestir,
  } = useEtf();
  const isBelowLg = useIsBelowLg();

  // Devolve o resultado (false = falha) para o sheet do celular manter o erro aberto.
  const handleUpdateObjetivo = (ativoId: string, novoObjetivo: number) =>
    updateObjetivo(ativoId, novoObjetivo);

  // Aba sem ativos: o TOTAL GERAL de % da Carteira mostra "—" em vez de 100%.
  const temAtivos = (data?.secoes ?? []).some((s) => s.ativos.length > 0);
  const temLinhaUsd = (data?.secoes ?? []).some((s) => s.ativos.some(emDolar));

  const columns: ColumnDef<EtfAtivo, EtfSecao>[] = [
    {
      key: 'nome',
      header: 'Nome do Ativo',
      align: 'left',
      render: (a) => (
        <div>
          {emDolar(a) ? (
            <span className="inline-flex max-w-full items-center gap-1.5">
              <AssetNameLink portfolioId={a.id} ticker={a.ticker} nome={a.nome} />
              <span className={SELO_USD} title="ETF em dólar">
                US$
              </span>
            </span>
          ) : (
            <AssetNameLink portfolioId={a.id} ticker={a.ticker} nome={a.nome} />
          )}
          {a.observacoes && (
            <div className="text-xs text-gray-900 dark:text-white mt-1">{a.observacoes}</div>
          )}
        </div>
      ),
    },
    {
      key: 'indiceRastreado',
      header: 'Índice Rastreado',
      align: 'center',
      render: (a) =>
        a.indiceRastreado.charAt(0).toUpperCase() + a.indiceRastreado.slice(1).replace('_', ' '),
      renderSectionTotal: () => '-',
      renderGrandTotal: () => '-',
    },
    {
      key: 'quantidade',
      valor: 'sensivel-curto',
      header: 'Quantidade',
      align: 'right',
      render: (a, f) => f.formatNumber(a.quantidade),
      renderSectionTotal: (s, f) => f.formatNumber(s.totalQuantidade),
      renderGrandTotal: (t, f) => f.formatNumber((t?.quantidade as number) || 0),
    },
    {
      key: 'precoAquisicao',
      // Sensível nas duas moedas: <Sensivel> aqui (R$) e dentro do ValorUsdComBrl (US$ e R$).
      header: 'Preço Médio',
      align: 'right',
      render: (a, f) =>
        emDolar(a) ? (
          <ValorLinhaUsd usd={a.precoAquisicaoUSD} brl={a.precoAquisicao} a={a} />
        ) : (
          <Sensivel>{f.formatCurrency(a.precoAquisicao)}</Sensivel>
        ),
      renderSectionTotal: () => '-',
      renderGrandTotal: () => '-',
    },
    {
      key: 'valorTotal',
      header: 'Valor Total',
      align: 'right',
      render: (a, f) =>
        emDolar(a) ? (
          <ValorLinhaUsd usd={a.valorTotalUSD} brl={a.valorTotal} a={a} />
        ) : (
          f.formatCurrency(a.valorTotal)
        ),
      renderSectionTotal: (s, f) => f.formatCurrency(s.totalValorAplicado),
      renderGrandTotal: (t, f) => f.formatCurrency((t?.valorAplicado as number) || 0),
    },
    {
      key: 'cotacaoAtual',
      valor: 'visivel',
      header: 'Cotação Atual',
      align: 'right',
      render: (a, f) => (
        <span className="text-gray-900 dark:text-white">
          {emDolar(a) ? (
            <CotacaoLinhaUsd a={a} />
          ) : (
            <ValorVisivel>{f.formatCurrency(a.cotacaoAtual)}</ValorVisivel>
          )}
        </span>
      ),
      renderSectionTotal: () => '-',
      renderGrandTotal: () => '-',
    },
    {
      key: 'valorAtualizado',
      header: 'Valor Atualizado',
      align: 'right',
      render: (a, f) =>
        emDolar(a) ? (
          <ValorLinhaUsd usd={a.valorAtualizadoUSD} brl={a.valorAtualizado} a={a} />
        ) : (
          f.formatCurrency(a.valorAtualizado)
        ),
      renderSectionTotal: (s, f) => f.formatCurrency(s.totalValorAtualizado),
      renderGrandTotal: (t, f) => f.formatCurrency((t?.valorAtualizado as number) || 0),
    },
    {
      key: 'riscoPorAtivo',
      header: (
        <>
          <span className="block">Risco Por Ativo</span>
          <span className="block">(Carteira Total)</span>
        </>
      ),
      align: 'right',
      render: (a, f) => f.formatPercentage(a.riscoPorAtivo),
      renderSectionTotal: (s, f) => f.formatPercentage(s.totalRisco),
      renderGrandTotal: (t, f) => f.formatPercentage((t?.risco as number) || 0),
    },
    {
      key: 'percentualCarteira',
      header: '% da Aba',
      align: 'right',
      render: (a, f) => f.formatPercentage(a.percentualCarteira),
      renderSectionTotal: (s, f) => f.formatPercentage(s.totalPercentualCarteira),
      renderGrandTotal: () => (temAtivos ? formatPct(100) : '—'),
    },
    {
      key: 'objetivo',
      header: 'Objetivo',
      highlight: true,
      align: 'right',
      render: (a, f) => (
        <EditableObjetivoCell
          ativoId={a.id}
          objetivo={a.objetivo}
          formatPercentage={f.formatPercentage}
          onUpdateObjetivo={handleUpdateObjetivo}
        />
      ),
      renderSectionTotal: (s, f) => f.formatPercentage(s.totalObjetivo),
      renderGrandTotal: (t, f) => f.formatPercentage((t?.objetivo as number) || 0),
    },
    {
      key: 'quantoFalta',
      header: 'Quanto Falta',
      align: 'right',
      render: (a, f) => (
        <span className={quantoFaltaClass(a.quantoFalta)}>{f.formatPercentage(a.quantoFalta)}</span>
      ),
      renderSectionTotal: (s, f) => f.formatPercentage(s.totalQuantoFalta),
      renderGrandTotal: (t, f) => (
        <span className={quantoFaltaClass((t?.quantoFalta as number) || 0)}>
          {f.formatPercentage((t?.quantoFalta as number) || 0)}
        </span>
      ),
    },
    {
      key: 'necessidadeAporte',
      header: 'Nec. Aporte $',
      align: 'right',
      render: (a, f) => f.formatCurrency(a.necessidadeAporte),
      renderSectionTotal: (s, f) => f.formatCurrency(s.totalNecessidadeAporte),
      renderGrandTotal: (t, f) => f.formatCurrency((t?.necessidadeAporte as number) || 0),
    },
    {
      key: 'proventos',
      header: 'Proventos',
      align: 'right',
      render: (a, f) =>
        emDolar(a) ? (
          <ValorLinhaUsd usd={a.proventosUSD} brl={a.proventos ?? 0} a={a} />
        ) : (
          f.formatCurrency(a.proventos ?? 0)
        ),
      renderSectionTotal: (s, f) => f.formatCurrency(s.totalProventos ?? 0),
      renderGrandTotal: (t, f) => f.formatCurrency((t?.proventos as number) || 0),
    },
    {
      key: 'rentabilidade',
      header: 'Rentabilidade',
      align: 'right',
      render: (a, f) => f.formatPercentage(a.rentabilidade),
      renderSectionTotal: (s, f) => f.formatPercentage(s.rentabilidadeMedia),
      renderGrandTotal: (t, f) => f.formatPercentage((t?.rentabilidade as number) || 0),
    },
  ];

  const metricCards: MetricCardConfig[] = [
    {
      title: 'Necessidade de Aporte Total',
      getValue: (_r, nec) => formatCurrency(nec ?? 0),
      color: 'warning',
    },
    { title: '__CAIXA_PARA_INVESTIR__', getValue: () => '', color: 'success' },
    {
      title: 'Saldo Início do Mês',
      getValue: (r) => formatCurrency((r?.saldoInicioMes as number) ?? 0),
    },
    {
      title: 'Valor Atualizado',
      getValue: (r) => formatCurrency((r?.valorAtualizado as number) ?? 0),
    },
    {
      title: 'Rendimento',
      getValue: (r) => formatCurrency((r?.rendimento as number) ?? 0),
      getColor: (r) => metricColorBySign((r?.rendimento as number) ?? 0),
    },
    {
      title: 'Rentabilidade',
      getValue: (r) => formatPercentage((r?.rentabilidade as number) ?? 0),
      getColor: (r) => metricColorBySign((r?.rentabilidade as number) ?? 0),
    },
  ];

  return (
    <GenericAssetTable<EtfAtivo, EtfSecao>
      data={data as unknown as Record<string, unknown>}
      loading={loading}
      error={error}
      loadingText="Carregando dados ETF..."
      columns={columns}
      getSecoes={(d) => (d.secoes as EtfSecao[]) ?? []}
      getSectionAtivos={(s) => s.ativos}
      getSectionKey={(s) => s.regiao}
      getSectionName={(s) => s.nome || SECTION_NAMES[s.regiao]}
      getTotalGeral={(d) => (d.totalGeral as Record<string, unknown>) ?? {}}
      getResumo={(d) => (d.resumo as Record<string, unknown>) ?? {}}
      metricCards={metricCards}
      necessidadeAporteKey="etfs"
      onUpdateCaixaParaInvestir={updateCaixaParaInvestir}
      sectionOrder={SECTION_ORDER}
      sectionNames={SECTION_NAMES}
      tableTitle="ETF's - Detalhamento"
      formatCurrency={formatCurrency}
      formatPercentage={formatPercentage}
      formatNumber={formatNumber}
      totalCarteira={totalCarteira}
      mobileQuantityUnit="cotas"
      mover={{ categoria: 'etfs' }}
      topo={
        temLinhaUsd ? (
          <FaixaCambioEtf
            cotacaoDolar={data?.cotacaoDolar}
            taxaData={data?.taxaData}
            posicoesSemCambio={data?.posicoesSemCambio}
          />
        ) : undefined
      }
    >
      {/* Charts and aux table */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-6">
          <ComponentCard title="Resumo de Aportes">
            {isBelowLg ? (
              <ResumoAportesCards
                items={(data?.tabelaAuxiliar || []).map((item, index) => ({
                  key: index,
                  nome: item.ticker,
                  cotacao: formatCurrency(item.cotacaoAtual),
                  necessidade: formatCurrency(item.necessidadeAporte),
                  lote: formatNumber(item.loteAproximado),
                }))}
              />
            ) : (
              <div className={TABLE_STYLES.wrapper}>
                <table className={TABLE_STYLES.table}>
                  <thead>
                    <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
                      <th className={`${TABLE_STYLES.th} text-left`}>Nome Ativo</th>
                      <th className={`${TABLE_STYLES.th} text-right`}>Cotação Atual</th>
                      <th className={`${TABLE_STYLES.th} text-right`}>Necessidade Aporte</th>
                      <th className={`${TABLE_STYLES.th} text-right`}>Lote Aproximado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.tabelaAuxiliar || []).map((item, index) => (
                      <tr key={index} className={`${TABLE_STYLES.row} ${TABLE_STYLES.rowHover}`}>
                        <td className={`${TABLE_STYLES.td} font-medium`}>{item.ticker}</td>
                        <td className={`${TABLE_STYLES.td} text-right font-medium`}>
                          <ValorVisivel>{formatCurrency(item.cotacaoAtual)}</ValorVisivel>
                        </td>
                        <td className={`${TABLE_STYLES.td} text-right font-medium`}>
                          <span
                            className={
                              item.necessidadeAporte > 0
                                ? 'text-orange-600 dark:text-orange-400'
                                : 'text-gray-600 dark:text-gray-400'
                            }
                          >
                            <Sensivel>{formatCurrency(item.necessidadeAporte)}</Sensivel>
                          </span>
                        </td>
                        <td className={`${TABLE_STYLES.td} text-right font-medium`}>
                          <Sensivel curto>{formatNumber(item.loteAproximado)}</Sensivel>
                        </td>
                      </tr>
                    ))}
                    <BasicTablePlaceholderRows
                      count={Math.max(
                        0,
                        MIN_PLACEHOLDER_ROWS - (data?.tabelaAuxiliar?.length || 0),
                      )}
                      colSpan={4}
                      compact={false}
                    />
                  </tbody>
                </table>
              </div>
            )}
          </ComponentCard>
        </div>
        <div className="xl:col-span-6">
          <ComponentCard title="Distribuicao por Ativo">
            <PieChartEtfAtivo data={data?.alocacaoAtivo ?? []} />
          </ComponentCard>
        </div>
      </div>
    </GenericAssetTable>
  );
}
