import { describe, it, expect } from 'vitest';
import { montarKpis, medianaPares } from '@/services/analiseAtivos/leitura/ativo/kpisAtivo';
import { paraLinhaQuadroApi } from '@/services/analiseAtivos/leitura/linhasQuadro';
import {
  LINHA_AURE3,
  LINHA_HCTR11,
  LINHA_HGLG11,
  LINHA_ITUB4,
  LINHA_WEGE3,
  linhaQuadroDb,
} from '@/test/fixtures/analiseAtivos/linhasDb';

const ATUAIS = {
  plMedia10a: 36.95,
  plPontosHistorico: 10,
  dpa12m: 2.0032,
  rend12m: null,
  vpCota: null,
};
const par = (roe: number, margem: number) =>
  paraLinhaQuadroApi(linhaQuadroDb({ symbol: `P${roe}3`, roePct: roe, margemLiquidaPct: margem }));

describe('montarKpis — ações', () => {
  const wege = paraLinhaQuadroApi(LINHA_WEGE3);

  it('8 KPIs na ordem da v1, com média 10a do P/L e caixa líquido', () => {
    const k = montarKpis({ linha: wege, atuais: ATUAIS, pares: [] });
    expect(k.map((x) => x.codigo)).toEqual([
      'pl',
      'pvp',
      'dy12m',
      'roe',
      'margemLiquida',
      'divLiqEbitda',
      'payout',
      'cagrLucro',
    ]);
    expect(k[0].sub).toBe('média 10a: 37,0×');
    expect(k[2].sub).toBe('R$ 2,00 por ação em 12m');
    if (wege.divLiqEbitda.estado === 'ok' && wege.divLiqEbitda.valor <= 0) {
      expect(k[5].sub).toBe('caixa líquido');
    }
  });

  it('P/L sem média com menos de 5 pontos de histórico', () => {
    const k = montarKpis({ linha: wege, atuais: { ...ATUAIS, plPontosHistorico: 4 }, pares: [] });
    expect(k[0].sub).toBeNull();
  });

  it('mediana dos pares só com 3 ou mais pares', () => {
    const dois = [par(10, 5), par(20, 7)];
    expect(medianaPares(dois, 'roe')).toBeNull();
    expect(montarKpis({ linha: wege, atuais: ATUAIS, pares: dois })[3].sub).toBeNull();
    const tres = [...dois, par(30, 9)];
    expect(medianaPares(tres, 'roe')).toEqual({ valor: 20, n: 3 });
    expect(montarKpis({ linha: wege, atuais: ATUAIS, pares: tres })[3].sub).toBe(
      'mediana de 3 pares: 20,0%',
    );
  });

  it('payout acima de 150% ganha o aviso', () => {
    const l = paraLinhaQuadroApi(linhaQuadroDb({ payoutPct: 161 }));
    const k = montarKpis({ linha: l, atuais: null, pares: [] });
    expect(k[6].sub).toBe('acima de 150%: inclui extraordinários ou lucro negativo');
    const normal = montarKpis({
      linha: paraLinhaQuadroApi(linhaQuadroDb({ payoutPct: 52 })),
      atuais: null,
      pares: [],
    });
    expect(normal[6].sub).toBeNull();
  });

  it('proventos em conferência: selo no DY e no payout', () => {
    const l = paraLinhaQuadroApi(linhaQuadroDb({ flags: ['provento_suspeito'], dy12mPct: 4 }));
    const k = montarKpis({ linha: l, atuais: null, pares: [] });
    expect(k[2].selo).toBe('proventos_em_conferencia');
    expect(k[6].selo).toBe('proventos_em_conferencia');
  });

  it('ITUB4 (financeira): Dív. líq./EBITDA n/a e sem mediana em campo n/a', () => {
    const k = montarKpis({
      linha: paraLinhaQuadroApi(LINHA_ITUB4),
      atuais: null,
      pares: [par(10, 5), par(20, 7), par(30, 9)],
    });
    expect(k[5].valor.estado).toBe('nao_se_aplica');
    if (k[4].valor.estado !== 'ok') expect(k[4].sub).toBeNull();
  });

  it('AURE3 (prejuízo): P/L "—" com a frase do prejuízo, não "fora do escopo"', () => {
    const k = montarKpis({ linha: paraLinhaQuadroApi(LINHA_AURE3), atuais: null, pares: [] });
    expect(k[0].valor).toEqual({
      estado: 'ausente',
      motivo: 'prejuizo',
      texto: 'P/L não calculado: prejuízo no último exercício',
    });
  });

  it('CAGR do lucro por ação em 5 anos fechados; histórico curto = ausente', () => {
    const lpa = [2020, 2021, 2022, 2023, 2024, 2025].map((ano, i) => ({ ano, valor: 1 + i * 0.2 }));
    const k = montarKpis({ linha: wege, atuais: null, pares: [], lpaAnual: lpa });
    expect(k[7].valor.estado).toBe('ok');
    expect(k[7].sub).toBe('lucro por ação de 2020 a 2025');
    const curto = montarKpis({ linha: wege, atuais: null, pares: [], lpaAnual: lpa.slice(3) });
    expect(curto[7].valor).toMatchObject({
      estado: 'ausente',
      texto: 'histórico com menos de 5 anos',
    });
  });
});

describe('montarKpis — FIIs', () => {
  it('8 KPIs; vacância com fonte CVM no tijolo', () => {
    const k = montarKpis({
      linha: paraLinhaQuadroApi(LINHA_HGLG11),
      atuais: {
        plMedia10a: null,
        plPontosHistorico: 0,
        dpa12m: null,
        rend12m: 13.2,
        vpCota: 165.95,
      },
      pares: [],
      patrimonioData: '2026-08-01',
    });
    expect(k.map((x) => x.codigo)).toEqual([
      'dy12m',
      'pvp',
      'rendCota12m',
      'patrimonio',
      'cotistas',
      'liquidez21',
      'obrigacoesPl',
      'vacanciaCvm',
    ]);
    expect(k[1].sub).toBe('VP/cota: R$ 165,95');
    expect(k[3].sub).toBe('informe mensal CVM de ago/26');
    expect(k[7].sub).toBe('fonte CVM · pode diferir do relatório do gestor');
    expect(k.some((x) => /cap rate/i.test(x.rotulo))).toBe(false);
  });

  it('papel: vacância n/a "fundo de papel não tem imóveis"', () => {
    const k = montarKpis({ linha: paraLinhaQuadroApi(LINHA_HCTR11), atuais: null, pares: [] });
    expect(k[7].valor).toEqual({
      estado: 'nao_se_aplica',
      motivo: 'papel_sem_imoveis',
      texto: 'fundo de papel não tem imóveis',
    });
    expect(k[7].sub).toBeNull();
  });
});
