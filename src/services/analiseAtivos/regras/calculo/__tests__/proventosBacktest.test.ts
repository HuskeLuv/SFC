/**
 * Backtest da Análise de Ativos (18/10/2026, achados A1, A2 e M9): linhas reais de
 * asset_dividend_history de prod (17/10/2026) contra a B3 (suplemento por ISIN). DY 12m com
 * hoje = 16/10/2026 (janela de data-com (16/10/2025, 16/10/2026]).
 */
import { describe, expect, it } from 'vitest';
import {
  auditarProventos,
  mesesDyCvm,
  rendimento12m,
} from '@/services/analiseAtivos/regras/calculo/proventos';
import { P, bruto } from './helpers';

const HOJE = '2026-10-16';
/** linha BRAPI: data-com gravada (convenção 'com') e pagamento; sem pagamento = pag igual à data */
const l = (id: string, symbol: string, tipo: string, valor: number, com: string, pag: string) =>
  bruto({ id, symbol, tipo, valor, dataExGravada: com, dataPagamento: pag });
const validos = (aud: ReturnType<typeof auditarProventos>) =>
  aud
    .filter((x) => x.status === 'valido')
    .map((x) => x.origemId)
    .sort();
const dy12m = (aud: ReturnType<typeof auditarProventos>, classe: 'acao' | 'fii' = 'acao') => {
  const r = rendimento12m(aud, HOJE, classe, [], P);
  return r.estado === 'ok' ? Number(r.valor.toFixed(8)) : null;
};

describe('A1a — soma de proventos de datas-com diferentes gravada numa linha', () => {
  it('SAPR11: 1,960639691 (30/12/2025, pago 26/06/2026) = 1,4082268 (30/06/2025) + 0,5524128 ⇒ sai; DY 12m = 0,5524 (B3)', () => {
    const aud = auditarProventos(
      [
        l('jun', 'SAPR11', 'JCP', 1.4082268, '2025-06-30', '2025-06-30'),
        l('soma', 'SAPR11', 'JCP', 1.960639691, '2025-12-30', '2026-06-26'),
        l('dez', 'SAPR11', 'JCP', 0.5524128, '2025-12-30', '2025-12-30'),
      ],
      [],
      P,
      { classe: 'acao' },
    );
    expect(aud.find((x) => x.origemId === 'soma')).toMatchObject({
      status: 'duplicata',
      duplicataDe: 'dez',
      flags: ['soma_de_parcelas'],
    });
    expect(dy12m(aud)).toBe(0.5524128); // antes: 2,5131 (DY 6,28% × 1,38% da B3)
  });

  it('BBDC4: 0,644233458 (03/07/2026) = 0,297339 (07/04) + 0,346895 (06/07) com 6 casas ⇒ sai', () => {
    const aud = auditarProventos(
      [
        l('t1', 'BBDC4', 'JCP', 0.297339, '2026-04-07', '2026-10-30'),
        l('soma', 'BBDC4', 'JCP', 0.644233458, '2026-07-03', '2026-09-15'),
        l('t2', 'BBDC4', 'JCP', 0.346895, '2026-07-06', '2027-01-29'),
        l('m1', 'BBDC4', 'JCP', 0.018974809, '2026-07-01', '2026-08-03'),
      ],
      [],
      P,
      { classe: 'acao' },
    );
    expect(aud.find((x) => x.origemId === 'soma')!.flags).toContain('soma_de_parcelas');
    expect(validos(aud)).toEqual(['m1', 't1', 't2']);
  });

  it('PETR4: 0,67407131 NÃO é soma (0,20250435 + 0,47160378 = 0,67410813, 5e-5 de diferença) — fica', () => {
    const aud = auditarProventos(
      [
        l('a', 'PETR4', 'JCP', 0.47160378, '2025-12-22', '2026-02-20'),
        l('b', 'PETR4', 'JCP', 0.17518233, '2025-12-22', '2026-03-20'),
        l('c', 'PETR4', 'JCP', 0.35048636, '2026-06-01', '2026-08-20'),
        l('x', 'PETR4', 'JCP', 0.67407131, '2026-08-21', '2026-11-23'),
        l('y', 'PETR4', 'JCP', 0.20250435, '2026-08-21', '2026-12-21'),
      ],
      [],
      P,
      { classe: 'acao' },
    );
    expect(aud.every((x) => x.status === 'valido')).toBe(true);
  });
});

