/**
 * Regras do motor de sanidade (bloco C, fatia A) com fixtures REAIS do banco de DEV (extraídas em
 * 03/10/2026, somente leitura; dataRef 29/09/2026): fixtures/dev-2026-10-03.json.
 *
 * Devem marcar: CBAV3, LAND3, HAPV3 (P/VP 0,062), SBSP3 em 29/04/26, GSRF11, APXU11, POMO3 2015–19.
 * NÃO devem marcar: INHF11 (2 negócios), CGAS3 (P/VP 10,4), KNRE11/RECT11 (FII líquido com P/VP
 * 0,30–0,49), PRIO3 (queda real de lucro), SYNE3 (só revisão).
 * MMVE11: fixa o resultado medido no dry-run (2º sinal da mediana dispara: 147 → 70,7 com 1 negócio).
 */
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/dev-2026-10-03.json';
import { SCORING_PARAMS_V2 } from '@/services/analiseAtivos/params/scoringParamsV2';
import {
  flagsDasDeteccoes,
  chaveLiberacaoDe,
  type Deteccao,
} from '@/services/analiseAtivos/regras/calculo/sanidade/aplicarConferencia';
import {
  revisaoDpaDmpl,
  revisaoPrecoBrapi,
  revisaoRendFiiCvm,
} from '@/services/analiseAtivos/regras/calculo/sanidade/divergenciaFonte';
import { detectarEscalaAcoes } from '@/services/analiseAtivos/regras/calculo/sanidade/escalaAcoes';
import {
  detectarFiiObrigacoes,
  detectarFiiVp,
  revisaoFiiCotistas,
  revisaoFiiPl,
  type MesFiiSanidade,
} from '@/services/analiseAtivos/regras/calculo/sanidade/fii';
import {
  detectarSaltoEscalaFundamentos,
  revisaoVariacaoLucro,
  revisaoVariacaoNivel,
  type FySanidade,
} from '@/services/analiseAtivos/regras/calculo/sanidade/fundamentosRevisao';
import {
  detectarHistoricoEscala,
  type PontoHistorico,
} from '@/services/analiseAtivos/regras/calculo/sanidade/historicoEscala';
import {
  detectarPrecoBase,
  fatorDeEvento,
  type PregaoSerie,
} from '@/services/analiseAtivos/regras/calculo/sanidade/precoBase';
import { detectarPrecoEsporadico } from '@/services/analiseAtivos/regras/calculo/sanidade/precoEsporadico';
import { parseFlagConf, parseFlagRev } from '@/services/analiseAtivos/regras/comum/conferencia';
import { ausente, deNumero } from '@/services/analiseAtivos/regras/comum/valor';

const cfg = SCORING_PARAMS_V2.sanidade.conferencia;
const DATA_REF = fixture.dataRef;

interface Atual {
  pvp: number | null;
  pl: number | null;
  preco: number | null;
  obrigacoesPlPct: number | null;
  vpCota: number | null;
}
interface Precos {
  resumo: { ultimoPregao: string; closeRaw: number; pregoesComNegocio21: number };
  atual: Atual;
  serie: PregaoSerie[];
  eventos: Array<{ dataEvento: string; status: string }>;
}

const atual = (s: string) => (fixture.acoesEscala as Record<string, Atual>)[s];
const precos = (s: string) => (fixture.precos as unknown as Record<string, Precos>)[s];
const historico = (s: string) => (fixture.historico as Record<string, PontoHistorico[]>)[s];
const mesesFii = (s: string) =>
  (fixture.fiis as unknown as Record<string, { meses: MesFiiSanidade[] }>)[s].meses;
const fys = (s: string) => (fixture.fundamentos as unknown as Record<string, FySanidade[]>)[s];

