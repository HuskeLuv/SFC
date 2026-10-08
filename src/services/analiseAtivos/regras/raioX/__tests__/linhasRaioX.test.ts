import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));

import { montarAcao, montarFii } from '@/services/analiseAtivos/leitura/ativo/raioX';
import {
  CAMPO_LINHA_RAIOX,
  LINHAS_ACAO,
  catalogoRaioX,
} from '@/services/analiseAtivos/regras/raioX/linhasRaioX';
import { MOTIVO_PER_SHARE } from '@/services/analiseAtivos/regras/conferencia/conferenciaAnual';
import { LIMIAR_TAXA_ADM_ANO_PCT } from '@/services/analiseAtivos/cenarios/contrato';
import { TEXTOS_RAIO_X } from '@/services/analiseAtivos/textosRaioX';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import {
  ACOES_DEV,
  FIIS_DEV,
  HOJE_DEV,
  dadosAcaoDev,
  dadosFiiDev,
} from '@/test/fixtures/analiseAtivos/raioXDev';
import type { Estado } from '@/types/analiseAtivosApi';
import type { CodigoLinhaRaioX, LinhaRaioX, RaioXResposta } from '@/types/analiseAtivosBlocoD';

type Parcial = ReturnType<typeof montarAcao>['raioX'];

const acao = (t: (typeof ACOES_DEV)[number]) => montarAcao(HOJE_DEV, dadosAcaoDev(t)).raioX;
const fii = (t: (typeof FIIS_DEV)[number]) => montarFii(HOJE_DEV, dadosFiiDev(t)).raioX;

function linhaDe(r: Parcial | RaioXResposta, codigo: CodigoLinhaRaioX): LinhaRaioX | undefined {
  for (const b of r.blocos) for (const l of b.linhas) if (l.codigo === codigo) return l;
  return undefined;
}
function v(r: Parcial, codigo: CodigoLinhaRaioX, ano: number): number | null {
  const e = linhaDe(r, codigo)?.valores[ano];
  return e?.estado === 'ok' ? e.valor : null;
}
function estado(r: Parcial, codigo: CodigoLinhaRaioX, ano: number): Estado<number> | undefined {
  return linhaDe(r, codigo)?.valores[ano];
}
const T = TEXTOS_RAIO_X;

describe('catálogo', () => {
  it('ações: 3 blocos; FIIs: 4 (imóveis no tijolo, recebíveis no papel)', () => {
    expect([...new Set(LINHAS_ACAO.map((d) => d.bloco))]).toEqual([
      'lucro_caixa',
      'caixa_divida',
      'fluxo_caixa',
    ]);
    expect([...new Set(catalogoRaioX('fii_tijolo').map((d) => d.bloco))]).toEqual([
      'resultado_distribuicao',
      'patrimonio_cota',
      'carteira_imoveis',
      'alavancagem_custos',
    ]);
    expect([...new Set(catalogoRaioX('fii_papel').map((d) => d.bloco))]).toEqual([
      'resultado_distribuicao',
      'patrimonio_cota',
      'carteira_recebiveis',
      'alavancagem_custos',
    ]);
    expect(catalogoRaioX('fii_outro')).toEqual(catalogoRaioX('fii_tijolo'));
  });

  it('todo código do catálogo tem rótulo e entrada no mapa de conferência', () => {
    for (const variante of ['acao', 'fii_tijolo', 'fii_papel'] as const) {
      for (const d of catalogoRaioX(variante)) {
        expect((T.linhas as Record<string, { rotulo: string }>)[d.codigo]?.rotulo).toBeTruthy();
        expect(d.codigo in CAMPO_LINHA_RAIOX).toBe(true);
      }
    }
  });

  it('decisão 4: sem inadimplência, prazo médio, vencimentos, indexadores; nunca "FCF"', () => {
    const rotulos = Object.values(T.linhas).map((l) => `${l.rotulo} ${l.sub}`.toLowerCase());
    for (const proibido of ['inadimpl', 'prazo médio', 'venciment', 'indexador', 'ltv', 'fcf']) {
      expect(rotulos.some((r) => r.includes(proibido))).toBe(false);
    }
  });
});

