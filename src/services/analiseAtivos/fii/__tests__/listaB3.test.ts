import { describe, expect, it } from 'vitest';
import { assertUrlPermitida } from '@/services/analiseAtivos/fontes/allowlist';
import { ErroLayoutFonte } from '@/services/analiseAtivos/fontes/erros';
import {
  lerDetalheFundo,
  lerPaginaLista,
  paraItemRegra,
  urlDetalheFundo,
  urlListaFundos,
} from '@/services/analiseAtivos/fii/listaB3Fii';
import {
  historicosManuais,
  mapaManuaisVigentes,
  TICKERS_MANUAIS,
} from '@/services/analiseAtivos/fii/tickersManuais';

describe('lista pública de FIIs da B3', () => {
  it('URLs na allowlist; payload base64 com typeFund FII', () => {
    expect(() => assertUrlPermitida(urlListaFundos(1))).not.toThrow();
    expect(() => assertUrlPermitida(urlDetalheFundo({ id: 1, acronym: 'HGLG' }))).not.toThrow();
    const payload = urlListaFundos(2).split('/').pop()!;
    expect(JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))).toMatchObject({
      pageNumber: 2,
      typeFund: 'FII',
    });
  });

  it('lista B3: página válida, layout mudou ⇒ ErroLayoutFonte', () => {
    const ok = lerPaginaLista(
      JSON.stringify({
        page: { totalPages: 6 },
        results: [
          {
            id: 305,
            acronym: 'hglg',
            fundName: 'PÁTRIA LOG',
            tradingName: 'FII HGLG PAX',
            typeName: null,
          },
        ],
      }),
    );
    expect(ok).toEqual({
      totalPaginas: 6,
      itens: [
        {
          id: 305,
          acronym: 'HGLG',
          fundName: 'PÁTRIA LOG',
          tradingName: 'FII HGLG PAX',
          typeName: null,
        },
      ],
    });
    expect(() => lerPaginaLista('{"pagina":1}')).toThrow(ErroLayoutFonte);
    expect(() => lerPaginaLista('<html>')).toThrow(ErroLayoutFonte);
  });

  it('detalhe B3: CNPJ e tipo; vazio ⇒ null', () => {
    expect(
      lerDetalheFundo(
        '{"cnpj":"11728688000147","tradingCode":"HGLG11","typeName":"FII","acronym":"HGLG"}',
      ),
    ).toEqual({ cnpj: '11728688000147', tradingCode: 'HGLG11', typeName: 'FII' });
    expect(lerDetalheFundo('')).toBeNull();
    expect(() => lerDetalheFundo('{"x":1}')).toThrow(ErroLayoutFonte);
  });

  it('paraItemRegra: sem ISIN na lista; tipo do detalhe prevalece (FIAGRO sai)', () => {
    const b = { id: 1, acronym: 'XXXX', fundName: 'X', tradingName: 'FII X', typeName: null };
    expect(paraItemRegra(b, null)).toMatchObject({ isin: null, cnpjB3: null, typeName: null });
    expect(
      paraItemRegra(b, { cnpj: '11728688000147', tradingCode: 'XXXX11', typeName: 'FIAGRO' }),
    ).toMatchObject({ cnpjB3: '11728688000147', typeName: 'FIAGRO' });
  });
});

describe('tickersManuais', () => {
  it('cada item tem motivo e CNPJ formatado; IRDM11 é histórico (validTo)', () => {
    for (const t of TICKERS_MANUAIS) {
      expect(t.motivo.length).toBeGreaterThan(10);
      expect(t.cnpj).toMatch(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/);
    }
    const vig = mapaManuaisVigentes();
    expect(vig.get('BTCI11')).toBe('09.552.812/0001-14');
    expect(vig.get('IRIM11')).toBe('41.076.564/0001-95');
    expect(vig.has('IRDM11')).toBe(false);
    expect(historicosManuais()).toEqual([
      expect.objectContaining({
        ticker: 'IRDM11',
        cnpj: '28.830.325/0001-10',
        validTo: '2025-10-31',
      }),
    ]);
  });
});