function escala(s: string, extra: Partial<Parameters<typeof detectarEscalaAcoes>[0]> = {}) {
  const a = atual(s);
  return detectarEscalaAcoes(
    {
      pvp: deNumero(a.pvp),
      pl: a.pl === null ? ausente('sem_dado_fonte') : deNumero(a.pl),
      valorMercado: undefined,
      valorMercadoUltimoFy: null,
      eventoConfirmadoDesdeFy: false,
      dataContagem: '2026-06-30',
      ...extra,
    },
    cfg,
  );
}

describe('R1 acoes_escala (fixture DEV)', () => {
  it.each(['CBAV3', 'LAND3', 'HAPV3'])('%s marca pvp_minimo (P/VP < 0,08)', (s) => {
    const d = escala(s);
    expect(d).toMatchObject({ grupo: 'acoes_escala', regra: 'pvp_minimo', chave: '2026-06-30' });
  });

  it('HAPV3 é marcada com o P/VP real de 0,062', () => {
    expect(escala('HAPV3')?.valor).toBeCloseTo(0.062, 3);
  });

  it.each(['CGAS3', 'PRIO3', 'SYNE3', 'WEGE3'])('%s NÃO marca (P/VP e P/L plausíveis)', (s) => {
    expect(escala(s)).toBeNull();
  });

  it('VM ÷ VM do último FY fora de [1/10; 10] marca vm_razao; com evento confirmado, não', () => {
    const base = { pvp: deNumero(1), pl: deNumero(8), dataContagem: '2026-03-31' };
    const comVm = (vm: number, evento = false) =>
      detectarEscalaAcoes(
        {
          ...base,
          valorMercado: deNumero(vm),
          valorMercadoUltimoFy: 100,
          eventoConfirmadoDesdeFy: evento,
        },
        cfg,
      );
    expect(comVm(1500)?.regra).toBe('vm_razao');
    expect(comVm(5)?.regra).toBe('vm_razao');
    expect(comVm(900)).toBeNull();
    expect(comVm(1500, true)).toBeNull();
  });
});

describe('R2 historico (fixture DEV)', () => {
  const anos = (s: string) => detectarHistoricoEscala(historico(s), cfg).map((d) => d.chave);

  it('POMO3 2015–19 marcados (o ponto sai da média), 2020+ não', () => {
    expect(anos('POMO3')).toEqual(['2015', '2016', '2017', '2018', '2019']);
    expect(anos('POMO4')).toEqual(['2015', '2016', '2017', '2018', '2019']);
  });

  it('falso positivo documentado: LWSA3 2020 marca (e é liberável pela curadoria)', () => {
    expect(anos('LWSA3')).toEqual(['2020']);
  });

  it.each(['WEGE3', 'PRIO3'])('%s: nenhum ano fora de escala', (s) => {
    expect(anos(s)).toEqual([]);
  });

  it('maioria dos anos na escala errada (CBAV3): a régua são os anos com P/VP plausível', () => {
    // VM de 2021/2024/2025 em milhões (nº de ações errado), 2022/2023 em bilhões
    const pontos: PontoHistorico[] = [
      { anoFiscal: 2021, pl: 0.02, pvp: 0.0027, pReceita: 0.004 },
      { anoFiscal: 2022, pl: 11, pvp: 1.35, pReceita: 1.9 },
      { anoFiscal: 2023, pl: 9, pvp: 0.74, pReceita: 1.1 },
      { anoFiscal: 2024, pl: 0.006, pvp: 0.0008, pReceita: 0.001 },
      { anoFiscal: 2025, pl: 0.009, pvp: 0.0011, pReceita: 0.0015 },
    ];
    expect(detectarHistoricoEscala(pontos, cfg).map((d) => d.chave)).toEqual([
      '2021',
      '2024',
      '2025',
    ]);
    // LAND3: só 2021 certo — um ano plausível basta de âncora
    const land: PontoHistorico[] = [
      { anoFiscal: 2021, pl: 56.9, pvp: 3.1, pReceita: 8 },
      { anoFiscal: 2022, pl: 0.03, pvp: 0.001, pReceita: 0.004 },
      { anoFiscal: 2023, pl: 0.05, pvp: 0.002, pReceita: 0.006 },
      { anoFiscal: 2024, pl: 0.09, pvp: 0.0035, pReceita: 0.01 },
      { anoFiscal: 2025, pl: 0.07, pvp: 0.003, pReceita: 0.008 },
    ];
    expect(detectarHistoricoEscala(land, cfg).map((d) => d.chave)).toEqual([
      '2022',
      '2023',
      '2024',
      '2025',
    ]);
  });

  it('um múltiplo sozinho fora da escala não marca', () => {
    const pontos: PontoHistorico[] = [
      { anoFiscal: 2020, pl: 10, pvp: 1, pReceita: 1 },
      { anoFiscal: 2021, pl: 11, pvp: 1.1, pReceita: 1.1 },
      { anoFiscal: 2022, pl: 900, pvp: 1.2, pReceita: 1.2 },
      { anoFiscal: 2023, pl: 12, pvp: 1, pReceita: 1 },
    ];
    expect(detectarHistoricoEscala(pontos, cfg)).toEqual([]);
  });
});