describe('ações (DEV)', () => {
  it('WEGE3: EBITDA = EBIT + D&A, dívida líquida, FCL e caixa de financiamento', () => {
    const r = acao('WEGE3');
    expect(r.variante).toBe('acao');
    expect(r.anos).toEqual([2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016]);
    expect(v(r, 'ebitda', 2025)).toBeCloseTo(7998.741 + 1001.296, 3);
    expect(v(r, 'margemEbitdaPct', 2025)).toBeCloseTo((9000.037 / 40804.11) * 100, 2);
    expect(v(r, 'dividaLiquida', 2025)).toBeCloseTo(3549.314 + 1041.508 - 6296.498 - 983.367, 3);
    expect(v(r, 'fcl', 2025)).toBeCloseTo(6451.033 - 2691.321, 3);
    expect(v(r, 'caixaFinanciamento', 2025)).toBeCloseTo(-4362.857, 3);
    expect(linhaDe(r, 'caixaFinanciamento')?.rotulo).toBe('Caixa de financiamento');
    expect(v(r, 'nAcoesMi', 2025)).toBeCloseTo(4195.696, 3);
    expect(v(r, 'patrimonioLiquido', 2025)).toBeCloseTo(17417.185, 3);
    expect(r.observacoes).toContain(T.sobreOsDados.fcfFinanciamento);
    expect(r.blocos.map((b) => b.codigo)).toEqual(['lucro_caixa', 'caixa_divida', 'fluxo_caixa']);
  });

  it('WEGE3: flag da linha inteira (proventos) nunca vai para um ano fechado', () => {
    const r = acao('WEGE3');
    for (const b of r.blocos) {
      for (const l of b.linhas) {
        expect(Object.keys(l.conferencias)).toEqual([]);
        expect(Object.values(l.selos).flat()).toEqual([]);
      }
    }
  });

  it('razões em itálico (tipo razao) e valores (tipo valor)', () => {
    const r = acao('WEGE3');
    expect(linhaDe(r, 'margemBrutaPct')?.tipo).toBe('razao');
    expect(linhaDe(r, 'divLiqEbitda')?.tipo).toBe('razao');
    expect(linhaDe(r, 'receita')?.tipo).toBe('valor');
  });

  it('FCL/lucro com prejuízo = "—" com o motivo (CBAV3 2024)', () => {
    const r = acao('CBAV3');
    expect(estado(r, 'fclLucroPct', 2024)).toEqual({
      estado: 'ausente',
      motivo: 'lucro_nao_positivo',
      texto: T.conferencia.lucroNaoPositivo,
    });
    expect(v(r, 'fclLucroPct', 2025)).toBeCloseTo((55.33 / 121.04) * 100, 0);
  });

  it('CBAV3: LPA e nº de ações de 2021, 2022, 2024 e 2025 em conferência (decisão 1)', () => {
    const r = acao('CBAV3');
    for (const ano of [2021, 2022, 2024, 2025]) {
      for (const c of ['lpa', 'nAcoesMi'] as const) {
        expect(estado(r, c, ano)).toMatchObject({
          estado: 'ausente',
          motivo: MOTIVO_PER_SHARE,
          exibicao: 'ocultar',
        });
        expect(linhaDe(r, c)?.conferencias[ano]?.exibicao).toBe('ocultar');
      }
    }
    expect(v(r, 'nAcoesMi', 2023)).toBeCloseTo(645.477, 3);
    expect(r.observacoes).toContain(T.sobreOsDados.perShareConferencia);
  });

  it('ITUB4 (banco): linhas que não se aplicam saem e vão para "Sobre os dados"; payout sai', () => {
    const r = acao('ITUB4');
    expect(r.variante).toBe('acao_financeira');
    expect(r.linhasNaoAplicaveis).toEqual([
      'Receita líquida',
      'Lucro bruto',
      'Margem bruta',
      'EBITDA',
      'Margem EBITDA',
      'EBIT',
      'Margem líquida',
      'ROIC',
      'Caixa e aplicações',
      'Dívida bruta',
      'Dívida líquida',
      'Dív. líq./EBITDA',
      'Dív. líq./PL',
      'Liquidez corrente',
    ]);
    // payout (dmpl_zero_com_proventos em todos os anos): a linha sai, com a observação
    expect(linhaDe(r, 'payoutPct')).toBeUndefined();
    expect(r.observacoes).toContain(T.sobreOsDados.payoutSemProventos);
    expect(r.observacoes[0]).toBe('Padrão contábil: individual BR GAAP.');
    expect(r.observacoes.some((o) => o.startsWith('Não se aplicam a bancos'))).toBe(true);
    expect(linhaDe(r, 'lucroLiquido')).toBeTruthy();
    expect(r.escopo).toBe('ind');
    expect(r.padraoContabil).toBe('BRGAAP');
  });

  it('TAEE11, PETR4 e VALE3: 10 anos e os 3 blocos', () => {
    for (const t of ['TAEE11', 'PETR4', 'VALE3'] as const) {
      const r = acao(t);
      expect(r.anos).toHaveLength(10);
      expect(r.blocos).toHaveLength(3);
      expect(r.linhasNaoAplicaveis).toEqual([]);
    }
  });
});