describe('A1b — total declarado + parcelas do mesmo provento', () => {
  it('ABEV3: JCP total 0,269 (19/12/2025) + parcelas 0,075 + 0,0755 + 0,1185 de 18/12 ⇒ parcelas saem; DY 12m = B3', () => {
    const aud = auditarProventos(
      [
        l('div', 'ABEV3', 'DIVIDENDO', 0.4612, '2025-12-18', '2025-12-30'),
        l('p1', 'ABEV3', 'JCP', 0.075, '2025-12-18', '2026-04-06'),
        l('p2', 'ABEV3', 'JCP', 0.0755, '2025-12-18', '2026-07-06'),
        l('p3', 'ABEV3', 'JCP', 0.1185, '2025-12-18', '2026-10-06'),
        l('tot', 'ABEV3', 'JCP', 0.269, '2025-12-19', '2026-12-30'),
      ],
      [],
      P,
      { classe: 'acao' },
    );
    expect(validos(aud)).toEqual(['div', 'tot']);
    expect(dy12m(aud)).toBe(0.7302);
  });

  it('CPFE3 29/04/2025: total 2,79417675 pago por último (15/12) + parcelas de jun–ago e de 30/04 ⇒ parcelas saem (DPA = B3)', () => {
    const aud = auditarProventos(
      [
        l('tot', 'CPFE3', 'DIVIDENDO', 2.79417675, '2025-04-29', '2025-12-15'),
        l('a', 'CPFE3', 'DIVIDENDO', 0.321109633, '2025-04-29', '2025-08-25'),
        l('b', 'CPFE3', 'DIVIDENDO', 0.781077485, '2025-04-29', '2025-06-25'),
        l('c', 'CPFE3', 'DIVIDENDO', 0.433931936, '2025-04-29', '2025-07-25'),
        l('d', 'CPFE3', 'DIVIDENDO', 0.173572, '2025-04-30', '2025-10-27'),
        l('e', 'CPFE3', 'DIVIDENDO', 0.216965, '2025-04-30', '2025-09-25'),
        l('f', 'CPFE3', 'DIVIDENDO', 0.607504, '2025-04-30', '2025-11-19'),
      ],
      [],
      P,
      { classe: 'acao' },
    );
    expect(validos(aud)).toEqual(['tot']);
    expect(aud.filter((x) => x.flags.includes('parcela_de_total'))).toHaveLength(6);
  });

  it('CPFE3 28/04/2023: 1,234365592 = 0,433931936 + 0,260359162 + 0,540074494 (exato) ⇒ fica o total e o 0,8679 da mesma data (B3: 2,1022)', () => {
    const aud = auditarProventos(
      [
        l('tot', 'CPFE3', 'DIVIDENDO', 1.234365592, '2023-04-28', '2023-12-31'),
        l('p1', 'CPFE3', 'DIVIDENDO', 0.433931936, '2023-04-28', '2023-12-31'),
        l('p2', 'CPFE3', 'DIVIDENDO', 0.260359162, '2023-04-28', '2023-10-25'),
        l('p3', 'CPFE3', 'DIVIDENDO', 0.540074494, '2023-04-28', '2023-06-23'),
        l('outro', 'CPFE3', 'DIVIDENDO', 0.867863872, '2023-04-28', '2023-05-16'),
      ],
      [],
      P,
      { classe: 'acao' },
    );
    expect(validos(aud)).toEqual(['outro', 'tot']);
  });

  it('B3SA3: 4 parcelas iguais de 30/12/2025 e um total somado da fonte NÃO viram "total + parcelas"', () => {
    const aud = auditarProventos(
      [
        l('s', 'B3SA3', 'JCP', 0.15701467399, '2025-12-30', '2026-01-12'),
        l('a', 'B3SA3', 'JCP', 0.07448513949, '2025-12-30', '2026-04-13'),
        l('b', 'B3SA3', 'JCP', 0.07448513948, '2025-12-30', '2026-07-07'),
        l('c', 'B3SA3', 'JCP', 0.07448513948, '2025-12-30', '2026-10-07'),
      ],
      [],
      P,
      { classe: 'acao' },
    );
    expect(aud.every((x) => x.status === 'valido')).toBe(true);
  });
});

