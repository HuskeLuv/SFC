// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import CardCriterios, { notasDoPerfil } from '../CardCriterios';
import ItemCriterio, { textoFatoCriterio } from '../ItemCriterio';
import { CORES_PERMITIDAS } from '@/constants/analiseAtivosVisual';
import { TEXTOS_ATIVO } from '@/services/analiseAtivos/textosAtivo';
import { TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';
import { esperarDomLimpo } from '@/test/utils/varrerDom';
import {
  CRITERIOS_ATIVO_HGLG11,
  CRITERIOS_ATIVO_ITUB4,
  CRITERIOS_ATIVO_WEGE3,
} from '@/test/fixtures/analiseAtivos/criterios';
import type { ChaveJanela, CriteriosAtivo } from '@/types/analiseAtivosCriterios';

const fetchSpy = vi.fn();
beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const contagem = (container: HTMLElement) =>
  container.querySelector('[data-contagem-criterios]')?.textContent?.replace(/\s+/g, ' ').trim();

function radio(anos: number) {
  return screen.getByRole('radio', { name: `${anos} anos` });
}

describe('CardCriterios — janelas (as 3 na mesma resposta)', () => {
  it('abre na janela 5 com "n de 6" neutro, 6 itens e o título do bloco', () => {
    const { container } = render(
      <CardCriterios ticker="WEGE3" classe="acao" criterios={CRITERIOS_ATIVO_WEGE3} />,
    );
    const j5 = CRITERIOS_ATIVO_WEGE3.janelas['5'];
    expect(screen.getByRole('heading', { level: 2, name: 'Critérios de fundamentos' }));
    expect(radio(5)).toHaveAttribute('aria-checked', 'true');
    expect(contagem(container)).toBe(
      `${j5.atendidos} de ${j5.aplicaveis} critérios atendidos em 5 anos`,
    );
    expect(container.querySelectorAll('li[data-criterio]')).toHaveLength(6);
    expect(screen.getByRole('list', { name: /em 5 anos \(2021–2025\)/ })).toBeInTheDocument();
  });

  it.each([3, 10, 5] as const)(
    'trocar para %i anos troca contagem, itens e fatos sem nova requisição',
    (anos) => {
      const { container } = render(
        <CardCriterios
          ticker="WEGE3"
          classe="acao"
          criterios={CRITERIOS_ATIVO_WEGE3}
          janelaInicial={anos === 5 ? 3 : 5}
        />,
      );
      fireEvent.click(radio(anos));
      const j = CRITERIOS_ATIVO_WEGE3.janelas[String(anos) as ChaveJanela];
      expect(radio(anos)).toHaveAttribute('aria-checked', 'true');
      expect(container.querySelector('[data-card-criterios]')).toHaveAttribute(
        'data-janela',
        String(anos),
      );
      expect(contagem(container)).toMatch(new RegExp(`^${j.atendidos} de ${j.aplicaveis} `));
      for (const item of j.itens) {
        const li = container.querySelector(`li[data-criterio="${item.id}"]`) as HTMLElement;
        expect(li).toHaveAttribute('data-janela', String(anos));
        expect(within(li).getByText(textoFatoCriterio(item))).toBeInTheDocument();
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it('setas do teclado na pílula também trocam a janela', () => {
    const { container } = render(
      <CardCriterios ticker="WEGE3" classe="acao" criterios={CRITERIOS_ATIVO_WEGE3} />,
    );
    fireEvent.keyDown(radio(5), { key: 'ArrowRight' });
    expect(container.querySelector('[data-card-criterios]')).toHaveAttribute('data-janela', '10');
  });
});

describe('CardCriterios — instituição financeira (D4: n de 3)', () => {
  it('ITUB4: "3 de 3", nota dos 3 critérios que não se aplicam, itens n/a tracejados', () => {
    const { container } = render(
      <CardCriterios ticker="ITUB4" classe="acao" criterios={CRITERIOS_ATIVO_ITUB4} />,
    );
    const j5 = CRITERIOS_ATIVO_ITUB4.janelas['5'];
    expect(j5.aplicaveis).toBe(3);
    expect(contagem(container)).toMatch(new RegExp(`^${j5.atendidos} de 3 `));
    expect(screen.getByText(/3 critérios não se aplicam a este ativo/)).toBeInTheDocument();
    const na = container.querySelectorAll('li[data-estado-criterio="nao_se_aplica"]');
    expect([...na].map((li) => li.getAttribute('data-criterio'))).toEqual(['ebitda', 'dl', 'fcl']);
    for (const li of na) {
      expect(li.className).toContain('border-dashed');
      expect(li.querySelector('[data-mini-barras]')).toBeNull();
      expect(within(li as HTMLElement).getByText('n/a')).toBeInTheDocument();
    }
    expect(
      within(na[2] as HTMLElement).getByText(TEXTOS_CRITERIOS.motivos.instituicao_financeira_fcl),
    ).toBeInTheDocument();
    expect(
      within(na[0] as HTMLElement).getByText(TEXTOS_CRITERIOS.motivos.instituicao_financeira),
    ).toBeInTheDocument();
  });
});

describe('CardCriterios — FII (D3 e nota da janela de 10 anos)', () => {
  it('vacância: "não atende · sem dado nas demonstrações" com o motivo D3', () => {
    const { container } = render(
      <CardCriterios ticker="HGLG11" classe="fii" criterios={CRITERIOS_ATIVO_HGLG11} />,
    );
    const vac = container.querySelector('li[data-criterio="vac"]') as HTMLElement;
    expect(vac).toHaveAttribute('data-estado-criterio', 'sem_dado');
    expect(
      within(vac).getByText(`não atende · ${TEXTOS_CRITERIOS.motivos.sem_fonte_confiavel.vac}`),
    ).toBeInTheDocument();
    expect(within(vac).getByText('não atende, sem dado:')).toHaveClass('sr-only');
    expect(screen.getByText(/Fonte: informes mensais e trimestrais dos FIIs \(CVM\)\./));
  });

  it('janela 10: só "sem dado nas demonstrações", sem a nota dos informes de 2016 (v2.5)', () => {
    const { container } = render(
      <CardCriterios ticker="HGLG11" classe="fii" criterios={CRITERIOS_ATIVO_HGLG11} />,
    );
    fireEvent.click(radio(10));
    expect(container.querySelector('[data-nota-janela-10]')).toBeNull();
    expect(container.textContent).not.toMatch(/começam em 2016/);
    const rend = container.querySelector('li[data-criterio="rend"]') as HTMLElement;
    expect(within(rend).getByText(`não atende · ${TEXTOS_CRITERIOS.fatos.semDado}`));
  });

  it('ação na janela 10 não leva a nota de FII', () => {
    const { container } = render(
      <CardCriterios
        ticker="WEGE3"
        classe="acao"
        criterios={CRITERIOS_ATIVO_WEGE3}
        janelaInicial={10}
      />,
    );
    expect(container.querySelector('[data-nota-janela-10]')).toBeNull();
  });

  it('FoF/indefinido: a observação do perfil entra sob o número', () => {
    const fof: CriteriosAtivo = {
      ...CRITERIOS_ATIVO_HGLG11,
      perfil: 'fii_papel',
      observacaoPerfil: TEXTOS_CRITERIOS.perfil.fof,
    };
    expect(notasDoPerfil(fof, 5)).toEqual([
      TEXTOS_CRITERIOS.subtitulo,
      TEXTOS_CRITERIOS.perfil.fof,
    ]);
    render(<CardCriterios ticker="RBRF11" classe="fii" criterios={fof} />);
    expect(screen.getByText((t) => t.includes(TEXTOS_CRITERIOS.perfil.fof))).toBeInTheDocument();
  });
});

describe('ItemCriterio — mini-barras com hover e foco', () => {
  const rec = CRITERIOS_ATIVO_WEGE3.janelas['5'].itens.find((i) => i.id === 'rec')!;

  it('barras da janela (J+1 anos em "crescente"), aria-label com todos os anos', () => {
    render(
      <ul>
        <ItemCriterio item={rec} janela={5} />
      </ul>,
    );
    const img = screen.getByRole('img', { name: /Receita crescente, 2020 a 2025/ });
    expect(img).toHaveAttribute('tabindex', '0');
    expect(img.querySelectorAll('rect[data-barra]')).toHaveLength(6);
    expect(img.getAttribute('aria-label')).toContain('2025: 40.804');
  });

  it('foco + ← mostra o ano anterior; hover numa barra mostra o ano dela', () => {
    const { container } = render(
      <ul>
        <ItemCriterio item={rec} janela={5} />
      </ul>,
    );
    const img = screen.getByRole('img', { name: /Receita crescente/ });
    const leitura = () => container.querySelector('[data-leitura-barra]')?.textContent;
    expect(leitura()).toMatch(/^2025: 40\.804/);
    img.focus();
    fireEvent.keyDown(img, { key: 'ArrowLeft' });
    expect(leitura()).toMatch(/^2024: 37\.987/);
    fireEvent.mouseEnter(img.querySelectorAll('rect[data-barra]')[0]);
    expect(leitura()).toMatch(/^2020: 17\.470/);
  });

  it('sem série (n/a ou sem dado) não desenha barras', () => {
    const vac = CRITERIOS_ATIVO_HGLG11.janelas['5'].itens.find((i) => i.id === 'vac')!;
    const { container } = render(
      <ul>
        <ItemCriterio item={vac} janela={5} />
      </ul>,
    );
    expect(container.querySelector('[data-mini-barras]')).toBeNull();
  });
});

describe('CardCriterios — sem avaliação, linguagem e cores', () => {
  it('sem avaliação: título + texto de espera, sem pílulas', () => {
    render(<CardCriterios ticker="XPTO3" classe="acao" criterios={null} />);
    expect(screen.getByText(TEXTOS_ATIVO.criterios.semAvaliacao)).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it.each([
    ['WEGE3', 'acao', CRITERIOS_ATIVO_WEGE3],
    ['ITUB4', 'acao', CRITERIOS_ATIVO_ITUB4],
    ['HGLG11', 'fii', CRITERIOS_ATIVO_HGLG11],
  ] as const)('%s: DOM limpo (linguagemV2, sem classe de placar) nas 3 janelas', (t, c, crit) => {
    const { container } = render(<CardCriterios ticker={t} classe={c} criterios={crit} />);
    for (const anos of [3, 5, 10]) {
      fireEvent.click(radio(anos));
      esperarDomLimpo(container);
    }
  });

  it('fonte dos componentes: só cores da paleta e nenhuma classe semântica', () => {
    const permitidas = new Set(CORES_PERMITIDAS.map((c) => c.toUpperCase()));
    const semanticas =
      /\b(?:bg|text|border|fill|stroke)-(?:green|emerald|lime|red|rose|amber|yellow|orange)-\d{2,3}\b/;
    for (const a of ['CardCriterios.tsx', 'ItemCriterio.tsx']) {
      const f = readFileSync(path.join(__dirname, '..', a), 'utf8');
      const fora = [...f.matchAll(/#[0-9a-fA-F]{6}\b/g)]
        .map((m) => m[0])
        .filter((h) => !permitidas.has(h.toUpperCase()));
      expect(fora, a).toEqual([]);
      expect(semanticas.test(f), a).toBe(false);
    }
  });
});
