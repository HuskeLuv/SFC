import { describe, expect, it } from 'vitest';
import {
  alertaAnoNaoPublicado,
  anoPodeNaoEstarPublicado,
  ehAnoNaoPublicado,
  ehHttp404,
} from '@/services/analiseAtivos/fontes/anoNaoPublicado';
import { ErroFonte } from '@/services/analiseAtivos/fontes/erros';

const e404 = new ErroFonte('http_erro', 'HTTP 404', 404);

describe('anoNaoPublicado (M13: virada do ano nos arquivos da CVM)', () => {
  it('só ErroFonte http_erro 404 conta como 404', () => {
    expect(ehHttp404(e404)).toBe(true);
    expect(ehHttp404(new ErroFonte('http_erro', 'HTTP 500', 500))).toBe(false);
    expect(ehHttp404(new ErroFonte('timeout'))).toBe(false);
    expect(ehHttp404(new Error('404'))).toBe(false);
  });

  it('em 01/01/2027 o arquivo de 2027 pode não existir; o de 2026 tem de existir', () => {
    expect(anoPodeNaoEstarPublicado(2027, '2027-01-01')).toBe(true);
    expect(anoPodeNaoEstarPublicado(2028, '2027-01-01')).toBe(true);
    expect(anoPodeNaoEstarPublicado(2026, '2027-01-01')).toBe(false);
    expect(ehAnoNaoPublicado(e404, 2027, '2027-01-01')).toBe(true);
    expect(ehAnoNaoPublicado(e404, 2026, '2027-01-01')).toBe(false);
    expect(ehAnoNaoPublicado(new ErroFonte('rede'), 2027, '2027-01-01')).toBe(false);
  });

  it('alerta de nível aviso com a URL', () => {
    const url = 'https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_2027.zip';
    expect(alertaAnoNaoPublicado(url, 2027)).toMatchObject({
      codigo: 'arquivo_ano_nao_publicado',
      nivel: 'aviso',
      ref: url,
    });
  });
});
