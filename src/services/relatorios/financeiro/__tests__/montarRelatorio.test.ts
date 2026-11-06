import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Insumos } from '../insumos';

const m = vi.hoisted(() => ({
  montarOrcamento: vi.fn(),
  montarDividas: vi.fn(),
  montarCarteira: vi.fn(),
  montarCarteiraAvancada: vi.fn(),
  montarPlanejamento: vi.fn(),
  montarSonhos: vi.fn(),
  montarSaude: vi.fn(),
  montarIr: vi.fn(),
  montarIrGancho: vi.fn(),
}));

vi.mock('../orcamento', () => ({ montarOrcamento: m.montarOrcamento }));
vi.mock('../dividas', () => ({ montarDividas: m.montarDividas }));
vi.mock('../carteira', () => ({ montarCarteira: m.montarCarteira }));
vi.mock('../carteiraAvancada', () => ({ montarCarteiraAvancada: m.montarCarteiraAvancada }));
vi.mock('../planejamento', () => ({ montarPlanejamento: m.montarPlanejamento }));
vi.mock('../sonhos', () => ({ montarSonhos: m.montarSonhos }));
vi.mock('../saude', () => ({ montarSaude: m.montarSaude }));
vi.mock('../ir', () => ({ montarIr: m.montarIr, montarIrGancho: m.montarIrGancho }));
vi.mock('../insumos', () => ({ carregarInsumos: vi.fn() }));

import { montarRelatorioFinanceiro } from '../montarRelatorio';

const AGORA = new Date('2026-11-06T09:42:00-03:00');

function insumosFalsos(): Insumos & { saudeBase: ReturnType<typeof vi.fn> } {
  return {
    userId: 'cli-A',
    agora: AGORA,
    hojeSP: { ano: 2026, mes0: 10, dia: 6 },
    janela: [],
    inicioJanela: new Date('2025-11-01T00:00:00Z'),
    cashflowDoAno: vi.fn(),
    orcadosDosAnos: vi.fn(),
    saudeBase: vi.fn().mockResolvedValue({ asOf: '2026-11-06' }),
    snapshots13m: vi.fn(),
    performance13m: vi.fn(),
    dividasComPagamentos: vi.fn(),
    aportesMensais13m: vi.fn(),
    aportesCarteira13m: vi.fn(),
  } as unknown as Insumos & { saudeBase: ReturnType<typeof vi.fn> };
}

const params = (plano: 'basic' | 'pro' | 'adv', insumos: Insumos) => ({
  userId: 'cli-A',
  meses: 3 as const,
  plano,
  cliente: 'Ana Ribeiro',
  consultor: null,
  agora: AGORA,
  insumos,
});

describe('montarRelatorioFinanceiro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    m.montarOrcamento.mockResolvedValue({ tag: 'orcamento' });
    m.montarDividas.mockResolvedValue({ tag: 'dividas' });
    m.montarCarteira.mockResolvedValue({ tag: 'carteira' });
    m.montarCarteiraAvancada.mockResolvedValue({ tag: 'carteiraAvancada' });
    m.montarPlanejamento.mockResolvedValue({ tag: 'planejamento' });
    m.montarSonhos.mockResolvedValue([{ tag: 'sonho' }]);
    m.montarSaude.mockReturnValue({ tag: 'saude' });
    m.montarIr.mockResolvedValue({ tag: 'ir' });
    m.montarIrGancho.mockResolvedValue({ tag: 'irGancho' });
  });

  it('basic: só orçamento, dívidas e o gancho do IR; bloqueados não rodam', async () => {
    const ins = insumosFalsos();
    const r = await montarRelatorioFinanceiro(params('basic', ins));
    expect(r.plano).toBe('basic');
    expect(r.orcamento).toEqual({ tag: 'orcamento' });
    expect(r.dividas).toEqual({ tag: 'dividas' });
    expect(r.carteira).toBeNull();
    expect(r.planejamento).toBeNull();
    expect(r.sonhos).toBeNull();
    expect(r.carteiraAvancada).toBeNull();
    expect(r.saude).toBeNull();
    expect(r.ir).toBeNull();
    expect(r.irGancho).toEqual({ tag: 'irGancho' });
    for (const f of [
      m.montarCarteira,
      m.montarCarteiraAvancada,
      m.montarPlanejamento,
      m.montarSonhos,
      m.montarSaude,
      m.montarIr,
    ]) {
      expect(f).not.toHaveBeenCalled();
    }
    expect(ins.saudeBase).not.toHaveBeenCalled();
  });

  it('pro: carteira, planejamento e sonhos; Advanced null; gancho do IR', async () => {
    const ins = insumosFalsos();
    const r = await montarRelatorioFinanceiro(params('pro', ins));
    expect(r.carteira).toEqual({ tag: 'carteira' });
    expect(r.planejamento).toEqual({ tag: 'planejamento' });
    expect(r.sonhos).toEqual([{ tag: 'sonho' }]);
    expect(r.carteiraAvancada).toBeNull();
    expect(r.saude).toBeNull();
    expect(r.ir).toBeNull();
    expect(r.irGancho).toEqual({ tag: 'irGancho' });
    expect(m.montarCarteiraAvancada).not.toHaveBeenCalled();
    expect(m.montarIr).not.toHaveBeenCalled();
    expect(ins.saudeBase).not.toHaveBeenCalled();
  });

  it('adv: tudo, irGancho null, saúde na fase 2 com os blocos da fase 1', async () => {
    const ins = insumosFalsos();
    const r = await montarRelatorioFinanceiro(params('adv', ins));
    expect(r.carteiraAvancada).toEqual({ tag: 'carteiraAvancada' });
    expect(r.ir).toEqual({ tag: 'ir' });
    expect(r.saude).toEqual({ tag: 'saude' });
    expect(r.irGancho).toBeNull();
    expect(m.montarIrGancho).not.toHaveBeenCalled();
    expect(m.montarSaude).toHaveBeenCalledWith(
      expect.objectContaining({
        saudeBase: { asOf: '2026-11-06' },
        orcamento: { tag: 'orcamento' },
        dividas: { tag: 'dividas' },
        carteiraAvancada: { tag: 'carteiraAvancada' },
      }),
    );
  });

  it('cabeçalho do contrato e contexto dos montadores', async () => {
    const ins = insumosFalsos();
    const r = await montarRelatorioFinanceiro({ ...params('adv', ins), consultor: 'Carlos' });
    expect(r.versao).toBe(1);
    expect(r.cliente).toBe('Ana Ribeiro');
    expect(r.consultor).toBe('Carlos');
    expect(r.geradoEm).toBe('2026-11-06T09:42:00-03:00');
    expect(r.periodo.rotulo).toBe('Set/26 a Nov/26 · 3 meses');
    const ctx = m.montarOrcamento.mock.calls[0][0];
    expect(ctx).toMatchObject({
      userId: 'cli-A',
      meses: 3,
      mesesDoPeriodo: ['2026-09', '2026-10', '2026-11'],
      comConsultor: true,
      insumos: ins,
    });
  });

  it('loga o tempo de cada montador com o usuário em hash', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await montarRelatorioFinanceiro(params('adv', insumosFalsos()));
    const linha = JSON.parse(info.mock.calls.at(-1)?.[0] as string);
    expect(linha.evento).toBe('relatorio-financeiro');
    expect(linha.usuario).not.toContain('cli-A');
    expect(linha.usuario).toHaveLength(12);
    expect(Object.keys(linha.ms)).toEqual(
      expect.arrayContaining(['orcamento', 'dividas', 'carteira', 'ir', 'saude', 'total']),
    );
  });
});
