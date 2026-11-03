import { describe, expect, it } from 'vitest';
import {
  COOKIE_VALORES_OCULTOS,
  MASCARA_VALOR,
  PILULA_HTML,
  contemValorMonetario,
  dividirPorValores,
  lerCookieValoresOcultos,
  mascararHtml,
  mascararTexto,
  opcoesCookieValoresOcultos,
} from '../valoresOcultos';
import { formatBRL, formatUSD } from '../format';

const NBSP = ' ';

describe('contemValorMonetario', () => {
  it.each([
    'R$ 1.234,56',
    `R$${NBSP}1.234,56`,
    formatBRL(9876543.21),
    formatBRL(-10),
    formatUSD(1500),
    '-R$ 10,00',
    'R$ -10,00',
    'US$ 12,30',
    'R$ 2000K',
    'R$ 1,2 mi',
    'R$ 300 mil',
    'Total: R$ 5 bi',
    '$575',
    '$1,575,000',
    '-$12.50',
    'Realty Income - $575 - 10/03/2026',
  ])('casa %s', (texto) => {
    expect(contemValorMonetario(texto)).toBe(true);
  });

  it.each([
    '12,5%',
    '1.234,56',
    '7777',
    'CDI 100%',
    'R$',
    'Aplicado',
    '$',
    'US$',
    '${valor}',
    '$ 10',
  ])('não casa %s', (texto) => {
    expect(contemValorMonetario(texto)).toBe(false);
  });

  it('é reentrante (a regex global não guarda lastIndex entre chamadas)', () => {
    expect(contemValorMonetario('R$ 1,00')).toBe(true);
    expect(contemValorMonetario('R$ 1,00')).toBe(true);
  });
});

describe('mascararTexto', () => {
  it('troca o valor e mantém símbolo, % e texto', () => {
    expect(mascararTexto('Aplicado R$ 1.234,56 (+12,5%)')).toBe(
      `Aplicado R$ ${MASCARA_VALOR} (+12,5%)`,
    );
    expect(mascararTexto('US$ 1.500,00')).toBe(`US$ ${MASCARA_VALOR}`);
    expect(mascararTexto(`R$${NBSP}2000K`)).toBe(`R$ ${MASCARA_VALOR}`);
  });

  it('o sinal colado some junto; o hífen de separação fica', () => {
    expect(mascararTexto('-R$ 10,00')).toBe(`R$ ${MASCARA_VALOR}`);
    expect(mascararTexto('CDB Banco - R$ 10.000,00 - 01/2027')).toBe(
      `CDB Banco - R$ ${MASCARA_VALOR} - 01/2027`,
    );
  });

  it('"$" puro do en-US (nome de REIT) mascara o número inteiro e mantém o resto', () => {
    expect(mascararTexto('Realty Income - $1,575,000 - 10/03/2026')).toBe(
      `Realty Income - $ ${MASCARA_VALOR} - 10/03/2026`,
    );
  });

  it('"milhões" não vira sufixo', () => {
    expect(mascararTexto('R$ 10 milhões')).toBe(`R$ ${MASCARA_VALOR} milhões`);
  });

  it('sem valor, devolve o mesmo texto', () => {
    expect(mascararTexto('12,5% a.a.')).toBe('12,5% a.a.');
  });
});

describe('mascararHtml', () => {
  it('troca cada valor por pílula e não deixa dígito do valor', () => {
    const html = '<div>Dividendos: <b>R$ 1.234,56</b></div><div>JCP: <b>R$ 10,00</b></div>';
    const out = mascararHtml(html);
    expect(out).not.toContain('1.234,56');
    expect(out).not.toContain('10,00');
    expect(out.split(PILULA_HTML)).toHaveLength(3);
  });
});

describe('dividirPorValores', () => {
  it('separa trechos comuns e sensíveis', () => {
    expect(dividirPorValores('Saldo R$ 10,00 e US$ 2,00!')).toEqual([
      { texto: 'Saldo ', sensivel: false },
      { texto: 'R$ 10,00', sensivel: true },
      { texto: ' e ', sensivel: false },
      { texto: 'US$ 2,00', sensivel: true },
      { texto: '!', sensivel: false },
    ]);
  });

  it('texto sem valor é um trecho só', () => {
    expect(dividirPorValores('12%')).toEqual([{ texto: '12%', sensivel: false }]);
  });

  it('juntar os trechos devolve o original', () => {
    const t = 'Total - R$ 1.234,56 (-R$ 3,00) em 10/2026';
    expect(
      dividirPorValores(t)
        .map((x) => x.texto)
        .join(''),
    ).toBe(t);
  });
});

describe('cookie', () => {
  it('nome e leitura', () => {
    expect(COOKIE_VALORES_OCULTOS).toBe('mf_valores_ocultos');
    expect(lerCookieValoresOcultos('1')).toBe(true);
    expect(lerCookieValoresOcultos('')).toBe(false);
    expect(lerCookieValoresOcultos(undefined)).toBe(false);
    expect(lerCookieValoresOcultos('true')).toBe(false);
  });

  it('opções: 1 ano ao ligar, 0 ao desligar, nunca httpOnly', () => {
    expect(opcoesCookieValoresOcultos(true, true)).toEqual({
      httpOnly: false,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 31536000,
    });
    expect(opcoesCookieValoresOcultos(false, false)).toMatchObject({ maxAge: 0, secure: false });
  });
});
