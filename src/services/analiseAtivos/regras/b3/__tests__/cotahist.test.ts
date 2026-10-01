import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { ErroLayoutFonte } from '@/services/analiseAtivos/fontes/erros';
import {
  dataParaDdmmaaaa,
  filtrarRegistro,
  lerTrailerCotahist,
  parseLinhaCotahist,
  validarCabecalhoCotahist,
  type RegistroCotahist,
} from '@/services/analiseAtivos/regras/b3/cotahist';

// Linhas REAIS do COTAHIST_A2016, COTAHIST_A2024 (MGLU3 mai/jun) e COTAHIST_M082026 (RZAG11, IBOV11).
const LINHAS = readFileSync(path.join(__dirname, 'fixtures', 'cotahist_amostra.txt'), 'latin1')
  .split('\r\n')
  .filter((l) => l.length > 0);

function linha(symbol: string, data: string): string {
  const aaaammdd = data.replace(/-/g, '');
  const l = LINHAS.find(
    (x) => x.startsWith('01') && x.slice(2, 10) === aaaammdd && x.slice(12, 24).trim() === symbol,
  );
  if (!l) throw new Error(`fixture sem ${symbol} ${data}`);
  return l;
}

function reg(symbol: string, data: string): RegistroCotahist {
  const r = parseLinhaCotahist(linha(symbol, data));
  if (!r) throw new Error('linha não parseou');
  return r;
}

describe('parseLinhaCotahist — preço cru (regra 28)', () => {
  it('WEGE3 29/12/2016 closeRaw = 15,50 (cru, antes do 1,3:1 de 2018 e do 2:1 de 2021)', () => {
    const r = reg('WEGE3', '2016-12-29');
    expect(r.closeRaw).toBeCloseTo(15.5, 6);
    expect(r).toMatchObject({
      data: '2016-12-29',
      codBdi: '02',
      tpMerc: '010',
      especi: 'ON NM',
      fatCot: 1,
      preultCentavos: 1550,
    });
  });

  it('HGLG11 29/12/2016 = 1.100,00 (antes do desdobramento 10:1 de 2018) e MGLU3 = 106,17', () => {
    expect(reg('HGLG11', '2016-12-29').closeRaw).toBeCloseTo(1100, 6);
    expect(reg('HGLG11', '2016-12-29').codBdi).toBe('12');
    expect(reg('MGLU3', '2016-12-29').closeRaw).toBeCloseTo(106.17, 6);
  });

  it('VOLTOT/100, QUATOT e TOTNEG nas posições do layout (WEGE3 29/12/2016)', () => {
    const r = reg('WEGE3', '2016-12-29');
    expect(r.negocios).toBe(8628);
    expect(r.quantidade).toBe(2080400n);
    expect(r.volumeFin).toBeCloseTo(31_890_961, 2);
    expect(r.voltotCentavos).toBe('3189096100');
    // coerência: volume ≈ quantidade × preço médio do dia (entre mínima e máxima)
    expect(r.volumeFin / Number(r.quantidade)).toBeGreaterThan(15);
    expect(r.volumeFin / Number(r.quantidade)).toBeLessThan(16);
  });

  it('FATCOT = 1000 real (CBEE3 04/01/2016): closeRaw = PREULT/100/1000', () => {
    const r = reg('CBEE3', '2016-01-04');
    expect(r.fatCot).toBe(1000);
    expect(r.closeRaw).toBeCloseTo(0.00087, 8);
    // VOLTOT R$ 784 para 900 mil ações ⇒ R$ 0,00087/ação: confirma que PREULT é por lote de 1000
    expect(r.volumeFin / Number(r.quantidade)).toBeCloseTo(r.closeRaw, 5);
  });

  it('FATCOT = 1000 sintético (linha real da WEGE3 29/12/2016 com FATCOT trocado) ⇒ 15,50/1000', () => {
    const real = linha('WEGE3', '2016-12-29');
    // posições 211-217 (1-indexadas) = FATCOT
    const sintetica = real.slice(0, 210) + '0001000' + real.slice(217);
    expect(sintetica).toHaveLength(real.length);
    const r = parseLinhaCotahist(sintetica)!;
    expect(r.fatCot).toBe(1000);
    expect(r.closeRaw).toBeCloseTo(0.0155, 8);
    expect(r.preultCentavos).toBe(1550);
  });

  it('FATCOT = 100 (IBOV11 03/08/2026)', () => {
    const r = reg('IBOV11', '2026-08-03');
    expect(r.fatCot).toBe(100);
    expect(r.closeRaw).toBeCloseTo(1775.82, 6);
  });

  it('header, trailer, linha curta e campo numérico inválido ⇒ null', () => {
    expect(parseLinhaCotahist(LINHAS[0])).toBeNull();
    expect(parseLinhaCotahist(LINHAS[LINHAS.length - 1])).toBeNull();
    expect(parseLinhaCotahist(linha('WEGE3', '2016-12-29').slice(0, 200))).toBeNull();
    const l = linha('WEGE3', '2016-12-29');
    expect(parseLinhaCotahist(l.slice(0, 108) + 'ABCDEFGHIJKLM' + l.slice(121))).toBeNull();
    expect(parseLinhaCotahist(l.slice(0, 2) + '20161332' + l.slice(10))).toBeNull();
  });
});

