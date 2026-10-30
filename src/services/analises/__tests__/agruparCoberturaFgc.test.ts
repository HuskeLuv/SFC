import { describe, it, expect } from 'vitest';
import {
  agruparCoberturaFgc,
  fonteInstituicao,
  type AtivoFgcBase,
  type InstRef,
  type ItemFgc,
} from '../agruparCoberturaFgc';
import { aceitaEmissor } from '@/lib/fgc/produtosCobertos';

const inst = (id: string, nome: string, extra: Partial<InstRef> = {}): InstRef => ({
  id,
  nome,
  cnpj: null,
  cnpjCalculado: false,
  tipoBacen: null,
  codigo: null,
  conglomerado: null,
  ...extra,
});

const BANCO_XP = inst('bxp', 'Banco XP S.A.', {
  cnpj: '33264668000103',
  tipoBacen: 'B1',
  codigo: '348',
});
const BTG = inst('btg', 'BTG Pactual', { cnpj: '30306294000145', tipoBacen: 'B1', codigo: '208' });
const XP_INV = inst('xpinv', 'XP Investimentos', {
  cnpj: '02332886000104',
  tipoBacen: 'N2',
  codigo: '102',
});
const SAFRA = inst('safra', 'Banco Safra', {
  cnpj: '58160789000128',
  tipoBacen: 'B1',
  conglomerado: 'C0080109',
});
const J_SAFRA = inst('jsafra', 'Banco J. Safra', {
  cnpj: '03017677000120',
  tipoBacen: 'B1',
  conglomerado: 'C0080109',
});

let seq = 0;
function rf(
  valorAtual: number,
  opts: {
    emissor?: InstRef | null;
    corretora?: InstRef | null;
    type?: string;
    symbol?: string;
    pluggySubtype?: string | null;
    origem?: 'manual' | 'openFinance';
    emissorInformadoTexto?: string | null;
  } = {},
): ItemFgc {
  seq += 1;
  const type = opts.type ?? 'CDB_PRE';
  const aceita = aceitaEmissor({
    type,
    tesouroBondType: null,
    assetSymbol: opts.symbol ?? `RENDA-FIXA-${seq}`,
    pluggySubtype: opts.pluggySubtype ?? null,
  });
  const coberto = ['CDB', 'LC', 'LCI', 'LCA', 'RDB', 'DPGE', 'LIG', 'RDC'].includes(
    type.split('_')[0],
  );
  const ativo: AtivoFgcBase = {
    id: `p${seq}`,
    nome: `Título ${seq}`,
    produto: type.split('_')[0],
    valorAtual,
    valorInvestido: valorAtual,
    vencimento: '2028-01-01T00:00:00.000Z',
    coberto,
    isentoIR: false,
  };
  return {
    ativo,
    coberto,
    valorAtual,
    temFi: true,
    aceita,
    deposito: false,
    emissor: aceita ? (opts.emissor ?? null) : null,
    corretora: opts.corretora ?? null,
    origem: opts.origem ?? 'manual',
    emissorInformadoTexto: opts.emissorInformadoTexto ?? null,
  };
}

function deposito(valorAtual: number, corretora: InstRef | null, produto = 'Conta Corrente') {
  seq += 1;
  return {
    ativo: {
      id: `p${seq}`,
      nome: produto,
      produto,
      valorAtual,
      valorInvestido: valorAtual,
      vencimento: null,
      coberto: true,
      isentoIR: produto === 'Poupança',
    },
    coberto: true,
    valorAtual,
    temFi: false,
    aceita: false,
    deposito: true,
    emissor: null,
    corretora,
    origem: 'manual' as const,
    emissorInformadoTexto: null,
  } satisfies ItemFgc;
}

