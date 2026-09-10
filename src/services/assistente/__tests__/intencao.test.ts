import { describe, expect, it } from 'vitest';
import { classificarIntencao, guardarTextoDaIntencao } from '../intencao';

describe('classificarIntencao', () => {
  it.each([
    ['Onde devo investir meus 10 mil?', 'recomendacao_investimento'],
    ['Qual ação vai subir mais no próximo mês pra eu comprar?', 'recomendacao_investimento'],
    ['Qual o total da minha fatura?', 'nao_suportado'],
    ['Quais contas vencem esta semana?', 'nao_suportado'],
    ['Qual meu saldo na conta Nubank?', 'nao_suportado'],
    ['Gastei 45,90 no mercado hoje', 'lancamento'],
    ['Registra um aporte de R$ 1.000 em ITSA4', 'lancamento'],
    ['Quanto recebi de dividendos em agosto?', 'proventos'],
    ['Qual foi a rentabilidade da carteira?', 'rentabilidade'],
    ['Como está minha carteira?', 'carteira'],
    ['Tenho alguma dívida cadastrada?', 'dividas'],
    ['Minha reserva de emergência está adequada?', 'saude_financeira'],
    ['Quais objetivos eu cadastrei?', 'objetivos'],
    ['Estou estourando o orçamento?', 'orcamento'],
    ['Qual foi minha maior despesa do mês?', 'maior_despesa'],
    ['Quanto sobrou no mês passado?', 'sobra_mes'],
    ['Quanto recebi este mês?', 'receitas'],
    ['Quanto gastei com delivery?', 'gasto_categoria'],
    ['Onde vejo os proventos?', 'proventos'],
    ['Como importo um arquivo OFX?', 'navegacao'],
    ['O que é CDI?', 'conceito'],
    ['blablabla', 'outro'],
  ])('%s → %s', (texto, esperado) => {
    expect(classificarIntencao(texto)).toBe(esperado);
  });

  it('guarda texto só das intenções de revisão', () => {
    expect(guardarTextoDaIntencao('outro')).toBe(true);
    expect(guardarTextoDaIntencao('nao_suportado')).toBe(true);
    expect(guardarTextoDaIntencao('recomendacao_investimento')).toBe(true);
    expect(guardarTextoDaIntencao('carteira')).toBe(false);
  });
});
