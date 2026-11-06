// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { MesesRelatorio, RelatorioFinanceiro } from '@/types/relatorioFinanceiro';
import { relatorioExemplo } from '../__fixtures__/relatorioExemplo';
import { SecaoCarteira } from '../secoes/SecaoCarteira';
import { SecaoIr } from '../secoes/SecaoIr';
import { SecaoPlanejamento } from '../secoes/SecaoPlanejamento';
import { SecaoSaude } from '../secoes/SecaoSaude';
import { SecaoSonhos } from '../secoes/SecaoSonhos';
import DestaquePgbl from '../adv/DestaquePgbl';
import ParagrafoPgbl from '../adv/ParagrafoPgbl';
import { carregados } from './dynamicMock';

vi.mock('next/dynamic', () => import('./dynamicMock'));

/** Renderiza e espera o corpo dinâmico (quando há) aparecer. */
async function renderSecao(el: ReactElement, pronto?: string) {
  const r = render(el);
  if (pronto) await waitFor(() => expect(r.container.querySelector(pronto)).not.toBeNull());
  return r;
}

const SENTINELA = 'SENTINELA_REAL_XYZ';
const VALOR_SENTINELA = 987_654_321.12;

/** Relatório com TODOS os blocos preenchidos e marcados com sentinelas, mas no plano pedido. */
function comSentinelas(plano: RelatorioFinanceiro['plano'], meses: MesesRelatorio = 6) {
  const base = relatorioExemplo(meses, 'adv');
  const ir0 = relatorioExemplo(meses, 'basic').irGancho;
  const r: RelatorioFinanceiro = {
    ...base,
    plano,
    irGancho: ir0,
    carteira: {
      ...base.carteira!,
      patrimonio: VALOR_SENTINELA,
      classes: [{ chave: 'acoes', nome: SENTINELA, valor: VALOR_SENTINELA }],
    },
    carteiraAvancada: { ...base.carteiraAvancada!, twr: 777.77 },
    planejamento: {
      ...base.planejamento!,
      patrimonioRealizado: VALOR_SENTINELA,
    },
    sonhos: base.sonhos!.map((s) => ({ ...s, nome: SENTINELA })),
    saude: { ...base.saude!, frase: SENTINELA, bens: [{ nome: SENTINELA, valor: 1 }] },
    ir: { ...base.ir!, rendaTributavel: VALOR_SENTINELA, planos: [] },
  };
  return r;
}

const fmtSentinela = '987.654.321';