describe('R3 preco_base (fixture DEV)', () => {
  const pb = (s: string, eventos = precos(s).eventos) =>
    detectarPrecoBase(precos(s).serie, eventos, DATA_REF, cfg.precoBase);

  it('SBSP3: salto ×0,20 em 29/04/2026 sem evento ⇒ conferência com chave na data', () => {
    const d = pb('SBSP3');
    expect(d).toMatchObject({ grupo: 'preco_base', regra: 'base_sem_evento', chave: '2026-04-29' });
    expect(d?.valor).toBeCloseTo(32.99 / 167, 4);
  });

  it('SBSP3 com o desdobramento registrado a ±3 dias ⇒ não marca', () => {
    expect(pb('SBSP3', [{ dataEvento: '2026-04-27' }])).toBeNull();
  });

  it.each(['INHF11', 'PRIO3', 'RECT11', 'KNRE11', 'CGAS3'])('%s não marca', (s) => {
    expect(pb(s)).toBeNull();
  });

  it('fator de evento: razão a ±8% de {2,…,100} ou do inverso', () => {
    expect(fatorDeEvento(0.1975, cfg.precoBase.fatores, cfg.precoBase.tolFator)).toBeCloseTo(0.2);
    expect(fatorDeEvento(9.31, cfg.precoBase.fatores, cfg.precoBase.tolFator)).toBe(10);
    expect(fatorDeEvento(1.6, cfg.precoBase.fatores, cfg.precoBase.tolFator)).toBeNull();
  });

  it('salto que não persiste 5 pregões não marca', () => {
    const serie: PregaoSerie[] = [
      { date: '2026-05-04', closeRaw: 100, negocios: 500 },
      { date: '2026-05-05', closeRaw: 50, negocios: 500 },
      { date: '2026-05-06', closeRaw: 50, negocios: 500 },
      { date: '2026-05-07', closeRaw: 98, negocios: 500 },
      { date: '2026-05-08', closeRaw: 99, negocios: 500 },
      { date: '2026-05-11', closeRaw: 99, negocios: 500 },
      { date: '2026-05-12', closeRaw: 99, negocios: 500 },
    ];
    expect(detectarPrecoBase(serie, [], DATA_REF, cfg.precoBase)).toBeNull();
  });
});

