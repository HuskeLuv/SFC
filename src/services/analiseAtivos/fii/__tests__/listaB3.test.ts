import { describe, expect, it } from 'vitest';
import { assertUrlPermitida } from '@/services/analiseAtivos/fontes/allowlist';
import { ErroLayoutFonte } from '@/services/analiseAtivos/fontes/erros';
import {
  juntarListas,
  lerDetalheFundo,
  lerPaginaLista,
  paraItemRegra,
  tipoDoDetalhe,
  urlDetalheFundo,
  urlListaFundos,
  type ItemListaB3Bruto,
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
          tipoFundo: 'FII',
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

  it('listas FIAGRO e FI-INFRA: typeFund da lista vai no payload da lista e do detalhe', () => {
    const tf = (u: string) =>
      (
        JSON.parse(Buffer.from(u.split('/').pop()!, 'base64').toString('utf8')) as {
          typeFund: string;
        }
      ).typeFund;
    expect(tf(urlListaFundos(1, 100, 'FIAGRO'))).toBe('FIAGRO');
    expect(tf(urlListaFundos(1, 100, 'FI-INFRA'))).toBe('FI-INFRA');
    // Fiagro consultado como FII volta sem código de negociação: o detalhe usa o tipo da lista
    expect(tf(urlDetalheFundo({ id: 6627, acronym: 'KNCA', tipoFundo: 'FIAGRO' }))).toBe('FIAGRO');
    expect(tf(urlDetalheFundo({ id: 27, acronym: 'KDIF', tipoFundo: 'FI-INFRA' }))).toBe(
      'FI-INFRA',
    );
    // item da lista FII marcado FIAGRO pela B3
    expect(tipoDoDetalhe({ tipoFundo: 'FII', typeName: 'FIAGRO' })).toBe('FIAGRO');
    expect(tipoDoDetalhe({ typeName: null })).toBe('FII');
    const pag = lerPaginaLista(
      JSON.stringify({
        page: { totalPages: 1 },
        results: [
          { id: 27, acronym: 'KDIF', fundName: 'KINEA', tradingName: 'X', typeName: 'FI-INFRA' },
        ],
      }),
      'FI-INFRA',
    );
    expect(pag.itens[0]).toMatchObject({ acronym: 'KDIF', tipoFundo: 'FI-INFRA' });
  });

  it('juntarListas: sigla repetida fica uma; o tipo específico vence o FII', () => {
    const base = { fundName: 'X', tradingName: 'X', typeName: null };
    const itens: ItemListaB3Bruto[] = [
      { ...base, id: 1, acronym: 'HGLG', tipoFundo: 'FII' },
      { ...base, id: 2, acronym: 'AAAA', tipoFundo: 'FII' },
      { ...base, id: 1, acronym: 'HGLG', tipoFundo: 'FII' },
      { ...base, id: 3, acronym: 'AAAA', tipoFundo: 'FIAGRO' },
      { ...base, id: 27, acronym: 'KDIF', tipoFundo: 'FI-INFRA' },
    ];
    expect(juntarListas(itens).map((i) => [i.acronym, i.tipoFundo, i.id])).toEqual([
      ['HGLG', 'FII', 1],
      ['AAAA', 'FIAGRO', 3],
      ['KDIF', 'FI-INFRA', 27],
    ]);
  });

  it('paraItemRegra: item de lista FIAGRO/FI-INFRA mantém o tipo da lista', () => {
    const b: ItemListaB3Bruto = {
      id: 6627,
      acronym: 'KNCA',
      fundName: 'KINEA CRÉDITO AGRO',
      tradingName: 'FIAGRO KINEA',
      typeName: null,
      tipoFundo: 'FIAGRO',
    };
    expect(
      paraItemRegra(b, { cnpj: '41745701000137', tradingCode: 'KNCA11', typeName: 'FII' }),
    ).toMatchObject({ typeName: 'FIAGRO', tipoLista: 'FIAGRO', cnpjB3: '41745701000137' });
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
  it('cada item tem motivo e CNPJ com 14 dígitos; IRDM11 é histórico (validTo)', () => {
    for (const t of TICKERS_MANUAIS) {
      expect(t.motivo.length).toBeGreaterThan(10);
      expect(t.cnpj).toMatch(/^\d{14}$/);
    }
    const vig = mapaManuaisVigentes();
    expect(vig.get('BTCI11')).toBe('09552812000114');
    expect(vig.get('IRIM11')).toBe('41076564000195');
    expect(vig.has('IRDM11')).toBe(false);
    expect(historicosManuais()).toEqual([
      expect.objectContaining({
        ticker: 'IRDM11',
        cnpj: '28830325000110',
        validTo: '2025-10-31',
      }),
    ]);
  });
});
