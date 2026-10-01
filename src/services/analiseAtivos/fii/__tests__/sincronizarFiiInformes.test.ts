import { beforeAll, describe, expect, it } from 'vitest';
import { linhasIguais, type LinhaFiiMensal } from '@/services/analiseAtivos/fii/gravarFii';
import {
  alertaDistribuicao,
  distribuicaoTipos,
  AgregadorAlertas,
  processarMesesFii,
  recalcularTiposDoFundo,
} from '@/services/analiseAtivos/fii/sincronizarFiiMensal';
import { montarLinhaTrimestral } from '@/services/analiseAtivos/fii/sincronizarFiiTrimestral';
import { SCORING_PARAMS_V1 as P } from '@/services/analiseAtivos/params/scoringParamsV1';
import {
  CNPJ,
  mensalFixture,
  trimestralFixture,
} from '@/services/analiseAtivos/regras/fii/__tests__/fixturesFii';
import type { FiiMesBruto } from '@/services/analiseAtivos/regras/fii/saneamentoMensal';
import type { FiiTipo } from '@/services/analiseAtivos/tipos';

let m26: FiiMesBruto[] = [];
let m25: FiiMesBruto[] = [];
beforeAll(async () => {
  m26 = (await mensalFixture('2026_amostra')).meses;
  m25 = (await mensalFixture('2025_hfof')).meses;
});
const URL = 'https://dados.cvm.gov.br/dados/FII/DOC/INF_MENSAL/DADOS/inf_mensal_fii_2026.zip';
const vazio = new Map<string, LinhaFiiMensal>();
const semOverride = new Map<string, FiiTipo>();
const achar = (linhas: LinhaFiiMensal[], cnpj: string, ref: string) =>
  linhas.find((l) => l.cnpj === cnpj && l.refMonth === ref)!;