describe('R4 preco_esporadico (fixture DEV)', () => {
  const esp = (s: string, classe: 'acao' | 'fii') => {
    const p = precos(s);
    return detectarPrecoEsporadico(
      {
        classe,
        pregoesComNegocio21: p.resumo.pregoesComNegocio21,
        ultimoPregao: p.resumo.ultimoPregao,
        pvp: deNumero(p.atual.pvp),
        serie: p.serie,
      },
      cfg.esporadico,
    );
  };

  it.each(['INHF11', 'KNRE11', 'RECT11'])('%s negocia (≥ 5 pregões em 21) ⇒ nada', (s) => {
    expect(esp(s, 'fii')).toBeNull();
  });

  it('CGAS3: esporádica, mas P/VP 10,4 dentro da faixa de ações ⇒ só selo informativo', () => {
    expect(esp('CGAS3', 'acao')).toEqual({ tipo: 'info', codigo: 'cotacao_esporadica' });
  });

  it('APXU11: esporádico, P/VP 1,34 e perto da mediana ⇒ só selo informativo', () => {
    expect(esp('APXU11', 'fii')).toEqual({ tipo: 'info', codigo: 'cotacao_esporadica' });
  });

  it('MMVE11 (resultado medido no dry-run): 2º sinal da mediana dispara (147 → 70,7)', () => {
    const d = esp('MMVE11', 'fii');
    expect(d).toMatchObject({ tipo: 'conf', grupo: 'preco_esporadico', regra: 'desvio_mediana' });
    expect(d && 'chave' in d ? d.chave : null).toBe('2026-09-25');
  });

  it('RBLG11: queda de preço que acompanhou o VP/cota (66 → 33) não dispara desvio_mediana', () => {
    // 20 pregões com negócio a 48 (mediana do dev; VP 66) até mar/26 e 6 a ~19 (VP 33 → 31) depois
    const serie = [
      ...Array.from({ length: 20 }, (_, i) => ({
        date: `2025-${String(10 + Math.floor(i / 10)).padStart(2, '0')}-${String(1 + (i % 10) * 2).padStart(2, '0')}`,
        closeRaw: 48,
        negocios: 3,
      })),
      { date: '2026-04-20', closeRaw: 20.81, negocios: 2 },
      { date: '2026-05-12', closeRaw: 19.5, negocios: 1 },
      { date: '2026-06-09', closeRaw: 18.9, negocios: 1 },
      { date: '2026-07-14', closeRaw: 18.2, negocios: 1 },
      { date: '2026-08-04', closeRaw: 18.0, negocios: 1 },
      { date: '2026-08-25', closeRaw: 17.69, negocios: 1 },
    ];
    const vps = [
      { refMonth: '2025-09-01', vpCota: 66.5 },
      { refMonth: '2026-03-01', vpCota: 66.02 },
      { refMonth: '2026-04-01', vpCota: 33.31 },
      { refMonth: '2026-08-01', vpCota: 30.96 },
    ];
    const base = {
      classe: 'fii' as const,
      pregoesComNegocio21: 1,
      ultimoPregao: '2026-08-25',
      pvp: deNumero(0.57),
      serie,
    };
    // só pelo preço cru (sem informes) o desvio de −63% dispara
    expect(detectarPrecoEsporadico(base, cfg.esporadico)).toMatchObject({
      regra: 'desvio_mediana',
    });
    // com o VP/cota, o P/VP está coerente: só o selo informativo
    expect(detectarPrecoEsporadico({ ...base, vps }, cfg.esporadico)).toEqual({
      tipo: 'info',
      codigo: 'cotacao_esporadica',
    });
    // preço que cai sem o VP cair continua disparando
    const vpsParados = vps.map((v) => ({ ...v, vpCota: 66 }));
    expect(detectarPrecoEsporadico({ ...base, vps: vpsParados }, cfg.esporadico)).toMatchObject({
      regra: 'desvio_mediana',
    });
  });

  it('P/VP de FII abaixo do piso 0,25 com cotação esporádica ⇒ faixa_pvp', () => {
    const d = detectarPrecoEsporadico(
      {
        classe: 'fii',
        pregoesComNegocio21: 2,
        ultimoPregao: '2026-09-29',
        pvp: deNumero(0.2),
        serie: [],
      },
      cfg.esporadico,
    );
    expect(d).toMatchObject({ regra: 'faixa_pvp', chave: '2026-09-29' });
  });
});

