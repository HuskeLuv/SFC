import { describe, expect, it } from 'vitest';
import { secaoOperacao, tipoCvmDoTopo } from '../secaoOperacao';
import type { AtivoTopoResposta, FiiTipoTela } from '@/types/analiseAtivosApi';
import { montarCorpoCompra, montarCorpoVenda, validarOperacao } from '../registroOperacao';

describe('secaoOperacao — seção automática da Carteira numa compra (v2.5)', () => {
  const nova = (classe: 'acao' | 'fii', tipoCvm: FiiTipoTela | null = null) =>
    secaoOperacao({ classe, posicao: null, planejado: null, tipoCvm });

  it('recompra usa a seção da posição (ação e FII), mesmo com outro tipo na CVM', () => {
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
        tipoCvm: 'fof',
      }),
    ).toEqual({ valor: 'tijolo', editavel: false, origem: 'posicao' });
  });

  it('planejado antigo usa a secao do plano (não a da CVM)', () => {
    expect(
      secaoOperacao({
        classe: 'fii',
        posicao: null,
        planejado: { secao: 'tvm' },
        tipoCvm: 'tijolo',
      }),
    ).toEqual({ valor: 'tvm', editavel: false, origem: 'planejado' });
    expect(
      secaoOperacao({ classe: 'acao', posicao: null, planejado: { secao: 'risk' }, tipoCvm: null }),
    ).toEqual({ valor: 'risk', editavel: false, origem: 'planejado' });
  });

  it('ação nova → value (padrão)', () => {
    expect(nova('acao')).toEqual({ valor: 'value', editavel: false, origem: 'padrao' });
  });

  it('FII novo: papel → tvm; tijolo → tijolo; FoF → fofi; híbrido/indefinido → tvm', () => {
    expect(nova('fii', 'papel')).toEqual({ valor: 'tvm', editavel: false, origem: 'sugestao_cvm' });
    expect(nova('fii', 'tijolo').valor).toBe('tijolo');
    expect(nova('fii', 'fof').valor).toBe('fofi');
    expect(nova('fii', 'hibrido').valor).toBe('tvm');
    expect(nova('fii', 'indefinido').valor).toBe('tvm');
  });

  it('FII sem tipo conhecido → tvm (padrão); nunca "obrigatoria"', () => {
    expect(nova('fii')).toEqual({ valor: 'tvm', editavel: false, origem: 'padrao' });
    for (const classe of ['acao', 'fii'] as const) {
      expect(nova(classe).valor).not.toBeNull();
      expect(nova(classe).origem).not.toBe('obrigatoria');
    }
  });

  it('valor fora das seções da aba é ignorado (cai no padrão)', () => {
    expect(
      secaoOperacao({
        classe: 'acao',
        posicao: null,
        planejado: { secao: 'brasil' },
        tipoCvm: null,
      }),
    ).toEqual({ valor: 'value', editavel: false, origem: 'padrao' });
  });

  it('posição sem seção válida usa o fallback da Carteira (FII → fofi; ação → value), não a CVM', () => {
    expect(
      secaoOperacao({
        classe: 'fii',
        posicao: { estrategia: null, tipoFii: null },
        planejado: { secao: 'tijolo' },
        tipoCvm: 'papel',
      }),
    ).toEqual({ valor: 'fofi', editavel: false, origem: 'posicao' });
    expect(
      secaoOperacao({
        classe: 'acao',
        posicao: { estrategia: 'brasil' },
        planejado: { secao: 'risk' },
        tipoCvm: null,
      }),
    ).toEqual({ valor: 'value', editavel: false, origem: 'posicao' });
  });
});

describe('tipoCvmDoTopo — tipo para a seção automática', () => {
  const topo = (
    extra: Partial<Pick<AtivoTopoResposta, 'fiiTipoCvm' | 'criterios' | 'tags'>> = {},
  ): Pick<AtivoTopoResposta, 'classe' | 'tags' | 'criterios' | 'fiiTipoCvm'> => ({
    classe: 'fii',
    tags: [],
    criterios: null,
    ...extra,
  });
  const perfil = (p: string) => ({ perfil: p }) as unknown as AtivoTopoResposta['criterios'];

  it('FoF (tipo CVM bruto) vence o perfil de papel → fof → seção fofi', () => {
    const t = tipoCvmDoTopo(topo({ fiiTipoCvm: 'fof', criterios: perfil('fii_papel') }));
    expect(t).toBe('fof');
    expect(nova2(t)).toBe('fofi');
  });

  it('perfil tijolo/papel; sem perfil, o tipo CVM bruto; ação → null', () => {
    expect(tipoCvmDoTopo(topo({ fiiTipoCvm: 'hibrido', criterios: perfil('fii_tijolo') }))).toBe(
      'tijolo',
    );
    expect(tipoCvmDoTopo(topo({ criterios: perfil('fii_papel') }))).toBe('papel');
    expect(tipoCvmDoTopo(topo({ fiiTipoCvm: 'tijolo' }))).toBe('tijolo');
    expect(tipoCvmDoTopo({ ...topo(), classe: 'acao' })).toBeNull();
  });

  function nova2(tipo: FiiTipoTela | null) {
    return secaoOperacao({ classe: 'fii', posicao: null, planejado: null, tipoCvm: tipo }).valor;
  }
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

  it('validarOperacao: inteiro > 0, venda ≤ posição, data não futura (sem erro de seção)', () => {
    const base = { data: '2026-10-13', hoje: '2026-10-13', posicao: 10 };
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
    expect(validarOperacao({ ...base, operacao: 'venda', quantidade: 10 })).toEqual([]);
    expect(
      validarOperacao({ ...base, operacao: 'compra', quantidade: 1, data: '2026-10-14' }),
    ).toEqual(['data_futura']);
    // compra de ativo sem posição: nada a pedir de seção
    expect(validarOperacao({ ...base, posicao: null, operacao: 'compra', quantidade: 1 })).toEqual(
      [],
    );
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
