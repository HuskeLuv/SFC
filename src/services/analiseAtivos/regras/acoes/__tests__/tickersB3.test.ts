import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { listarEntradasZip } from '@/services/analiseAtivos/fontes/zipStream';
import { lerFca } from '@/services/analiseAtivos/acoes/parserFca';
import { zipFcaBacktest } from '@/services/analiseAtivos/acoes/__tests__/zipFixtures';
import { raizTicker } from '@/services/analiseAtivos/repositorio/conversao';
import { completarComB3, type NegociadoB3 } from '@/services/analiseAtivos/regras/acoes/tickersB3';

const dir = mkdtempSync(path.join(os.tmpdir(), 'tickers-b3-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const BTG = '30306294000145';
const CSN = '33042730000104';
const CMIN = '08902291000115';
const MARFRIG = '03853896000140';
const CEA = '45242914000105';
const RAIZEN = '33453598000123';
const BRISANET = '04601397000128';
const MULTI = '59717553000102';
const KLABIN = '89637490000145';
const ALUPAR = '08364948000138';
const B100 = '52270350000171';
const HAGA = '30540991000166';
const BRF = '01838723000127';

/** COTAHIST 16/10/2026 (BDI 02), ESPECI como a B3 publica. */
const NEGOCIADOS_16OUT: NegociadoB3[] = [
  { symbol: 'BPAC11', especi: 'UNT     N2' },
  { symbol: 'BPAC3', especi: 'ON      N2' },
  { symbol: 'BPAC5', especi: 'PNA     N2' },
  { symbol: 'CSNA3', especi: 'ON' },
  { symbol: 'CMIN3', especi: 'ON      N2' },
  { symbol: 'MBRF3', especi: 'ON      NM' },
  { symbol: 'CEAB3', especi: 'ON      NM' },
  { symbol: 'RAIZ4', especi: 'PN      N2' },
  { symbol: 'BRST3', especi: 'ON      NM' },
  { symbol: 'MLAS3', especi: 'ON      NM' },
  { symbol: 'KLBN11', especi: 'UNT     N2' },
  { symbol: 'KLBN3', especi: 'ON      N2' },
  { symbol: 'KLBN4', especi: 'PN      N2' },
  { symbol: 'ALUP11', especi: 'UNT     N2' },
  { symbol: 'ALUP3', especi: 'ON      N2' },
  { symbol: 'ALUP4', especi: 'PN      N2' },
  { symbol: 'B1003', especi: 'ON      NM' },
  { symbol: 'HAGA3', especi: 'ON' },
  { symbol: 'HAGA4', especi: 'PN' },
  // não são ações da companhia ou não têm FCA no ano
  { symbol: 'AZUL97', especi: 'UNT     N2' },
  { symbol: 'IBOV11', especi: 'IBO/' },
  { symbol: 'HGLG11', especi: 'CI' },
  { symbol: 'WDCN3', especi: 'ON      NM' },
];

async function lerBacktest() {
  const zip = zipFcaBacktest(dir);
  return lerFca(zip, await listarEntradasZip(zip), 2026);
}

describe('lerFca — linhas que o FCA 2026 traz erradas (backtest 18/10, A9)', () => {
  it('só a Klabin, a Alupar e a B100 viram título pelo FCA; o resto fica em rejeitadas', async () => {
    const r = await lerBacktest();
    expect(r.titulos.filter((t) => !t.dataFim).map((t) => t.symbol)).toEqual([
      'ALUP11',
      'B1003',
      'KLBN11',
    ]);
    // fim de negociação preenchido: BRF (encerrada de verdade), C&A e Raízen (indevido)
    expect(r.titulos.filter((t) => t.dataFim).map((t) => [t.symbol, t.dataFim])).toEqual([
      ['BRFS3', '2025-09-22'],
      ['CEAB3', '2019-10-28'],
      ['RAIZ4', '2021-09-10'],
    ]);
    expect(
      r.rejeitadas.map((x) => [x.codigo, x.motivo]).sort((a, b) => a[0].localeCompare(b[0])),
    ).toEqual([
      ['000000', 'codigo_invalido'],
      ['2', 'codigo_invalido'],
      ['25585', 'codigo_invalido'],
      ['4030', 'codigo_invalido'],
      ['ADR', 'codigo_invalido'],
      ['BRST3', 'mercado'], // 'Balcão Não-Organizado'
      ['MLAS3', 'mercado'], // mercado vazio
    ]);
    expect([...r.ciasSemTicker.keys()].sort()).toEqual(
      [BTG, CSN, CMIN, MARFRIG, BRISANET, MULTI, HAGA].sort(),
    );
    expect(r.ciasSemTicker.get(BTG)?.nome).toBe('BCO BTG PACTUAL S.A.');
  });
});

describe('completarComB3 (A9: BTG, CSN, CMIN, C&A, MBRF, Raízen fora da Análise)', () => {
  it('casa cada ticker negociado ao CNPJ do próprio FCA, pela regra certa', async () => {
    const r = completarComB3(await lerBacktest(), NEGOCIADOS_16OUT);
    const regra = Object.fromEntries(r.completados.map((c) => [c.symbol, [c.cnpj, c.regra]]));
    expect(regra).toEqual({
      BPAC11: [BTG, 'mapa'],
      BPAC3: [BTG, 'mapa'],
      BPAC5: [BTG, 'mapa'],
      CSNA3: [CSN, 'mapa'],
      CMIN3: [CMIN, 'mapa'],
      MBRF3: [MARFRIG, 'mapa'],
      CEAB3: [CEA, 'fim_indevido'],
      RAIZ4: [RAIZEN, 'fim_indevido'],
      BRST3: [BRISANET, 'mercado_fca'],
      MLAS3: [MULTI, 'mercado_fca'],
      KLBN3: [KLABIN, 'raiz_fca'],
      KLBN4: [KLABIN, 'raiz_fca'],
      ALUP3: [ALUPAR, 'raiz_fca'],
      ALUP4: [ALUPAR, 'raiz_fca'],
      HAGA3: [HAGA, 'mapa'],
      HAGA4: [HAGA, 'mapa'],
    });
    // B1003 já vem do FCA (raiz com dígito); BRFS3 encerrada e sem negócio continua fechada
    const abertos = r.titulos.filter((t) => !t.dataFim).map((t) => t.symbol);
    const b100 = r.titulos.find((t) => t.symbol === 'B1003');
    expect(b100?.cnpj).toBe(B100);
    expect(b100?.origem).toBeUndefined(); // veio do FCA, não da B3
    expect(r.titulos.find((t) => t.symbol === 'BRFS3')?.dataFim).toBe('2025-09-22');
    // recibos (AZUL97), índice (IBOV11), FII (HGLG11) nunca entram; WDCN3 não tem FCA 2026
    for (const s of ['AZUL97', 'IBOV11', 'HGLG11', 'WDCN3']) expect(abertos).not.toContain(s);
    expect(r.alertas).toContainEqual(
      expect.objectContaining({ codigo: 'ticker_b3_sem_emissor', ref: 'WDCN3' }),
    );
  });

  it('sem duplicar empresa: nenhum CNPJ novo e cada raiz num CNPJ só', async () => {
    const lido = await lerBacktest();
    const r = completarComB3(lido, NEGOCIADOS_16OUT);
    const doFca = new Set([...lido.cias.keys(), ...lido.ciasSemTicker.keys()]);
    for (const c of r.cias.keys()) expect(doFca.has(c)).toBe(true);
    const cnpjsPorRaiz = new Map<string, Set<string>>();
    for (const t of r.titulos.filter((x) => !x.dataFim)) {
      const raiz = raizTicker(t.symbol);
      cnpjsPorRaiz.set(raiz, (cnpjsPorRaiz.get(raiz) ?? new Set()).add(t.cnpj));
    }
    for (const [, cnpjs] of cnpjsPorRaiz) expect(cnpjs.size).toBe(1);
    // as companhias que só tinham linha errada passam a ter cadastro (e balanços baixados)
    expect(r.cias.get(BTG)?.nome).toBe('BCO BTG PACTUAL S.A.');
    expect(r.cias.has(CSN)).toBe(true);
    // BRF não ganhou ticker nenhum: segue só com o BRFS3 encerrado
    expect(r.titulos.filter((t) => t.cnpj === BRF && !t.dataFim)).toEqual([]);
  });

  it('BPAC11: unit com a composição "1 ON E 2 PNA" e o início de negociação do FCA', async () => {
    const r = completarComB3(await lerBacktest(), NEGOCIADOS_16OUT);
    expect(r.titulos.find((t) => t.symbol === 'BPAC11')).toMatchObject({
      cnpj: BTG,
      classeTitulo: 'UNIT',
      unitQtdOn: 1,
      unitQtdPn: 2,
      composicaoTexto: '1 ON E 2 PNA',
      dataInicio: '2012-04-26',
      dataFim: null,
      origem: 'b3',
    });
    expect(r.titulos.find((t) => t.symbol === 'CSNA3')).toMatchObject({
      classeTitulo: 'ON',
      dataInicio: '1973-07-09',
      origem: 'b3',
    });
    // C&A: a linha do FCA é reaberta (mesmo início), não duplicada
    const ceab = r.titulos.filter((t) => t.symbol === 'CEAB3');
    expect(ceab).toHaveLength(1);
    expect(ceab[0]).toMatchObject({ dataInicio: '2019-10-28', dataFim: null, origem: 'b3' });
    expect(r.alertas.filter((a) => a.codigo === 'unit_sem_composicao')).toEqual([]);
  });

  it('sem COTAHIST (lista vazia) ⇒ nada muda', async () => {
    const lido = await lerBacktest();
    const r = completarComB3(lido, []);
    expect(r.titulos).toEqual(lido.titulos);
    expect(r.completados).toEqual([]);
    expect([...r.cias.keys()]).toEqual([...lido.cias.keys()]);
  });

  it('raiz do FCA vence o mapa; CNPJ do mapa fora do FCA do ano ⇒ alerta e não entra', async () => {
    const lido = await lerBacktest();
    const r = completarComB3(
      lido,
      [
        { symbol: 'KLBN4', especi: 'PN N2' },
        { symbol: 'WDCN3', especi: 'ON NM' },
      ],
      {
        KLBN: { cnpj: CSN, motivo: 'mapa errado de propósito' },
        WDCN: { cnpj: '11111111000111', motivo: 'sem FCA 2026' },
      },
    );
    expect(r.completados).toEqual([{ symbol: 'KLBN4', cnpj: KLABIN, regra: 'raiz_fca' }]);
    expect(r.alertas).toContainEqual(
      expect.objectContaining({ codigo: 'mapa_b3_sem_fca', ref: 'WDCN3' }),
    );
  });
});
