'use client';

import { ResponsiveCardList, type ResponsiveColumn } from '@/components/ui/table/ResponsiveTable';
import { MobileStatusPill } from '@/components/ui/mobile/MobileStatusPill';
import { formatBRLCompact, fPct } from '../utils';

/** Uma linha do histórico mensal (os mesmos números da tabela do desktop). */
export interface AcompanhamentoRow {
  off: number;
  /** 'Jun/25' (fMonth). */
  label: string;
  /** Registro do mês (null = sem registro). */
  aporteReal: number | null;
  patFinal: number | null;
  /** Rentabilidade do mês (calcRent), null quando não dá para calcular. */
  rent: number | null;
  /** Patrimônio necessário pelo plano (T[off]). */
  reqPat: number;
}

export type AcompanhamentoSituacao = 'na-meta' | 'abaixo' | null;

/**
 * Selo do mês pela MESMA comparação da coluna Δ% da tabela: Patrim. ≥ Nec. patrim. (Δ% ≥ 0) = Na
 * meta; abaixo disso, Abaixo. Sem registro (ou sem patrimônio necessário) não há selo.
 */
export function acompanhamentoSituacao(row: AcompanhamentoRow): AcompanhamentoSituacao {
  if (row.patFinal == null || !(row.reqPat > 0)) return null;
  const pct = (row.patFinal / row.reqPat - 1) * 100;
  return pct >= 0 ? 'na-meta' : 'abaixo';
}

interface AcompanhamentoCardsProps {
  rows: AcompanhamentoRow[];
  /** Mês tocado: abre o RegistrarMesSheet naquele mês. */
  onSelect: (off: number) => void;
}

const columns: ResponsiveColumn<AcompanhamentoRow>[] = [
  { id: 'mes', header: 'Mês', mobile: 'primary', cell: (r) => r.label },
  { id: 'off', header: 'Mês do plano', mobile: 'subtitle', cell: (r) => `M${r.off}` },
  {
    id: 'patrimonio',
    header: 'Patrim.',
    mobile: 'value',
    cell: (r) => (r.patFinal != null ? formatBRLCompact(r.patFinal) : '—'),
  },
  {
    id: 'aporte',
    header: 'Aporte',
    mobile: 'field',
    cell: (r) => (r.aporteReal != null ? formatBRLCompact(r.aporteReal) : '—'),
  },
  {
    id: 'rent',
    header: 'Rent.',
    mobile: 'field',
    cell: (r) => (r.rent != null ? fPct(r.rent, 2) : '—'),
  },
  {
    id: 'situacao',
    header: 'Situação',
    mobile: 'field',
    cell: (r) => {
      const s = acompanhamentoSituacao(r);
      if (s === 'na-meta') return <MobileStatusPill tone="ok">Na meta</MobileStatusPill>;
      if (s === 'abaixo') return <MobileStatusPill tone="atencao">Abaixo</MobileStatusPill>;
      return '—';
    },
  },
];

/**
 * Histórico mensal do acompanhamento em cartões (PWA fase 3, P3): um cartão por mês com o
 * patrimônio, o aporte, a rentabilidade e o selo Na meta/Abaixo. Tocar abre o registro do mês.
 */
export default function AcompanhamentoCards({ rows, onSelect }: AcompanhamentoCardsProps) {
  return (
    <div data-mf-mobile="">
      <ResponsiveCardList
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.off}
        ariaLabel="Histórico mensal"
        onRowClick={(r) => onSelect(r.off)}
        cardClassName={(r) => (r.patFinal == null ? 'opacity-70' : undefined)}
      />
    </div>
  );
}