describe('A1c — mesmo JCP repetido com outro pagamento', () => {
  it('ITUB4: JCP 0,71076 de 18/06/2026 pago em 28/08 e em 31/08 (3 dias) ⇒ conta uma vez (a de 28/08)', () => {
    const aud = auditarProventos(
      [
        l('p31', 'ITUB4', 'JCP', 0.71076, '2026-06-18', '2026-08-31'),
        l('p28', 'ITUB4', 'JCP', 0.71076, '2026-06-18', '2026-08-28'),
      ],
      [],
      P,
      { classe: 'acao' },
    );
    expect(validos(aud)).toEqual(['p28']);
    expect(aud.find((x) => x.origemId === 'p31')).toMatchObject({
      status: 'duplicata',
      duplicataDe: 'p28',
    });
  });

  it('ITSA4: JCP 0,0182 de 09/12/2025 (pago 06/03) e de 10/12 (pago 30/04) ⇒ data-com deslocada, conta uma vez', () => {
    const aud = auditarProventos(
      [
        l('a', 'ITSA4', 'JCP', 0.0182, '2025-12-09', '2026-03-06'),
        l('b', 'ITSA4', 'JCP', 0.0182, '2025-12-10', '2026-04-30'),
      ],
      [],
      P,
      { classe: 'acao' },
    );
    expect(validos(aud)).toEqual(['a']);
    expect(aud.find((x) => x.origemId === 'b')!.flags).toContain('duplicata_data_com_deslocada');
  });

  it('FLRY3: a mesma parcela com 8 e com 11 casas (0,13027153132 × 0,13027152), pagamentos a 1 dia ⇒ duplicata', () => {
    const aud = auditarProventos(
      [
        l('a', 'FLRY3', 'DIVIDENDO', 0.13027153132, '2025-12-02', '2027-09-02'),
        l('b', 'FLRY3', 'DIVIDENDO', 0.13027152, '2025-12-03', '2027-09-01'),
      ],
      [],
      P,
      { classe: 'acao' },
    );
    expect(aud.filter((x) => x.status === 'duplicata')).toHaveLength(1);
  });

  it('CMIG4: tranches iguais da MESMA data-com com 6 meses de intervalo seguem as duas', () => {
    const aud = auditarProventos(
      [
        l('a', 'CMIG4', 'JCP', 0.11840131614, '2025-12-23', '2026-06-30'),
        l('b', 'CMIG4', 'JCP', 0.11840131614, '2025-12-23', '2026-12-30'),
      ],
      [],
      P,
      { classe: 'acao' },
    );
    expect(validos(aud)).toEqual(['a', 'b']);
  });
});

