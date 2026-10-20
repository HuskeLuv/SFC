/**
 * A6, fatia B — Raio-X por template (banco e seguradora), regra de ouro com o Essencial do mesmo
 * template, e a linha FII 'Alavancagem (% do ativo)' (chave ALAV_ATIVO).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));

import { montarAcao, montarFii } from '@/services/analiseAtivos/leitura/ativo/raioX';
import {
  LINHAS_BANCO,
  LINHAS_SEGURADORA,
  catalogoRaioX,
} from '@/services/analiseAtivos/regras/raioX/linhasRaioX';
import { gerarCsvRaioX } from '@/services/analiseAtivos/regras/raioX/csvRaioX';
import { TEXTOS_FINANCEIRAS } from '@/services/analiseAtivos/textosFinanceiras';
import { TEXTOS_RAIO_X } from '@/services/analiseAtivos/textosRaioX';
import { HOJE_DEV, dadosAcaoDev, dadosFiiDev } from '@/test/fixtures/analiseAtivos/raioXDev';
import type { FundamentosPeriodo } from '@/services/analiseAtivos/tipos';
import type { CodigoLinhaRaioX, LinhaRaioX, RaioXResposta } from '@/types/analiseAtivosBlocoD';

type Parcial = ReturnType<typeof montarAcao>['raioX'];
const TS = TEXTOS_FINANCEIRAS.seguradora;

function linhaDe(r: Parcial, codigo: CodigoLinhaRaioX): LinhaRaioX | undefined {
  for (const b of r.blocos) for (const l of b.linhas) if (l.codigo === codigo) return l;
  return undefined;
}

/** ITUB4 do DEV com a PDD da DVA (−x bi por ano). */
function itubComPdd() {
  const d = dadosAcaoDev('ITUB4');
  return {
    ...d,
    periodos: d.periodos.map((p) => ({ ...p, pdd: -(20e9 + (p.anoFiscal - 2015) * 1e9) })),
  };
}

/** WEGE3 do DEV vestida de seguradora operacional (prêmios até 2022, IFRS 17 desde 2023). */
function seguradoraOperacional() {
  const d = dadosAcaoDev('WEGE3');
  return {
    ...d,
    financeira: true,
    periodos: d.periodos.map(
      (p): FundamentosPeriodo => ({
        ...p,
        premiosGanhos: p.anoFiscal <= 2022 ? 20e9 : null,
        sinistrosRetidos: p.anoFiscal <= 2022 ? -13e9 : null,
        receitaSeguro: p.anoFiscal >= 2023 ? 32e9 : null,
        despesaSeguro: p.anoFiscal >= 2023 ? -25e9 : null,
        resultadoFinanceiro: 1.5e9,
        equivalenciaPatrimonial: 0.05e9,
      }),
    ),
  };
}

function seguradoraHolding() {
  const d = dadosAcaoDev('WEGE3');
  return {
    ...d,
    financeira: true,
    periodos: d.periodos.map(
      (p): FundamentosPeriodo => ({
        ...p,
        receita: 0,
        receitaSeguro: 0,
        receitaComissoesServicos: 4e9,
        equivalenciaPatrimonial: 5e9,
        resultadoFinanceiro: 1e9,
      }),
    ),
  };
}

describe('Raio-X · banco', () => {
  const { essencial, raioX } = montarAcao(HOJE_DEV, { ...itubComPdd(), template: 'banco' });

  it('3 blocos (intermediação e resultado · balanço · fluxo de caixa) e nenhuma linha n/a', () => {
    expect(raioX.template).toBe('banco');
    expect(raioX.blocos.map((b) => b.codigo)).toEqual([
      'intermediacao_resultado',
      'balanco',
      'fluxo_caixa',
    ]);
    expect(raioX.linhasNaoAplicaveis).toEqual([]);
    expect(raioX.observacoes).toContain(TEXTOS_FINANCEIRAS.banco.observacoes.basileia);
  });

  it('regra de ouro: as linhas comuns são LITERALMENTE as células do Essencial do mesmo ano', () => {
    expect(essencial.template).toBe('banco');
    let comparadas = 0;
    for (const d of LINHAS_BANCO.filter((x) => x.essencial)) {
      const l = linhaDe(raioX, d.codigo);
      if (!l) continue;
      for (const ano of raioX.anos) {
        const le = essencial.linhas.find((x) => x.ano === ano)!;
        expect([d.codigo, ano, l.valores[ano]]).toEqual([d.codigo, ano, le.valores[d.essencial!]]);
        comparadas++;
      }
    }
    expect(comparadas).toBeGreaterThan(30);
  });

  it('PDD e PL ÷ ativo do ano', () => {
    const ano = raioX.anos[0];
    expect(linhaDe(raioX, 'pdd')?.valores[ano]).toEqual({
      estado: 'ok',
      valor: (20e9 + (ano - 2015) * 1e9) / 1e6,
    });
    expect(linhaDe(raioX, 'plAtivoPct')?.valores[ano]?.estado).toBe('ok');
  });

  it('sem template ⇒ o Raio-X de hoje (acao_financeira com as linhas n/a)', () => {
    const hoje = montarAcao(HOJE_DEV, dadosAcaoDev('ITUB4')).raioX;
    expect(montarAcao(HOJE_DEV, { ...dadosAcaoDev('ITUB4'), template: null }).raioX).toEqual(hoje);
    expect('template' in hoje).toBe(false);
    expect(hoje.linhasNaoAplicaveis.length).toBeGreaterThan(0);
  });
});