describe('agruparCoberturaFgc', () => {
  it('CDB Banco XP via BTG + via XP e CDB BTG: 2 grupos, Banco XP com 2 corretoras e excedente', () => {
    const r = agruparCoberturaFgc([
      rf(186_420, { emissor: BANCO_XP, corretora: BTG }),
      rf(124_310, { emissor: BANCO_XP, corretora: XP_INV }),
      rf(95_000, { emissor: BTG, corretora: BTG }),
    ]);
    expect(r.grupos).toHaveLength(2);
    const bxp = r.grupos.find((g) => g.chave === '33264668')!;
    expect(bxp.instituicaoNome).toBe('Banco XP S.A.');
    expect(bxp.corretoras.map((c) => c.nome)).toEqual(['BTG Pactual', 'XP Investimentos']);
    expect(bxp.totalCoberto).toBe(310_730);
    expect(bxp.excedente).toBe(60_730);
    expect(bxp.usaCorretoraComoEmissor).toBe(false);
    expect(bxp.ativos.every((a) => a.fonteInstituicao === 'emissor')).toBe(true);
    expect(r.resumo.totalExcedente).toBe(60_730);
    expect(r.resumo.totalEfetivamenteCoberto).toBe(250_000 + 95_000);
    expect(r.grupos[0].chave).toBe('33264668'); // ordenado pelo coberto
  });

  it('CDB sem emissor via BTG + conta corrente BTG: fallback com 1 sem emissor', () => {
    const r = agruparCoberturaFgc([rf(90_000, { corretora: BTG }), deposito(10_000, BTG)]);
    expect(r.grupos).toHaveLength(1);
    const g = r.grupos[0];
    expect(g.instituicaoId).toBe('btg');
    expect(g.usaCorretoraComoEmissor).toBe(true);
    expect(g.ativosSemEmissor).toBe(1);
    expect(g.ativos[0].fonteInstituicao).toBe('corretora');
    expect(g.ativos[0].editarEmissorHref).toBe(`/ativos/${g.ativos[0].id}/editar?editar=emissor`);
    expect(g.ativos[1].fonteInstituicao).toBe('nao-se-aplica');
    expect(g.ativos[1].editarEmissorHref).toBeNull();
    expect(g.totalCoberto).toBe(100_000);
  });

  it('debênture/fundo gravados como CDB e Pluggy DEBENTURE: contam, mas não pedem emissor', () => {
    const r = agruparCoberturaFgc([
      rf(80_000, { corretora: BTG, symbol: 'DEBENTURE-ABC1', emissor: BANCO_XP }),
      rf(50_000, { corretora: BTG, symbol: 'FUNDO-XYZ' }),
      rf(40_000, {
        symbol: 'PLUGGY-RF-123',
        pluggySubtype: 'DEBENTURE',
        origem: 'openFinance',
      }),
    ]);
    const todos = r.grupos.flatMap((g) => g.ativos);
    expect(todos.every((a) => a.fonteInstituicao === 'nao-se-aplica')).toBe(true);
    expect(todos.every((a) => a.editarEmissorHref === null)).toBe(true);
    expect(todos.every((a) => a.aceitaEmissor === false)).toBe(true);
    const btg = r.grupos.find((g) => g.instituicaoId === 'btg')!;
    // Emissor gravado numa debênture é ignorado: continua na corretora, como hoje.
    expect(btg.totalCoberto).toBe(130_000);
    expect(btg.usaCorretoraComoEmissor).toBe(false);
    expect(btg.ativosSemEmissor).toBe(0);
    const desc = r.grupos.find((g) => g.chave === 'desconhecida')!;
    expect(desc.ativosSemEmissor).toBe(0);
    expect(desc.temOpenFinance).toBe(true);
    // isFgcCovered não mudou: tudo conta como coberto.
    expect(r.resumo.totalEfetivamenteCoberto).toBe(170_000);
  });

  it('emissor gravado é XP CCTVM (N2): titularNaoEmissor', () => {
    const r = agruparCoberturaFgc([rf(50_000, { emissor: XP_INV, corretora: XP_INV })]);
    const g = r.grupos[0];
    expect(g.titularNaoEmissor).toBe(true);
    expect(g.usaCorretoraComoEmissor).toBe(false);
    expect(g.ativos[0].fonteInstituicao).toBe('emissor-nao-emissor');
    expect(g.ativos[0].editarEmissorHref).not.toBeNull();
  });

  it('dois registros com a mesma raiz de CNPJ caem num grupo só', () => {
    const outraLinha = inst('bxp-bcb', 'BANCO XP S.A.', {
      cnpj: '33264668000103',
      cnpjCalculado: true,
      tipoBacen: 'B1',
      codigo: 'BCB-33264668',
    });
    const filial = inst('bxp-filial', 'Banco XP filial', { cnpj: '33.264.668/0002-84' });
    const r = agruparCoberturaFgc([
      rf(100_000, { emissor: BANCO_XP, corretora: BTG }),
      rf(100_000, { emissor: outraLinha, corretora: BTG }),
      rf(100_000, { emissor: filial, corretora: XP_INV }),
    ]);
    expect(r.grupos).toHaveLength(1);
    expect(r.grupos[0].excedente).toBe(50_000);
  });

  it('dois grupos do mesmo conglomerado: 1 aviso, sem mudar os limites', () => {
    const r = agruparCoberturaFgc([
      rf(162_400, { emissor: SAFRA, corretora: BTG, type: 'LCA_POS' }),
      rf(118_900, { emissor: J_SAFRA, corretora: XP_INV }),
      rf(10_000, { emissor: BANCO_XP, corretora: BTG }),
    ]);
    expect(r.grupos).toHaveLength(3);
    expect(r.avisosConglomerado).toEqual([
      {
        conglomerado: 'C0080109',
        chaves: ['58160789', '03017677'],
        nomes: ['Banco Safra', 'Banco J. Safra'],
      },
    ]);
    expect(r.resumo.totalExcedente).toBe(0);
    expect(r.resumo.totalEfetivamenteCoberto).toBe(162_400 + 118_900 + 10_000);
  });

  it('poupança sozinha: sem fallback', () => {
    const r = agruparCoberturaFgc([deposito(20_000, BTG, 'Poupança')]);
    expect(r.grupos[0].usaCorretoraComoEmissor).toBe(false);
    expect(r.grupos[0].ativosSemEmissor).toBe(0);
  });

  it('Open Finance sem casamento: "Emissor não identificado" com o texto recebido', () => {
    const r = agruparCoberturaFgc([
      rf(30_000, {
        symbol: 'PLUGGY-RF-9',
        pluggySubtype: 'CDB',
        origem: 'openFinance',
        emissorInformadoTexto: 'ARBI',
      }),
    ]);
    const g = r.grupos[0];
    expect(g.chave).toBe('desconhecida');
    expect(g.instituicaoNome).toBe('Emissor não identificado');
    expect(g.ativos[0].fonteInstituicao).toBe('desconhecida');
    expect(g.ativos[0].emissorInformadoTexto).toBe('ARBI');
    expect(g.ativos[0].origem).toBe('openFinance');
    expect(g.ativosSemEmissor).toBe(1);
    expect(g.usaCorretoraComoEmissor).toBe(false);
  });

  it('fonteInstituicao: emissor de tipo desconhecido (linha antiga) conta como emissor', () => {
    const antigo = inst('old', 'Banco Antigo', { codigo: '999' });
    expect(fonteInstituicao(rf(1, { emissor: antigo, corretora: BTG }))).toBe('emissor');
    const corretoraAntiga = inst('cor', 'Ágora', { codigo: 'COR-AGORA' });
    expect(fonteInstituicao(rf(1, { emissor: corretoraAntiga }))).toBe('emissor-nao-emissor');
  });
});

