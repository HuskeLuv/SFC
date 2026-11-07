import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCarregarGrupos = vi.hoisted(() => vi.fn());
vi.mock('@/services/analises/coberturaFgc', () => ({
  carregarGruposCoberturaFgc: mockCarregarGrupos,
}));

import { aceitaEmissor } from '@/lib/fgc/produtosCobertos';
import {
  agruparCoberturaFgc,
  type InstRef,
  type ItemFgc,
} from '@/services/analises/agruparCoberturaFgc';
import type { ContextoMontador, Insumos } from '../insumos';
import { montarBlocoFgc, montarFgc, statusDoEmissor } from '../fgc';

const inst = (id: string, nome: string, extra: Partial<InstRef> = {}): InstRef => ({
  id,
  nome,
  cnpj: null,
  cnpjCalculado: false,
  tipoBacen: 'B1',
  codigo: null,
  conglomerado: null,
  ...extra,
});

const BMG = inst('bmg', 'Banco BMG S.A.', { cnpj: '61186680000174' });
const INTER = inst('inter', 'Banco Inter S.A.', { cnpj: '00416968000101' });
const SAFRA = inst('safra', 'Banco Safra', { cnpj: '58160789000128', conglomerado: 'C1' });
const J_SAFRA = inst('jsafra', 'Banco J. Safra', { cnpj: '03017677000120', conglomerado: 'C1' });
const XP_INV = inst('xpinv', 'XP Investimentos', { cnpj: '02332886000104', tipoBacen: 'N2' });

let seq = 0;
function rf(
  valorAtual: number,
  opts: { emissor?: InstRef | null; corretora?: InstRef | null; type?: string } = {},
): ItemFgc {
  seq += 1;
  const type = opts.type ?? 'CDB_PRE';
  const aceita = aceitaEmissor({
    type,
    tesouroBondType: null,
    assetSymbol: `RENDA-FIXA-${seq}`,
    pluggySubtype: null,
  });
  const coberto = !['CRI', 'CRA', 'LF'].includes(type.split('_')[0]);
  return {
    ativo: {
      id: `p${seq}`,
      nome: `Título ${seq}`,
      produto: type.split('_')[0],
      valorAtual,
      valorInvestido: valorAtual,
      vencimento: '2028-01-01T00:00:00.000Z',
      coberto,
      isentoIR: false,
    },
    coberto,
    valorAtual,
    temFi: true,
    aceita,
    deposito: false,
    emissor: aceita ? (opts.emissor ?? null) : null,
    corretora: opts.corretora ?? null,
    origem: 'manual',
    emissorInformadoTexto: null,
  };
}

const bloco = (itens: ItemFgc[]) => montarBlocoFgc(agruparCoberturaFgc(itens));

describe('statusDoEmissor (cortes da tela)', () => {
  it('< 80% dentro, 80% a < 100% atenção, ≥ 100% acima', () => {
    expect(statusDoEmissor(0)).toBe('dentro');
    expect(statusDoEmissor(79.99)).toBe('dentro');
    expect(statusDoEmissor(80)).toBe('atencao');
    expect(statusDoEmissor(99.99)).toBe('atencao');
    expect(statusDoEmissor(100)).toBe('acima');
    expect(statusDoEmissor(140)).toBe('acima');
  });
});

