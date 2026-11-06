'use client';
import React from 'react';
import { useIRStocksUs } from '@/hooks/useIR';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import IRSummaryCard from './IRSummaryCard';
import IRStateMessage from './IRStateMessage';
import { formatBRL, formatYearMonth } from './irFormatters';
import { Sensivel, ValorVisivel } from '@/components/common/valores/Sensivel';
import { TABLE_STYLES, TABLE_HEADER_STYLE } from '@/components/ui/table/tableStyles';
import { ResponsiveCardList } from '@/components/ui/table/ResponsiveTable';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import type { IRStocksUsAnual, IRStocksUsResponse } from '@/hooks/useIR';

type IRStocksUsDados = IRStocksUsResponse;

const AVISO_PADRAO =
  'Desde 2024 (Lei 14.754), ações, REITs e ETFs no exterior pagam 15% no ajuste anual da declaração. Estimativa: confira com seu contador.';
const ROTULO_APROXIMADO_PADRAO = 'câmbio de mercado (aproximado)';
/** Primeiro ano da apuração anual (ANO_INICIO_LEI_14754 do serviço). */
const ANO_LEI_14754 = 2024;

const corDoValor = (v: number) =>
  v > 0
    ? 'text-emerald-600 dark:text-emerald-400'
    : v < 0
      ? 'text-red-600 dark:text-red-400'
      : undefined;

/** Faixa de aviso na paleta My Finance (tom de estado selecionado; no escuro, bg-white/5). */
function AvisoIR({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="note"
      className="rounded-lg border border-[#DCE6F2] bg-[#EDF2F8] px-4 py-3 text-sm text-[#314666] dark:border-gray-700 dark:bg-white/5 dark:text-gray-300"
    >
      {children}
    </p>
  );
}

