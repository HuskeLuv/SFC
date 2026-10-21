import { describe, expect, it } from 'vitest';
import {
  PALAVRAS_PROIBIDAS_V2,
  PALAVRAS_PROIBIDAS_V2_OPERACAO,
  encontrarProibidasOperacao,
  encontrarProibidasV2,
} from '../linguagemV2';
import { PALAVRAS_PROIBIDAS_BLOCO_D } from '../varreduraTextos';
import {
  LEITURA_DOS_DADOS,
  RODAPE_CENARIOS_V2,
  RODAPE_QUADRO,
  TEXTOS_LITERAIS_OBRIGATORIOS,
} from '@/services/analiseAtivos/textosLiterais';

describe('linguagemV2', () => {
  it('inclui a lista do Bloco D (e a da Fase 1) e o vocabulário retirado na v2.4', () => {
    for (const p of PALAVRAS_PROIBIDAS_BLOCO_D) expect(PALAVRAS_PROIBIDAS_V2).toContain(p);
    for (const p of ['semáforo', 'destaque', 'vencedor', 'melhores', 'falta', 'faltam']) {
      expect(PALAVRAS_PROIBIDAS_V2).toContain(p);
    }
    for (const p of ['quanto falta', 'aporte necessário', 'aprovado', 'nota', 'notas']) {
      expect(PALAVRAS_PROIBIDAS_V2).toContain(p);
    }
  });

  it("casa 'Índice' (I maiúsculo, palavra inteira), 'faltam', 'recomendação' e '★'", () => {
    expect(encontrarProibidasV2('Índice MF 8,4')).toEqual(['Índice']);
    expect(encontrarProibidasV2('o Indice do app')).toEqual(['Índice']);
    expect(encontrarProibidasV2('faltam 2,2 p.p.')).toEqual(['faltam']);
    expect(encontrarProibidasV2('Quanto falta para o objetivo')).toEqual(
      expect.arrayContaining(['falta', 'quanto falta']),
    );
    expect(encontrarProibidasV2('Recomendação do analista')).toEqual(
      expect.arrayContaining(['recomendação', 'recomend*']),
    );
    expect(encontrarProibidasV2('recomendado para você')).toEqual(['recomend*']);
    expect(encontrarProibidasV2('★ destaque')).toEqual(expect.arrayContaining(['★', 'destaque']));
    expect(encontrarProibidasV2('Semáforo verde')).toEqual(['semáforo']);
    expect(encontrarProibidasV2('o ativo vencedor')).toEqual(['vencedor']);
    expect(encontrarProibidasV2('aporte necessário: R$ 3.633')).toEqual(['aporte necessário']);
  });

  it("não casa 'índice de busca', nomes compostos nem pedaços de palavra", () => {
    expect(encontrarProibidasV2('índice de busca')).toEqual([]);
    expect(encontrarProibidasV2('Índices de Preços')).toEqual([]);
    expect(encontrarProibidasV2('anotação, notável, compras, faltante')).toEqual([]);
    expect(encontrarProibidasV2('Critérios de fundamentos · 5 anos')).toEqual([]);
    expect(encontrarProibidasV2('cresceu em 5 de 5 anos · 17.500 → 40.800 (R$ mi)')).toEqual([]);
    expect(encontrarProibidasV2('desvio −2,2 p.p. em relação ao alvo planejado por você')).toEqual(
      [],
    );
  });

  it('literal registrado = ignorado com ignorarLiterais; com uma palavra a mais = acusado', () => {
    for (const l of [RODAPE_QUADRO, LEITURA_DOS_DADOS, RODAPE_CENARIOS_V2]) {
      expect(encontrarProibidasV2(l.texto).length, l.id).toBeGreaterThan(0);
      expect(encontrarProibidasV2(l.texto, { ignorarLiterais: true }), l.id).toEqual([]);
      expect(
        encontrarProibidasV2(`${l.texto} Confira.`, { ignorarLiterais: true }).length,
        l.id,
      ).toBeGreaterThan(0);
    }
    // casamento exato: espaços colapsados contam como o mesmo texto
    const comQuebra = LEITURA_DOS_DADOS.texto.replace('. Não há', '.\n   Não há');
    expect(encontrarProibidasV2(comQuebra, { ignorarLiterais: true })).toEqual([]);
    // um trecho do literal NÃO é literal
    const trecho = 'Não há ranking, nota ou ativo "vencedor"';
    expect(encontrarProibidasV2(trecho, { ignorarLiterais: true }).length).toBeGreaterThan(0);
  });

  it('todos os literais registrados passam com ignorarLiterais', () => {
    for (const l of Object.values(TEXTOS_LITERAIS_OBRIGATORIOS)) {
      expect(encontrarProibidasV2(l.texto, { ignorarLiterais: true }), l.id).toEqual([]);
    }
  });

  it('lista de operação: libera só Compra/Venda (TEXTOS_OPERACAO)', () => {
    expect(encontrarProibidasV2('Compra')).toEqual(['compra']);
    expect(encontrarProibidasV2('Venda')).toEqual(['venda']);
    expect(encontrarProibidasOperacao('Compra')).toEqual([]);
    expect(encontrarProibidasOperacao('Venda')).toEqual([]);
    expect(encontrarProibidasOperacao('Compre agora')).toEqual(['compre']);
    expect(encontrarProibidasOperacao('Recomendamos a compra')).toEqual(
      expect.arrayContaining(['recomendamos', 'recomend*']),
    );
    expect(PALAVRAS_PROIBIDAS_V2_OPERACAO).not.toContain('venda');
    expect(PALAVRAS_PROIBIDAS_V2_OPERACAO).toContain('compre');
  });

  // fundamentei-regras F3 (A4.d): rótulos EUA em inglês ⇒ o veto vale também em inglês
  it('termos EN de avaliação e chamada à ação também são proibidos', () => {
    const casos: Array<[string, string]> = [
      ['Cheap stock', 'cheap'],
      ['Looks expensive', 'expensive'],
      ['Fair value: US$ 50', 'fair value'],
      ['Fair-value estimate', 'fair value'],
      ['Strong Buy', 'buy'],
      ['Time to sell', 'sell'],
      ['Undervalued REIT', 'undervalued'],
      ['Overvalued', 'overvalued'],
      ['Trading at a discount', 'discount'],
      ['Opportunity', 'opportunity'],
      ['Best dividend stocks', 'best'],
      ['Worst performers', 'worst'],
      ['Analyst rating', 'rating'],
      ['Quality score', 'score'],
      ['Target price', 'target price'],
      ['20% upside', 'upside'],
      ['Buying opportunities', 'buying'],
    ];
    for (const [texto, termo] of casos) {
      expect(encontrarProibidasV2(texto), texto).toContain(termo);
    }
    expect(encontrarProibidasV2('Recommended for income')).toContain('recomend*');
    expect(encontrarProibidasV2('Our recommendation')).toContain('recomend*');
  });

  it('os rótulos EN da lista fechada passam (palavra inteira: Revenue, OCF, Payout…)', () => {
    for (const r of [
      'Revenue',
      'Net income',
      'Net debt/EBITDA',
      'OCF adj./share (US$)',
      'Payout (÷ OCF adj.)',
      'Div. growing',
      'Profit streak',
      'Div. yield',
      'Revenue: annual growth > 0',
      'Payout ≤ 90% of OCF adj.',
      // 'sell' e 'buy' só como palavra inteira
      'Russell Road Holdings',
      'Buyback',
    ]) {
      expect(encontrarProibidasV2(r), r).toEqual([]);
    }
  });
});