describe('processarMesesFii (fii-mensal)', () => {
  it('grava os 3 últimos meses de cada CNPJ com reguaVigente e obrigacoesPlPct prontos', () => {
    const { linhas } = processarMesesFii(m26, vazio, semOverride, P, {
      todosOsMeses: false,
      sourceUrl: URL,
    });
    const hglg = linhas.filter((l) => l.cnpj === CNPJ.HGLG).map((l) => l.refMonth);
    expect(hglg).toEqual(['2026-06-01', '2026-07-01', '2026-08-01']);
    // XPML jan/26 não está entre os 3 últimos meses
    expect(linhas.find((l) => l.cnpj === CNPJ.XPML && l.refMonth === '2026-01-01')).toBeUndefined();

    const h = achar(linhas, CNPJ.HGLG, '2026-08-01');
    expect(h).toMatchObject({
      tipoComposicao: 'tijolo',
      tipoVigente: 'tijolo',
      reguaVigente: 'fii_tijolo',
      cotistas: 608_345,
      sourceUrl: URL,
    });
    expect(h.vpCota).toBeCloseTo(165.95, 2);
    expect(h.obrigacoesPlPct).toBeCloseTo(16.25, 1);
    expect(achar(linhas, CNPJ.TRXF, '2026-08-01').obrigacoesPlPct).toBeCloseTo(70.27, 1);
    expect(achar(linhas, CNPJ.CPTS, '2026-08-01')).toMatchObject({
      tipoVigente: 'fof',
      reguaVigente: 'fora_do_indice',
    });
    expect(achar(linhas, CNPJ.MXRF, '2026-08-01')).toMatchObject({
      tipoVigente: 'papel',
      reguaVigente: 'fii_papel',
    });
  });

  it('todosOsMeses (backfill) inclui XPML jan/26 com DY da CVM descartado', () => {
    const { linhas } = processarMesesFii(m26, vazio, semOverride, P, {
      todosOsMeses: true,
      sourceUrl: URL,
    });
    const x = achar(linhas, CNPJ.XPML, '2026-01-01');
    expect(x.dyMesCvmPct).toBeNull();
    expect(x.flags).toContain('dy_cvm_descartado');
  });

  it('histerese lê os meses anteriores do banco: troca só no 3º mês seguido', () => {
    const base = achar(
      processarMesesFii(m26, vazio, semOverride, P, { todosOsMeses: false, sourceUrl: URL }).linhas,
      CNPJ.KNRI,
      '2026-08-01',
    );
    const gravados = new Map<string, LinhaFiiMensal>();
    for (const ref of ['2026-03-01', '2026-04-01', '2026-05-01']) {
      gravados.set(`${CNPJ.KNRI}|${ref}`, {
        ...base,
        refMonth: ref,
        tipoComposicao: 'papel',
        tipoVigente: 'papel',
        reguaVigente: 'fii_papel',
      });
    }
    const { linhas, alertas } = processarMesesFii(
      m26.filter((m) => m.cnpj === CNPJ.KNRI),
      gravados,
      semOverride,
      P,
      { todosOsMeses: false, sourceUrl: URL },
    );
    expect(linhas.map((l) => [l.refMonth, l.tipoComposicao, l.tipoVigente])).toEqual([
      ['2026-06-01', 'tijolo', 'papel'],
      ['2026-07-01', 'tijolo', 'papel'],
      ['2026-08-01', 'tijolo', 'tijolo'],
    ]);
    expect(achar(linhas, CNPJ.KNRI, '2026-08-01').flags).toContain('tipo_mudou');
    expect(alertas.map((a) => a.codigo)).toContain('fii_tipo_mudou');
  });

  it('FiiTipoOverride vence a composição (e a régua sai do tipo do override)', () => {
    const { linhas } = processarMesesFii(
      m26.filter((m) => m.cnpj === CNPJ.KNRI),
      vazio,
      new Map([[CNPJ.KNRI, 'papel' as FiiTipo]]),
      P,
      { todosOsMeses: false, sourceUrl: URL },
    );
    for (const l of linhas) {
      expect(l).toMatchObject({
        tipoComposicao: 'tijolo',
        tipoVigente: 'papel',
        reguaVigente: 'fii_papel',
      });
      expect(l.flags).toContain('tipo_override');
    }
  });

  it('HFOF11 mai/25: fatorDesdobramento 10 e alerta', () => {
    const { linhas, alertas } = processarMesesFii(m25, vazio, semOverride, P, {
      todosOsMeses: true,
      sourceUrl: URL,
    });
    expect(achar(linhas, CNPJ.HFOF, '2025-05-01').fatorDesdobramento).toBe(10);
    expect(achar(linhas, CNPJ.HFOF, '2025-04-01').fatorDesdobramento).toBeNull();
    expect(alertas.map((a) => a.codigo)).toContain('fii_desdobramento');
  });

  it('distribuição de tipos do último mês e alerta fora de ±10% da Fase A', () => {
    const { linhas } = processarMesesFii(m26, vazio, semOverride, P, {
      todosOsMeses: false,
      sourceUrl: URL,
    });
    const d = distribuicaoTipos(linhas);
    expect(d.refMonth).toBe('2026-08-01');
    expect(d.contagem.tijolo + d.contagem.papel + d.contagem.fof).toBeGreaterThan(5);
    expect(alertaDistribuicao(d.contagem, d.refMonth!)?.codigo).toBe('fii_distribuicao_tipos');
    expect(
      alertaDistribuicao(
        { tijolo: 270, papel: 88, fof: 60, hibrido: 7, indefinido: 44, sem_tipo: 0 },
        '2026-08-01',
      ),
    ).toBeNull();
  });
});

describe('recalcularTiposDoFundo (script fii-tipo-override)', () => {
  it('override recalcula vigente/régua de todos os meses sem mexer no resto; remover volta à composição', () => {
    const { linhas } = processarMesesFii(
      m26.filter((m) => m.cnpj === CNPJ.CPTS),
      vazio,
      semOverride,
      P,
      { todosOsMeses: true, sourceUrl: URL },
    );
    expect(linhas.every((l) => l.tipoVigente === 'fof')).toBe(true);
    const com = recalcularTiposDoFundo(linhas, 'papel', P);
    for (const [i, l] of com.entries()) {
      expect(l).toMatchObject({ tipoVigente: 'papel', reguaVigente: 'fii_papel' });
      expect(l.flags).toContain('tipo_override');
      expect(l.vpCota).toBe(linhas[i].vpCota);
      expect(l.sourceUrl).toBe(linhas[i].sourceUrl);
    }
    const sem = recalcularTiposDoFundo(com, null, P);
    expect(sem.map((l) => [l.tipoVigente, l.reguaVigente])).toEqual(
      linhas.map((l) => [l.tipoVigente, l.reguaVigente]),
    );
    expect(sem.every((l) => !l.flags.includes('tipo_override'))).toBe(true);
  });
});

