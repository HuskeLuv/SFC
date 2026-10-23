'use client';
/**
 * Layout das abas Stocks e REIT's em US$ (Carteira EUA em US$, out/2026), atrás da chave
 * CARTEIRA_EUA_DOLAR_HABILITADO (`layoutUsd` da rota): linhas, subtotais e total em US$, a
 * linha "Equivale a (R$)" pela cotação de hoje e o Caixa para Investir (R$) numa linha
 * própria, fora do total em US$.
 *
 * Cores: só a paleta My Finance (src/constants/brandColors.ts — MYFINANCE_BRAND/MYFINANCE_TONS,
 * em classes arbitrárias como no resto do app) e os cinzas do tema.
 */
import React, { type ReactNode } from 'react';
import { formatBRL, formatUSD } from '@/utils/format';
import { TABLE_STYLES } from '@/components/ui/table/tableStyles';
import {
  LinhaTotalExtra,
  type ColumnDef,
  type MetricCardColor,
  type MetricCardConfig,
} from './GenericAssetTable';
import type { CamposAbaEua, CamposLinhaEua } from '@/types/carteiraStocks';

/** R$ por US$ 1 com 4 casas ("5,0385"). */
export const formatTaxaCambio = (taxa: number): string =>
  taxa.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

/** 'YYYY-MM-DD' → 'dd/mm' (sem Date: evita virar o dia pelo fuso). */
const dataCurta = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const [, mes, dia] = iso.split('-');
  return dia && mes ? `${dia}/${mes}` : null;
};

/** "US$ 1 = R$ 5,0385 em 22/10" (sem câmbio = null). */
export const linhaCambio = (aba: CamposAbaEua | null | undefined): string | null => {
  const taxa = aba?.cotacaoDolar;
  if (taxa == null || !(taxa > 0)) return null;
  const data = dataCurta(aba?.taxaData);
  return `US$ 1 = R$ ${formatTaxaCambio(taxa)}${data ? ` em ${data}` : ''}`;
};

const CHIP_USD =
  'inline-flex items-center rounded-full border border-[#DCE6F2] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#314666] dark:border-[#6E9DC4]/40 dark:bg-transparent dark:text-[#6E9DC4]';

