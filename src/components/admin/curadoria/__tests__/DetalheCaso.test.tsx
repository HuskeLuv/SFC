// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createTestQueryWrapper } from '@/test/wrappers';
import { encontrarPalavrasProibidas } from '@/services/analiseAtivos/regras/comum/linguagem';
import type { CasoDetalheResposta } from '@/types/analiseAtivosCuradoria';
import { ConteudoDetalhe } from '../DetalheCaso';
import { TEXTOS_FILA } from '../marcasCaso';

const XSS =
  '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>**negrito** https://evil.example';

function detalhe(over: Partial<CasoDetalheResposta['caso']> = {}): CasoDetalheResposta {
  return {
    caso: {
      id: '7d3f6a52-1b2c-4d5e-8f90-123456789abc',
      symbol: 'WEGE3',
      classe: 'acao',
      grupo: 'proventos',
      campo: 'payout',
      periodo: '2025',
      origem: 'misto',
      regraCodigo: 'salto_recente',
      regraAtiva: false,
      status: 'em_analise',
      emConferencia: false,
      conferenciaManual: false,
      nReportes: 2,
      slaAte: '2026-10-05',
      diasUteisRestantes: 1,
      idadeDiasUteis: 3,
      responsavel: { id: 'adm1', nome: 'Wellington' },
      abertoEm: '2026-09-28T20:47:00.000Z',
      atualizadoEm: '2026-10-02T13:00:00.000Z',
      cnpj: '84429695000111',
      resolucao: null,
      efeitoTela: null,
      respostaPublica: null,
      notaCurador: null,
      resolvidoEm: null,
      casoAnteriorId: null,
      ...over,
    },
    oQueUsuarioViu: {
      bloco: 'valuation',
      campo: 'payout',
      valorExibido: '134%',
      periodo: '2025',
      fonteExibida: XSS,
      frescorExibido: null,
    },
    regra: { codigo: 'salto_recente', chave: '2025', ativa: false, desde: '2026-09-30' },
    reportes: [
      {
        id: 'r1',
        protocolo: 'K7M2Q9XZ',
        autor: { id: 'u1', nome: 'Pedro D.', email: 'pedro@example.com' },
        cliente: null,
        bloco: 'valuation',
        campo: 'payout',
        periodo: '2025',
        valorExibido: '134%',
        valorEsperado: '<b>52%</b>',
        fonteExibida: null,
        frescorExibido: null,
        versaoQuadro: 'v1',
        mensagem: XSS,
        fonteEsperada: 'javascript:alert(1)',
        contextoServidor: { flags: ['<svg onload=alert(1)>'] },
        criadoEm: '2026-10-01T17:02:00.000Z',
        anonimizado: false,
      },
      {
        id: 'r2',
        protocolo: 'H4N8P2RT',
        autor: { id: 'u2', nome: 'Ana L.', email: 'ana@example.com' },
        cliente: { id: 'c9', nome: 'Marina Costa' },
        bloco: 'kpis',
        campo: 'dy12m',
        periodo: null,
        valorExibido: '4%',
        valorEsperado: null,
        fonteExibida: null,
        frescorExibido: null,
        versaoQuadro: 'v1',
        mensagem: 'DY fora do histórico.',
        fonteEsperada: null,
        contextoServidor: {},
        criadoEm: '2026-09-28T23:47:00.000Z',
        anonimizado: false,
      },
    ],
    linhaAtual: { payoutPct: 52, flags: [] },
    fontes: [{ rotulo: 'Documentos da companhia (CVM RAD)', url: 'https://www.rad.cvm.gov.br/' }],
    eventos: [],
  };
}

const fetchMock = vi.fn();

function renderizar(d: CasoDetalheResposta) {
  const Wrapper = createTestQueryWrapper();
  return render(
    <Wrapper>
      <ConteudoDetalhe detalhe={d} onSalvo={() => {}} onRecarregar={() => {}} />
    </Wrapper>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  document.cookie = 'csrf-token=tok';
  (window as unknown as { __xss?: number }).__xss = undefined;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DetalheCaso — texto do usuário é TEXTO (XSS)', () => {
  it('mensagem, valor esperado, fonte e retrato aparecem literais, sem elemento injetado', () => {
    const { container } = renderizar(detalhe());
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')?.textContent).not.toBe('52%');
    expect(container.querySelector('svg[onload]')).toBeNull();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
    // o texto aparece como foi digitado
    expect(screen.getAllByText(XSS, { exact: false }).length).toBeGreaterThan(0);
    // URL livre do usuário não vira link (só as fontes oficiais são <a>)
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs.some((h) => h?.includes('evil.example') || h?.startsWith('javascript'))).toBe(
      false,
    );
  });

  it('consultor agindo aparece com o cliente; regra parou com relatos = aviso de que não fecha sozinho', () => {
    renderizar(detalhe());
    expect(screen.getByText('agindo pelo cliente Marina Costa')).toBeInTheDocument();
    expect(screen.getByText(TEXTOS_FILA.regraParouComRelato)).toBeInTheDocument();
  });
});

describe('DecisaoCaso', () => {
  it('fechar sem resolução: erro anunciado e foco no select, sem chamar a API', async () => {
    renderizar(detalhe());
    fireEvent.click(screen.getByLabelText('Corrigido'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e avisar 2 usuários' }));
    const erro = await screen.findByText('Escolha a resolução para fechar o caso.');
    expect(erro.closest('[role="alert"]')).not.toBeNull();
    expect(document.activeElement?.tagName).toBe('SELECT');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('não há opção de conferência manual (decisão 16)', () => {
    const { container } = renderizar(detalhe());
    expect(container.textContent?.toLowerCase()).not.toContain('conferência manual');
  });

  it('"Liberar o valor" só habilita com Rejeitado + Dado confirmado', () => {
    renderizar(detalhe());
    fireEvent.click(screen.getByLabelText('Rejeitado'));
    const liberar = screen.getByLabelText('Liberar o valor') as HTMLInputElement;
    expect(liberar.disabled).toBe(true);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'dado_confirmado' } });
    expect((screen.getByLabelText('Liberar o valor') as HTMLInputElement).disabled).toBe(false);
  });

  it('409: mostra quem alterou e quando, mantém o texto digitado', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'alterado',
          atualizadoEm: '2026-10-02T13:57:00.000Z',
          atualizadoPor: { id: 'adm2', nome: 'Ana Curadora' },
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    renderizar(detalhe());
    const resposta = screen.getByLabelText(/Resposta para o usuário/) as HTMLTextAreaElement;
    fireEvent.change(resposta, { target: { value: 'Conferimos com a fonte.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    const alerta = await screen.findByText(/Este caso foi alterado por Ana Curadora/);
    expect(alerta.closest('[role="alert"]')).not.toBeNull();
    expect(resposta.value).toBe('Conferimos com a fonte.');
    expect(screen.getByRole('button', { name: 'Recarregar o caso' })).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/admin/analise-ativos/casos/');
    expect(init.method).toBe('PATCH');
    expect(new Headers(init.headers).get('x-csrf-token')).toBe('tok');
  });

  it('termo proibido: o servidor indica e o campo fica marcado', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'termo', details: { termos: ['barato'] } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    renderizar(detalhe());
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(
        screen.getByText('A resposta tem um termo que não pode ser usado: barato.'),
      ).toBeInTheDocument(),
    );
  });
});

describe('textos só da tela do admin', () => {
  it('passam pela varredura de linguagem', () => {
    for (const t of Object.values(TEXTOS_FILA)) {
      expect(encontrarPalavrasProibidas(t), t).toEqual([]);
    }
  });
});