describe('montarLinhaTrimestral (fii-trimestral)', () => {
  const U =
    'https://dados.cvm.gov.br/dados/FII/DOC/INF_TRIMESTRAL/DADOS/inf_trimestral_fii_2026.zip';

  it('HGLG11 2T26: 37 imóveis, vacância 2,4%, prazo, receita; RECR11 papel ⇒ nsa:vacancia', async () => {
    const tri = await trimestralFixture({
      imovel: 'inf_trimestral_fii_imovel_2026_amostra.csv',
      complemento: 'inf_trimestral_fii_complemento_2026_amostra.csv',
      resultado: 'inf_trimestral_fii_resultado_2026_amostra.csv',
    });
    const h = montarLinhaTrimestral(tri.find((t) => t.cnpj === CNPJ.HGLG)!, 'tijolo', P, U).linha;
    expect(h).toMatchObject({ refQuarter: '2026-06-30', nImoveisRenda: 37, sourceUrl: U });
    expect(h.vacanciaFisicaCvmPct).toBeCloseTo(2.41, 1);
    expect(h.prazoMedioAnosAprox).toBeCloseTo(3.4, 1);
    expect(h.idxIpcaPct).toBeCloseTo(78.9, 0);
    expect(h.receitaAluguel).toBeGreaterThan(0);
    expect(h.nCri).toBeNull(); // sem a entrada ativo nesta fixture ⇒ ausente, não zero

    const r = montarLinhaTrimestral(tri.find((t) => t.cnpj === CNPJ.RECR)!, 'papel', P, U).linha;
    expect(r.vacanciaFisicaCvmPct).toBeNull();
    expect(r.flags).toContain('nsa:vacanciaFisicaCvmPct');
  });

  it('KNCR11 2T26: 96 CRIs distintos', async () => {
    const [t] = await trimestralFixture({ ativo: 'inf_trimestral_fii_ativo_2026_kncr.csv' });
    const l = montarLinhaTrimestral(t, 'papel', P, U).linha;
    expect(l.nCri).toBe(96);
    expect(l.maiorCriPct).toBeGreaterThan(0);
    expect(l.nImoveisRenda).toBeNull();
  });
});

describe('idempotência e alertas', () => {
  it('linhasIguais tolera o último dígito do Decimal e a ordem das flags; muda com dado real', () => {
    const { linhas } = processarMesesFii(m26, vazio, semOverride, P, {
      todosOsMeses: false,
      sourceUrl: URL,
    });
    const a = achar(linhas, CNPJ.HGLG, '2026-08-01');
    expect(linhasIguais(a, { ...a, vpCota: a.vpCota! + 1e-8, pl: a.pl! + 0.01 })).toBe(true);
    expect(linhasIguais({ ...a, flags: ['x', 'y'] }, { ...a, flags: ['y', 'x'] })).toBe(true);
    expect(linhasIguais(a, { ...a, cotistas: a.cotistas! + 1 })).toBe(false);
    expect(linhasIguais(a, { ...a, tipoVigente: 'papel' })).toBe(false);
    expect(linhasIguais(a, { ...a, pl: a.pl! + 1 })).toBe(false);
  });

  it('AgregadorAlertas resume repetição por código (não afoga alertas únicos)', () => {
    const saida: string[] = [];
    const ag = new AgregadorAlertas((a) => saida.push(a.mensagem), 2);
    for (let i = 0; i < 5; i++) ag.add({ codigo: 'x', nivel: 'aviso', mensagem: `x${i}` });
    ag.add({ codigo: 'y', nivel: 'info', mensagem: 'y0' });
    ag.fechar();
    expect(saida).toEqual(['x0', 'x1', 'y0', '+3 ocorrências de x (total 5)']);
  });
});
