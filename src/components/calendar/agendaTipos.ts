/**
 * Metadados dos tipos de evento da Agenda: rótulo, cor (paleta My Finance —
 * src/constants/brandColors.ts, tons claros da mesma família no dark mode),
 * quais ficam ligados por padrão, e a conversão para o formato do FullCalendar.
 */
import type { EventInput } from '@fullcalendar/core';
import { MYFINANCE_BRAND } from '@/constants/brandColors';
import type { EventoAgenda, Periodo, TipoEvento } from '@/services/calendario/types';

export interface TipoMeta {
  tipo: TipoEvento;
  label: string;
  descricao: string;
  /** Cor no tema claro. */
  cor: string;
  /** Cor no tema escuro (tom claro da mesma família da paleta). */
  corDark: string;
  ligadoPorPadrao: boolean;
}

export const TIPOS_META: TipoMeta[] = [
  {
    tipo: 'divida',
    label: 'Parcelas de dívidas',
    descricao: 'Cronograma dos financiamentos e vencimento das rotativas',
    cor: MYFINANCE_BRAND.seguranca,
    corDark: '#9DBEDC', // derivado claro de tranquilidade
    ligadoPorPadrao: true,
  },
  {
    tipo: 'provento',
    label: 'Proventos',
    descricao: 'Data-com e pagamento de dividendos, JCP e rendimentos',
    cor: MYFINANCE_BRAND.patrimonio,
    corDark: '#80BCF8', // derivado claro de outside
    ligadoPorPadrao: true,
  },
  {
    tipo: 'rf',
    label: 'Vencimentos de renda fixa',
    descricao: 'CDB, LCI, LCA, debêntures e Tesouro',
    cor: MYFINANCE_BRAND.tranquilidade,
    corDark: '#C7D9EA', // derivado claro de tranquilidade
    ligadoPorPadrao: true,
  },
  {
    tipo: 'ir',
    label: 'Imposto de renda',
    descricao: 'DARF, come-cotas e declaração (em breve)',
    cor: MYFINANCE_BRAND.potencia,
    corDark: MYFINANCE_BRAND.transparencia,
    ligadoPorPadrao: true,
  },
  {
    tipo: 'planejamento',
    label: 'Planejamento',
    descricao: 'Data-alvo dos objetivos (em breve)',
    cor: '#0056AC', // derivado escuro de outside
    corDark: '#4D9FF5', // derivado claro de outside
    ligadoPorPadrao: false,
  },
  {
    tipo: 'mercado',
    label: 'Mercado',
    descricao: 'Feriados da B3, Copom e IPCA (em breve)',
    cor: MYFINANCE_BRAND.transparencia,
    corDark: '#3A5C8F', // derivado de seguranca
    ligadoPorPadrao: false,
  },
  {
    tipo: 'manual',
    label: 'Meus eventos',
    descricao: 'O que você anotou na agenda',
    cor: MYFINANCE_BRAND.outside,
    corDark: MYFINANCE_BRAND.outside,
    ligadoPorPadrao: true,
  },
];

/** Tipos que já têm fonte no servidor (os outros aparecem na legenda como "em breve"). */
export const TIPOS_DISPONIVEIS: TipoEvento[] = ['manual', 'divida', 'provento', 'rf'];

export const STORAGE_KEY_TIPOS = 'agenda.tiposVisiveis';

export function tiposPadrao(): Set<TipoEvento> {
  return new Set(TIPOS_META.filter((t) => t.ligadoPorPadrao).map((t) => t.tipo));
}

export function lerTiposVisiveis(): Set<TipoEvento> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_TIPOS);
    if (!raw) return tiposPadrao();
    const lista = JSON.parse(raw) as unknown;
    if (!Array.isArray(lista)) return tiposPadrao();
    const validos = new Set(TIPOS_META.map((t) => t.tipo));
    return new Set(lista.filter((t): t is TipoEvento => validos.has(t as TipoEvento)));
  } catch {
    return tiposPadrao();
  }
}

export function gravarTiposVisiveis(tipos: Set<TipoEvento>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY_TIPOS, JSON.stringify([...tipos]));
  } catch {}
}

export function metaDoTipo(tipo: TipoEvento): TipoMeta {
  return TIPOS_META.find((t) => t.tipo === tipo) ?? TIPOS_META[TIPOS_META.length - 1];
}

export function corDoTipo(tipo: TipoEvento, theme: 'light' | 'dark'): string {
  const m = metaDoTipo(tipo);
  return theme === 'dark' ? m.corDark : m.cor;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Data civil de um Date LOCAL (o FullCalendar trabalha em horário local). */
export function dataCivilLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function somarDiasCivil(s: string, dias: number): string {
  const [a, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

/** Período civil da visão do FullCalendar (activeEnd é exclusivo). */
export function periodoDaVisao(activeStart: Date, activeEnd: Date): Periodo {
  return { de: dataCivilLocal(activeStart), ate: somarDiasCivil(dataCivilLocal(activeEnd), -1) };
}

export function formatarDataCivil(s: string): string {
  const [a, m, d] = s.split('-');
  return `${d}/${m}/${a}`;
}

export function eventoPago(e: EventoAgenda): boolean {
  return e.tipo === 'divida' && e.detalhe.paga === true;
}

/** EventoAgenda → evento do FullCalendar (fim exclusivo; hora vira evento com horário). */
export function paraFullCalendar(e: EventoAgenda, theme: 'light' | 'dark'): EventInput {
  const cor = corDoTipo(e.tipo, theme);
  return {
    id: e.id,
    title: e.titulo,
    start: e.hora ? `${e.data}T${e.hora}:00` : e.data,
    end: e.hora ? undefined : e.dataFim ? somarDiasCivil(e.dataFim, 1) : undefined,
    allDay: !e.hora,
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    textColor: cor,
    classNames: [
      'agenda-evento',
      `agenda-evento-${e.tipo}`,
      ...(eventoPago(e) ? ['agenda-evento-pago'] : []),
    ],
    extendedProps: { evento: e, cor },
  };
}
