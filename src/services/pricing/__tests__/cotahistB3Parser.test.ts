import { describe, it, expect } from 'vitest';
import { parseCotahistLine } from '../cotahistB3Parser';

/**
 * Constrói uma linha COTAHIST de 245 chars com os campos default e overrides.
 * Cada substring respeita o tamanho fixo declarado na spec B3 — passar string
 * maior que o tamanho do campo é erro do test (lança).
 *
 * Layout (1-indexed):
 *    1-2   TIPREG (2)
 *    3-10  DATPRE (8)
 *   11-12  CODBDI (2)
 *   13-24  CODNEG (12)
 *   25-27  TPMERC (3)
 *   28-39  NOMRES (12)
 *   40-49  ESPECI (10)
 *   50-52  PRAZOT (3)
 *   53-56  MODREF (4)
 *   57-69  PREABE (13)
 *   70-82  PREMAX (13)
 *   83-95  PREMIN (13)
 *   96-108 PREMED (13)
 *  109-121 PREULT (13)
 *  122-134 PREOFC (13)
 *  135-147 PREOFV (13)
 *  148-152 TOTNEG (5)
 *  153-170 QUATOT (18)
 *  171-188 VOLTOT (18)
 *  189-201 PREEXE (13)
 *  202-202 INDOPC (1)
 *  203-210 DATVEN (8)
 *  211-217 FATCOT (7)
 *  218-230 PTOEXE (13)
 *  231-242 CODISI (12)
 *  243-245 DISMES (3)
 */
function pad(value: string, length: number, char = ' ', side: 'left' | 'right' = 'right'): string {
  if (value.length > length) {
    throw new Error(`Valor "${value}" maior que tamanho ${length}`);
  }
  return side === 'right' ? value.padEnd(length, char) : value.padStart(length, char);
}

interface BuildOpts {
  tipreg?: string;
  datpre?: string;
  codbdi?: string;
  codneg?: string;
  tpmerc?: string;
  preult?: string;
}

function buildLine(opts: BuildOpts = {}): string {
  const tipreg = pad(opts.tipreg ?? '01', 2);
  const datpre = pad(opts.datpre ?? '20200615', 8);
  const codbdi = pad(opts.codbdi ?? '02', 2);
  const codneg = pad(opts.codneg ?? 'PETR4', 12);
  const tpmerc = pad(opts.tpmerc ?? '010', 3);
  const nomres = pad('PETROBRAS', 12);
  const especi = pad('PN', 10);
  const prazot = pad('', 3);
  const modref = pad('R$', 4);
  // PREABE/PREMAX/PREMIN/PREMED: 13 chars, zero-padded à esquerda.
  const preabe = pad('0000000250000', 13, ' ', 'left');
  const premax = pad('0000000260000', 13, ' ', 'left');
  const premin = pad('0000000240000', 13, ' ', 'left');
  const premed = pad('0000000250000', 13, ' ', 'left');
  const preult = pad(opts.preult ?? '0000000254300', 13, ' ', 'left'); // R$ 25,43
  const preofc = pad('0000000254400', 13, ' ', 'left');
  const preofv = pad('0000000254500', 13, ' ', 'left');
  const totneg = pad('00100', 5);
  const quatot = pad('000000000000010000', 18);
  const voltot = pad('000000000002543000', 18);
  const preexe = pad('0000000000000', 13);
  const indopc = pad('0', 1);
  const datven = pad('99991231', 8);
  const fatcot = pad('0000001', 7);
  const ptoexe = pad('0000000000000', 13);
  const codisi = pad('BRPETRACNPR6', 12);
  const dismes = pad('103', 3);

  const line =
    tipreg +
    datpre +
    codbdi +
    codneg +
    tpmerc +
    nomres +
    especi +
    prazot +
    modref +
    preabe +
    premax +
    premin +
    premed +
    preult +
    preofc +
    preofv +
    totneg +
    quatot +
    voltot +
    preexe +
    indopc +
    datven +
    fatcot +
    ptoexe +
    codisi +
    dismes;

  if (line.length !== 245) {
    throw new Error(`Linha gerada tem ${line.length} chars, esperado 245`);
  }
  return line;
}