describe('seções 4 a 8 no Advanced (corpo real)', () => {
  it('4: carteira 4a + 4b com os rótulos do Pedro e os cartões "em breve" com link', async () => {
    const rel = relatorioExemplo(12, 'adv');
    const { container } = await renderSecao(
      <SecaoCarteira relatorio={rel} />,
      '.callout a[href="/carteira?aba=analise"]',
    );
    await waitFor(() => expect(container.textContent).toContain('Aportes no período'));
    expect(container.querySelector('.sec-num')!.textContent).toBe('4');
    expect(container.querySelector('.locked')).toBeNull();
    expect(container.textContent).toContain('Patrimônio investido');
    expect(container.textContent).toContain('R$ 1.173.752');
    expect(container.textContent).toContain('em 30/10/2026');
    expect(container.textContent).toContain('em 6 classes');
    expect(container.textContent).toContain('Rentabilidade (TWR)');
    expect(container.textContent).toContain('Proventos recebidos');
    const links = [...container.querySelectorAll('.callout a')].map((a) => a.textContent);
    expect(links).toEqual(['Análises > Cobertura FGC', 'Análises > IR']);
    expect(container.textContent).toContain('Cobertura do FGC: em breve no relatório');
    expect(container.textContent).toContain('IR mensal de ações e FIIs: em breve no relatório');
    // 6 fatias na rosca, 12 barras no histórico
    expect(container.querySelectorAll('.dl > div')).toHaveLength(6);
  });

  it('4: carteira sem histórico e sem rentabilidade mostra "em processamento"', async () => {
    const base = relatorioExemplo(3, 'adv');
    const rel: RelatorioFinanceiro = {
      ...base,
      carteira: { ...base.carteira!, historicoStatus: 'processando', variacaoPeriodo: null },
      carteiraAvancada: {
        ...base.carteiraAvancada!,
        twr: null,
        retornoDiario: { datas: [], carteira: [], ibov: [], cdi: [], ipca: [] },
      },
    };
    const { container } = await renderSecao(<SecaoCarteira relatorio={rel} />, '.block');
    await waitFor(() => expect(container.textContent).toContain('Histórico em processamento'));
    expect(container.textContent).toContain('rentabilidade em processamento');
  });

  it('4: histórico indisponível não promete a próxima geração', async () => {
    const base = relatorioExemplo(3, 'adv');
    const rel: RelatorioFinanceiro = {
      ...base,
      carteira: {
        ...base.carteira!,
        historicoStatus: 'indisponivel',
        historico: [],
        variacaoPeriodo: null,
      },
    };
    const { container } = await renderSecao(<SecaoCarteira relatorio={rel} />, '.block');
    await waitFor(() =>
      expect(container.textContent).toContain('não corresponde às posições atuais'),
    );
    expect(container.textContent).not.toContain('próxima geração');
  });

  it('5: planejamento com plano e sem plano (estado vazio com link)', async () => {
    const rel = relatorioExemplo(12, 'adv');
    const { container, unmount } = await renderSecao(
      <SecaoPlanejamento relatorio={rel} />,
      '.kpis',
    );
    expect(container.textContent).toContain('Aportes: projetado x realizado');
    expect(container.textContent).toContain('linha = meta 1,061% a.m.');
    expect(container.textContent).toContain('R$ 5,0 mi');
    expect(container.textContent).toContain('Out/34');
    unmount();

    const vazio: RelatorioFinanceiro = {
      ...rel,
      planejamento: {
        temPlano: false,
        patrimonioRealizado: 1000,
        patrimonioPlanejadoHoje: null,
        metaIndependencia: null,
        metaMensal: null,
        serie: [],
      },
    };
    const r2 = await renderSecao(<SecaoPlanejamento relatorio={vazio} />, '.callout');
    const link = r2.container.querySelector('.callout a')!;
    expect(link.getAttribute('href')).toBe('/planejamento-financeiro?modo=aposentadoria');
    expect(r2.container.textContent).toContain('Cadastre seu plano de independência');
    expect(r2.container.querySelectorAll('.kpi')).toHaveLength(1);
  });

  it('6: sonhos (tabela + cartões) e estado vazio', async () => {
    const rel = relatorioExemplo(1, 'adv');
    const { container, unmount } = await renderSecao(<SecaoSonhos relatorio={rel} />, 'table');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(4);
    expect(container.querySelectorAll('.dream')).toHaveLength(4);
    expect(container.textContent).toContain('Aportado no mês');
    expect(container.textContent).toContain('Sem aporte há 4 meses');
    expect(container.textContent).toContain('Abr/27');
    unmount();

    const r2 = await renderSecao(<SecaoSonhos relatorio={{ ...rel, sonhos: [] }} />, '.callout');
    expect(r2.container.querySelector('.callout a')!.getAttribute('href')).toBe(
      '/planejamento-financeiro?modo=sonhos',
    );
  });

  it('7: saúde com nota, 6 indicadores, bases e balanço', async () => {
    const rel = relatorioExemplo(3, 'adv');
    const { container } = await renderSecao(<SecaoSaude relatorio={rel} />, '.score');
    expect(container.querySelector('.score .big')!.textContent).toBe('78/100');
    expect(container.querySelectorAll('.ind-row')).toHaveLength(6);
    expect(container.textContent).toContain('Patrimônio líquido');
    expect(container.textContent).toContain('As metas podem diferir das da tela Saúde Financeira');
    expect(container.textContent).toContain('O histórico da nota começa a ser registrado em breve');
  });

  it('8: IR completo com a linha de apoio só no Advanced', async () => {
    const rel = relatorioExemplo(1, 'adv');
    const { container } = await renderSecao(<SecaoIr relatorio={rel} />, '.sec-head p');
    expect(container.querySelector('.sec-head p')!.textContent).toBe(
      'Quanto o PGBL reduz o seu IR e o que falta fazer até 31/12. Ano-calendário 2026.',
    );
    expect(container.textContent).toContain('Aportado em PGBL');
    expect(container.textContent).toContain('faltam R$ 8.168 · 58 dias');
    expect(container.textContent).toContain('Um aporte único de R$ 8.168,00');
    expect(container.textContent).toContain('R$ 28.842,63');
    expect(container.textContent).toContain('restituição projetada R$ 2.437,37');
    expect(container.querySelectorAll('.chk > div')).toHaveLength(5);
    expect(container.querySelector('.prog')).not.toBeNull();
    expect(container.querySelector('.locked')).toBeNull();
  });

  it('8: IR encerrado some com a barra e o callout do prazo', async () => {
    const base = relatorioExemplo(1, 'adv');
    const rel: RelatorioFinanceiro = {
      ...base,
      ir: { ...base.ir!, encerrado: true, diasAte3112: null },
    };
    const { container } = await renderSecao(<SecaoIr relatorio={rel} />, '.sec-head p');
    expect(container.querySelector('.sec-head p')!.textContent).toContain(
      'Ano-calendário 2026 encerrado',
    );
    expect(container.textContent).toContain('ano-calendário 2026 encerrado');
    expect(container.querySelector('.prog')).toBeNull();
    expect(container.textContent).not.toContain('Um aporte único');
  });

  it('8: simulação sem INSS mostra o aviso com o link da aba PGBL', async () => {
    const base = relatorioExemplo(1, 'adv');
    const rel: RelatorioFinanceiro = {
      ...base,
      ir: {
        ...base.ir!,
        economia: 0,
        condicoes: [
          {
            chave: 'inss',
            status: 'warn',
            titulo: 'Contribuição ao INSS no ano',
            descricao: 'Informe o INSS na aba PGBL.',
          },
        ],
      },
    };
    const { container } = await renderSecao(<SecaoIr relatorio={rel} />, '.callout.warn');
    const aviso = container.querySelector('.callout.warn')!;
    expect(aviso.textContent).toContain('Informe o INSS');
    expect(aviso.querySelector('a')!.getAttribute('href')).toBe('/carteira?aba=analise');
  });

  it('adv/DestaquePgbl e adv/ParagrafoPgbl', () => {
    const ir = relatorioExemplo(1, 'adv').ir!;
    const { container, rerender } = render(
      <ul>
        <DestaquePgbl ir={ir} />
      </ul>,
    );
    expect(container.textContent).toBe(
      'PGBL: faltam R$ 8.168 para usar todo o limite de 12% em 2026. Um aporte até 31/12 reduz o IR em cerca de R$ 2.246.',
    );
    rerender(
      <ul>
        <DestaquePgbl ir={{ ...ir, encerrado: true }} />
      </ul>,
    );
    expect(container.querySelector('li')).toBeNull();
    const p = render(<ParagrafoPgbl />);
    expect(p.container.textContent).toContain('PGBL e IR.');
  });
});

