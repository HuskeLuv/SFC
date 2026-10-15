import { describe, expect, it, vi } from 'vitest';
import { CRITERIA_PARAMS_V1 } from '../criteriaParamsV1';
import { criteriaParamsSchema, criteriosDoPerfil, idsNaoSeAplica } from '../criteriaParamsSchema';
import { ErroParams, obterCriteriaParams, validarCriteriaParams } from '../obterCriteriaParams';

const copia = () => structuredClone(CRITERIA_PARAMS_V1);

describe('CriteriaParams v1', () => {
  it('é válido pelo schema estrito', () => {
    expect(criteriaParamsSchema.safeParse(CRITERIA_PARAMS_V1).success).toBe(true);
    expect(validarCriteriaParams(CRITERIA_PARAMS_V1).versao).toBe(1);
  });

  it('janelas 3/5/10 com padrão 5 e âncora em maio', () => {
    expect(CRITERIA_PARAMS_V1.janelas).toEqual([3, 5, 10]);
    expect(CRITERIA_PARAMS_V1.janelaPadrao).toBe(5);
    expect(CRITERIA_PARAMS_V1.ancoraAno.mesLiberaAnoAnterior).toBe(5);
  });

  it('6 critérios por perfil, na ordem do protótipo', () => {
    expect(CRITERIA_PARAMS_V1.perfis.acao.map((c) => c.id)).toEqual([
      'rec',
      'luc',
      'ebitda',
      'mg',
      'dl',
      'fcl',
    ]);
    expect(CRITERIA_PARAMS_V1.perfis.fii_tijolo.map((c) => c.id)).toEqual([
      'rend',
      'vp',
      'vac',
      'alav',
      'mes',
      'res',
    ]);
    expect(CRITERIA_PARAMS_V1.perfis.fii_papel.map((c) => c.id)).toEqual([
      'rend',
      'vp',
      'inad',
      'ltv',
      'mes',
      'res',
    ]);
  });

  it('limites do screen.js e rótulos decididos', () => {
    const porId = Object.fromEntries(
      [
        ...CRITERIA_PARAMS_V1.perfis.acao,
        ...CRITERIA_PARAMS_V1.perfis.fii_tijolo,
        ...CRITERIA_PARAMS_V1.perfis.fii_papel,
      ].map((c) => [c.id, c]),
    );
    expect(porId.dl.limite).toBe(3);
    expect(porId.dl.rotulo).toBe('Dív. líq./EBITDA ≤ 3×');
    expect(porId.vac.limite).toBe(10);
    expect(porId.alav.limite).toBe(20);
    expect(porId.alav.rotulo).toBe('Obrigações/PL ≤ 20%');
    expect(porId.inad.limite).toBe(3);
    expect(porId.ltv.limite).toBe(60);
    // FCL = fco − capex, nunca o campo fcf
    expect(porId.fcl.serie).toBe('fcl');
    expect(porId.fcl.definicao).toContain('FCO − CAPEX');
  });

  it('D3: vacância, inadimplência e LTV inativos com motivo; o resto ativo', () => {
    const todos = [
      ...CRITERIA_PARAMS_V1.perfis.acao,
      ...CRITERIA_PARAMS_V1.perfis.fii_tijolo,
      ...CRITERIA_PARAMS_V1.perfis.fii_papel,
    ];
    const inativos = [...new Set(todos.filter((c) => c.ativo === false).map((c) => c.id))];
    expect(inativos.sort()).toEqual(['inad', 'ltv', 'vac']);
    for (const c of todos.filter((x) => x.ativo === false)) {
      expect(c.motivoInativo).toBe('sem_fonte_confiavel');
    }
  });

  it('D4: financeira com naoSeAplica de 3 (n de 3) sobre a lista de ações', () => {
    expect(CRITERIA_PARAMS_V1.perfis.acao_financeira.naoSeAplica).toEqual(['ebitda', 'dl', 'fcl']);
    expect(criteriosDoPerfil(CRITERIA_PARAMS_V1, 'acao_financeira')).toHaveLength(6);
    const aplicaveis =
      criteriosDoPerfil(CRITERIA_PARAMS_V1, 'acao_financeira').length -
      idsNaoSeAplica(CRITERIA_PARAMS_V1, 'acao_financeira').length;
    expect(aplicaveis).toBe(3);
    expect(idsNaoSeAplica(CRITERIA_PARAMS_V1, 'acao')).toEqual([]);
  });

  it('regras: equivalências, híbrido 50%, Dív.líq/EBITDA e meses', () => {
    expect(CRITERIA_PARAMS_V1.equivalencias).toEqual({ vac: 'inad', alav: 'ltv' });
    expect(CRITERIA_PARAMS_V1.regraHibrido.limiarImoveisPlPct).toBe(50);
    expect(CRITERIA_PARAMS_V1.regraHibrido.aplicaA).toContain('fof');
    expect(CRITERIA_PARAMS_V1.dlEbitda).toEqual({
      caixaLiquido: 'atende',
      exibirNegativoComoZero: true,
      ebitdaNaoPositivo: 'nao_atende_se_dl_positiva',
    });
    expect(CRITERIA_PARAMS_V1.meses).toEqual({ ancora: 'fim_anoFim', mesesBaseCurta: 'sem_dado' });
  });
});