describe('A2 — rendimentos "fantasmas" de FII (data-com = pagamento, dia 01)', () => {
  it('RBTS11: fantasma 10,9084 de 01/12/2025 sai pelo 7,3419 real de 30/12; os de fev–jun/2026 saem pela CVM (DY 0); DY 12m = 7,3419 (B3)', () => {
    const semCvm = mesesDyCvm([
      { refMonth: '2025-12-01', dyMesCvmPct: 2.1777 },
      ...['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'].map((m) => ({
        refMonth: `${m}-01`,
        dyMesCvmPct: 0,
      })),
    ]).semRendimento;
    const aud = auditarProventos(
      [
        l('f1', 'RBTS11', 'RENDIMENTO', 10.9083805, '2025-12-01', '2025-12-01'),
        l('real', 'RBTS11', 'RENDIMENTO', 7.34188413, '2025-12-30', '2026-01-15'),
        l('f2', 'RBTS11', 'RENDIMENTO', 3.5664957, '2026-02-01', '2026-02-01'),
        l('f3', 'RBTS11', 'RENDIMENTO', 0.2936076, '2026-03-01', '2026-03-01'),
        l('f4', 'RBTS11', 'RENDIMENTO', 0.2936076, '2026-06-01', '2026-06-01'),
      ],
      [],
      P,
      { classe: 'fii', mesesSemRendimentoCvm: semCvm },
    );
    expect(validos(aud)).toEqual(['real']);
    expect(aud.find((x) => x.origemId === 'f1')).toMatchObject({
      duplicataDe: 'real',
      flags: ['fantasma_mensal'],
    });
    expect(dy12m(aud, 'fii')).toBe(7.34188413); // antes: 22,9912 (DY 10,9% × 3,5%)
  });

  it('REME11: fantasma 1,1376 de 01/04/2026 sai pelo real pago em 15/04 (data-com 31/03); XLPR11 01/12/2025 × 30/12', () => {
    const reme = auditarProventos(
      [
        l('real', 'REME11', 'RENDIMENTO', 0.15, '2026-03-31', '2026-04-15'),
        l('f', 'REME11', 'RENDIMENTO', 1.1376011, '2026-04-01', '2026-04-01'),
      ],
      [],
      P,
      { classe: 'fii' },
    );
    expect(validos(reme)).toEqual(['real']);
    const xlpr = auditarProventos(
      [
        l('f', 'XLPR11', 'RENDIMENTO', 2.3435884, '2025-12-01', '2025-12-01'),
        l('real', 'XLPR11', 'RENDIMENTO', 2.343588385846, '2025-12-30', '2026-01-15'),
      ],
      [],
      P,
      { classe: 'fii' },
    );
    expect(validos(xlpr)).toEqual(['real']);
  });

  it('BTHF11 2023: fantasma sem rendimento real no mês e com DY na CVM fica (é a única notícia do pagamento)', () => {
    const aud = auditarProventos(
      [l('f', 'BTHF11', 'RENDIMENTO', 0.07749606, '2023-02-01', '2023-02-01')],
      [],
      P,
      {
        classe: 'fii',
        mesesSemRendimentoCvm: mesesDyCvm([
          { refMonth: '2023-01-01', dyMesCvmPct: 0 },
          { refMonth: '2023-02-01', dyMesCvmPct: 0.775 },
        ]).semRendimento,
      },
    );
    expect(validos(aud)).toEqual(['f']);
  });

  it('ações não usam a regra do fantasma de FII', () => {
    const aud = auditarProventos(
      [
        l('f', 'TEST3', 'DIVIDENDO', 1, '2026-04-01', '2026-04-01'),
        l('r', 'TEST3', 'DIVIDENDO', 0.5, '2026-03-31', '2026-04-15'),
      ],
      [],
      P,
      { classe: 'acao' },
    );
    expect(validos(aud)).toEqual(['f', 'r']);
  });

  it('mesesDyCvm: mês com alguma versão > 0 não é "sem rendimento"; DY nulo não entra', () => {
    const r = mesesDyCvm([
      { refMonth: '2026-01-01', dyMesCvmPct: 0 },
      { refMonth: '2026-01-01', dyMesCvmPct: 0.8 },
      { refMonth: '2026-02-01', dyMesCvmPct: 0 },
      { refMonth: '2026-03-01', dyMesCvmPct: null },
    ]);
    expect([...r.semRendimento]).toEqual(['2026-02']);
    expect([...r.comRendimento]).toEqual(['2026-01']);
  });
});
