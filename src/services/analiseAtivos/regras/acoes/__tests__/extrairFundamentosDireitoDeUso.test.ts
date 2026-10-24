/**
 * EBITDA como o Fundamentei: a D&A da DFC deixa de fora a linha própria de direito de uso /
 * arrendamento (IFRS 16). Linhas SINTÉTICAS com os rótulos do plano de contas da CAML3.
 */
import { describe, expect, it } from 'vitest';
import {
  extrairFundamentos,
  type ContextoExtracao,
  type LinhaDemonstrativo,
} from '@/services/analiseAtivos/regras/acoes/extrairFundamentos';

const MI = 1e6;
const ctx: ContextoExtracao = {
  demonstrativos: new Set(['DRE', 'DFC_MI']),
  ehFinanceira: false,
  tipoPeriodo: 'FY',
  escopo: 'con',
  dtIni: '2025-03-01',
  dtFim: '2026-02-28',
  mesFimExercicio: 2,
};
const l = (cdConta: string, dsConta: string, valor: number): LinhaDemonstrativo => ({
  demonstrativo: cdConta.startsWith('6') ? 'DFC_MI' : 'DRE',
  cdConta,
  dsConta,
  valor,
});
const base = [
  l('3.01', 'Receita de Venda de Bens e/ou Serviços', 1000 * MI),
  l('3.11', 'Lucro/Prejuízo Consolidado do Período', 10 * MI),
  l('6.01', 'Caixa Líquido Atividades Operacionais', 50 * MI),
  l('6.01.01', 'Caixa Gerado nas Operações', 60 * MI),
];

describe('D&A da DFC sem direito de uso', () => {
  it('soma depreciações e amortização do intangível; direito de uso e arrendamento ficam fora', () => {
    const f = extrairFundamentos(
      [
        ...base,
        l('6.01.01.09', 'Depreciações', 20 * MI),
        l('6.01.01.10', 'Amortizações Intangível', 2 * MI),
        l('6.01.01.11', 'Amortizações Ativo de Direito de Uso', 6 * MI),
        l('6.01.01.12', 'Amortização de arrendamentos', 1 * MI),
        l('6.01.01.14', 'Baixa - Ativo de Direito de Uso', 9 * MI),
      ],
      ctx,
    );
    expect(f.depreciacaoAmortizacao).toBe(22 * MI);
  });

  it('linha única que já junta tudo continua inteira', () => {
    const f = extrairFundamentos(
      [...base, l('6.01.01.02', 'Depreciação, Amortização e Exaustão', 30 * MI)],
      ctx,
    );
    expect(f.depreciacaoAmortizacao).toBe(30 * MI);
  });
});
