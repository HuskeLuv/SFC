// @vitest-environment jsdom
/**
 * Barra "Filtros de fundamentos" (BarraFiltrosCriterios) e o estado na URL (useEstadoQuadroUrl) —
 * fatia B da v2.4: chips E, janela 3|5|10, chip vac/inad desabilitado com motivo (D3), alvos de
 * 44 px por classe, marcas neutras e varredura de linguagem (caso 32).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

const media = vi.hoisted(() => ({ celular: false }));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => media.celular }));

import BarraFiltrosCriterios, { descricaoChip } from '../BarraFiltrosCriterios';
import RodapeCriterios from '../RodapeCriterios';
import {
  alternarCriterio,
  escreverEstadoQuadro,
  filtrosDoEstado,
  lerEstadoQuadro,
} from '../useEstadoQuadroUrl';
import { definicoesChips } from '@/test/fixtures/analiseAtivos/criterios';
import { esperarDomLimpo } from '@/test/utils/varrerDom';
import { TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';
import { RODAPE_QUADRO } from '@/services/analiseAtivos/textosLiterais';
import type { BarraFiltrosCriteriosProps } from '@/types/analiseAtivosCriterios';

function props(over: Partial<BarraFiltrosCriteriosProps> = {}): BarraFiltrosCriteriosProps {
  return {
    classe: 'acao',
    janela: 5,
    definicoes: definicoesChips('acao'),
    selecionados: [],
    naCarteira: false,
    setor: null,
    setores: ['Financeiro', 'Saúde'],
    onTrocarJanela: vi.fn(),
    onAlternarCriterio: vi.fn(),
    onAlternarNaCarteira: vi.fn(),
    onTrocarSetor: vi.fn(),
    onLimpar: vi.fn(),
    ...over,
  };
}

const chip = (nome: RegExp) => screen.getByRole('button', { name: nome });

describe('BarraFiltrosCriterios', () => {
  beforeEach(() => {
    media.celular = false;
  });

  it('ações: 6 chips + Na minha carteira + Setor; janela 3|5|10 com 5 marcada', () => {
    const p = props();
    render(<BarraFiltrosCriterios {...p} />);
    expect(screen.getByRole('group', { name: 'Filtros de fundamentos' })).toBeInTheDocument();
    for (const r of [/Receita crescente/, /Lucro crescente/, /EBITDA crescente/, /Margem/, /Dív/]) {
      expect(chip(r)).toHaveAttribute('aria-pressed', 'false');
    }
    expect(chip(/FCL crescente/)).toBeInTheDocument();
    expect(chip(/Na minha carteira/)).toBeInTheDocument();
    expect(chip(/Setor/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '5 anos' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: '10 anos' }));
    expect(p.onTrocarJanela).toHaveBeenCalledWith(10);
    // sem filtro ligado não há "Limpar filtros"
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull();
  });

  it('chip ligado: aria-pressed e ✓ neutro; clique alterna; Limpar aparece', () => {
    const p = props({ selecionados: ['rec', 'mg'] });
    render(<BarraFiltrosCriterios {...p} />);
    const rec = chip(/Receita crescente/);
    expect(rec).toHaveAttribute('aria-pressed', 'true');
    expect(rec.textContent).toContain('✓');
    // cor da paleta (nunca verde/vermelho)
    const visual = rec.querySelector('span')!;
    expect(visual.className).toContain('bg-[#EDF2F8]');
    expect(visual.className).not.toMatch(/green|emerald|red-|#D92D20|#F97066/);
    fireEvent.click(chip(/Lucro crescente/));
    expect(p.onAlternarCriterio).toHaveBeenCalledWith('luc');
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(p.onLimpar).toHaveBeenCalled();
  });

  it('FII: pares tijolo/papel; vac/inad desabilitado com selo e motivo (D3); alav/ltv habilitado', () => {
    const p = props({ classe: 'fii', definicoes: definicoesChips('fii') });
    render(<BarraFiltrosCriterios {...p} />);
    const vac = chip(/Vacância ≤ 10%/);
    expect(vac).toHaveAttribute('aria-disabled', 'true');
    expect(vac).not.toHaveAttribute('aria-pressed');
    expect(vac.textContent).toContain('Inadimplência ≤ 3%');
    expect(vac.textContent).toContain(TEXTOS_CRITERIOS.chips.seloSemDado);
    expect(vac.getAttribute('title')).toContain(TEXTOS_CRITERIOS.chips.tooltipDesabilitado);
    const desc = document.getElementById(vac.getAttribute('aria-describedby')!);
    expect(desc?.textContent).toContain(TEXTOS_CRITERIOS.chips.tooltipDesabilitado);
    fireEvent.click(vac);
    expect(p.onAlternarCriterio).not.toHaveBeenCalled();

    const alav = chip(/Obrigações\/PL ≤ 20%/);
    expect(alav).toHaveAttribute('aria-pressed', 'false');
    expect(alav.textContent).toContain('LTV ≤ 60%');
    expect(alav.getAttribute('title')).toContain(TEXTOS_CRITERIOS.chips.tooltipParAlavancagem);
    fireEvent.click(alav);
    expect(p.onAlternarCriterio).toHaveBeenCalledWith('alav');
    expect(chip(/Segmento/)).toBeInTheDocument();
  });

  it('descricaoChip junta definição, par de papel e motivo', () => {
    const [vac] = definicoesChips('fii').filter((d) => d.id === 'vac');
    const t = descricaoChip(vac);
    expect(t).toContain(vac.definicao);
    expect(t).toContain('em FII de papel: Inadimplência ≤ 3%');
    expect(t).toContain(TEXTOS_CRITERIOS.chips.tooltipDesabilitado);
  });

  it('alvos de 44 px: chips, Na minha carteira, Setor e pílulas da janela (min-h-11)', () => {
    render(<BarraFiltrosCriterios {...props({ selecionados: ['rec'] })} />);
    const barra = screen.getByRole('group', { name: 'Filtros de fundamentos' });
    for (const b of within(barra).getAllByRole('button')) {
      expect(b.className, b.textContent ?? '').toContain('min-h-11');
    }
    for (const r of within(barra).getAllByRole('radio')) expect(r.className).toContain('min-h-11');
  });

  it('celular: trilho de chips com rolagem só dentro dele; mesmos chips', () => {
    media.celular = true;
    render(
      <BarraFiltrosCriterios {...props({ classe: 'fii', definicoes: definicoesChips('fii') })} />,
    );
    const trilho = document.querySelector('[data-quadro-chips]') as HTMLElement;
    expect(trilho.hasAttribute('data-mf-scroll-x')).toBe(true);
    expect(trilho.className).toContain('overflow-x-auto');
    expect(within(trilho).getAllByRole('button').length).toBe(8);
    // sr-only dos chips não escapa do trilho (o botão é o bloco de contenção)
    for (const b of within(trilho).getAllByRole('button'))
      expect(b.className).toContain('relative');
  });

  it('caso 32: barra e rodapé sem linguagem proibida; o rodapé passa só como literal', () => {
    const { container } = render(
      <div>
        <BarraFiltrosCriterios
          {...props({ classe: 'fii', definicoes: definicoesChips('fii'), selecionados: ['rend'] })}
        />
        <RodapeCriterios />
      </div>,
    );
    const r = esperarDomLimpo(container);
    expect(r.literais).toEqual(['rodape-quadro']);
    const rodape = container.querySelector('[data-texto-legal="rodape-quadro"]')!;
    expect(rodape.textContent).toBe(RODAPE_QUADRO.texto);
  });
});

describe('useEstadoQuadroUrl (funções puras)', () => {
  it('padrão: A–Z, janela 5, sem critérios', () => {
    const e = lerEstadoQuadro(new URLSearchParams(''));
    expect(e).toMatchObject({
      classe: 'acao',
      ordem: 'ticker',
      dir: 'asc',
      janela: 5,
      criterios: [],
      naCarteira: false,
      setor: null,
    });
    expect(escreverEstadoQuadro(e).toString()).toBe('');
  });

  it('lê j, c (só chips habilitados da classe, na ordem da barra), carteira e s', () => {
    const e = lerEstadoQuadro(
      new URLSearchParams('classe=fii&j=10&c=res,vac,rend,rec,ltv,rend&carteira=1&s=Logística'),
    );
    expect(e).toMatchObject({
      classe: 'fii',
      janela: 10,
      criterios: ['rend', 'res'],
      naCarteira: true,
      setor: 'Logística',
    });
    expect(filtrosDoEstado(e)).toEqual({
      classe: 'fii',
      ordem: 'ticker',
      dir: 'asc',
      janela: 10,
      criterios: 'rend,res',
      naCarteira: true,
      segmento: 'Logística',
    });
    expect(escreverEstadoQuadro(e).toString()).toBe(
      'classe=fii&j=10&c=rend%2Cres&carteira=1&s=Log%C3%ADstica',
    );
  });

  it('valores inválidos caem no padrão; ordem antiga (indicador) vira A–Z', () => {
    const e = lerEstadoQuadro(new URLSearchParams('j=4&ordem=indiceMf&dir=xx&c=nota'));
    expect(e).toMatchObject({ janela: 5, ordem: 'ticker', dir: 'asc', criterios: [] });
    expect(lerEstadoQuadro(new URLSearchParams('ordem=criterios')).dir).toBe('desc');
  });

  it('alternarCriterio liga/desliga mantendo a ordem da barra', () => {
    expect(alternarCriterio('acao', ['mg'], 'rec')).toEqual(['rec', 'mg']);
    expect(alternarCriterio('acao', ['rec', 'mg'], 'rec')).toEqual(['mg']);
    expect(alternarCriterio('fii', [], 'vac')).toEqual([]);
  });
});