describe('parseCotahistLine', () => {
  it('parseia linha real de cotação (PETR4, lote-padrão)', () => {
    const line = buildLine();
    const result = parseCotahistLine(line);
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe('PETR4');
    expect(result!.codBdi).toBe('02');
    expect(result!.tpmerc).toBe('010');
    // PREULT = 0000000254300 → 254300 / 100 = 2543.00
    expect(result!.closePrice).toBe(2543);
    expect(result!.date.toISOString()).toBe('2020-06-15T00:00:00.000Z');
  });

  it('retorna null para TIPREG=00 (header)', () => {
    const line = buildLine({ tipreg: '00' });
    expect(parseCotahistLine(line)).toBeNull();
  });

  it('retorna null para TIPREG=99 (trailer)', () => {
    const line = buildLine({ tipreg: '99' });
    expect(parseCotahistLine(line)).toBeNull();
  });

  it('retorna null para CODBDI fora de {02, 12, 14} — ex.: 10 (opções)', () => {
    const line = buildLine({ codbdi: '10' });
    expect(parseCotahistLine(line)).toBeNull();
  });

  it('retorna null para CODBDI=99 (índices)', () => {
    expect(parseCotahistLine(buildLine({ codbdi: '99' }))).toBeNull();
  });

  it('aceita CODBDI=12 (FII)', () => {
    const line = buildLine({ codbdi: '12', codneg: 'KNRI11' });
    const result = parseCotahistLine(line);
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe('KNRI11');
    expect(result!.codBdi).toBe('12');
  });

  it('aceita CODBDI=14 (ETF)', () => {
    const line = buildLine({ codbdi: '14', codneg: 'BOVA11' });
    const result = parseCotahistLine(line);
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe('BOVA11');
    expect(result!.codBdi).toBe('14');
  });

  it('retorna null para TPMERC fora de 010 (ex.: 020 = termo)', () => {
    expect(parseCotahistLine(buildLine({ tpmerc: '020' }))).toBeNull();
  });

  it('retorna null para TPMERC=070 (opções)', () => {
    expect(parseCotahistLine(buildLine({ tpmerc: '070' }))).toBeNull();
  });

  it('divide PREULT por 100 corretamente (preço fechamento)', () => {
    // PREULT = 0000000098765 → 98765/100 = 987.65
    const line = buildLine({ preult: '0000000098765' });
    const result = parseCotahistLine(line);
    expect(result).not.toBeNull();
    expect(result!.closePrice).toBe(987.65);
  });

  it('retorna null para linha curta (<245 chars)', () => {
    expect(parseCotahistLine('01202006150202PETR4')).toBeNull();
  });

  it('retorna null para linha vazia', () => {
    expect(parseCotahistLine('')).toBeNull();
  });

  it('retorna null para PREULT=0 (sem negociação)', () => {
    const line = buildLine({ preult: '0000000000000' });
    expect(parseCotahistLine(line)).toBeNull();
  });

  it('trima espaços do CODNEG (12 chars right-padded)', () => {
    // CODNEG é 12 chars right-padded com espaços; nosso buildLine já faz isso,
    // mas validamos que o parser remove o whitespace.
    const line = buildLine({ codneg: 'VALE3' });
    const result = parseCotahistLine(line);
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe('VALE3');
    expect(result!.symbol.length).toBe(5);
  });

  it('parseia data corretamente (UTC midnight, sem TZ drift)', () => {
    const line = buildLine({ datpre: '20180102' });
    const result = parseCotahistLine(line);
    expect(result!.date.getUTCFullYear()).toBe(2018);
    expect(result!.date.getUTCMonth()).toBe(0); // janeiro
    expect(result!.date.getUTCDate()).toBe(2);
    expect(result!.date.getUTCHours()).toBe(0);
  });

  it('rejeita data fora do range razoável (year=1900)', () => {
    const line = buildLine({ datpre: '19000101' });
    expect(parseCotahistLine(line)).toBeNull();
  });
});