describe('Raio-X · seguradora', () => {
  it('operacional: sinistralidade até 2022, despesa ÷ receita (IFRS 17) desde 2023, o outro regime "—" com o motivo', () => {
    const { essencial, raioX } = montarAcao(HOJE_DEV, {
      ...seguradoraOperacional(),
      template: 'seguradora',
    });
    expect(raioX.blocos.map((b) => b.codigo)).toEqual([
      'receita_resultado',
      'operacao_seguros',
      'proventos',
    ]);
    const sin = linhaDe(raioX, 'sinistralidadePct')!;
    const ifrs = linhaDe(raioX, 'despesaReceitaSeguroPct')!;
    expect(sin.valores[2022]).toEqual({ estado: 'ok', valor: 65 });
    expect(sin.valores[2024]).toMatchObject({ estado: 'ausente', texto: TS.motivos.ifrs17 });
    expect(ifrs.valores[2024]).toEqual({ estado: 'ok', valor: 78.125 });
    expect(ifrs.valores[2021]).toMatchObject({ estado: 'ausente', texto: TS.motivos.ifrs17 });
    // equivalência da operacional: '—' com o motivo, a linha fica
    expect(linhaDe(raioX, 'equivalenciaPatrimonial')?.valores[2024]).toMatchObject({
      estado: 'ausente',
      texto: TS.motivos.equivalenciaNaoSeAplica,
    });
    expect(raioX.observacoes).toContain(TS.observacoes.ifrs17);
    for (const d of LINHAS_SEGURADORA.filter((x) => x.essencial)) {
      const l = linhaDe(raioX, d.codigo);
      if (!l) continue;
      for (const ano of raioX.anos) {
        const le = essencial.linhas.find((x) => x.ano === ano)!;
        expect(l.valores[ano]).toEqual(le.valores[d.essencial!]);
      }
    }
  });

  it('holding: as linhas de operação de seguro ficam com "—" e o motivo da holding', () => {
    const { raioX } = montarAcao(HOJE_DEV, { ...seguradoraHolding(), template: 'seguradora' });
    const sin = linhaDe(raioX, 'sinistralidadePct')!;
    expect(sin).toBeDefined();
    expect(Object.values(sin.valores).every((e) => e.estado === 'ausente')).toBe(true);
    expect(sin.valores[raioX.anos[0]]).toMatchObject({ texto: TS.motivos.holdingSemOperacao });
    expect(raioX.observacoes).toContain(TS.observacoes.holdingOperacao);
    expect(linhaDe(raioX, 'receitaOperacional')?.valores[raioX.anos[0]]).toEqual({
      estado: 'ok',
      valor: 4000,
    });
  });

  it('CSV do Raio-X: blocos do template e a unidade nas linhas de regime', () => {
    const { raioX } = montarAcao(HOJE_DEV, {
      ...seguradoraOperacional(),
      template: 'seguradora',
    });
    const csv = gerarCsvRaioX(
      { ...raioX, ticker: 'PSSA3', classe: 'acao', nome: 'x', versao: 'v' } as RaioXResposta,
      {
        hoje: '2026-10-19',
        versaoParams: 2,
      },
    );
    expect(csv).toContain(TEXTOS_RAIO_X.blocos.operacao_seguros);
    expect(csv).toContain(`${TEXTOS_RAIO_X.linhas.sinistralidadePct.rotulo} (%)`);
    expect(csv).toContain(`${TEXTOS_RAIO_X.linhas.despesaReceitaSeguroPct.rotulo} (%)`);
    expect(csv).toContain(`${TEXTOS_RAIO_X.linhas.receitaOperacional.rotulo} (R$ mi)`);
  });
});

describe("FII · 'Alavancagem (% do ativo)' (chave ALAV_ATIVO)", () => {
  it('desligada ⇒ catálogo e Raio-X de hoje; ligada ⇒ linha logo depois da do PL, lida dos múltiplos', () => {
    expect(catalogoRaioX('fii_tijolo').some((d) => d.codigo === 'obrigacoesAtivoPct')).toBe(false);
    const codigos = catalogoRaioX('fii_tijolo', { alavAtivo: true }).map((d) => d.codigo);
    expect(codigos.indexOf('obrigacoesAtivoPct')).toBe(codigos.indexOf('obrigacoesPlPct') + 1);

    const d = dadosFiiDev('HGLG11');
    const hoje = montarFii(HOJE_DEV, d).raioX;
    expect(linhaDe(hoje, 'obrigacoesAtivoPct')).toBeUndefined();

    const comValor = {
      ...d,
      alavAtivo: true,
      multiplos: d.multiplos.map((m) => ({ ...m, obrigacoesAtivoPct: 4.5 })),
    };
    const r = montarFii(HOJE_DEV, comValor).raioX;
    const l = linhaDe(r, 'obrigacoesAtivoPct')!;
    expect(l.rotulo).toBe(TEXTOS_RAIO_X.linhas.obrigacoesAtivoPct.rotulo);
    expect(l.valores[r.anos[0]]).toEqual({ estado: 'ok', valor: 4.5 });
    // o resto do Raio-X não muda
    const semLinha = {
      ...r,
      blocos: r.blocos.map((b) => ({
        ...b,
        linhas: b.linhas.filter((x) => x.codigo !== 'obrigacoesAtivoPct'),
      })),
    };
    expect(semLinha).toEqual(hoje);
  });

  it('ligada e ainda sem o múltiplo gravado (antes da fatia E) ⇒ a linha não aparece', () => {
    const d = dadosFiiDev('HGLG11');
    const r = montarFii(HOJE_DEV, { ...d, alavAtivo: true }).raioX;
    expect(linhaDe(r, 'obrigacoesAtivoPct')).toBeUndefined();
  });
});