describe('seções 4 a 8 bloqueadas (corpo fictício)', () => {
  it('Basic: tudo bloqueado, nenhum corpo real carregado e nenhuma sentinela no HTML', async () => {
    carregados.length = 0;
    const rel = comSentinelas('basic');
    const { container } = render(
      <>
        <SecaoCarteira relatorio={rel} />
        <SecaoPlanejamento relatorio={rel} />
        <SecaoSonhos relatorio={rel} />
        <SecaoSaude relatorio={rel} />
        <SecaoIr relatorio={rel} />
      </>,
    );
    expect(container.querySelectorAll('.locked')).toHaveLength(6);
    expect(container.querySelectorAll('.locked.tall')).toHaveLength(1);
    expect(carregados).toEqual([]);
    expect(container.innerHTML).not.toContain(SENTINELA);
    expect(container.innerHTML).not.toContain(fmtSentinela);
    expect(container.innerHTML).not.toContain('777,77');
    const ctas = [...container.querySelectorAll('a.cta')].map((a) => a.textContent);
    expect(ctas).toEqual([
      'Liberar no Pro com 20% off',
      'Liberar no Advanced com 30% off',
      'Liberar no Pro com 20% off',
      'Liberar no Pro com 20% off',
      'Liberar no Advanced com 30% off',
      'Liberar no Advanced com 30% off',
    ]);
  });

  it('Pro: 4b, 7 e 8 bloqueados; só os corpos reais do Pro são carregados', async () => {
    carregados.length = 0;
    const rel = comSentinelas('pro');
    const { container } = render(
      <>
        <SecaoCarteira relatorio={rel} />
        <SecaoSaude relatorio={rel} />
        <SecaoIr relatorio={rel} />
      </>,
    );
    await waitFor(() => expect(container.textContent).toContain('Aportes no período'));
    expect(container.querySelectorAll('.locked')).toHaveLength(3);
    expect(carregados.some((c) => c.includes('CarteiraReal'))).toBe(true);
    expect(carregados.some((c) => /Avancada|Saude|SecaoIrConteudo/.test(c))).toBe(false);
    // 4a é real (o Pro tem o patrimônio), mas 4b, 7 e 8 não usam dado real
    const bloqueados = [...container.querySelectorAll('.locked')].map((l) => l.innerHTML).join('');
    expect(bloqueados).not.toContain(SENTINELA);
    expect(bloqueados).not.toContain('777,77');
    // gancho do 4b usa o patrimônio que o Pro já tem
    expect(container.querySelectorAll('.locked .hook')[0].textContent).toContain(fmtSentinela);
  });

  it('ganchos: sobra do período, sobra por mês e índice de poupança dos meses fechados', () => {
    const rel = relatorioExemplo(3, 'basic');
    const { container } = render(
      <>
        <SecaoCarteira relatorio={rel} />
        <SecaoPlanejamento relatorio={rel} />
        <SecaoSaude relatorio={rel} />
      </>,
    );
    const hooks = [...container.querySelectorAll('.hook')].map((h) => h.textContent ?? '');
    expect(hooks[0]).toMatch(/^Você teve R\$ [\d.]+ de sobra no período\./);
    // 4b no Basic: sem gancho (o Basic não tem o patrimônio)
    expect(hooks[1]).toMatch(/^Com R\$ [\d.]+ de sobra por mês/);
    expect(hooks[2]).toMatch(/índice de poupança nos meses fechados do período foi \d+,\d%/);
  });

  it('descrições dos cadeados 5 e 6 reescritas (decisão 6)', () => {
    const rel = relatorioExemplo(1, 'basic');
    const { container } = render(
      <>
        <SecaoPlanejamento relatorio={rel} />
        <SecaoSonhos relatorio={rel} />
      </>,
    );
    const ps = [...container.querySelectorAll('.lock-in > p:not(.hook)')].map((p) => p.textContent);
    expect(ps).toEqual([
      'Compare o que você planejou com o que realizou mês a mês, até a independência financeira.',
      'Veja quanto falta para cada sonho, quanto guardar por mês e quando você chega lá.',
    ]);
  });

  it('8 bloqueado: Ganho com a economia, sem linha de apoio no título', () => {
    const rel = relatorioExemplo(1, 'pro');
    const { container } = render(<SecaoIr relatorio={rel} />);
    expect(container.querySelector('.sec-head p')).toBeNull();
    const gain = container.querySelector('.gain')!;
    expect(gain.querySelector('.gl')!.textContent).toBe('Sua restituição de IR 2026 pode ser');
    expect(gain.querySelector('b')!.textContent).toBe('até+ R$ 6.151');
    expect(gain.querySelector('.gs')!.textContent).toBe(
      'maior, calculado com a sua renda de R$ 186.400.',
    );
    expect(gain.querySelector('.tag')!.textContent).toBe('Prazo para agir: 31/12 · faltam 58 dias');
  });

  it('8 bloqueado: Ganho some com economiaMaxima ≤ 0 e com o ano encerrado', () => {
    const base = relatorioExemplo(1, 'basic');
    const zero = { ...base, irGancho: { ...base.irGancho!, economiaMaxima: 0 } };
    const r1 = render(<SecaoIr relatorio={zero} />);
    expect(r1.container.querySelector('.gain')).toBeNull();
    expect(r1.container.querySelector('.locked.tall')).not.toBeNull();
    r1.unmount();

    const enc = {
      ...base,
      irGancho: { ...base.irGancho!, encerrado: true, diasAte3112: null },
    };
    const r2 = render(<SecaoIr relatorio={enc} />);
    expect(r2.container.querySelector('.gain')).toBeNull();
    expect(r2.container.textContent).not.toContain('Prazo para agir');
    expect(r2.container.querySelector('.lock-in > p')!.textContent).toContain(
      'ano-calendário 2026, encerrado',
    );
  });

  it('renda lançada no gancho leva a marca "lançado até"', () => {
    const base = relatorioExemplo(1, 'basic');
    const rel = { ...base, irGancho: { ...base.irGancho!, rendaOrigem: 'lancado' as const } };
    const { container } = render(<SecaoIr relatorio={rel} />);
    expect(container.querySelector('.gain .gs')!.textContent).toContain('(lançado até 03/11)');
  });

  it.each([1, 3, 6, 12] as const)('fictícios mantêm a estrutura com n=%i', (n) => {
    const rel = relatorioExemplo(n, 'basic');
    const { container } = render(
      <>
        <SecaoCarteira relatorio={rel} />
        <SecaoSonhos relatorio={rel} />
        <SecaoSaude relatorio={rel} />
      </>,
    );
    const blurs = container.querySelectorAll('.locked .blur');
    expect(blurs).toHaveLength(4);
    blurs.forEach((b) => expect(b.getAttribute('aria-hidden')).toBe('true'));
    expect(container.querySelectorAll('.locked .blur .dream')).toHaveLength(4);
    expect(container.querySelectorAll('.locked .blur .ind-row')).toHaveLength(6);
    // nada focável dentro do conteúdo desfocado
    expect(container.querySelectorAll('.locked .blur a')).toHaveLength(0);
  });
});
