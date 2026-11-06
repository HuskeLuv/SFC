// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { mockFetchResponse } from '@/test/mocks/fetch';
import type { Plano } from '@/lib/planos';
import type { MesesRelatorio, RelatorioFinanceiro } from '@/types/relatorioFinanceiro';
import { relatorioExemplo } from '../__fixtures__/relatorioExemplo';

const mocks = vi.hoisted(() => ({
  ocultos: false,
  busca: new URLSearchParams(),
  replace: vi.fn(),
}));

// next/font não roda no Vitest
vi.mock('../fontes', () => ({ classeFontesRelatorio: 'fonte-teste' }));
vi.mock('@/context/ValoresOcultosContext', () => ({
  useValoresOcultos: () => ({ ativo: mocks.ocultos }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => '/relatorios/financeiro',
  useSearchParams: () => mocks.busca,
}));

import RelatorioFinanceiroPage, {
  DocumentoRelatorio,
  mesesDaUrl,
} from '../RelatorioFinanceiroPage';

const PROIBIDAS_TODOS = /PGBL|dedu[cç]/i;
const APORTE = /aporte/i;

function renderDoc(meses: MesesRelatorio, plano: Plano, mexer?: (r: RelatorioFinanceiro) => void) {
  const r = relatorioExemplo(meses, plano);
  mexer?.(r);
  return render(<DocumentoRelatorio relatorio={r} />);
}

const secao = (container: HTMLElement, numero: number) =>
  [...container.querySelectorAll<HTMLElement>('section.page')].find(
    (s) => s.querySelector('.sec-num')?.textContent === String(numero),
  )!;

beforeEach(() => {
  mocks.ocultos = false;
  mocks.busca = new URLSearchParams();
  mocks.replace.mockReset();
  vi.restoreAllMocks();
});

describe('capa', () => {
  it('metadados e sumário sem cadeado no Advanced', () => {
    const { container } = renderDoc(1, 'adv');
    const capa = container.querySelector('section.cover')!;
    expect(capa.querySelector('h1')!.textContent).toBe('Relatório financeiro');
    const meta = [...capa.querySelectorAll('.meta div')].map((d) => d.textContent);
    expect(meta).toEqual([
      'ClienteAna Ribeiro',
      'PeríodoNovembro de 2026 (parcial, lançado até 03/11)',
      'PlanoAdvanced',
      'Gerado em03/11/2026',
    ]);
    expect(capa.querySelectorAll('.toc > div')).toHaveLength(8);
    expect(capa.querySelectorAll('.toc .lk')).toHaveLength(0);
  });

  it('sumário com cadeado e nome do plano no Basic e no Pro', () => {
    const basic = renderDoc(3, 'basic').container;
    expect([...basic.querySelectorAll('.toc .lk')].map((l) => l.textContent?.trim())).toEqual([
      'Pro',
      'Pro',
      'Pro',
      'Advanced',
      'Advanced',
    ]);
    const pro = renderDoc(3, 'pro').container;
    expect(pro.querySelectorAll('.toc .lk')).toHaveLength(2);
  });

  it('consultor: na capa e no rodapé', () => {
    const { container } = renderDoc(1, 'adv', (r) => (r.consultor = 'Carlos Consultor'));
    expect(container.querySelector('.cover .meta')!.textContent).toContain('Carlos Consultor');
    expect(container.querySelector('.pf')!.textContent).toContain(
      'gerado pelo consultor Carlos Consultor',
    );
  });
});

describe('seção 1 — Resumo', () => {
  it('Advanced n=1: os 8 KPIs reais e os números do Pedro', () => {
    const { container } = renderDoc(1, 'adv');
    const s1 = secao(container, 1);
    expect(s1.querySelectorAll('.kpi')).toHaveLength(8);
    expect(s1.querySelectorAll('.kpi.lockt')).toHaveLength(0);
    const v = (rotulo: string) =>
      [...s1.querySelectorAll('.kpi')].find((k) => k.querySelector('.l')!.textContent === rotulo)!;
    expect(v('Receita no período').querySelector('.v')!.textContent).toBe('R$ 50.000');
    expect(v('Receita no período').querySelector('.s')!.textContent).toBe('prevista para o mês');
    expect(v('Dívidas em aberto').querySelector('.v')!.textContent).toBe('R$ 358.150');
    expect(v('Dívidas em aberto').querySelector('.s')!.textContent).toBe('4 contratos');
    expect(v('Saúde financeira').querySelector('.v')!.textContent).toBe('78/100');
    expect(v('Saúde financeira').querySelector('.s')!.textContent).toBe('Saudável, 1 alerta');
    expect(v('Sonhos no ritmo').querySelector('.v')!.textContent).toBe('2 de 4');
    expect(v('Sonhos no ritmo').querySelector('.s')!.textContent).toBe('1 atrasado');
    expect(s1.querySelectorAll('.insights li.lk')).toHaveLength(0);
    expect(s1.textContent).toContain('Saúde foi a categoria que mais passou do orçado');
    expect(s1.textContent).toContain('O rotativo do cartão custa 431,5% ao ano');
  });

  it('Pro: KpiLock só nos blocos Advanced; destaque da carteira sem a palavra proibida', async () => {
    const { container } = renderDoc(12, 'pro');
    const s1 = secao(container, 1);
    expect([...s1.querySelectorAll('.kpi.lockt .l')].map((l) => l.textContent)).toEqual([
      'Rentabilidade da carteira',
      'Saúde financeira',
    ]);
    await waitFor(() => expect(s1.textContent).toContain('em novos investimentos'));
    expect(s1.innerHTML).not.toMatch(APORTE);
    expect(s1.textContent).toContain(', em ');
    expect([...s1.querySelectorAll('.insights li.lk')].map((l) => l.textContent)).toEqual([
      'Rentabilidade, proventos, saúde financeira e quanto do seu IR pode voltar: disponível no Advanced.',
    ]);
  });

  it('Basic: 4 KpiLock com textos neutros e os 2 itens bloqueados em cinza', () => {
    const { container } = renderDoc(1, 'basic');
    const s1 = secao(container, 1);
    expect([...s1.querySelectorAll('.kpi.lockt .l')].map((l) => l.textContent)).toEqual([
      'Patrimônio investido',
      'Rentabilidade da carteira',
      'Saúde financeira',
      'Sonhos',
    ]);
    expect(s1.querySelectorAll('.insights li.lk')).toHaveLength(2);
  });
});

describe('seção 2 — Orçamento', () => {
  it('n=1: 5 KPIs, 10 barras, categorias sem orçamento e o ritmo do mês', () => {
    const { container } = renderDoc(1, 'basic');
    const s2 = secao(container, 2);
    expect(s2.querySelectorAll('.kpi')).toHaveLength(5);
    expect(s2.querySelectorAll('.hb-row')).toHaveLength(10);
    expect(s2.querySelector('p.fine')!.textContent).toBe(
      'Sem orçamento no período: Impostos, Dependentes, Planejamento.',
    );
    expect(s2.querySelector('.callout')!.textContent).toBe(
      'Ritmo do mês: 3 de 30 dias passaram (10%) e 74% do orçado já está lançado. Contas fixas lançadas no início do mês puxam esse número para cima.',
    );
    expect(s2.querySelector('svg')).toBeNull();
  });

  it('n=12: gráfico mensal e top 5 estouros; sem o callout do ritmo', () => {
    const { container } = renderDoc(12, 'basic');
    const s2 = secao(container, 2);
    expect(s2.querySelector('.chart svg[role="img"]')).not.toBeNull();
    const linhas = s2.querySelectorAll('table tbody tr');
    expect(linhas.length).toBeGreaterThan(0);
    expect(linhas.length).toBeLessThanOrEqual(5);
    expect(linhas[0].querySelectorAll('td')[1].textContent).toMatch(/de 12$/);
    expect(s2.querySelector('.callout')).toBeNull();
  });

  it('sem orçamento: Orçado/Disponível —, lista do realizado e o callout', () => {
    const { container } = renderDoc(1, 'basic', (r) => {
      r.orcamento.temOrcamento = false;
      r.orcamento.meses.forEach((m) => m.categorias.forEach((c) => (c.orcado = 0)));
      r.orcamento.ritmo = null;
    });
    const s2 = secao(container, 2);
    const vals = [...s2.querySelectorAll('.kpi .v')].map((v) => v.textContent);
    expect(vals[1]).toBe('—');
    expect(vals[3]).toBe('—');
    expect(s2.querySelectorAll('.hb-orc')).toHaveLength(0);
    expect(s2.textContent).toContain('Defina seu orçamento na aba Orçamento');
  });
});

describe('seção 3 — Dívidas', () => {
  it('n=1: KPIs, tabela pelo CET e o callout do rotativo', () => {
    const { container } = renderDoc(1, 'basic');
    const s3 = secao(container, 3);
    expect(s3.querySelectorAll('.kpi')).toHaveLength(6);
    const nomes = [...s3.querySelectorAll('tbody tr:not(.tot) td:first-child')].map(
      (td) => td.firstChild?.textContent,
    );
    expect(nomes).toEqual([
      'Rotativo do cartão',
      'Financiamento do carro',
      'Financiamento imobiliário',
      'Compras parceladas',
    ]);
    expect(s3.querySelector('.tag.bad')!.textContent).toBe('Rotativo');
    expect(s3.querySelector('.callout.warn')!.textContent).toMatch(/^O rotativo é 0,6% do que/);
    expect(s3.textContent).not.toContain('chega em breve');
  });

  it("n>1: cartão 'em breve' no lugar dos gráficos, com link", () => {
    const { container } = renderDoc(6, 'basic');
    const s3 = secao(container, 3);
    expect(s3.querySelectorAll('svg[role="img"]')).toHaveLength(0);
    const breve = [...s3.querySelectorAll('.callout')].find((c) =>
      c.textContent?.includes('chega em breve'),
    )!;
    expect(breve.querySelector('a')!.getAttribute('href')).toBe('/dividas');
  });

  it('sem dívidas: estado vazio', () => {
    const { container } = renderDoc(1, 'basic', (r) => {
      r.dividas.itens = [];
      r.dividas.semDividasForaImovel = { mes: null, motivo: 'sem_dividas' };
    });
    const s3 = secao(container, 3);
    expect(s3.querySelector('table')).toBeNull();
    expect(s3.textContent).toContain('Você não tem dívidas em aberto');
  });
});

describe('seção 9 — Como ler', () => {
  it('Basic: sem a palavra proibida e sem o parágrafo de IR', () => {
    const { container } = renderDoc(1, 'basic');
    const s9 = secao(container, 9);
    expect(s9.textContent).toContain('sem o efeito de entradas e saídas de dinheiro');
    expect(s9.textContent).toContain('difere da sobra prevista da tela Orçamento');
    expect(s9.innerHTML).not.toMatch(APORTE);
  });

  it('Advanced: saúde, proventos e os blocos em breve', () => {
    const { container } = renderDoc(12, 'adv');
    const s9 = secao(container, 9);
    expect(s9.textContent).toContain('A nota de 0 a 100 é provisória');
    expect(s9.textContent).toContain(
      'a evolução das dívidas mês a mês, a cobertura do FGC e o IR mensal de ações e FIIs',
    );
  });
});

describe('palavras proibidas no que a casca desenha (F3)', () => {
  it.each([1, 3, 6, 12] as const)('Basic n=%i: nada de PGBL, dedução ou aporte', (n) => {
    const { container } = renderDoc(n, 'basic');
    expect(container.innerHTML).not.toMatch(PROIBIDAS_TODOS);
    expect(container.innerHTML).not.toMatch(APORTE);
  });

  it.each([1, 12] as const)('Pro n=%i: nada de PGBL ou dedução', async (n) => {
    const { container } = renderDoc(n, 'pro');
    await waitFor(() => expect(container.textContent).toContain('novos investimentos'));
    expect(container.innerHTML).not.toMatch(PROIBIDAS_TODOS);
    for (const num of [1, 2, 3, 9]) expect(secao(container, num).innerHTML).not.toMatch(APORTE);
  });
});

describe('esconder valores (olho)', () => {
  it("olho fechado: R$ vira 'R$ ••••' e os % ficam visíveis", () => {
    mocks.ocultos = true;
    const { container } = renderDoc(1, 'adv');
    const s1 = secao(container, 1);
    const kpi = (rotulo: string) =>
      [...s1.querySelectorAll('.kpi')].find((k) => k.querySelector('.l')!.textContent === rotulo)!;
    expect(kpi('Sobra').querySelector('.v')!.textContent).toBe('R$ ••••');
    expect(kpi('Gastos realizados').querySelector('.s')!.textContent).toMatch(/^\d+% do orçado$/);
    expect(kpi('Saúde financeira').querySelector('.v')!.textContent).toBe('78/100');
    for (const v of container.querySelectorAll('.kpi .v')) {
      expect(v.textContent).not.toMatch(/R\$ \d/);
    }
    expect(container.querySelectorAll('table td.n')[0].textContent).toBe('R$ ••••');
  });
});

describe('página', () => {
  function comCliente(ui: ReactNode) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
  }

  it('mesesDaUrl: padrão 1 e só 1|3|6|12', () => {
    expect(mesesDaUrl(null)).toBe(1);
    expect(mesesDaUrl('6')).toBe(6);
    expect(mesesDaUrl('5')).toBe(1);
  });

  it('modo demonstração: não chama a API e troca o período pela URL', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mocks.busca = new URLSearchParams('fixture=exemplo&plano=basic');
    comCliente(<RelatorioFinanceiroPage demonstracao={relatorioExemplo(1, 'basic')} />);
    expect(screen.getByText('Modo demonstração · dados de exemplo')).toBeTruthy();
    const grupo = screen.getByRole('group', { name: 'Período' });
    expect(
      within(grupo).getByRole('button', { name: 'Mês atual' }).getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.click(within(grupo).getByRole('button', { name: '6 meses' }));
    expect(mocks.replace).toHaveBeenCalledWith(
      '/relatorios/financeiro?fixture=exemplo&plano=basic&meses=6',
      { scroll: false },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('dados reais: esqueleto, depois o documento; Baixar PDF chama window.print', async () => {
    mocks.busca = new URLSearchParams('meses=3');
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse(relatorioExemplo(3, 'adv')));
    vi.stubGlobal('fetch', fetchMock);
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const { container } = comCliente(<RelatorioFinanceiroPage />);
    expect(container.querySelector('main.doc[aria-busy="true"]')).not.toBeNull();
    await waitFor(() => expect(container.querySelector('section.cover h1')).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/relatorios/financeiro?meses=3',
      expect.objectContaining({ credentials: 'include' }),
    );
    const botao = screen.getByRole('button', { name: 'Baixar PDF' });
    fireEvent.click(botao);
    expect(print).toHaveBeenCalled();
  });

  it('erro: mensagem com tentar de novo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse({}, 500)));
    comCliente(<RelatorioFinanceiroPage />);
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
  });
});