describe('FIIs (DEV)', () => {
  it('HGLG11 2025: rendimento distribuído = 2º tri + 4º tri (223 + 236 = 459)', () => {
    const r = fii('HGLG11');
    expect(r.variante).toBe('fii_tijolo');
    expect(v(r, 'rendimentoDistribuido', 2025)).toBeCloseTo(458.932, 3);
    expect(v(r, 'payoutResultadoPct', 2025)).toBeCloseTo((458.932 / 454.5369) * 100, 1);
  });

  it('2º tri faltando ⇒ "—" (semestre incompleto)', () => {
    const d = dadosFiiDev('HGLG11');
    d.trimestres = d.trimestres.filter((t) => t.refQuarter !== '2025-06-30');
    const r = montarFii(HOJE_DEV, d).raioX;
    expect(estado(r, 'rendimentoDistribuido', 2025)).toEqual({
      estado: 'ausente',
      motivo: 'semestre_incompleto',
      texto: T.conferencia.semestreIncompleto,
    });
  });

  it('resultado por cota pela média mensal de cotas (HGLG11 2025 ≈ 12,90, não 10,72)', () => {
    const r = fii('HGLG11');
    expect(v(r, 'resultadoCota', 2025)).toBeCloseTo(12.9, 1);
    expect(454.5369 / 42.404675).toBeCloseTo(10.72, 2);
  });

  it('base de cotas de hoje: HGLG11 2017 VP/cota = 112,73 e nº de cotas × 10', () => {
    const r = fii('HGLG11');
    expect(v(r, 'vpCota', 2017)).toBeCloseTo(112.73, 2);
    expect(v(r, 'rendimentoCota', 2017)).toBeCloseTo(10.44, 2);
    expect(v(r, 'nCotasMi', 2017)).toBeCloseTo(3.401, 3);
    expect(r.observacoes.some((o) => o.includes('04/2018'))).toBe(true);
  });

  it('decisão 3: taxa de adm. no ano (HGLG11 2025 = 0,565%); XPLG11 2020 fora da escala', () => {
    const h = fii('HGLG11');
    expect(v(h, 'taxaAdmAnoPct', 2025)).toBeCloseTo(0.565, 3);
    expect(h.observacoes).toContain(T.sobreOsDados.taxaAdm);
    const x = fii('XPLG11');
    const e2020 = estado(x, 'taxaAdmAnoPct', 2020);
    expect(e2020).toMatchObject({ estado: 'ausente', exibicao: 'ocultar' });
    expect(e2020?.estado === 'ausente' && e2020.valorNaoPublicado).toBeGreaterThan(
      LIMIAR_TAXA_ADM_ANO_PCT,
    );
    expect(linhaDe(x, 'taxaAdmAnoPct')?.conferencias[2020]?.exibicao).toBe('ocultar');
    // 2018: só 7 meses informados
    expect(estado(x, 'taxaAdmAnoPct', 2018)).toMatchObject({
      estado: 'ausente',
      texto: T.conferencia.taxaAdmMesesIncompletos,
    });
  });

  it('KNCR11 (papel): carteira de recebíveis; receita de aluguéis sai com a observação', () => {
    const r = fii('KNCR11');
    expect(r.variante).toBe('fii_papel');
    expect(r.blocos.map((b) => b.codigo)).toEqual([
      'resultado_distribuicao',
      'patrimonio_cota',
      'carteira_recebiveis',
      'alavancagem_custos',
    ]);
    expect(r.linhasNaoAplicaveis).toEqual([T.linhas.receitaAluguel.rotulo]);
    expect(r.observacoes).toContain(T.sobreOsDados.receitaPapel);
    expect(v(r, 'nCri', 2025)).toBe(83);
    expect(v(r, 'rendimentoDistribuido', 2025)).toBeCloseTo(1159.402, 3);
    expect(linhaDe(r, 'nCri')?.fonteCvmAviso).toBe(true);
    // taxa de performance sem nenhum ano: a linha sai
    expect(linhaDe(r, 'taxaPerformance')).toBeUndefined();
  });

  it('MXRF11 e XPLG11: blocos do tipo; payout do resultado com resultado ≤ 0 = "—"', () => {
    expect(fii('MXRF11').variante).toBe('fii_papel');
    const d = dadosFiiDev('XPLG11');
    d.trimestres = d.trimestres.map((t) =>
      t.refQuarter.startsWith('2025') ? { ...t, resultadoTrimestral: -1e6 } : t,
    );
    const r = montarFii(HOJE_DEV, d).raioX;
    expect(estado(r, 'payoutResultadoPct', 2025)).toEqual({
      estado: 'ausente',
      motivo: 'resultado_nao_positivo',
      texto: T.conferencia.resultadoNaoPositivo,
    });
  });

  it('cnpj_em_conferencia: tudo que vem do informe sai em conferência; rendimento e DY ficam', () => {
    const d = dadosFiiDev('HGLG11');
    d.flagsLinha = ['cnpj_em_conferencia'];
    const r = montarFii(HOJE_DEV, d).raioX;
    const cnpj = TEXTOS_TELA.ausentesPorCampo.cnpjEmConferencia;
    for (const c of ['resultado', 'patrimonioLiquido', 'taxaAdmAnoPct', 'vpCota'] as const) {
      expect(estado(r, c, 2025)).toMatchObject({ estado: 'ausente', texto: cnpj });
    }
    expect(v(r, 'rendimentoCota', 2025)).toBe(13.2);
    expect(r.observacoes[0]).toBe(cnpj);
  });
});