describe('montarBlocoFgc', () => {
  it('vazio: sem emissores, totais zerados, limites do FGC', () => {
    const b = bloco([]);
    expect(b).toEqual({
      limitePorEmissor: 250_000,
      tetoGlobal: 1_000_000,
      emissores: [],
      totalCoberto: 0,
      pctTetoGlobal: 0,
      totalExcedente: 0,
      rendaFixaSemCobertura: 0,
      avisos: [],
    });
  });

  it('típico: por emissor, do maior para o menor, nº de títulos e % do limite', () => {
    const b = bloco([
      rf(100_000, { emissor: BMG }),
      rf(68_478.56, { emissor: BMG }),
      rf(89_406.65, { emissor: INTER }),
    ]);
    expect(b.emissores).toEqual([
      {
        chave: '61186680',
        nome: 'Banco BMG S.A.',
        valorCoberto: 168_478.56,
        nTitulos: 2,
        pctLimite: 67.39,
        excedente: 0,
        status: 'dentro',
        usaCorretora: false,
      },
      expect.objectContaining({ nome: 'Banco Inter S.A.', nTitulos: 1, pctLimite: 35.76 }),
    ]);
    expect(b.totalCoberto).toBe(257_885.21);
    expect(b.pctTetoGlobal).toBe(25.79);
    expect(b.avisos).toEqual([]);
  });

  it('borda: acima do limite conta só R$ 250 mil no total; teto global de R$ 1 milhão', () => {
    const grandes = [BMG, INTER, SAFRA, J_SAFRA, inst('b5', 'Banco 5', { cnpj: '11111111000191' })];
    const b = bloco([
      rf(300_000, { emissor: BMG }),
      ...grandes.slice(1).map((e) => rf(240_000, { emissor: e })),
    ]);
    const bmg = b.emissores.find((e) => e.nome === 'Banco BMG S.A.')!;
    expect(bmg).toMatchObject({ pctLimite: 120, excedente: 50_000, status: 'acima' });
    expect(b.emissores.filter((e) => e.status === 'atencao')).toHaveLength(4);
    // 250 + 4 × 240 = 1.210 mil → limitado ao teto
    expect(b.totalCoberto).toBe(1_000_000);
    expect(b.pctTetoGlobal).toBe(100);
    expect(b.totalExcedente).toBe(50_000);
  });

  it('fora do FGC: só entra em rendaFixaSemCobertura, nunca como emissor', () => {
    const b = bloco([rf(50_000, { emissor: BMG }), rf(80_000, { type: 'CRI', corretora: XP_INV })]);
    expect(b.emissores.map((e) => e.nome)).toEqual(['Banco BMG S.A.']);
    expect(b.emissores[0].nTitulos).toBe(1);
    expect(b.rendaFixaSemCobertura).toBe(80_000);
  });

  it('avisos: mesmo conglomerado (soma e excedente) e emissor a informar', () => {
    const b = bloco([
      rf(150_000, { emissor: SAFRA }),
      rf(130_000, { emissor: J_SAFRA }),
      rf(20_000, { corretora: XP_INV }),
    ]);
    expect(b.avisos).toEqual([
      {
        tipo: 'conglomerado',
        nomes: ['Banco Safra', 'Banco J. Safra'],
        total: 280_000,
        acima: 30_000,
      },
      { tipo: 'emissorPendente', n: 1 },
    ]);
    const xp = b.emissores.find((e) => e.nome === 'XP Investimentos')!;
    expect(xp.usaCorretora).toBe(true);
  });
});

describe('montarFgc', () => {
  const ctx = (insumos: Insumos) => ({ userId: 'u1', insumos }) as unknown as ContextoMontador;

  beforeEach(() => {
    mockCarregarGrupos.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('carrega uma vez por insumos (trocar de período não recarrega)', async () => {
    mockCarregarGrupos.mockResolvedValue(agruparCoberturaFgc([rf(10_000, { emissor: BMG })]));
    const ins = {} as Insumos;
    const a = await montarFgc(ctx(ins));
    const b = await montarFgc(ctx(ins));
    expect(a).toBe(b);
    expect(a?.emissores).toHaveLength(1);
    expect(mockCarregarGrupos).toHaveBeenCalledTimes(1);
    expect(mockCarregarGrupos).toHaveBeenCalledWith('u1');
  });

  it('falha na carga vira null e a próxima chamada tenta de novo', async () => {
    mockCarregarGrupos.mockRejectedValueOnce(new Error('banco fora'));
    mockCarregarGrupos.mockResolvedValueOnce(agruparCoberturaFgc([]));
    const ins = {} as Insumos;
    expect(await montarFgc(ctx(ins))).toBeNull();
    expect(await montarFgc(ctx(ins))).toMatchObject({ emissores: [] });
    expect(mockCarregarGrupos).toHaveBeenCalledTimes(2);
  });
});
