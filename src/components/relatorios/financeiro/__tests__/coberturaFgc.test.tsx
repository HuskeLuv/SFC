// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { RelatorioFinanceiro } from '@/types/relatorioFinanceiro';
import type { BlocoFgcRelatorio } from '@/types/relatorioFinanceiroFgc';
import { relatorioExemplo } from '../__fixtures__/relatorioExemplo';
import { SecaoCarteira } from '../secoes/SecaoCarteira';
import { CoberturaFgcReal } from '../secoes/real/CoberturaFgcReal';
import { carregados } from './dynamicMock';

vi.mock('next/dynamic', () => import('./dynamicMock'));

const ocultos = vi.hoisted(() => ({ ativo: false }));
vi.mock('@/context/ValoresOcultosContext', () => ({
  useValoresOcultos: () => ({ ativo: ocultos.ativo }),
}));

const SENTINELA = 'BANCO_SENTINELA_XYZ';

const bloco = (extra: Partial<BlocoFgcRelatorio> = {}): BlocoFgcRelatorio => ({
  limitePorEmissor: 250_000,
  tetoGlobal: 1_000_000,
  emissores: [],
  totalCoberto: 0,
  pctTetoGlobal: 0,
  totalExcedente: 0,
  rendaFixaSemCobertura: 0,
  avisos: [],
  ...extra,
});

const emissor = (nome: string, valorCoberto: number, extra = {}) => ({
  chave: nome,
  nome,
  valorCoberto,
  nTitulos: 1,
  pctLimite: Math.round((valorCoberto / 2500) * 100) / 100,
  excedente: Math.max(0, valorCoberto - 250_000),
  status: 'dentro' as const,
  usaCorretora: false,
  ...extra,
});

describe('CoberturaFgcReal', () => {
  it('vazio: estado honesto, sem subtítulo do teto', () => {
    const { container } = render(<CoberturaFgcReal fgc={bloco()} />);
    expect(container.textContent).toContain('Cobertura do FGC');
    expect(container.textContent).toContain('Nenhum investimento coberto pelo FGC na carteira.');
    expect(container.textContent).not.toContain('teto global');
    expect(container.querySelectorAll('[data-fgc-emissor]')).toHaveLength(0);
  });

  it('típico: barra, % do limite, tag e subtítulo do teto global', () => {
    const { container } = render(
      <CoberturaFgcReal
        fgc={bloco({
          emissores: [emissor('Banco BMG S.A.', 168_478.56, { nTitulos: 2 })],
          totalCoberto: 168_478.56,
          pctTetoGlobal: 16.85,
        })}
      />,
    );
    expect(container.querySelector('h3')!.textContent).toBe(
      'Cobertura do FGC 16,9% do teto global de R$ 1 milhão',
    );
    const linha = container.querySelector('[data-fgc-emissor]')!;
    expect(linha.textContent).toContain('Banco BMG S.A. · 2 títulos');
    expect(linha.textContent).toContain('R$ 168.479');
    expect(linha.textContent).toContain('67,4% de R$ 250 mil por emissor');
    expect(linha.querySelector('.tag.good')!.textContent).toBe('Dentro do limite');
    expect((linha.querySelector('.prog.good i') as HTMLElement).style.width).toBe('67.39%');
  });

  it('borda: acima do limite, atenção, resumo além de 6 emissores e avisos', () => {
    const emissores = [
      emissor('Banco A', 300_000, { status: 'acima' }),
      emissor('Banco B', 240_000, { status: 'atencao' }),
      ...['C', 'D', 'E', 'F', 'G', 'H'].map((l) => emissor(`Banco ${l}`, 10_000)),
    ];
    const { container } = render(
      <CoberturaFgcReal
        fgc={bloco({
          emissores,
          totalCoberto: 550_000,
          pctTetoGlobal: 55,
          rendaFixaSemCobertura: 80_000,
          avisos: [
            { tipo: 'conglomerado', nomes: ['Banco A', 'Banco B'], total: 540_000, acima: 290_000 },
            { tipo: 'emissorPendente', n: 2 },
          ],
        })}
      />,
    );
    const linhas = container.querySelectorAll('[data-fgc-emissor]');
    expect(linhas).toHaveLength(6);
    expect(linhas[0].querySelector('.tag.bad')!.textContent).toBe('Acima do limite');
    expect(linhas[0].textContent).toContain('120,0% de R$ 250 mil por emissor · R$ 50.000 acima');
    expect((linhas[0].querySelector('.prog i') as HTMLElement).style.width).toBe('100%');
    expect(linhas[1].querySelector('.tag.warn')!.textContent).toBe('Atenção');
    expect(container.textContent).toContain('Mais 2 emissores, somando R$ 20.000.');
    expect(container.textContent).toContain(
      'Banco A e Banco B são do mesmo grupo financeiro: para o FGC, o limite de R$ 250 mil pode ser um só. Juntos somam R$ 540.000, R$ 290.000 acima do limite.',
    );
    expect(container.textContent).toContain(
      '2 investimentos estão sem o banco emissor confirmado. Informe o emissor em Análises > Cobertura FGC para o limite ficar certo.',
    );
    expect(container.textContent).toContain('R$ 80.000 em renda fixa sem cobertura do FGC');
  });

  it('carga falhou (null): leva à tela, sem número', () => {
    const { container } = render(<CoberturaFgcReal fgc={null} />);
    expect(container.textContent).toBe(
      'Cobertura do FGC: indisponível agora. Veja em Análises > Cobertura FGC.',
    );
    expect(container.querySelector('a')!.getAttribute('href')).toBe('/carteira?aba=analise');
  });
});