describe('R5/R6 FII e revisão (fixture DEV)', () => {
  it('GSRF11: VP/cota ×6,23 entre os dois últimos informes ⇒ fii_vp (mês 2026-08)', () => {
    const d = detectarFiiVp(mesesFii('GSRF11'), cfg);
    expect(d).toMatchObject({ grupo: 'fii_vp', regra: 'vp_salto', chave: '2026-08' });
    expect(d?.valor).toBeCloseTo(6.23, 2);
    expect(revisaoFiiPl(mesesFii('GSRF11'), cfg.rev)?.regra).toBe('fii_pl');
    expect(revisaoFiiCotistas(mesesFii('GSRF11'), cfg.rev)?.regra).toBe('fii_cotistas');
  });

  it('APXU11: Obrigações/PL 125% ⇒ fii_obrigacoes (mês 2026-08)', () => {
    const [mesAtual] = mesesFii('APXU11');
    expect(detectarFiiObrigacoes(mesAtual, cfg)).toMatchObject({
      grupo: 'fii_obrigacoes',
      regra: 'obrigacoes_acima',
      chave: '2026-08',
    });
  });

  it.each(['KNRE11', 'RECT11', 'INHF11', 'MMVE11'])('%s: sem fii_vp nem fii_obrigacoes', (s) => {
    expect(detectarFiiVp(mesesFii(s), cfg)).toBeNull();
    expect(detectarFiiObrigacoes(mesesFii(s)[0], cfg)).toBeNull();
  });

  it('desdobramento identificado no informe não marca fii_vp', () => {
    const meses = mesesFii('GSRF11').map((m, i) => (i === 0 ? { ...m, fatorDesdobramento: 6 } : m));
    expect(detectarFiiVp(meses, cfg)).toBeNull();
  });
});

describe('R7/R8 fundamentos (fixture DEV)', () => {
  it('PRIO3: queda real de lucro (10,3 bi → 2,25 bi) não marca nada', () => {
    expect(detectarSaltoEscalaFundamentos(fys('PRIO3'), cfg)).toBeNull();
    expect(revisaoVariacaoLucro(fys('PRIO3'), cfg.rev)).toBeNull();
  });

  it('SYNE3: só caso de revisão (lucro ÷ 8,8 e receita −76%), nunca conferência', () => {
    expect(detectarSaltoEscalaFundamentos(fys('SYNE3'), cfg)).toBeNull();
    expect(revisaoVariacaoLucro(fys('SYNE3'), cfg.rev)).toMatchObject({
      tipo: 'rev',
      regra: 'variacao_lucro',
      chave: '2025',
    });
    expect(revisaoVariacaoNivel(fys('SYNE3'), cfg.rev)?.regra).toBe('variacao_nivel');
  });

  it.each(['WEGE3', 'CGAS3'])('%s: sem salto de escala', (s) => {
    expect(detectarSaltoEscalaFundamentos(fys(s), cfg)).toBeNull();
  });

  it('documento inteiro ×1000 marca salto_escala; com escala_corrigida, não; uma conta só, não', () => {
    const [ant, ult] = fys('WEGE3').slice(-2);
    const x1000 = {
      ...ult,
      receita: ult.receita! * 1000,
      ativoTotal: ult.ativoTotal! * 1000,
      pl: ult.pl! * 1000,
    };
    expect(detectarSaltoEscalaFundamentos([ant, x1000], cfg)?.regra).toBe('salto_escala');
    expect(
      detectarSaltoEscalaFundamentos([ant, { ...x1000, flags: ['escala_corrigida'] }], cfg),
    ).toBeNull();
    expect(detectarSaltoEscalaFundamentos([ant, { ...ult, pl: ult.pl! * 20 }], cfg)).toBeNull();
  });
});

