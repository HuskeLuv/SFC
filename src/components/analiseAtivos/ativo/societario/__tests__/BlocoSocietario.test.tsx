// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

const mockHook = vi.hoisted(() => ({ useSocietarioAtivo: vi.fn() }));
vi.mock('@/hooks/useSocietarioAtivo', () => mockHook);

import BlocoSocietario, { contagemCompacta, dataBr } from '../BlocoSocietario';
import { TEXTOS_SOCIETARIO } from '@/services/analiseAtivos/textosSocietario';
import { esperarDomLimpo } from '@/test/utils/varrerDom';
import type { SocietarioResposta } from '@/types/analiseAtivosComplementos';

const T = TEXTOS_SOCIETARIO;

const WEGE3: SocietarioResposta = {
  ticker: 'WEGE3',
  acionistas: {
    estado: 'ok',
    valor: {
      anoFre: 2026,
      dtReceb: '2026-09-22',
      acionistas: [
        {
          nome: 'WPA Participações e Serviços S.A.',
          pctOn: 50.088,
          pctPn: null,
          pctTotal: 50.088,
          controlador: true,
          acordoAcionistas: true,
          sintetica: null,
        },
        {
          nome: 'Outros',
          pctOn: 49.912,
          pctPn: null,
          pctTotal: 49.912,
          controlador: false,
          acordoAcionistas: false,
          sintetica: 'outros',
        },
      ],
    },
  },
  circulacao: {
    estado: 'ok',
    valor: {
      anoFre: 2026,
      dtReceb: '2026-09-22',
      pctOn: { estado: 'ok', valor: 34.796 },
      pctPn: { estado: 'nao_se_aplica', motivo: 'nao_emite', texto: T.circulacao.naoEmite },
      pctTotal: { estado: 'ok', valor: 34.796 },
      nAcionistasPf: 359032,
      nAcionistasPj: 2900,
      nAcionistasInst: 1130,
    },
  },
  tagAlong: {
    estado: 'ok',
    valor: [
      { especie: 'ON', classePn: '', pct: 100, base: 'segmento_b3' },
      { especie: 'PN', classePn: '', pct: null, base: 'nao_emite' },
      { especie: 'UNIT', classePn: '', pct: null, base: 'nao_emite' },
    ],
  },
  dividendoMinimo: {
    estado: 'ok',
    valor: {
      anoFre: 2022,
      pctLucroAjustado: { estado: 'ok', valor: 25 },
      trecho: '25% (vinte e cinco por cento) no mínimo, do lucro líquido ajustado',
      linkFreVigente: 'https://www.rad.cvm.gov.br/ENETCONSULTA/frmDownloadDocumento.aspx?x=1',
    },
  },
  segmentoListagem: 'Novo Mercado',
  versao: 'fre-2026v3-2022',
};

function consulta(data: SocietarioResposta | undefined, extra: Record<string, unknown> = {}) {
  return { data, isPending: data === undefined, isError: false, refetch: vi.fn(), ...extra };
}

describe('BlocoSocietario', () => {
  beforeEach(() => mockHook.useSocietarioAtivo.mockReset());

  it('acionistas (só nome e %), circulação, tag along e dividendo mínimo com aviso e link', () => {
    mockHook.useSocietarioAtivo.mockReturnValue(consulta(WEGE3));
    const { container } = render(<BlocoSocietario ticker="WEGE3" />);
    expect(screen.getByRole('heading', { name: T.titulo })).toBeTruthy();
    const tabela = screen.getByRole('table', { name: 'Principais acionistas diretos de WEGE3' });
    expect(within(tabela).getByText('WPA Participações e Serviços S.A.')).toBeTruthy();
    expect(within(tabela).getByText(T.acionistas.controlador)).toBeTruthy();
    expect(within(tabela).getByText(T.acionistas.acordo)).toBeTruthy();
    expect(within(tabela).getAllByText('50,09%')).toHaveLength(2);
    // exercício do FRE + DT_RECEB
    expect(
      screen.getByText('diretos · FRE do exercício 2026 · entregue em 22/09/2026 · CVM'),
    ).toBeTruthy();
    // PN na circulação + PN e Unit no tag along
    expect(screen.getAllByText(T.circulacao.naoEmite)).toHaveLength(3);
    expect(
      screen.getByText(
        'Acionistas: 359 mil pessoas físicas · 2,9 mil pessoas jurídicas · 1,1 mil institucionais',
      ),
    ).toBeTruthy();
    expect(screen.getByText(T.tagAlong.bases.segmento_b3)).toBeTruthy();
    expect(screen.getByText(T.dividendoMinimo.sub)).toBeTruthy();
    expect(screen.getByText('25%')).toBeTruthy();
    const link = screen.getByRole('link', { name: /Formulário de Referência vigente na CVM/ });
    expect(link.getAttribute('href')).toContain('https://www.rad.cvm.gov.br/');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(container.textContent).not.toMatch(
      /\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}/,
    );
    esperarDomLimpo(container);
  });

  it('sem % reconhecível: "sem dado · o FRE remete a outro item"; sem FRE: o motivo', () => {
    mockHook.useSocietarioAtivo.mockReturnValue(
      consulta({
        ...WEGE3,
        acionistas: { estado: 'ausente', motivo: 'sem_fre', texto: T.motivos.sem_fre },
        dividendoMinimo: {
          estado: 'ok',
          valor: {
            anoFre: 2022,
            pctLucroAjustado: {
              estado: 'ausente',
              motivo: 'remete_outro_item',
              texto: T.motivos.remete_outro_item,
            },
            trecho: 'Informações prestadas na seção 18.12.',
            linkFreVigente: null,
          },
        },
      }),
    );
    render(<BlocoSocietario ticker="BBSE3" />);
    expect(screen.getByText(T.motivos.remete_outro_item)).toBeTruthy();
    expect(screen.getByText(T.motivos.sem_fre)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('carregando e erro com "Tentar de novo"', () => {
    mockHook.useSocietarioAtivo.mockReturnValue(consulta(undefined));
    const { unmount } = render(<BlocoSocietario ticker="WEGE3" />);
    expect(screen.getByRole('status')).toBeTruthy();
    unmount();
    mockHook.useSocietarioAtivo.mockReturnValue(
      consulta(undefined, { isPending: false, isError: true }),
    );
    render(<BlocoSocietario ticker="WEGE3" />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('formatação: contagem compacta e data dd/mm/aaaa', () => {
    expect(contagemCompacta(653637)).toBe('654 mil');
    expect(contagemCompacta(2900)).toBe('2,9 mil');
    expect(contagemCompacta(812)).toBe('812');
    expect(contagemCompacta(null)).toBe('—');
    expect(dataBr('2026-09-22')).toBe('22/09/2026');
  });
});
