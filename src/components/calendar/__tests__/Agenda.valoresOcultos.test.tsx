// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { EventoAgenda } from '@/services/calendario/types';
import {
  ComValoresOcultos,
  expectPilulas,
  expectSemValoresExpostos,
  representacoesDoSentinela,
} from '@/test/valoresOcultos';

/**
 * Esconder valores (Fase 6, fatia 1): Agenda com o olho fechado. Resumo do período, "Próximos 30
 * dias" e o detalhe do evento (valor + juros, amortização, saldo, valor bruto/líquido e aplicado)
 * viram pílula; títulos, datas, parcela "14 de 360", taxa e contagens ficam. Olho aberto: os
 * valores aparecem como hoje e não há pílula.
 */

const h = vi.hoisted(() => ({ eventos: [] as EventoAgenda[] }));

vi.mock('next/navigation', () => ({ usePathname: () => '/calendario' }));
vi.mock('@/hooks/useAgenda', () => ({
  useAgenda: () => ({ data: { eventos: h.eventos }, isLoading: false }),
}));

import AgendaPainel from '../AgendaPainel';
import AgendaDetalheModal from '../AgendaDetalheModal';
import { tiposPadrao } from '../agendaTipos';

const S = {
  parcela: 3456.78,
  juros: 1234.56,
  amortizacao: 2222.22,
  saldoDevedor: 187654.32,
  proventoLiquido: 876.54,
  proventoBruto: 931.47,
  rfVencimento: 23456.78,
  rfAplicado: 20123.45,
  darf: 789.01,
} as const;
const SENTINELAS = Object.values(S);

const hoje = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const dia = (n: number) => {
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const ev = (o: Partial<EventoAgenda> & Pick<EventoAgenda, 'id' | 'tipo' | 'titulo'>) =>
  ({
    data: dia(1),
    dataFim: null,
    hora: null,
    valor: null,
    descricao: null,
    link: null,
    detalhe: {},
    ...o,
  }) as EventoAgenda;

const DIVIDA = ev({
  id: 'divida:apto:14',
  tipo: 'divida',
  titulo: 'Financiamento · parcela 14/360',
  valor: S.parcela,
  link: '/dividas/apto',
  detalhe: {
    instituicao: 'Banco E2E',
    numero: 14,
    total: 360,
    paga: false,
    juros: S.juros,
    amortizacao: S.amortizacao,
    saldoDevedor: S.saldoDevedor,
    indexador: 'TR',
  },
});
const PROVENTO = ev({
  id: 'provento:petr4:pagamento',
  tipo: 'provento',
  titulo: 'PETR4 · Dividendo',
  data: dia(3),
  valor: S.proventoLiquido,
  detalhe: {
    evento: 'pagamento',
    symbol: 'PETR4',
    tipoProvento: 'Dividendo',
    bruto: S.proventoBruto,
    liquido: S.proventoLiquido,
    dataCom: dia(0),
    dataPagamento: dia(3),
    provisionado: true,
  },
});
const RF = ev({
  id: 'rf:cdb:vencimento',
  tipo: 'rf',
  titulo: 'CDB Banco E2E · vencimento',
  data: dia(5),
  valor: S.rfVencimento,
  detalhe: {
    tipoTitulo: 'CDB',
    taxa: '110% do CDI',
    investedAmount: S.rfAplicado,
    isentoIr: false,
  },
});
const DARF = ev({ id: 'ir:darf', tipo: 'ir', titulo: 'DARF', data: dia(7), valor: S.darf });
const EVENTOS = [DIVIDA, PROVENTO, RF, DARF];

afterEach(() => cleanup());

const renderPainel = (ocultos: boolean) => {
  h.eventos = EVENTOS;
  return render(
    <ComValoresOcultos ocultos={ocultos}>
      <AgendaPainel eventos={EVENTOS} tipos={tiposPadrao()} theme="light" onSelecionar={vi.fn()} />
    </ComValoresOcultos>,
  );
};

const renderDetalhe = (evento: EventoAgenda, ocultos: boolean) =>
  render(
    <ComValoresOcultos ocultos={ocultos}>
      <AgendaDetalheModal
        evento={evento}
        theme="light"
        podeEditar
        onClose={vi.fn()}
        onEditar={vi.fn()}
      />
    </ComValoresOcultos>,
  );

describe('Agenda com o olho fechado', () => {
  it('painel: resumo e próximos 30 dias sem dinheiro; rótulos, contagens e datas ficam', () => {
    const { container } = renderPainel(true);
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS });
    // 4 linhas do resumo + 4 eventos dos próximos 30 dias.
    expectPilulas(container, 8);
    expect(container.textContent).toContain('A pagar');
    expect(container.textContent).toContain('(1)');
    expect(screen.getByText('PETR4 · Dividendo')).toBeTruthy();
  });

  it.each([
    ['dívida', DIVIDA, 4],
    ['provento', PROVENTO, 3],
    ['renda fixa', RF, 2],
  ] as const)('detalhe da %s: valor e linhas em R$ viram pílula', (_n, evento, pilulas) => {
    renderDetalhe(evento, true);
    const dialog = document.body;
    expectSemValoresExpostos(dialog, { sentinelas: SENTINELAS });
    expectPilulas(dialog, pilulas);
    expect(dialog.textContent).toContain(evento.titulo);
  });

  it('detalhe: parcela, taxa e indexador continuam visíveis', () => {
    renderDetalhe(DIVIDA, true);
    expect(document.body.textContent).toContain('14 de 360');
    expect(document.body.textContent).toContain('TR');
    cleanup();
    renderDetalhe(RF, true);
    expect(document.body.textContent).toContain('110% do CDI');
  });
});

describe('Agenda com o olho aberto', () => {
  it('painel e detalhe mostram os valores como hoje, sem pílula', () => {
    const { container } = renderPainel(false);
    expectPilulas(container, 0);
    for (const n of [S.parcela, S.proventoLiquido, S.rfVencimento, S.darf]) {
      expect(representacoesDoSentinela(n).some((f) => container.textContent?.includes(f))).toBe(
        true,
      );
    }
    cleanup();
    renderDetalhe(DIVIDA, false);
    expectPilulas(document.body, 0);
    for (const n of [S.parcela, S.juros, S.amortizacao, S.saldoDevedor]) {
      expect(representacoesDoSentinela(n).some((f) => document.body.textContent?.includes(f))).toBe(
        true,
      );
    }
  });
});