describe('R9 divergência de fonte (só revisão)', () => {
  it('dpa_dmpl: último ano fechado com payout por ação ≥ 3× o da DMPL', () => {
    const porAno = [
      { anoFiscal: 2024, payoutPorAcaoPct: 300, payoutDmplPct: 30 },
      { anoFiscal: 2025, payoutPorAcaoPct: 120, payoutDmplPct: 30 },
    ];
    expect(revisaoDpaDmpl(porAno, '2026-09-29', cfg.rev)).toMatchObject({ chave: '2025' });
    expect(revisaoDpaDmpl(porAno.slice(0, 1), '2026-09-29', cfg.rev)).toBeNull();
  });

  it('rend_fii_cvm ≥ 2×', () => {
    expect(
      revisaoRendFiiCvm({ rendProvedor: 2.1, rendCvm: 1, mes: '2026-08' }, cfg.rev)?.regra,
    ).toBe('rend_fii_cvm');
    expect(
      revisaoRendFiiCvm({ rendProvedor: 1.5, rendCvm: 1, mes: '2026-08' }, cfg.rev),
    ).toBeNull();
  });

  it('preco_brapi: > 5% do dia E do pregão anterior (D-1 publicado como D não conta)', () => {
    const base = { data: '2026-09-29', cotahistDia: 10, cotahistAnterior: 11 };
    expect(revisaoPrecoBrapi({ ...base, precoProvedor: 11 }, cfg.rev)).toBeNull();
    expect(revisaoPrecoBrapi({ ...base, precoProvedor: 12 }, cfg.rev)?.regra).toBe('preco_brapi');
    expect(revisaoPrecoBrapi({ ...base, precoProvedor: 10.2 }, cfg.rev)).toBeNull();
  });
});

describe('flags e liberação', () => {
  const sbsp: Deteccao = {
    tipo: 'conf',
    grupo: 'preco_base',
    regra: 'base_sem_evento',
    chave: '2026-04-29',
  };

  it('gera flags do contrato (conf:/rev:/info:)', () => {
    const flags = flagsDasDeteccoes('SBSP3', [
      sbsp,
      { tipo: 'rev', regra: 'variacao_lucro', chave: '2025' },
      { tipo: 'info', codigo: 'cotacao_esporadica' },
      null,
    ]);
    expect(flags).toEqual([
      'conf:preco_base:base_sem_evento@2026-04-29',
      'rev:variacao_lucro@2025',
      'info:cotacao_esporadica',
    ]);
    expect(parseFlagConf(flags[0])).toEqual({
      grupo: 'preco_base',
      regra: 'base_sem_evento',
      chave: '2026-04-29',
    });
    expect(parseFlagRev(flags[1])).toEqual({ regra: 'variacao_lucro', chave: '2025' });
  });

  it('mesma chave liberada não marca; chave nova marca de novo', () => {
    const lib = new Set([chaveLiberacaoDe('SBSP3', 'base_sem_evento', '2026-04-29')]);
    expect(flagsDasDeteccoes('SBSP3', [sbsp], lib)).toEqual([]);
    expect(flagsDasDeteccoes('sbsp3', [{ ...sbsp, chave: '2026-09-01' }], lib)).toEqual([
      'conf:preco_base:base_sem_evento@2026-09-01',
    ]);
    // a liberação é por símbolo: a mesma chave em outro ticker continua marcando
    expect(flagsDasDeteccoes('SBSP11', [sbsp], lib)).toHaveLength(1);
  });

  it('info:cotacao_esporadica some quando o mesmo ticker já tem conf:preco_esporadico', () => {
    const flags = flagsDasDeteccoes('MMVE11', [
      { tipo: 'conf', grupo: 'preco_esporadico', regra: 'desvio_mediana', chave: '2026-09-25' },
      { tipo: 'info', codigo: 'cotacao_esporadica' },
    ]);
    expect(flags).toEqual(['conf:preco_esporadico:desvio_mediana@2026-09-25']);
  });
});
