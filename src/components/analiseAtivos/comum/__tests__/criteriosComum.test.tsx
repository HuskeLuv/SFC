// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import CelulaCriterios from '../CelulaCriterios';
import MarcaCriterio from '../MarcaCriterio';
import PilulasJanela from '../PilulasJanela';
import MiniBarrasAnuais, { ariaMiniBarras } from '../MiniBarrasAnuais';
import { CORES_PERMITIDAS } from '@/constants/analiseAtivosVisual';
import { LEITURA_DOS_DADOS, RODAPE_QUADRO } from '@/services/analiseAtivos/textosLiterais';
import { esperarDomLimpo, varrerDom } from '@/test/utils/varrerDom';
import {
  CRITERIOS_LINHA_HGLG11,
  CRITERIOS_LINHA_ITUB4,
  CRITERIOS_LINHA_WEGE3,
  rotulosCriterios,
} from '@/test/fixtures/analiseAtivos/criterios';
import type { EstadoCriterio, Janela } from '@/types/analiseAtivosCriterios';

afterEach(cleanup);

const ARQUIVOS = [
  'CelulaCriterios.tsx',
  'MarcaCriterio.tsx',
  'PilulasJanela.tsx',
  'MiniBarrasAnuais.tsx',
];
const fonte = (a: string) => readFileSync(path.join(__dirname, '..', a), 'utf8');

/** cores semânticas proibidas na marca de critério (D1: neutras) */
const CLASSES_SEMANTICAS =
  /\b(?:bg|text|border|fill|stroke)-(?:green|emerald|lime|red|rose|amber|yellow|orange)-\d{2,3}\b/;

describe('MarcaCriterio', () => {
  const casos: Array<[EstadoCriterio, string, string]> = [
    ['atende', 'atende:', ''],
    ['nao_atende', 'não atende:', '—'],
    ['sem_dado', 'não atende, sem dado:', '—'],
    ['nao_se_aplica', 'não se aplica:', 'n/a'],
  ];

  it.each(casos)('%s: texto sr-only e marca neutra', (estado, sr, visivel) => {
    const { container } = render(<MarcaCriterio estado={estado} />);
    const raiz = container.querySelector('[data-estado-criterio]') as HTMLElement;
    expect(raiz).toHaveAttribute('data-estado-criterio', estado);
    expect(raiz.querySelector('.sr-only')?.textContent).toBe(sr);
    if (visivel) expect(raiz.querySelector('[aria-hidden="true"]')?.textContent).toBe(visivel);
    expect(container.innerHTML).not.toMatch(CLASSES_SEMANTICAS);
  });

  it('decorativa: sem texto sr-only; n/a em pílula tracejada; 22 px por padrão', () => {
    const { container, rerender } = render(<MarcaCriterio estado="atende" decorativa />);
    expect(container.querySelector('.sr-only')).toBeNull();
    expect(container.innerHTML).toContain('h-[22px] w-[22px]');
    rerender(<MarcaCriterio estado="nao_se_aplica" tamanho="sm" />);
    expect(container.innerHTML).toContain('border-dashed');
  });
});