describe('Cobertura do FGC na seção 4 por plano', () => {
  /** Relatório com o FGC marcado por sentinela, no plano pedido. */
  function comSentinela(plano: RelatorioFinanceiro['plano']): RelatorioFinanceiro {
    const base = relatorioExemplo(6, 'adv');
    return {
      ...base,
      plano,
      carteiraAvancada: {
        ...base.carteiraAvancada!,
        fgc: bloco({
          emissores: [emissor(SENTINELA, 123_456.78)],
          totalCoberto: 123_456.78,
          pctTetoGlobal: 12.35,
        }),
      },
    };
  }

  it('Advanced: mostra o FGC real (dados do Pedro na demonstração)', async () => {
    const { container } = render(<SecaoCarteira relatorio={relatorioExemplo(6, 'adv')} />);
    await waitFor(() => expect(container.querySelectorAll('[data-fgc-emissor]')).toHaveLength(4));
    expect(container.textContent).toContain('Banco BMG S.A. · 2 títulos');
    expect(container.textContent).toContain('R$ 168.479');
    expect(container.textContent).toContain('47,1% do teto global de R$ 1 milhão');
  });

  it('Advanced com o olho fechado: valores em R$ e % do limite escondidos, tag visível', async () => {
    ocultos.ativo = true;
    try {
      const { FormatoProvider } = await import('../FormatoProvider');
      const { container } = render(
        <FormatoProvider>
          <SecaoCarteira relatorio={comSentinela('adv')} />
        </FormatoProvider>,
      );
      await waitFor(() => expect(container.querySelector('[data-fgc-emissor]')).not.toBeNull());
      const linha = container.querySelector('[data-fgc-emissor]')!;
      expect(linha.textContent).not.toContain('123.457');
      expect(linha.textContent).toContain('R$ ••••');
      // % de um limite fixo revela o valor: sai junto com a barra e o % do teto global.
      expect(linha.textContent).not.toContain('49,4%');
      expect(linha.textContent).toContain('Limite de R$ 250 mil por emissor');
      expect(linha.querySelector('.prog')).toBeNull();
      expect(container.textContent).not.toContain('do teto global');
    } finally {
      ocultos.ativo = false;
    }
  });

  it.each(['basic', 'pro'] as const)(
    '%s: 4b sob o cadeado com o FGC fictício, sem dado real',
    async (plano) => {
      carregados.length = 0;
      const { container } = render(<SecaoCarteira relatorio={comSentinela(plano)} />);
      if (plano === 'pro') {
        await waitFor(() => expect(container.textContent).toContain('Aportes no período'));
      }
      const cadeado = [...container.querySelectorAll('.locked')].pop()!;
      expect(cadeado.textContent).toContain('Cobertura do FGC');
      expect(cadeado.textContent).toContain('Banco A · 2 títulos');
      expect(container.innerHTML).not.toContain(SENTINELA);
      expect(container.innerHTML).not.toContain('123.457');
      expect(container.innerHTML).not.toContain('Banco BMG');
      expect(container.querySelector('[data-fgc-emissor]')).toBeNull();
      expect(carregados.some((c) => /Avancada|CoberturaFgcReal/.test(c))).toBe(false);
    },
  );
});
