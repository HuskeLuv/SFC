import { describe, expect, it } from 'vitest';
import { assertUrlPermitida } from '@/services/analiseAtivos/fontes/allowlist';
import { ErroLayoutFonte } from '@/services/analiseAtivos/fontes/erros';
import {
  candidatosFiagro,
  lerInformeFiagroLinhas,
  urlInformeFiagro,
} from '@/services/analiseAtivos/fii/parserInformeFiagro';
import {
  candidatosDiario,
  cotasDoFechamento,
  lerInformeDiarioLinhas,
  mesDoFechamento,
  urlInformeDiarioFi,
} from '@/services/analiseAtivos/fii/parserInformeDiarioFi';
import { textoFixture } from '@/services/analiseAtivos/regras/fii/__tests__/fixturesFii';

async function* linhas(texto: string): AsyncIterable<string> {
  for (const l of texto.split(/\r?\n/)) yield l;
}

// Linhas REAIS (dados abertos da CVM): inf_mensal_fiagro_202609 (KNCA11, RURA11, um fundo de balcão
// e um CNPJ com duas linhas) e inf_diario_fi_202609 (KDIF11, JURO11 e um fundo fora do filtro).
const FIAGRO = textoFixture('inf_mensal_fiagro_202609_amostra.csv');
const DIARIO = textoFixture('inf_diario_fi_202609_amostra.csv');
const KNCA = '41745701000137';
const RURA = '42479593000160';
const KDIF = '26324298000189';
const JURO = '42730834000100';

describe('informe mensal de Fiagro (CVM)', () => {
  it('URL do mês na allowlist; antes de 202505 não existe', () => {
    expect(urlInformeFiagro('2026-09-01')).toBe(
      'https://dados.cvm.gov.br/dados/FIAGRO/DOC/INF_MENSAL/DADOS/inf_mensal_fiagro_202609.zip',
    );
    expect(() => assertUrlPermitida(urlInformeFiagro('2025-05-01'))).not.toThrow();
    expect(() => urlInformeFiagro('2025-04-01')).toThrow();
  });

  it('mês no formato do FII: percentuais já em p.p. (sem ×100) e composição mapeada', async () => {
    const r = await lerInformeFiagroLinhas(linhas(FIAGRO), { arquivo: 'amostra' });
    const knca = r.meses.find((m) => m.cnpj === KNCA)!;
    expect(knca).toMatchObject({
      refMonth: '2026-09-01',
      versao: 1,
      dtEntrega: expect.stringMatching(/^2026-1\d-\d{2}$/),
      pl: 2164726036.54,
      cotas: 21599919,
      vpCota: 100.22,
      cotistas: 92355,
      // DY 0,93% ao mês: o informe de Fiagro já traz p.p. (o de FII traz fração 0,0093)
      dyMesCvmPct: 0.93,
      segmentoCvm: 'Fiagro',
      temComposicao: true,
      spe: null,
      obrigSecuritizacao: null,
    });
    // adm 0 + gestão 0,09 + distribuição 0 (CVM 175 separa as três)
    expect(knca.taxaAdmPct).toBeCloseTo(0.09, 10);
    // papel = CRA + CRI + CPR (+ CDCA + debêntures, zerados)
    expect(knca.cri).toBeCloseTo(1460031461.41 + 63711218.91 + 242641908.67, 2);
    expect(knca.cotasFii).toBeCloseTo(295969832.44, 2);
    expect(knca.rendaFixa).toBeCloseTo(124719900.77, 2);
    expect(knca.lciLca).toBe(0);
    expect(knca.imoveis).toBe(0);
    const rura = r.meses.find((m) => m.cnpj === RURA)!;
    expect(rura.taxaAdmPct).toBeCloseTo(0.08, 10);
    expect(r.linhasLidas).toBe(5);
    // CNPJ repetido no mês: uma linha só (maior versão; empate = a última)
    expect(r.meses.filter((m) => m.cnpj === '62839177000133')).toHaveLength(1);
  });

  it('filtro por CNPJ e candidatos do cadastro (ISIN, bolsa, PL e cotas)', async () => {
    const r = await lerInformeFiagroLinhas(linhas(FIAGRO), {
      arquivo: 'amostra',
      cnpjs: new Set([KNCA, RURA]),
    });
    expect(r.meses.map((m) => m.cnpj)).toEqual([KNCA, RURA]);
    const c = candidatosFiagro([r]);
    expect(c).toEqual([
      expect.objectContaining({
        cnpj: KNCA,
        isin: 'BRKNCACTF014',
        bolsa: true,
        pl: 2164726036.54,
        cotas: 21599919,
        ultimoMes: '2026-09-01',
      }),
      expect.objectContaining({ cnpj: RURA, isin: 'BRRURAR01M16', bolsa: true }),
    ]);
  });

  it('coluna obrigatória sumida ⇒ ErroLayoutFonte', async () => {
    const semDy = FIAGRO.replace('Dividend_Yield_Mes', 'DY_X');
    await expect(lerInformeFiagroLinhas(linhas(semDy), { arquivo: 'amostra' })).rejects.toThrow(
      ErroLayoutFonte,
    );
  });
});