describe('CelulaCriterios', () => {
  it('botão de 44 px com aria-label e "n de k"; k quadradinhos', () => {
    const { container } = render(
      <CelulaCriterios criterios={CRITERIOS_LINHA_WEGE3} ticker="WEGE3" />,
    );
    const botao = screen.getByRole('button', {
      name: 'Critérios em 5 anos: 5 de 6 atendidos. Ver detalhes.',
    });
    expect(botao.className).toContain('min-h-11');
    expect(botao).toHaveTextContent('5 de 6');
    expect(container.querySelectorAll('[data-quadrado]')).toHaveLength(6);
    expect(container.querySelectorAll('[data-quadrado="atende"]')).toHaveLength(5);
  });

  it('financeira: n de 3 com 3 quadradinhos tracejados (não se aplica)', () => {
    const { container } = render(
      <CelulaCriterios criterios={CRITERIOS_LINHA_ITUB4} ticker="ITUB4" />,
    );
    expect(screen.getByRole('button')).toHaveTextContent('2 de 3');
    expect(container.querySelectorAll('[data-quadrado="nao_se_aplica"]')).toHaveLength(3);
    expect(container.innerHTML).toContain('border-dashed');
  });

  it('tooltip em foco, toque e hover; Esc fecha; não propaga o clique para a linha', () => {
    const abrirLinha = vi.fn();
    render(
      <div onClick={abrirLinha}>
        <CelulaCriterios
          criterios={CRITERIOS_LINHA_HGLG11}
          ticker="HGLG11"
          rotulos={rotulosCriterios('fii_tijolo')}
          observacaoPerfil="FoF: avaliado com os critérios de papel (regra de composição)"
        />
      </div>,
    );
    const botao = screen.getByRole('button');
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.click(botao);
    expect(abrirLinha).not.toHaveBeenCalled();
    const tip = screen.getByRole('tooltip');
    expect(botao).toHaveAttribute('aria-describedby', tip.id);
    expect(
      within(tip).getByText(/Obrigações\/PL ≤ 20%: não atende · dentro do limite/),
    ).toBeTruthy();
    expect(
      within(tip).getByText(/Vacância ≤ 10%: não atende · sem dado nas demonstrações/),
    ).toBeTruthy();
    expect(within(tip).getByText(/FoF: avaliado/)).toBeTruthy();

    fireEvent.keyDown(botao, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.focus(botao);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.blur(botao);
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.pointerEnter(botao, { pointerType: 'mouse' });
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.pointerLeave(botao, { pointerType: 'mouse' });
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.keyDown(botao, { key: 'Enter' });
    expect(abrirLinha).not.toHaveBeenCalled();
  });

  it('sem avaliação: "—" sem botão, com aria-label', () => {
    render(<CelulaCriterios criterios={null} ticker="NOVO3" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByLabelText('Critérios: sem avaliação para NOVO3.')).toHaveTextContent('—');
  });

  it('caso 32 (fatia 0): DOM aberto sem linguagem nem classe proibida', () => {
    const { container } = render(
      <CelulaCriterios
        criterios={CRITERIOS_LINHA_ITUB4}
        ticker="ITUB4"
        rotulos={rotulosCriterios('acao_financeira')}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    esperarDomLimpo(container);
  });
});

describe('PilulasJanela', () => {
  it('radiogroup com 3 opções, a selecionada marcada e alvo de 44 px', () => {
    render(<PilulasJanela valor={5} onTrocar={vi.fn()} />);
    const grupo = screen.getByRole('radiogroup', { name: 'Janela de anos dos critérios' });
    const radios = within(grupo).getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual(['3 anos', '5 anos', '10 anos']);
    expect(screen.getByRole('radio', { name: '5 anos' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '5 anos' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: '3 anos' })).toHaveAttribute('tabindex', '-1');
    for (const r of radios) expect(r.className).toContain('min-h-11');
  });

  it('clique e setas trocam a janela', () => {
    const onTrocar = vi.fn<(j: Janela) => void>();
    render(<PilulasJanela valor={5} onTrocar={onTrocar} variante="compacta" />);
    fireEvent.click(screen.getByRole('radio', { name: '10a' }));
    expect(onTrocar).toHaveBeenLastCalledWith(10);
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowLeft' });
    expect(onTrocar).toHaveBeenLastCalledWith(3);
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
    expect(onTrocar).toHaveBeenLastCalledWith(10);
    // clicar na selecionada não chama
    onTrocar.mockClear();
    fireEvent.click(screen.getByRole('radio', { name: '5a' }));
    expect(onTrocar).not.toHaveBeenCalled();
  });
});

describe('MiniBarrasAnuais', () => {
  const serie = [
    { ano: 2021, valor: 23600 },
    { ano: 2022, valor: null },
    { ano: 2023, valor: -1200 },
  ];

  it('aria-label com todos os anos; sem dado tracejado; negativo na mesma cor', () => {
    const { container } = render(
      <MiniBarrasAnuais serie={serie} formato="n" unidade="R$ mi" rotulo="Receita crescente" />,
    );
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute(
      'aria-label',
      'Receita crescente, 2021 a 2023: 2021: 23.600; 2022: sem dado; 2023: −1.200',
    );
    expect(img).toHaveAttribute('tabindex', '0');
    expect(container.querySelector('[data-barra="sem_dado"]')).toBeTruthy();
    const neg = container.querySelector('[data-barra="negativo"]') as SVGElement;
    expect(neg.getAttribute('class')).toContain('fill-[#396CAA]');
  });

  it('hover e setas mostram ano: valor; só o texto do negativo fica vermelho', () => {
    const { container } = render(
      <MiniBarrasAnuais serie={serie} formato="n" unidade="R$ mi" rotulo="Receita crescente" />,
    );
    const leitura = () => container.querySelector('[data-leitura-barra]') as HTMLElement;
    // padrão: último ano (negativo, em vermelho)
    expect(leitura()).toHaveTextContent('2023: −1.200 (R$ mi)');
    expect(leitura().innerHTML).toContain('text-[#D92D20]');
    fireEvent.mouseEnter(container.querySelector('[data-barra="positivo"]') as Element);
    expect(leitura()).toHaveTextContent('2021: 23.600 (R$ mi)');
    expect(leitura().innerHTML).not.toContain('text-[#D92D20]');
    fireEvent.keyDown(screen.getByRole('img'), { key: 'ArrowRight' });
    expect(leitura()).toHaveTextContent('2022: —');
  });

  it('ariaMiniBarras puro', () => {
    expect(ariaMiniBarras('X', [{ ano: 2025, valor: 3 }], 'x')).toBe('X, 2025 a 2025: 2025: 3,0×');
  });
});

describe('arquivos dos componentes neutros', () => {
  it('só cores da paleta (hex) e nenhuma cor semântica nem classe de placar', () => {
    const permitidas = new Set(CORES_PERMITIDAS.map((c) => c.toUpperCase()));
    const fora: string[] = [];
    for (const a of ARQUIVOS) {
      const f = fonte(a);
      for (const m of f.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
        if (!permitidas.has(m[0].toUpperCase())) fora.push(`${a}: ${m[0]}`);
      }
      if (CLASSES_SEMANTICAS.test(f)) fora.push(`${a}: classe semântica`);
      if (/\b(?:best|star|winner|destaque)\b/i.test(f.replace(/\/\*[\s\S]*?\*\//g, ''))) {
        fora.push(`${a}: classe de placar`);
      }
    }
    expect(fora).toEqual([]);
  });

  it('MarcaCriterio usa vermelho em lugar nenhum; MiniBarras só no texto do valor', () => {
    expect(fonte('MarcaCriterio.tsx')).not.toMatch(/D92D20|F97066/);
    expect(fonte('CelulaCriterios.tsx')).not.toMatch(/D92D20|F97066/);
    expect(fonte('PilulasJanela.tsx')).not.toMatch(/D92D20|F97066/);
    expect(fonte('MiniBarrasAnuais.tsx')).toMatch(/text-\[#D92D20\] dark:text-\[#F97066\]/);
    expect(fonte('MiniBarrasAnuais.tsx')).not.toMatch(/fill-\[#D92D20\]/);
  });
});

describe('varrerDom', () => {
  it('ignora data-nome-ativo e aceita data-texto-legal com o literal exato', () => {
    const { container } = render(
      <div>
        <span data-nome-ativo="">Kinea Índices de Preços</span>
        <p data-texto-legal="rodape-quadro">{RODAPE_QUADRO.texto}</p>
        <p data-texto-legal="leitura-dos-dados">
          {LEITURA_DOS_DADOS.texto.replace('. Não', '.\n    Não')}
        </p>
        <span>Critérios de fundamentos · 5 anos</span>
      </div>,
    );
    const r = varrerDom(container);
    expect(r.achados).toEqual([]);
    expect(r.literais).toEqual(['rodape-quadro', 'leitura-dos-dados']);
    expect(r.texto).toContain('Critérios de fundamentos');
    expect(r.texto).not.toContain('Kinea');
  });

  it('acusa literal alterado ou id desconhecido, palavra proibida, atributo e classe de placar', () => {
    const { container } = render(
      <div>
        <p data-texto-legal="rodape-quadro">{`${RODAPE_QUADRO.texto} Confira.`}</p>
        <p data-texto-legal="inventado">qualquer</p>
        <span>Índice MF 8,4</span>
        <button type="button" aria-label="Ver o vencedor">
          x
        </button>
        <td className="cell-best">1</td>
        <span className="star">★</span>
        <span data-destaque="">2025</span>
        <span className="items-start justify-start">ok</span>
      </div>,
    );
    const r = varrerDom(container);
    const por = (t: string) => r.achados.filter((a) => a.tipo === t).map((a) => a.detalhe);
    expect(por('literal_invalido')).toEqual(['rodape-quadro', 'inventado']);
    expect(por('palavra')).toEqual(expect.arrayContaining(['Índice', 'vencedor', '★']));
    expect(por('classe')).toEqual(['cell-best', 'star', 'data-destaque']);
  });

  it('textos de operação passam só pela lista própria', () => {
    const { container } = render(
      <div>
        <button type="button">Compra</button>
        <button type="button">Venda</button>
      </div>,
    );
    expect(varrerDom(container).achados.map((a) => a.detalhe)).toEqual(['compra', 'venda']);
    expect(varrerDom(container, { textosOperacao: ['Compra', 'Venda'] }).achados).toEqual([]);
  });
});
