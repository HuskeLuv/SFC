'use client';

import type { BlocoCarteira } from '@/types/relatorioFinanceiro';
import { useFormato } from '../../FormatoProvider';

/**
 * Destaque da carteira no Resumo (Pro e Advanced): "Seu patrimônio investido cresceu X no período,
 * com Y em novos investimentos". Corpo REAL: só entra por next/dynamic quando o plano libera a
 * carteira, porque lê `aportesPeriodo` (o nome do campo não pode ir para os chunks do Basic).
 * O texto não usa a palavra proibida na seção 1 (decisão 6). Export default (next/dynamic).
 */
export default function DestaqueCarteira({ carteira }: { carteira: BlocoCarteira }) {
  const { fR0 } = useFormato();
  const novos = carteira.aportesPeriodo;
  const variacao = carteira.variacaoPeriodo;
  if (variacao == null) {
    return (
      <li>
        Seu patrimônio investido é de {fR0(carteira.patrimonio)}, com {fR0(novos)} em novos
        investimentos no período.
        {carteira.historicoStatus === 'indisponivel'
          ? ' A variação do período fica de fora deste relatório.'
          : ' O histórico mensal ainda está em processamento.'}
      </li>
    );
  }
  return (
    <li>
      Seu patrimônio investido {variacao >= 0 ? 'cresceu' : 'caiu'} {fR0(Math.abs(variacao))} no
      período, com {fR0(novos)} em novos investimentos.
    </li>
  );
}
