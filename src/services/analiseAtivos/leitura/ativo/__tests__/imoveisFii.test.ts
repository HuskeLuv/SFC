/**
 * Leitura da seção "Imóveis e composição do fundo" (A6, fatia A). Banco falso com o FII FICTÍCIO
 * XPTO11 (CNPJ, nomes e números inventados).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const m = vi.hoisted(() => ({
  linha: vi.fn(),
  mensal: vi.fn(),
  ultimoTri: vi.fn(),
  imoveis: vi.fn(),
  setores: vi.fn(),
  essencial: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    fiiMonthly: { findMany: m.mensal },
    fiiImovelTrimestral: { findFirst: m.ultimoTri, findMany: m.imoveis },
    fiiInquilinoSetorTrimestral: { findMany: m.setores },
  },
}));
vi.mock('@/services/analiseAtivos/leitura/linhasQuadro', () => ({
  obterLinhaQuadro: m.linha,
  versaoQuadro: async () => 'v1',
}));
vi.mock('@/services/analiseAtivos/leitura/ativo/fundamentosEssencial', async (orig) => ({
  ...(await orig<object>()),
  obterFundamentosEssencial: m.essencial,
}));

import {
  _limparCacheImoveisFii,
  mesesAntes,
  obterImoveisFii,
} from '@/services/analiseAtivos/leitura/ativo/imoveisFii';

const CNPJ = '99888777000166';
const HOJE = '2026-10-19';
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const dec = (n: number) => new Prisma.Decimal(n);

const MENSAL = {
  refMonth: d('2026-09-01'),
  ativoTotal: dec(1000),
  imoveis: dec(850),
  spe: null,
  cri: dec(30),
  lciLca: null,
  cotasFii: dec(20),
  rendaFixa: dec(60),
  acoes: null,
  valoresReceber: null,
};

function linhaQuadro(p: Partial<{ classe: string; fiiTipo: string | null; flags: string[] }>) {
  return { symbol: 'XPTO11', classe: 'fii', cnpj: CNPJ, fiiTipo: 'tijolo', flags: [], ...p };
}

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  _limparCacheImoveisFii('XPTO11', 'v1');
  m.linha.mockResolvedValue(linhaQuadro({}));
  m.mensal.mockResolvedValue([MENSAL]);
  m.ultimoTri.mockResolvedValue({ refQuarter: d('2026-06-30') });
  m.imoveis.mockResolvedValue([
    {
      ordem: 0,
      classe: 'Imóveis para renda acabados',
      nome: 'Galpão Alfa',
      endereco: 'Rua das Flores, 10, Cidade Y, SP',
      ufInferida: 'SP',
      area: dec(5000),
      unidades: 2,
      vacanciaPct: 0,
      receitaPct: 60,
    },
    {
      ordem: 1,
      classe: 'Imóveis para renda acabados',
      nome: 'Galpão Beta',
      endereco: 'Rodovia BR 000, Km 1',
      ufInferida: null,
      area: dec(8000),
      unidades: 1,
      vacanciaPct: 10,
      receitaPct: 35,
    },
  ]);
  m.setores.mockResolvedValue([
    { setor: 'Setor1', pctReceitaFii: 50, placeholder: true },
    { setor: 'Logística', pctReceitaFii: 45, placeholder: false },
  ]);
  m.essencial.mockResolvedValue({
    dados: {
      linhas: [
        { ano: 2025, valores: { vacancia: { estado: 'ok', valor: 3 } } },
        { ano: null, valores: { vacancia: { estado: 'ok', valor: 6.15 } } },
      ],
    },
    cache: false,
  });
});

describe('obterImoveisFii', () => {
  it('tijolo: composição + lista; vacância = célula da última linha do Essencial', async () => {
    const r = await obterImoveisFii('xpto11', HOJE);
    expect(r?.cache).toBe(false);
    const dados = r!.dados;
    expect(dados.ticker).toBe('XPTO11');
    expect(dados.versao).toBe('v1');
    expect(dados.composicao.estado).toBe('ok');
    if (dados.imoveis.estado !== 'ok') throw new Error('esperava lista');
    expect(dados.imoveis.valor.refQuarter).toBe('2026-06-30');
    expect(dados.imoveis.valor.imoveis.map((i) => i.nome)).toEqual(['Galpão Beta', 'Galpão Alfa']);
    expect(dados.imoveis.valor.resumo).toMatchObject({
      nImoveisRenda: 2,
      areaTotalM2: 13000,
      vacanciaFisicaPct: { estado: 'ok', valor: 6.15 },
      nEstados: 1,
      nComUf: 1,
      setores: [{ setor: 'Logística', receitaPct: 45 }],
    });
    expect(m.mensal.mock.calls[0][0].where.refMonth.gte).toEqual(d('2025-09-01'));
    // 2ª chamada: cache por ticker:versão
    expect((await obterImoveisFii('XPTO11', HOJE))?.cache).toBe(true);
  });

  it('papel: só a composição; a lista nem é lida', async () => {
    m.linha.mockResolvedValue(linhaQuadro({ fiiTipo: 'papel' }));
    const r = await obterImoveisFii('XPTO11', HOJE);
    expect(r!.dados.imoveis).toMatchObject({
      estado: 'nao_se_aplica',
      motivo: 'nao_se_aplica_tipo',
    });
    expect(m.ultimoTri).not.toHaveBeenCalled();
    expect(m.essencial).not.toHaveBeenCalled();
  });

  it('ação ou ticker fora da área: null (404)', async () => {
    m.linha.mockResolvedValue(linhaQuadro({ classe: 'acao' }));
    expect(await obterImoveisFii('XPTO11', HOJE)).toBeNull();
    m.linha.mockResolvedValue(null);
    expect(await obterImoveisFii('XPTO11', HOJE)).toBeNull();
  });

  it('FII sem nenhum informe nas janelas: null (404)', async () => {
    m.mensal.mockResolvedValue([]);
    m.ultimoTri.mockResolvedValue(null);
    expect(await obterImoveisFii('XPTO11', HOJE)).toBeNull();
  });

  it('linha mensal sem composição é pulada; sem trimestral: lista sem dado', async () => {
    m.mensal.mockResolvedValue([
      {
        ...MENSAL,
        refMonth: d('2026-10-01'),
        imoveis: null,
        cri: null,
        cotasFii: null,
        rendaFixa: null,
      },
      MENSAL,
    ]);
    m.ultimoTri.mockResolvedValue(null);
    const r = await obterImoveisFii('XPTO11', HOJE);
    expect(r!.dados.composicao).toMatchObject({ estado: 'ok', valor: { refMonth: '2026-09-01' } });
    expect(r!.dados.imoveis).toMatchObject({ estado: 'ausente', motivo: 'sem_informe_trimestral' });
  });

  it('ticker↔CNPJ em conferência: as duas partes em conferência, sem ler o informe', async () => {
    m.linha.mockResolvedValue(linhaQuadro({ flags: ['cnpj_em_conferencia'] }));
    const r = await obterImoveisFii('XPTO11', HOJE);
    expect(r!.dados.composicao).toMatchObject({ motivo: 'cnpj_em_conferencia' });
    expect(r!.dados.imoveis).toMatchObject({ motivo: 'cnpj_em_conferencia' });
    expect(m.mensal).not.toHaveBeenCalled();
  });

  it('Essencial falha: vacância sem dado (o resto continua)', async () => {
    m.essencial.mockRejectedValue(new Error('x'));
    const r = await obterImoveisFii('XPTO11', HOJE);
    if (r!.dados.imoveis.estado !== 'ok') throw new Error('esperava lista');
    expect(r!.dados.imoveis.valor.resumo.vacanciaFisicaPct.estado).toBe('ausente');
  });

  it('mesesAntes', () => {
    expect(mesesAntes('2026-10-19', 13)).toBe('2025-09-01');
    expect(mesesAntes('2026-02-28', 15)).toBe('2024-11-01');
  });
});