export default function IRStocksUs() {
  const { data: resposta, isLoading, error } = useIRStocksUs();
  const data = resposta as IRStocksUsDados | undefined;
  const isBelowLg = useIsBelowLg();

  if (isLoading)
    return <LoadingSpinner text="Carregando apuração de Stocks, REITs e ETFs EUA..." />;
  if (error)
    return (
      <IRStateMessage
        variant="error"
        title="Erro ao carregar Stocks, REITs e ETFs EUA"
        description={(error as Error).message}
      />
    );
  const anos = data?.anos ?? [];
  if (!data || (data.meses.length === 0 && anos.length === 0))
    return (
      <IRStateMessage
        variant="empty"
        title="Sem operações de Stocks, REITs ou ETFs EUA"
        description="Considera Stocks, REITs e ETFs EUA cadastrados em dólar. Operações sem a cotação do dólar usam o câmbio de mercado da data. BDRs seguem regras de Renda Variável BR."
      />
    );

  const aviso = data.aviso ?? AVISO_PADRAO;
  const rotuloAproximado = data.rotuloCambioAproximado ?? ROTULO_APROXIMADO_PADRAO;
  const algumAproximado = data.meses.some((m) => m.cambioAproximado);
  const semCambio = data.operacoesSemCambio ?? 0;
  const dividendosSemCambio = data.dividendosSemCambio ?? 0;

  const anoAtual = new Date().getFullYear();
  const doAno = anos.find((a) => a.year === anoAtual) ?? anos[anos.length - 1];
  const anoRef = doAno?.year ?? anoAtual;
  const prejuizoAcumulado = anos.length > 0 ? anos[anos.length - 1].prejuizoAcumuladoBrl : 0;
  const algumRetidoEstimado = anos.some((a) => a.retidoEstimado);
  const anosDesc = [...anos].reverse();
  const mesesDesc = [...data.meses].reverse();

  const mesesAntigos = data.meses.filter((m) => (m.regime ?? 'mensal') === 'mensal');
  const darfAntigo = mesesAntigos.reduce((s, m) => s + m.irDevido, 0);
  const mesesComDarf = mesesAntigos.filter((m) => m.irDevido > 0).length;

  return (
    <div className="space-y-5">
      <AvisoIR>
        {aviso}
        {algumAproximado &&
          ` Meses marcados com * usam o ${rotuloAproximado} na data da operação, porque a cotação do dólar não foi gravada.`}
        {semCambio > 0 &&
          ` ${semCambio} operação(ões) sem câmbio disponível ficaram fora da apuração.`}
        {dividendosSemCambio > 0 &&
          ` ${dividendosSemCambio} dividendo(s) sem câmbio na data ficaram fora do ajuste.`}
        {algumRetidoEstimado &&
          ' O imposto retido nos EUA foi estimado em 30% nos dividendos que não trazem o valor retido.'}
      </AvisoIR>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <IRSummaryCard
          label={`IR no ajuste de ${anoRef}`}
          value={formatBRL(doAno?.irDevido ?? 0)}
          subtext={<ValorVisivel>Pago na declaração de {anoRef + 1}</ValorVisivel>}
          highlight
        />
        <IRSummaryCard
          label={`Ganho líquido em ${anoRef}`}
          value={formatBRL(doAno?.ganhoLiquidoBrl ?? 0)}
          color={corDoValor(doAno?.ganhoLiquidoBrl ?? 0)}
          subtext="Lucros menos prejuízos das vendas, em R$"
        />
        <IRSummaryCard
          label={`Dividendos em ${anoRef}`}
          value={formatBRL(doAno?.dividendosBrl ?? 0)}
          subtext={
            doAno && doAno.creditoExteriorBrl > 0 ? (
              <>
                Crédito do imposto pago nos EUA:{' '}
                <Sensivel>{formatBRL(doAno.creditoExteriorBrl)}</Sensivel>
              </>
            ) : (
              'Brutos, convertidos na data de pagamento'
            )
          }
        />
        <IRSummaryCard
          label="Prejuízo a compensar"
          value={formatBRL(prejuizoAcumulado)}
          subtext="Abate o ganho e os dividendos dos próximos anos"
        />
      </div>

      {anosDesc.length > 0 && (
        <section className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Ajuste anual (Lei 14.754)
            </h4>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              15% sobre ganho líquido + dividendos do ano, sem isenção. O imposto sai na declaração
              do ano seguinte, na ficha de Bens e Direitos (aplicações financeiras no exterior).
            </p>
          </div>
          <TabelaAnual anos={anosDesc} isBelowLg={isBelowLg} />
        </section>
      )}

      {mesesDesc.length > 0 && (
        <section className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Vendas mês a mês
            </h4>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              De {ANO_LEI_14754} em diante os meses só informam: o IR entra no ajuste anual. Até{' '}
              {ANO_LEI_14754 - 1}, vendas de até <ValorVisivel>{formatBRL(35000)}</ValorVisivel> no
              mês eram isentas e o lucro pagava DARF no mês seguinte
              {mesesComDarf > 0 && (
                <>
                  {' '}
                  ({mesesComDarf} {mesesComDarf === 1 ? 'mês' : 'meses'} com DARF, total{' '}
                  <Sensivel>{formatBRL(darfAntigo)}</Sensivel>)
                </>
              )}
              .
            </p>
          </div>
          <TabelaMensal meses={mesesDesc} isBelowLg={isBelowLg} rotulo={rotuloAproximado} />
        </section>
      )}
    </div>
  );
}

type MesUs = IRStocksUsResponse['meses'][number];

function StatusMes({ m }: { m: MesUs }) {
  if ((m.regime ?? 'mensal') === 'anual')
    return (
      <span className="inline-flex rounded-full bg-[#EDF2F8] px-2 py-0.5 text-xs font-medium text-[#314666] dark:bg-white/5 dark:text-gray-300">
        Ajuste anual
      </span>
    );
  if (m.isento)
    return (
      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        Isento
      </span>
    );
  if (m.irDevido > 0)
    return (
      <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
        DARF
      </span>
    );
  return (
    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
      —
    </span>
  );
}

const statusTexto = (m: MesUs) =>
  (m.regime ?? 'mensal') === 'anual'
    ? 'Ajuste anual'
    : m.isento
      ? 'Isento'
      : m.irDevido > 0
        ? 'DARF'
        : 'Sem IR';

