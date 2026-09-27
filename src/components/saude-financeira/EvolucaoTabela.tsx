'use client';

import { useEffect, useRef } from 'react';
import type { EvolucaoPonto, SnapshotData } from '@/hooks/useSaudeFinanceira';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { MobileStatusPill } from '@/components/ui/mobile/MobileStatusPill';
import { STATUS_TONE } from './StatusHero';
import { formatBRLCompact, formatPercent, MONTH_NAMES_PT, STATUS_META } from './utils';
import { TABLE_STYLES, TABLE_HEADER_STYLE } from '@/components/ui/table/tableStyles';

interface EvolucaoTabelaProps {
  snapshots: EvolucaoPonto[];
}

/** Últimas N fotos exibidas na tabela (a mais recente sempre entra). */
const MAX_COLUNAS = 12;

interface LinhaIndicador {
  chave: string;
  label: string;
  render: (data: SnapshotData) => string;
}

const LINHAS: LinhaIndicador[] = [
  { chave: 'renda', label: 'Renda mensal', render: (d) => formatBRLCompact(d.rendaMensal) },
  { chave: 'gasto', label: 'Gasto mensal', render: (d) => formatBRLCompact(d.gastoMensal) },
  {
    chave: 'poupanca',
    label: 'Poupança mensal',
    render: (d) => formatBRLCompact(d.poupancaMensal),
  },
  { chave: 'taxa', label: 'Taxa de poupança', render: (d) => formatPercent(d.taxaPoupanca) },
  {
    chave: 'altaLiquidez',
    label: 'Invest. alta liquidez',
    render: (d) => formatBRLCompact(d.ativosAltaLiquidez),
  },
  {
    chave: 'baixaLiquidez',
    label: 'Invest. baixa liquidez',
    render: (d) => formatBRLCompact(d.ativosBaixaLiquidez),
  },
  {
    chave: 'totalInvestimentos',
    label: 'Total de ativos',
    render: (d) => formatBRLCompact(d.ativosAltaLiquidez + d.ativosBaixaLiquidez),
  },
  {
    chave: 'rentabilidade',
    label: 'Rentabilidade (a.a.)',
    render: (d) => formatPercent(d.rentabilidadeAA),
  },
  {
    chave: 'patrimonioLiquido',
    label: 'Patrimônio líquido',
    render: (d) => formatBRLCompact(d.patrimonioLiquido),
  },
];

/**
 * Tabela "Evolução Indicadores Financeiros" da planilha: uma coluna por foto
 * mensal, uma linha por indicador, fechando com o status ED/FR/EQ do mês.
 */
/** 1ª coluna fixa ao rolar a matriz no celular (só na tela; a impressão não muda). */
const STICKY_COL =
  'mscreen:sticky mscreen:left-0 mscreen:z-[1] mscreen:bg-white dark:mscreen:bg-gray-900';
/** No cabeçalho, o fundo fixo é o azul `seguranca` do TABLE_HEADER_STYLE (texto branco). */
const STICKY_HEAD = 'mscreen:sticky mscreen:left-0 mscreen:z-[1] mscreen:bg-[#314666]';

export default function EvolucaoTabela({ snapshots }: EvolucaoTabelaProps) {
  const pontos = snapshots.slice(-MAX_COLUNAS);
  const isBelowLg = useIsBelowLg();
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Celular: a matriz abre no mês mais recente (fim da rolagem). O bloco começa recolhido
  // (display none, largura 0): rola quando ele ganha largura pela primeira vez.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!isBelowLg || !el) return;
    const rolarParaOFim = () => {
      if (el.clientWidth === 0) return false;
      el.scrollLeft = el.scrollWidth;
      return true;
    };
    if (rolarParaOFim() || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (rolarParaOFim()) ro.disconnect();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isBelowLg, pontos.length]);

  if (pontos.length < 2) return null;

  return (
    // data-mf-scroll-x: matriz de verdade, a única rolagem horizontal declarada da página.
    <div ref={wrapperRef} data-mf-scroll-x="" className={`mt-4 ${TABLE_STYLES.wrapper}`}>
      {/* Até 13 colunas (indicador + 12 fotos): variante compacta do padrão. */}
      <table className={`${TABLE_STYLES.table} min-w-[560px] mscreen:w-max mscreen:min-w-full`}>
        <thead>
          <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
            <th className={`${TABLE_STYLES.compact.th} text-left ${STICKY_HEAD}`}>Indicador</th>
            {pontos.map((p) => (
              <th key={`${p.year}-${p.month}`} className={`${TABLE_STYLES.compact.th} text-right`}>
                {MONTH_NAMES_PT[p.month] ?? p.month + 1}/{String(p.year).slice(-2)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LINHAS.map((linha) => (
            <tr key={linha.chave} className={TABLE_STYLES.row}>
              <td className={`${TABLE_STYLES.compact.td} ${STICKY_COL}`}>{linha.label}</td>
              {pontos.map((p) => (
                <td
                  key={`${p.year}-${p.month}`}
                  className={`${TABLE_STYLES.compact.td} text-right font-medium text-gray-900 dark:text-white/90`}
                >
                  {linha.render(p.data)}
                </td>
              ))}
            </tr>
          ))}
          <tr className={TABLE_STYLES.row}>
            <td className={`${TABLE_STYLES.compact.td} ${STICKY_COL}`}>Status</td>
            {pontos.map((p) => {
              const meta = STATUS_META[p.data.status];
              return (
                <td
                  key={`${p.year}-${p.month}`}
                  className={`${TABLE_STYLES.compact.td} text-right`}
                >
                  {isBelowLg ? (
                    <span data-mf-mobile="" className="hidden mscreen:inline">
                      <MobileStatusPill tone={STATUS_TONE[p.data.status]}>
                        {p.data.status}
                      </MobileStatusPill>
                    </span>
                  ) : null}
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.badgeClass}${
                      isBelowLg ? ' mscreen:hidden' : ''
                    }`}
                    title={meta.label}
                  >
                    {p.data.status}
                  </span>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