describe('criteriaParamsSchema recusa', () => {
  const invalido = (p: unknown) => criteriaParamsSchema.safeParse(p).success === false;

  it('chave extra na raiz, no perfil e no critério', () => {
    expect(invalido({ ...copia(), extra: 1 })).toBe(true);
    const p = copia();
    (p.perfis.acao[0] as Record<string, unknown>).peso = 0.2;
    expect(invalido(p)).toBe(true);
    const q = copia();
    (q.perfis as Record<string, unknown>).stocks = [];
    expect(invalido(q)).toBe(true);
  });

  it('limite ausente em max/min e limite em up', () => {
    const p = copia();
    delete (p.perfis.acao[4] as { limite?: number }).limite;
    expect(invalido(p)).toBe(true);
    const q = copia();
    (q.perfis.acao[0] as { limite?: number }).limite = 1;
    expect(invalido(q)).toBe(true);
  });

  it('ids duplicados e lista com tamanho ≠ 6', () => {
    const p = copia();
    p.perfis.acao[1] = { ...p.perfis.acao[1], id: 'rec' };
    expect(invalido(p)).toBe(true);
    const q = copia();
    q.perfis.fii_tijolo = q.perfis.fii_tijolo.slice(0, 5);
    expect(invalido(q)).toBe(true);
  });

  it('inativo sem motivo, naoSeAplica fora da lista, equivalência trocada, janela padrão fora', () => {
    const p = copia();
    delete (p.perfis.fii_tijolo[2] as { motivoInativo?: string }).motivoInativo;
    expect(invalido(p)).toBe(true);
    const q = copia();
    q.perfis.acao_financeira.naoSeAplica = ['ebitda', 'vac'];
    expect(invalido(q)).toBe(true);
    const r = copia();
    r.equivalencias = { inad: 'vac' };
    expect(invalido(r)).toBe(true);
    const s = copia();
    s.janelas = [3, 10];
    expect(invalido(s)).toBe(true);
  });
});

describe('obterCriteriaParams', () => {
  const linha = (version: number, params: unknown) => ({
    id: 'x',
    version,
    params,
    validFrom: new Date('2026-10-15T00:00:00.000Z'),
    createdBy: 'seed-v2-filtros',
    notas: null,
    createdAt: new Date(),
  });

  it('lê a versão ativa (maior com validFrom ≤ agora) e revalida', async () => {
    const findFirst = vi.fn().mockResolvedValue(linha(1, CRITERIA_PARAMS_V1));
    const prisma = { criteriaParams: { findFirst, findUnique: vi.fn() } };
    const r = await obterCriteriaParams(prisma as never);
    expect(r.versao).toBe(1);
    expect(r.params.perfis.acao).toHaveLength(6);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { version: 'desc' } }),
    );
  });

  it('sem versão ativa, versão inexistente e JSON inválido = ErroParams', async () => {
    const vazio = {
      criteriaParams: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    await expect(obterCriteriaParams(vazio as never)).rejects.toMatchObject({
      codigo: 'sem_versao_ativa',
    });
    await expect(obterCriteriaParams(vazio as never, { versao: 9 })).rejects.toMatchObject({
      codigo: 'versao_inexistente',
    });
    const ruim = {
      criteriaParams: { findFirst: vi.fn().mockResolvedValue(linha(2, { versao: 2 })) },
    };
    await expect(obterCriteriaParams(ruim as never)).rejects.toBeInstanceOf(ErroParams);
  });
});