function TabelaMensal({
  meses,
  isBelowLg,
  rotulo,
}: {
  meses: MesUs[];
  isBelowLg: boolean;
  rotulo: string;
}) {
  if (isBelowLg)
    return (
      <ResponsiveCardList<MesUs>
        ariaLabel="Vendas mês a mês de Stocks, REITs e ETFs EUA"
        rows={meses}
        getRowKey={(m) => m.yearMonth}
        columns={[
          {
            id: 'mes',
            header: 'Mês',
            mobile: 'primary',
            cell: (m) => (
              <MesComCambio
                yearMonth={m.yearMonth}
                aproximado={m.cambioAproximado}
                rotulo={rotulo}
              />
            ),
          },
          { id: 'status', header: 'Status', mobile: 'subtitle', cell: statusTexto },
          {
            id: 'ir',
            header: 'DARF',
            mobile: 'value',
            cell: (m) => (m.irDevido > 0 ? <Sensivel>{formatBRL(m.irDevido)}</Sensivel> : '—'),
          },
          {
            id: 'vendas',
            header: 'Vendas',
            mobile: 'field',
            cell: (m) => <Sensivel>{formatBRL(m.vendasTotalBrl)}</Sensivel>,
          },
          {
            id: 'lucro',
            header: 'Lucro/Prej.',
            mobile: 'field',
            cell: (m) => (
              <span className={corDoValor(m.lucroBrutoBrl)}>
                <Sensivel>{formatBRL(m.lucroBrutoBrl)}</Sensivel>
              </span>
            ),
          },
        ]}
      />
    );
  return (
    <div className={TABLE_STYLES.wrapper}>
      <table className={TABLE_STYLES.table}>
        <thead>
          <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
            <Th>Mês</Th>
            <Th align="right">Vendas (BRL)</Th>
            <Th align="right">Lucro/Prejuízo</Th>
            <Th align="center">Status</Th>
            <Th align="right">DARF</Th>
          </tr>
        </thead>
        <tbody>
          {meses.map((m) => (
            <tr key={m.yearMonth} className={`${TABLE_STYLES.row} ${TABLE_STYLES.rowHover}`}>
              <td
                className={`${TABLE_STYLES.td} whitespace-nowrap font-medium text-gray-900 dark:text-white`}
              >
                <MesComCambio
                  yearMonth={m.yearMonth}
                  aproximado={m.cambioAproximado}
                  rotulo={rotulo}
                />
              </td>
              <td className={`${TABLE_STYLES.td} whitespace-nowrap text-right`}>
                <Sensivel>{formatBRL(m.vendasTotalBrl)}</Sensivel>
              </td>
              <td className={`${TABLE_STYLES.td} whitespace-nowrap text-right font-medium`}>
                <span className={corDoValor(m.lucroBrutoBrl)}>
                  <Sensivel>{formatBRL(m.lucroBrutoBrl)}</Sensivel>
                </span>
              </td>
              <td className={`${TABLE_STYLES.td} whitespace-nowrap text-center`}>
                <StatusMes m={m} />
              </td>
              <td
                className={`${TABLE_STYLES.td} whitespace-nowrap text-right font-semibold text-gray-900 dark:text-white`}
              >
                {m.irDevido > 0 ? <Sensivel>{formatBRL(m.irDevido)}</Sensivel> : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabelaAnual({ anos, isBelowLg }: { anos: IRStocksUsAnual[]; isBelowLg: boolean }) {
  const moeda = (v: number) => <Sensivel>{formatBRL(v)}</Sensivel>;
  if (isBelowLg)
    return (
      <ResponsiveCardList<IRStocksUsAnual>
        ariaLabel="Ajuste anual de Stocks, REITs e ETFs EUA"
        rows={anos}
        getRowKey={(a) => String(a.year)}
        columns={[
          { id: 'ano', header: 'Ano', mobile: 'primary', cell: (a) => String(a.year) },
          {
            id: 'subtitulo',
            header: 'Declaração',
            mobile: 'subtitle',
            cell: (a) => `Declaração de ${a.year + 1}`,
          },
          { id: 'ir', header: 'IR a pagar', mobile: 'value', cell: (a) => moeda(a.irDevido) },
          {
            id: 'ganho',
            header: 'Ganho líquido',
            mobile: 'field',
            cell: (a) => (
              <span className={corDoValor(a.ganhoLiquidoBrl)}>{moeda(a.ganhoLiquidoBrl)}</span>
            ),
          },
          { id: 'div', header: 'Dividendos', mobile: 'field', cell: (a) => moeda(a.dividendosBrl) },
          {
            id: 'comp',
            header: 'Prejuízo compensado',
            mobile: 'field',
            cell: (a) => (a.prejuizoCompensadoBrl > 0 ? moeda(a.prejuizoCompensadoBrl) : '—'),
          },
          {
            id: 'cred',
            header: 'Crédito EUA',
            mobile: 'field',
            cell: (a) => (a.creditoExteriorBrl > 0 ? moeda(a.creditoExteriorBrl) : '—'),
          },
          {
            id: 'saldo',
            header: 'Prejuízo a compensar',
            mobile: 'field',
            cell: (a) => (a.prejuizoAcumuladoBrl > 0 ? moeda(a.prejuizoAcumuladoBrl) : '—'),
          },
        ]}
      />
    );
  return (
    <div className={TABLE_STYLES.wrapper}>
      <table className={TABLE_STYLES.table}>
        <thead>
          <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
            <Th>Ano</Th>
            <Th align="right">Ganho líquido</Th>
            <Th align="right">Dividendos</Th>
            <Th align="right">Prejuízo compensado</Th>
            <Th align="right">IR 15%</Th>
            <Th align="right">Crédito EUA</Th>
            <Th align="right">IR a pagar</Th>
            <Th align="right">Prejuízo a compensar</Th>
          </tr>
        </thead>
        <tbody>
          {anos.map((a) => (
            <tr key={a.year} className={`${TABLE_STYLES.row} ${TABLE_STYLES.rowHover}`}>
              <td
                className={`${TABLE_STYLES.td} whitespace-nowrap font-medium text-gray-900 dark:text-white`}
              >
                {a.year}
              </td>
              <td className={`${TABLE_STYLES.td} whitespace-nowrap text-right`}>
                <span className={corDoValor(a.ganhoLiquidoBrl)}>{moeda(a.ganhoLiquidoBrl)}</span>
              </td>
              <td className={`${TABLE_STYLES.td} whitespace-nowrap text-right`}>
                {moeda(a.dividendosBrl)}
              </td>
              <td className={`${TABLE_STYLES.td} whitespace-nowrap text-right`}>
                {a.prejuizoCompensadoBrl > 0 ? moeda(a.prejuizoCompensadoBrl) : '—'}
              </td>
              <td className={`${TABLE_STYLES.td} whitespace-nowrap text-right`}>
                {moeda(a.irBrutoBrl)}
              </td>
              <td className={`${TABLE_STYLES.td} whitespace-nowrap text-right`}>
                {a.creditoExteriorBrl > 0 ? moeda(a.creditoExteriorBrl) : '—'}
              </td>
              <td
                className={`${TABLE_STYLES.td} whitespace-nowrap text-right font-semibold text-gray-900 dark:text-white`}
              >
                {moeda(a.irDevido)}
              </td>
              <td className={`${TABLE_STYLES.td} whitespace-nowrap text-right`}>
                {a.prejuizoAcumuladoBrl > 0 ? moeda(a.prejuizoAcumuladoBrl) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MesComCambio({
  yearMonth,
  aproximado,
  rotulo,
}: {
  yearMonth: string;
  aproximado?: boolean;
  rotulo: string;
}) {
  if (!aproximado) return <>{formatYearMonth(yearMonth)}</>;
  return (
    <span title={rotulo}>
      {formatYearMonth(yearMonth)}
      <span aria-label={rotulo}>*</span>
    </span>
  );
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
}) {
  const alignClass =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return <th className={`${TABLE_STYLES.th} ${alignClass}`}>{children}</th>;
}
