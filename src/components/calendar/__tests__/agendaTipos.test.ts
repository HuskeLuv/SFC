// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { EventoAgenda } from '@/services/calendario/types';
import {
  STORAGE_KEY_TIPOS,
  corDoTipo,
  gravarTiposVisiveis,
  lerTiposVisiveis,
  paraFullCalendar,
  periodoDaVisao,
  tiposPadrao,
} from '../agendaTipos';
import { linhasDoDetalhe } from '../AgendaDetalheModal';
import { formParaPayload, validarForm, FORM_VAZIO } from '../AgendaEventoModal';

const base: EventoAgenda = {
  id: 'manual:e1:2026-09-25',
  tipo: 'manual',
  titulo: 'Renovar seguro',
  data: '2026-09-25',
  dataFim: null,
  hora: null,
  valor: null,
  descricao: null,
  link: null,
  detalhe: {
    eventoId: 'e1',
    categoria: 'lembrete',
    recorrencia: 'nenhuma',
    lembrete: true,
    ocorrencia: false,
  },
};

describe('paraFullCalendar', () => {
  it('dia inteiro, vários dias (fim exclusivo) e com hora', () => {
    expect(paraFullCalendar(base, 'light')).toMatchObject({
      id: base.id,
      start: '2026-09-25',
      end: undefined,
      allDay: true,
      classNames: ['agenda-evento', 'agenda-evento-manual'],
    });
    expect(paraFullCalendar({ ...base, dataFim: '2026-09-27' }, 'light').end).toBe('2026-09-28');
    expect(paraFullCalendar({ ...base, hora: '09:30' }, 'light')).toMatchObject({
      start: '2026-09-25T09:30:00',
      allDay: false,
    });
  });

  it('cor por tipo e tema (paleta My Finance), parcela paga ganha classe', () => {
    expect(paraFullCalendar(base, 'light').textColor).toBe('#0079F2');
    expect(corDoTipo('divida', 'light')).toBe('#314666');
    expect(corDoTipo('divida', 'dark')).toBe('#9DBEDC');
    const paga = paraFullCalendar({ ...base, tipo: 'divida', detalhe: { paga: true } }, 'dark');
    expect(paga.classNames).toContain('agenda-evento-pago');
    expect(paga.extendedProps?.cor).toBe('#9DBEDC');
  });
});

describe('periodoDaVisao', () => {
  it('usa datas locais e fecha o fim exclusivo', () => {
    // Grade de setembro/2026 vai de 30/08 a 04/10 (exclusivo 05/10).
    expect(periodoDaVisao(new Date(2026, 7, 30), new Date(2026, 9, 5))).toEqual({
      de: '2026-08-30',
      ate: '2026-10-04',
    });
  });
});

describe('tipos visíveis (localStorage)', () => {
  beforeEach(() => window.localStorage.clear());

  it('padrão quando não há nada guardado; ida e volta; ignora lixo', () => {
    expect(lerTiposVisiveis()).toEqual(tiposPadrao());
    expect(tiposPadrao().has('planejamento')).toBe(false);
    gravarTiposVisiveis(new Set(['manual', 'rf']));
    expect([...lerTiposVisiveis()]).toEqual(['manual', 'rf']);
    window.localStorage.setItem(STORAGE_KEY_TIPOS, '{"x":1}');
    expect(lerTiposVisiveis()).toEqual(tiposPadrao());
    window.localStorage.setItem(STORAGE_KEY_TIPOS, '["manual","banana"]');
    expect([...lerTiposVisiveis()]).toEqual(['manual']);
  });
});

describe('detalhe por tipo', () => {
  it('monta as linhas certas para dívida, provento e evento manual repetido', () => {
    const divida = linhasDoDetalhe({
      ...base,
      tipo: 'divida',
      detalhe: {
        instituicao: 'Caixa',
        numero: 9,
        total: 48,
        paga: false,
        juros: 40,
        amortizacao: 1000,
        saldoDevedor: 3000,
        indexador: 'IPCA',
        diaInformado: false,
      },
    });
    expect(divida).toEqual([
      ['Instituição', 'Caixa'],
      ['Parcela', '9 de 48'],
      ['Situação', 'A pagar'],
      ['Juros', expect.stringContaining('40,00')],
      ['Amortização', expect.stringContaining('1.000,00')],
      ['Saldo devedor após pagar', expect.stringContaining('3.000,00')],
      ['Indexador', 'IPCA'],
    ]);
    const provento = linhasDoDetalhe({
      ...base,
      tipo: 'provento',
      detalhe: {
        symbol: 'ITSA4',
        tipoProvento: 'JCP',
        bruto: 100,
        liquido: 82.5,
        dataCom: '2026-09-21',
        dataPagamento: '2026-10-05',
        provisionado: true,
      },
    });
    expect(provento.map((l) => l[0])).toEqual([
      'Ativo',
      'Tipo',
      'Valor bruto',
      'Valor líquido',
      'Data-com',
      'Pagamento',
      'Situação',
    ]);
    expect(provento[6][1]).toContain('Provisionado');
    const manual = linhasDoDetalhe({
      ...base,
      detalhe: { ...base.detalhe, recorrencia: 'mensal', ocorrencia: true, dataBase: '2026-01-25' },
    });
    expect(manual).toEqual([
      ['Categoria', 'Lembrete'],
      ['Repetição', 'Todo mês'],
      ['Primeira ocorrência', '25/01/2026'],
      ['Lembrete', 'Sim'],
    ]);
  });
});

describe('formulário do evento', () => {
  it('valida e converte para o corpo da API (vazios viram null)', () => {
    expect(validarForm(FORM_VAZIO)).toMatch(/título/);
    expect(validarForm({ ...FORM_VAZIO, titulo: 'x' })).toMatch(/data/);
    expect(
      validarForm({ ...FORM_VAZIO, titulo: 'x', data: '2026-09-25', dataFim: '2026-09-20' }),
    ).toMatch(/final/);
    expect(validarForm({ ...FORM_VAZIO, titulo: 'x', data: '2026-09-25' })).toBeNull();
    expect(
      formParaPayload({ ...FORM_VAZIO, titulo: ' Seguro ', data: '2026-09-25', descricao: '  ' }),
    ).toEqual({
      titulo: 'Seguro',
      data: '2026-09-25',
      dataFim: null,
      hora: null,
      categoria: 'pessoal',
      recorrencia: 'nenhuma',
      lembrete: false,
      descricao: null,
    });
  });
});