// ── Regressão: sem emissor diferente da corretora, os números são os mesmos de antes ──────

/** Algoritmo de antes (cobertura-fgc/route.ts em a25f9621), só a parte de agrupar e somar. */
function algoritmoAntigo(
  itens: { instId: string | null; inst: InstRef | null; valorAtual: number; coberto: boolean }[],
) {
  const LIM = 250_000;
  const groups = new Map<
    string,
    { totalCoberto: number; totalNaoCoberto: number; totalValor: number; n: number }
  >();
  for (const it of itens) {
    const instId = it.instId || 'desconhecida';
    const key = it.inst?.cnpj || instId;
    if (!groups.has(key)) {
      groups.set(key, { totalCoberto: 0, totalNaoCoberto: 0, totalValor: 0, n: 0 });
    }
    const g = groups.get(key)!;
    g.n += 1;
    if (it.coberto) g.totalCoberto += it.valorAtual;
    else g.totalNaoCoberto += it.valorAtual;
    g.totalValor += it.valorAtual;
  }
  const inst = Array.from(groups.values()).map((g) => ({
    excedente: Math.round(Math.max(0, g.totalCoberto - LIM) * 100) / 100,
    totalCoberto: Math.round(g.totalCoberto * 100) / 100,
    totalNaoCoberto: Math.round(g.totalNaoCoberto * 100) / 100,
    totalValor: Math.round(g.totalValor * 100) / 100,
    n: g.n,
  }));
  const totalCoberto = inst.reduce((s, i) => s + Math.min(i.totalCoberto, LIM), 0);
  const totalEfetivamenteCoberto = Math.min(totalCoberto, 1_000_000);
  const totalValorRendaFixa = inst.reduce((s, i) => s + i.totalValor, 0);
  return {
    totalEfetivamenteCoberto: Math.round(totalEfetivamenteCoberto * 100) / 100,
    totalNaoCoberto: Math.round(inst.reduce((s, i) => s + i.totalNaoCoberto, 0) * 100) / 100,
    totalExcedente: Math.round(inst.reduce((s, i) => s + i.excedente, 0) * 100) / 100,
    totalValorRendaFixa: Math.round(totalValorRendaFixa * 100) / 100,
    percentualCoberto:
      totalValorRendaFixa > 0
        ? Math.round((totalEfetivamenteCoberto / totalValorRendaFixa) * 100 * 100) / 100
        : 0,
    totalAtivos: inst.reduce((s, i) => s + i.n, 0),
    totalInstituicoes: inst.length,
  };
}