/** Faixa do câmbio acima dos cards. */
export function FaixaCambioEua({
  aba,
  temAproximado,
}: {
  aba: CamposAbaEua | null | undefined;
  temAproximado?: boolean;
}) {
  const cambio = linhaCambio(aba);
  const semCambio = aba?.posicoesSemCambio ?? 0;
  return (
    <div
      role="note"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[#DCE6F2] bg-[#EDF2F8] px-4 py-2.5 text-sm text-gray-700 dark:border-gray-700 dark:bg-white/5 dark:text-gray-300"
    >
      <span className={CHIP_USD}>US$</span>
      {cambio ? (
        <>
          <span>
            Valores da aba em <b className="font-semibold">dólar</b>. Equivalente em reais pela
            cotação de hoje:
          </span>
          <span className="font-semibold text-gray-900 tabular-nums dark:text-white">{cambio}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">câmbio de mercado</span>
        </>
      ) : (
        <span>
          Valores da aba em <b className="font-semibold">dólar</b>. Sem a cotação do dólar agora: o
          equivalente em reais fica indisponível.
        </span>
      )}
      {temAproximado ? (
        <span className="w-full text-xs text-gray-500 dark:text-gray-400">
          Posições gravadas em reais aparecem convertidas pela cotação de hoje (aprox.).
        </span>
      ) : null}
      {semCambio > 0 ? (
        <span className="w-full text-xs font-medium text-red-600 dark:text-red-400">
          {semCambio === 1
            ? '1 posição gravada em reais ficou fora do total por falta da cotação do dólar.'
            : `${semCambio} posições gravadas em reais ficaram fora do total por falta da cotação do dólar.`}
        </span>
      ) : null}
    </div>
  );
}

/** Valor da linha em US$ com o equivalente em R$ embaixo (e a marca 'aprox.'/'sem câmbio'). */
export function ValorUsdComBrl({
  usd,
  brl,
  linha,
}: {
  usd: number;
  brl: number | null | undefined;
  linha?: CamposLinhaEua;
}) {
  if (linha?.semCambio) {
    return <span className="text-xs text-gray-500 dark:text-gray-400">sem câmbio</span>;
  }
  return (
    <span className="inline-flex flex-col items-end">
      <span className="tabular-nums">
        {formatUSD(usd)}
        {linha?.aproximado ? (
          <span className="ml-1 text-[11px] font-normal text-gray-500 dark:text-gray-400">
            aprox.
          </span>
        ) : null}
      </span>
      {brl != null ? (
        <span className="text-[11px] font-normal text-gray-500 tabular-nums dark:text-gray-400">
          {formatBRL(brl)}
        </span>
      ) : null}
    </span>
  );
}

/** Cards das abas em US$ (Aplicado, Atualizado, Rendimento com o R$ embaixo). */
export const metricCardsAbaEua = (
  aba: CamposAbaEua | null | undefined,
  formatPercentage: (v: number) => string,
  colorBySign: (v: number) => MetricCardColor,
): MetricCardConfig[] => {
  const usd = aba?.totalUSD;
  const brl = aba?.totalBRL ?? null;
  return [
    {
      title: 'Necessidade de Aporte Total',
      // nec vem do necessidadeAporteMap (base carteira, já em R$) — sem conversão.
      getValue: (_r, nec) => formatBRL(nec ?? 0),
      getSubtitle: () => 'em reais (base: carteira total)',
      color: 'warning',
    },
    { title: '__CAIXA_PARA_INVESTIR__', getValue: () => '', color: 'success' },
    {
      title: 'Valor Aplicado',
      getValue: () => formatUSD(usd?.valorAplicado ?? 0),
      getSubtitle: () => (brl ? `custo em R$: ${formatBRL(brl.valorAplicado)}` : null),
    },
    {
      title: 'Valor Atualizado',
      getValue: () => formatUSD(usd?.valorAtualizado ?? 0),
      getSubtitle: () => (brl ? `equivale a ${formatBRL(brl.valorAtualizado)}` : null),
    },
    {
      title: 'Rendimento',
      getValue: () => formatUSD(usd?.rendimento ?? 0),
      getSubtitle: () => (brl ? `em R$: ${formatBRL(brl.rendimento)}` : null),
      getColor: () => colorBySign(usd?.rendimento ?? 0),
    },
    {
      title: 'Rentabilidade',
      getValue: () => formatPercentage(usd?.rentabilidade ?? 0),
      getSubtitle: () =>
        brl ? `em R$ (com câmbio): ${formatPercentage(brl.rentabilidade)}` : null,
      getColor: () => colorBySign(usd?.rentabilidade ?? 0),
    },
  ];
};

/**
 * Linhas abaixo do TOTAL GERAL (US$) na tabela: "Equivale a (R$)" e o caixa da aba (R$),
 * que não entra no total em US$.
 */
export function LinhasTotalAbaEua<TAtivo, TSecao>({
  columns,
  aba,
}: {
  columns: ColumnDef<TAtivo, TSecao>[];
  aba: CamposAbaEua | null | undefined;
}) {
  const brl = aba?.totalBRL ?? null;
  const cambio = linhaCambio(aba);
  const sub = (texto: string) => (
    <span className="block text-[11px] font-normal text-gray-500 dark:text-gray-400">{texto}</span>
  );
  return (
    <>
      <LinhaTotalExtra
        columns={columns}
        comMover
        vazio=""
        rotulo="Equivale a (R$)"
        celulas={
          brl
            ? {
                valorTotal: (
                  <>
                    {formatBRL(brl.valorAplicado)}
                    {sub('custo pelo câmbio de cada compra')}
                  </>
                ),
                valorAtualizado: (
                  <>
                    {formatBRL(brl.valorAtualizado)}
                    {cambio ? sub(cambio) : null}
                  </>
                ),
                proventos: formatBRL(brl.proventos),
              }
            : { valorAtualizado: sub('sem a cotação do dólar') }
        }
      />
      <tr className={TABLE_STYLES.row}>
        <td colSpan={columns.length + 1} className={`${TABLE_STYLES.compact.td}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <b className="font-semibold">Caixa para investir</b>{' '}
              <span className="text-xs text-gray-500 dark:text-gray-400">
                (em reais, não entra no total em US$)
              </span>
            </span>
            <span className="font-semibold tabular-nums">
              {formatBRL(aba?.caixaParaInvestirBRL ?? 0)}
            </span>
          </div>
        </td>
      </tr>
    </>
  );
}

/** Celular: totais em US$, custo/equivalente em R$ e o caixa à parte no cartão de total. */
export function TotaisAbaEuaMobile({ aba }: { aba: CamposAbaEua | null | undefined }) {
  const usd = aba?.totalUSD;
  const brl = aba?.totalBRL ?? null;
  const cambio = linhaCambio(aba);
  const item = (rotulo: string, valor: ReactNode) => (
    <div className="min-w-0">
      <dt className="text-[11px] text-gray-500 dark:text-gray-400">{rotulo}</dt>
      <dd className="text-sm font-semibold tabular-nums break-words">{valor}</dd>
    </div>
  );
  return (
    <div className="space-y-2 border-t border-gray-200 pt-3 dark:border-gray-700">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        {item('Aplicado em US$', formatUSD(usd?.valorAplicado ?? 0))}
        {item('Atualizado em US$', formatUSD(usd?.valorAtualizado ?? 0))}
        {brl ? item('Custo em R$', formatBRL(brl.valorAplicado)) : null}
        {brl ? item('Equivale a (R$)', formatBRL(brl.valorAtualizado)) : null}
      </dl>
      {cambio ? (
        <p className="text-[11px] text-gray-500 dark:text-gray-400">{cambio} · câmbio de mercado</p>
      ) : null}
      <div className="flex items-center justify-between gap-2 rounded-md bg-gray-50 px-3 py-2 text-sm dark:bg-white/5">
        <span>
          Caixa para investir{' '}
          <span className="text-[11px] text-gray-500 dark:text-gray-400">(R$, fora do total)</span>
        </span>
        <span className="font-semibold tabular-nums">
          {formatBRL(aba?.caixaParaInvestirBRL ?? 0)}
        </span>
      </div>
    </div>
  );
}

/** Alguma linha da aba é posição em R$ convertida (aprox.)? */
export const temLinhaAproximada = (
  secoes: ReadonlyArray<{ ativos: ReadonlyArray<CamposLinhaEua> }> | null | undefined,
): boolean => (secoes ?? []).some((s) => s.ativos.some((a) => a.aproximado));
