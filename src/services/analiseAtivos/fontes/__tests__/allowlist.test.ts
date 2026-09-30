import { describe, expect, it } from 'vitest';
import { assertUrlPermitida, HOSTS_PERMITIDOS } from '@/services/analiseAtivos/fontes/allowlist';
import { ErroFonte } from '@/services/analiseAtivos/fontes/erros';

const codigo = (url: string): string | null => {
  try {
    assertUrlPermitida(url);
    return null;
  } catch (e: unknown) {
    return e instanceof ErroFonte ? e.codigo : 'outro';
  }
};

describe('allowlist de downloads', () => {
  it('aceita os 4 hosts exatos em https', () => {
    expect(
      codigo('https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_2025.zip'),
    ).toBeNull();
    expect(
      codigo('https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_D30092026.ZIP'),
    ).toBeNull();
    expect(
      codigo('https://sistemaswebb3-listados.b3.com.br/fundsProxy/fundsCall/GetListFunds/x'),
    ).toBeNull();
    expect(codigo('https://www.b3.com.br/data/files/ClassifSetorial.zip')).toBeNull();
    expect(HOSTS_PERMITIDOS).toHaveLength(4);
  });

  it('recusa http://', () => {
    expect(codigo('http://dados.cvm.gov.br/dados/x.zip')).toBe('https_obrigatorio');
  });

  it('recusa hosts fora da lista, sem curinga', () => {
    for (const url of [
      'https://rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx',
      'https://brapi.dev/api/quote/PETR4',
      'https://b3.com.br/x',
      'https://b3.com.br.evil.com/x',
      'https://evil.b3.com.br/x',
      'https://dados.cvm.gov.br.evil.com/x',
    ]) {
      expect(codigo(url), url).toBe('host_nao_permitido');
    }
  });

  it('recusa credenciais, porta estranha e URL inválida', () => {
    expect(codigo('https://user:pw@dados.cvm.gov.br/x')).toBe('host_nao_permitido');
    expect(codigo('https://dados.cvm.gov.br:8443/x')).toBe('host_nao_permitido');
    expect(codigo('não é url')).toBe('url_invalida');
  });
});