describe('informe diário de fundos (FI-Infra leve)', () => {
  it('URL do mês na allowlist', () => {
    const u = urlInformeDiarioFi('2026-09-01');
    expect(u).toBe(
      'https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/inf_diario_fi_202609.zip',
    );
    expect(() => assertUrlPermitida(u)).not.toThrow();
    expect(() => urlInformeDiarioFi('2020-12-01')).toThrow();
  });

  it('fechamento = último dia do mês, só os CNPJs pedidos; cotas = PL ÷ cota', async () => {
    const r = await lerInformeDiarioLinhas(linhas(DIARIO), {
      arquivo: 'amostra',
      cnpjs: new Set([KDIF, JURO]),
    });
    expect([...r.fechamentos.keys()].sort()).toEqual([`${KDIF}|2026-09-01`, `${JURO}|2026-09-01`]);
    const kdif = r.fechamentos.get(`${KDIF}|2026-09-01`)!;
    expect(kdif.data).toBe('2026-09-30');
    expect(kdif).toMatchObject({ vlQuota: 117.9981286, pl: 2771158833.09, cotistas: 55632 });
    const mes = mesDoFechamento(kdif);
    expect(mes).toMatchObject({
      cnpj: KDIF,
      refMonth: '2026-09-01',
      vpCota: 117.9981286,
      pl: 2771158833.09,
      cotistas: 55632,
      temComposicao: false,
      cri: null,
      segmentoCvm: 'FI-Infra',
    });
    expect(mes.cotas).toBeCloseTo(2771158833.09 / 117.9981286, 3);
    const c = candidatosDiario(r);
    expect(c.map((x) => x.cnpj)).toEqual([KDIF, JURO].sort());
    expect(c[0]).toMatchObject({ nomes: [], isin: null, bolsa: true, ultimoMes: '2026-09-01' });
  });

  it('cotas inválidas (PL ou cota ≤ 0 / ausentes) ⇒ null', () => {
    expect(cotasDoFechamento({ pl: 100, vlQuota: 0 })).toBeNull();
    expect(cotasDoFechamento({ pl: null, vlQuota: 10 })).toBeNull();
    expect(cotasDoFechamento({ pl: 100, vlQuota: 10 })).toBe(10);
  });

  it('1 cotista (classe master de FIC) ⇒ cotistas sem dado', () => {
    const base = { cnpj: KDIF, data: '2026-09-30', vlQuota: 10, pl: 1000 };
    expect(mesDoFechamento({ ...base, cotistas: 1 }).cotistas).toBeNull();
    expect(mesDoFechamento({ ...base, cotistas: 0 }).cotistas).toBeNull();
    expect(mesDoFechamento({ ...base, cotistas: 2 }).cotistas).toBe(2);
  });

  it('0 cotistas num dia solto: fica o último número positivo do mês', async () => {
    const zerado = DIARIO.replace(';2771158833.09;0.00;0.00;55632', ';2771158833.09;0.00;0.00;0');
    const r = await lerInformeDiarioLinhas(linhas(zerado), {
      arquivo: 'amostra',
      cnpjs: new Set([KDIF]),
    });
    expect(r.fechamentos.get(`${KDIF}|2026-09-01`)).toMatchObject({
      data: '2026-09-30',
      cotistas: 55557,
    });
  });

  it('linha de subclasse não conta (só a da classe)', async () => {
    const comSub = DIARIO.replace(
      `26.324.298/0001-89;;2026-09-30`,
      `26.324.298/0001-89;SUB1;2026-09-30`,
    );
    const r = await lerInformeDiarioLinhas(linhas(comSub), {
      arquivo: 'amostra',
      cnpjs: new Set([KDIF]),
    });
    expect(r.fechamentos.get(`${KDIF}|2026-09-01`)!.data).toBe('2026-09-29');
  });
});
