import { describe, expect, it } from 'vitest';
import { secaoOperacao } from '../secaoOperacao';
import { montarCorpoCompra, montarCorpoVenda, validarOperacao } from '../registroOperacao';

describe('secaoOperacao — seção da Carteira numa compra', () => {
  it('recompra usa a seção da posição e não pergunta (ação e FII)', () => {
    expect(
      secaoOperacao({
        classe: 'acao',
        posicao: { estrategia: 'growth', tipoFii: null },
        planejado: null,
        tipoCvm: null,
      }),
    ).toEqual({ valor: 'growth', editavel: false, origem: 'posicao' });
    expect(
      secaoOperacao({
        classe: 'fii',
        posicao: { estrategia: null, tipoFii: 'tijolo' },
        planejado: null,
        tipoCvm: 'papel',
      }),
    ).toEqual({ valor: 'tijolo', editavel: false, origem: 'posicao' });
  });

  it('planejado usa a secao do plano (não a da CVM)', () => {
    expect(
      secaoOperacao({
        classe: 'fii',
        posicao: null,
        planejado: { secao: 'tvm' },
        tipoCvm: 'tijolo',
      }),
    ).toEqual({ valor: 'tvm', editavel: true, origem: 'planejado' });
    expect(
      secaoOperacao({ classe: 'acao', posicao: null, planejado: { secao: 'risk' }, tipoCvm: null }),
    ).toEqual({ valor: 'risk', editavel: true, origem: 'planejado' });
  });

  it('FII novo sugere pela CVM (tijolo→tijolo, papel→tvm, fof→fofi)', () => {
    const fii = (tipoCvm: 'tijolo' | 'papel' | 'fof') =>
      secaoOperacao({ classe: 'fii', posicao: null, planejado: null, tipoCvm });
    expect(fii('tijolo')).toEqual({ valor: 'tijolo', editavel: true, origem: 'sugestao_cvm' });
    expect(fii('papel').valor).toBe('tvm');
    expect(fii('fof').valor).toBe('fofi');
  });

  it('sem nada = obrigatória (ação nova; FII híbrido/indefinido)', () => {
    const obrigatoria = { valor: null, editavel: true, origem: 'obrigatoria' };
    expect(
      secaoOperacao({ classe: 'acao', posicao: null, planejado: null, tipoCvm: null }),
    ).toEqual(obrigatoria);
    expect(
      secaoOperacao({ classe: 'fii', posicao: null, planejado: null, tipoCvm: 'hibrido' }),
    ).toEqual(obrigatoria);
  });

  it('valor fora das seções da aba é ignorado', () => {
    expect(
      secaoOperacao({
        classe: 'acao',
        posicao: { estrategia: null },
        planejado: { secao: 'brasil' },
        tipoCvm: null,
      }).origem,
    ).toBe('obrigatoria');
  });
});

describe('registroOperacao — corpos das rotas existentes', () => {
  it('compra de ação: estrategia sempre presente, taxa 0, valor = qtd × cotação', () => {
    expect(
      montarCorpoCompra({
        classe: 'acao',
        assetId: 'a-wege',
        ticker: 'wege3',
        instituicaoId: 'inst-xp',
        data: '2026-10-13',
        quantidade: 10,
        cotacao: 52.31,
        secao: 'growth',
      }),
    ).toEqual({
      tipoAtivo: 'acao',
      assetId: 'a-wege',
      ativo: 'WEGE3',
      instituicaoId: 'inst-xp',
      dataCompra: '2026-10-13',
      quantidade: 10,
      cotacaoUnitaria: 52.31,
      valorInvestido: 523.1,
      taxaCorretagem: 0,
      estrategia: 'growth',
    });
  });

  it('compra de FII manda tipoFii (sem estrategia)', () => {
    const corpo = montarCorpoCompra({
      classe: 'fii',
      assetId: 'a-kncr',
      ticker: 'KNCR11',
      instituicaoId: 'inst',
      data: '2026-10-13',
      quantidade: 3,
      cotacao: 103.3,
      secao: 'tvm',
    });
    expect(corpo).toMatchObject({ tipoAtivo: 'fii', tipoFii: 'tvm', valorInvestido: 309.9 });
    expect(corpo).not.toHaveProperty('estrategia');
  });

  it('venda: resgate por quantidade SEM instituicaoId', () => {
    const corpo = montarCorpoVenda({
      portfolioId: 'pf-1',
      data: '2026-10-13',
      quantidade: 5,
      cotacao: 50,
    });
    expect(corpo).toEqual({
      portfolioId: 'pf-1',
      dataResgate: '2026-10-13',
      metodoResgate: 'quantidade',
      quantidade: 5,
      cotacaoUnitaria: 50,
    });
    expect(corpo).not.toHaveProperty('instituicaoId');
  });

  it('validarOperacao: inteiro > 0, venda ≤ posição, data não futura, seção na compra', () => {
    const base = { data: '2026-10-13', hoje: '2026-10-13', posicao: 10, secao: 'value' };
    expect(validarOperacao({ ...base, operacao: 'compra', quantidade: 5 })).toEqual([]);
    expect(validarOperacao({ ...base, operacao: 'compra', quantidade: 1.5 })).toEqual([
      'quantidade_invalida',
    ]);
    expect(validarOperacao({ ...base, operacao: 'compra', quantidade: 0 })).toEqual([
      'quantidade_invalida',
    ]);
    expect(validarOperacao({ ...base, operacao: 'venda', quantidade: 11 })).toEqual([
      'acima_da_posicao',
    ]);
    expect(validarOperacao({ ...base, operacao: 'venda', quantidade: 10, secao: null })).toEqual(
      [],
    );
    expect(
      validarOperacao({ ...base, operacao: 'compra', quantidade: 1, data: '2026-10-14' }),
    ).toEqual(['data_futura']);
    expect(validarOperacao({ ...base, operacao: 'compra', quantidade: 1, secao: null })).toEqual([
      'sem_secao',
    ]);
    expect(
      validarOperacao({
        ...base,
        operacao: 'compra',
        quantidade: 1,
        cotacao: 0,
        instituicaoId: '',
      }),
    ).toEqual(['preco_invalido', 'sem_instituicao']);
  });
});
