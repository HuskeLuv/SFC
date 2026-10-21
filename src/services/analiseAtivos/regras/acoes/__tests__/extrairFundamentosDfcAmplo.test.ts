/**
 * fundamentei-regras (F2, A4.a): regex ampliado dos proventos pagos na DFC, atrás da chave de
 * ingestão ANALISE_ATIVOS_DFC_PROVENTOS_AMPLO. Linhas SINTÉTICAS (rótulos do plano de contas, valores
 * redondos). Chave desligada = a regra de hoje.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  extrairFundamentos,
  type ContextoExtracao,
  type LinhaDemonstrativo,
} from '@/services/analiseAtivos/regras/acoes/extrairFundamentos';

const MI = 1e6;
const ctx = (extra: Partial<ContextoExtracao> = {}): ContextoExtracao => ({
  demonstrativos: new Set(['DRE', 'DFC_MI']),
  ehFinanceira: false,
  tipoPeriodo: 'FY',
  escopo: 'con',
  dtIni: '2025-01-01',
  dtFim: '2025-12-31',
  mesFimExercicio: 12,
  ...extra,
});

const l = (cdConta: string, dsConta: string, valor: number): LinhaDemonstrativo => ({
  demonstrativo: cdConta.startsWith('6') ? 'DFC_MI' : 'DRE',
  cdConta,
  dsConta,
  valor,
});

const base = [
  l('3.01', 'Receita de Venda de Bens e/ou Serviços', 1000 * MI),
  l('3.11', 'Lucro/Prejuízo Consolidado do Período', 100 * MI),
  l('3.11.01', 'Atribuído a Sócios da Empresa Controladora', 90 * MI),
  l('3.11.02', 'Atribuído a Sócios Não Controladores', 10 * MI),
  l('6.01', 'Caixa Líquido Atividades Operacionais', 150 * MI),
  l('6.03', 'Caixa Líquido Atividades de Financiamento', -80 * MI),
];

describe('extrairFundamentos — proventos pagos na DFC', () => {
  afterEach(() => {
    delete process.env.ANALISE_ATIVOS_DFC_PROVENTOS_AMPLO;
  });

  const rotulosNovos = [
    'Pagamento de Proventos',
    'Remuneração paga aos acionistas',
    'Lucros distribuídos',
    'Distribuição de lucros',
  ];

  it.each(rotulosNovos)('chave desligada: "%s" não entra (regra de hoje)', (rotulo) => {
    const f = extrairFundamentos([...base, l('6.03.01', rotulo, -30 * MI)], ctx());
    expect(f.dividendosJcpPagos).toBe(0);
  });

  it.each(rotulosNovos)('chave ligada: "%s" entra como saída positiva', (rotulo) => {
    const f = extrairFundamentos(
      [...base, l('6.03.01', rotulo, -30 * MI)],
      ctx({ dfcProventosAmplo: true }),
    );
    expect(f.dividendosJcpPagos).toBe(30 * MI);
  });

  it('chave ligada: dividendos a NÃO controladores ficam fora; hoje entram', () => {
    const linhas = [
      ...base,
      l('6.03.01', 'Dividendos e JCP pagos', -40 * MI),
      l('6.03.02', 'Dividendos pagos a acionistas não controladores', -5 * MI),
    ];
    expect(extrairFundamentos(linhas, ctx()).dividendosJcpPagos).toBe(45 * MI);
    expect(extrairFundamentos(linhas, ctx({ dfcProventosAmplo: true })).dividendosJcpPagos).toBe(
      40 * MI,
    );
  });

  it('sem o campo no contexto, vale a env (só a ingestão CVM chama)', () => {
    const linhas = [...base, l('6.03.01', 'Pagamento de Proventos', -30 * MI)];
    expect(extrairFundamentos(linhas, ctx()).dividendosJcpPagos).toBe(0);
    process.env.ANALISE_ATIVOS_DFC_PROVENTOS_AMPLO = 'true';
    expect(extrairFundamentos(linhas, ctx()).dividendosJcpPagos).toBe(30 * MI);
  });

  it('entradas positivas e outras contas de financiamento seguem fora', () => {
    const f = extrairFundamentos(
      [
        ...base,
        l('6.03.01', 'Captação de empréstimos', 50 * MI),
        l('6.03.02', 'Amortização de empréstimos', -20 * MI),
        l('6.03.03', 'Proventos recebidos', 3 * MI),
      ],
      ctx({ dfcProventosAmplo: true }),
    );
    expect(f.dividendosJcpPagos).toBe(0);
  });
});