describe('filtrarRegistro — só TPMERC 010 e BDI 02/12', () => {
  it('mantém ação lote-padrão (02) e FII (12)', () => {
    expect(filtrarRegistro(reg('WEGE3', '2016-12-29'))).toBe(true);
    expect(filtrarRegistro(reg('HGLG11', '2016-12-29'))).toBe(true);
    expect(filtrarRegistro(reg('MXRF11', '2016-12-29'))).toBe(true);
  });

  it('descarta fracionário (TPMERC 020, BDI 96), ETF (BDI 14) e FIAGRO (BDI 14 em 2026)', () => {
    const frac = reg('WEGE3F', '2016-12-29');
    expect(frac.tpMerc).toBe('020');
    expect(filtrarRegistro(frac)).toBe(false);
    const etf = reg('BOVA11', '2016-12-29');
    expect(etf.codBdi).toBe('14');
    expect(filtrarRegistro(etf)).toBe(false);
    const fiagro = reg('RZAG11', '2026-08-03');
    expect(fiagro.codBdi).toBe('14');
    expect(filtrarRegistro(fiagro)).toBe(false);
  });

  it('todas as linhas de dados da fixture: 02/12 + 010 passam, o resto não', () => {
    const regs = LINHAS.map(parseLinhaCotahist).filter((r): r is RegistroCotahist => r !== null);
    expect(regs).toHaveLength(LINHAS.length - 2);
    const passam = regs.filter(filtrarRegistro).map((r) => r.symbol);
    expect(passam).not.toContain('WEGE3F');
    expect(passam).not.toContain('BOVA11');
    expect(passam).not.toContain('RZAG11');
    expect(passam.filter((s) => s === 'MGLU3')).toHaveLength(16);
  });
});

describe('header e trailer', () => {
  it("header 00 validado ('COTAHIST')", () => {
    expect(validarCabecalhoCotahist(LINHAS[0])).toEqual({
      nomeArquivo: 'COTAHIST.2016',
      dataGeracao: '2016-12-29',
    });
  });

  it('arquivo com header diferente ⇒ ErroLayoutFonte', () => {
    expect(() => validarCabecalhoCotahist('CNPJ_CIA;DT_REFER;VERSAO')).toThrow(ErroLayoutFonte);
    expect(() => validarCabecalhoCotahist(LINHAS[1])).toThrow(ErroLayoutFonte);
    expect(() => validarCabecalhoCotahist(LINHAS[0].replace('COTAHIST', 'SERHISTX'))).toThrow(
      ErroLayoutFonte,
    );
    // header truncado (layout novo mais curto)
    expect(() => validarCabecalhoCotahist(LINHAS[0].trimEnd())).toThrow(ErroLayoutFonte);
  });

  it('trailer 99 com total de registros (inclui header e trailer)', () => {
    expect(lerTrailerCotahist(LINHAS[LINHAS.length - 1])).toEqual({ totalRegistros: 466736 });
    expect(lerTrailerCotahist(LINHAS[1])).toBeNull();
  });

  it('nome do diário: 2026-09-29 ⇒ 29092026', () => {
    expect(dataParaDdmmaaaa('2026-09-29')).toBe('29092026');
  });
});