describe('regressão: usuário sem emissor diferente da corretora', () => {
  it('totais idênticos ao algoritmo antigo', () => {
    const inter = inst('inter', 'Banco Inter', { cnpj: '00416968000101', tipoBacen: 'B1' });
    const semCatalogo = inst('sumiu', 'Instituição não identificada');
    const itens: ItemFgc[] = [
      rf(310_000.55, { corretora: BTG }),
      rf(95_000.1, { corretora: BTG, emissor: BTG }), // emissor = corretora (cadastro novo)
      rf(70_400, { corretora: inter, type: 'LCI_POS' }),
      deposito(12_345.67, inter),
      rf(80_000, { corretora: XP_INV, type: 'CRI_PRE' }),
      rf(60_000, { corretora: XP_INV, symbol: 'DEBENTURE-X' }),
      rf(55_000, { corretora: semCatalogo }),
      rf(40_000, { corretora: null }),
      rf(700_000, { corretora: SAFRA, emissor: SAFRA }),
      deposito(5_000, null, 'Poupança'),
    ];
    const antigo = algoritmoAntigo(
      itens.map((i) => ({
        instId: i.corretora?.id ?? null,
        inst: i.corretora && i.corretora.id !== 'sumiu' ? i.corretora : null,
        valorAtual: i.valorAtual,
        coberto: i.coberto,
      })),
    );
    const { resumo } = agruparCoberturaFgc(itens);
    expect(resumo).toEqual({
      ...antigo,
      limiteGlobal: 1_000_000,
      limitePorInstituicao: 250_000,
    });
  });
});
