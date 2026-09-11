'use client';

import React from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/modal';
import { formatBRL } from '@/utils/format';
import type { EventoAgenda } from '@/services/calendario/types';
import { corDoTipo, formatarDataCivil, metaDoTipo } from './agendaTipos';

interface Props {
  evento: EventoAgenda | null;
  theme: 'light' | 'dark';
  podeEditar: boolean;
  onClose: () => void;
  onEditar: (evento: EventoAgenda) => void;
}

const CATEGORIA_LABEL: Record<string, string> = {
  pessoal: 'Pessoal',
  pagamento: 'Pagamento',
  recebimento: 'Recebimento',
  lembrete: 'Lembrete',
};
const RECORRENCIA_LABEL: Record<string, string> = {
  nenhuma: 'Não repete',
  mensal: 'Todo mês',
  anual: 'Todo ano',
};

function rotuloDoLink(link: string): string {
  if (link.startsWith('/dividas')) return 'Abrir em Dívidas';
  if (link.startsWith('/ativos/')) return 'Abrir o ativo';
  if (link.startsWith('/carteira')) return 'Abrir a Carteira';
  if (link.startsWith('/planejamento')) return 'Abrir o Planejamento';
  return 'Abrir no app';
}

/** Linhas "rótulo: valor" específicas de cada tipo, a partir de `detalhe`. */
export function linhasDoDetalhe(e: EventoAgenda): Array<[string, string]> {
  const d = e.detalhe;
  const s = (v: unknown) => (v == null || v === '' ? null : String(v));
  const linhas: Array<[string, string | null]> = [];
  if (e.tipo === 'manual') {
    linhas.push(['Categoria', CATEGORIA_LABEL[String(d.categoria)] ?? s(d.categoria)]);
    linhas.push(['Repetição', RECORRENCIA_LABEL[String(d.recorrencia)] ?? s(d.recorrencia)]);
    if (d.ocorrencia && typeof d.dataBase === 'string') {
      linhas.push(['Primeira ocorrência', formatarDataCivil(d.dataBase)]);
    }
    linhas.push(['Lembrete', d.lembrete ? 'Sim' : 'Não']);
  } else if (e.tipo === 'divida') {
    linhas.push(['Instituição', s(d.instituicao)]);
    if (d.rotativa) {
      linhas.push(['Tipo', 'Dívida rotativa']);
    } else {
      linhas.push(['Parcela', `${d.numero} de ${d.total}`]);
      linhas.push(['Situação', d.paga ? 'Paga' : 'A pagar']);
      linhas.push(['Juros', typeof d.juros === 'number' ? formatBRL(d.juros) : null]);
      linhas.push([
        'Amortização',
        typeof d.amortizacao === 'number' ? formatBRL(d.amortizacao) : null,
      ]);
      linhas.push([
        'Saldo devedor após pagar',
        typeof d.saldoDevedor === 'number' ? formatBRL(d.saldoDevedor) : null,
      ]);
      linhas.push(['Indexador', s(d.indexador)]);
    }
  } else if (e.tipo === 'provento') {
    linhas.push(['Ativo', s(d.symbol)]);
    linhas.push(['Tipo', s(d.tipoProvento)]);
    linhas.push(['Valor bruto', typeof d.bruto === 'number' ? formatBRL(d.bruto) : null]);
    linhas.push(['Valor líquido', typeof d.liquido === 'number' ? formatBRL(d.liquido) : null]);
    linhas.push(['Data-com', typeof d.dataCom === 'string' ? formatarDataCivil(d.dataCom) : null]);
    linhas.push([
      'Pagamento',
      typeof d.dataPagamento === 'string' ? formatarDataCivil(d.dataPagamento) : null,
    ]);
    linhas.push(['Situação', d.provisionado ? 'Provisionado (ainda vai cair)' : 'Pago']);
  } else if (e.tipo === 'rf') {
    linhas.push(['Tipo', s(d.tipoTitulo)]);
    linhas.push(['Taxa', s(d.taxa)]);
    linhas.push([
      'Valor aplicado',
      typeof d.investedAmount === 'number' ? formatBRL(d.investedAmount) : null,
    ]);
    linhas.push(['Isento de IR', d.taxExempt ? 'Sim' : 'Não']);
  }
  return linhas.filter((l): l is [string, string] => l[1] != null);
}

export default function AgendaDetalheModal({
  evento,
  theme,
  podeEditar,
  onClose,
  onEditar,
}: Props) {
  if (!evento) return null;
  const meta = metaDoTipo(evento.tipo);
  const cor = corDoTipo(evento.tipo, theme);
  const quando =
    evento.dataFim && evento.dataFim !== evento.data
      ? `${formatarDataCivil(evento.data)} a ${formatarDataCivil(evento.dataFim)}`
      : `${formatarDataCivil(evento.data)}${evento.hora ? ` às ${evento.hora}` : ''}`;
  const semDia = evento.tipo === 'divida' && evento.detalhe.diaInformado === false;

  return (
    <Modal isOpen={true} onClose={onClose} className="max-w-[560px] p-6 lg:p-8">
      <div className="flex flex-col px-1">
        <span
          className="mb-2 inline-flex w-fit items-center gap-2 rounded-md px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: `${cor}22`, color: cor }}
        >
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cor }} />
          {meta.label}
        </span>
        <h5 className="text-xl font-semibold text-gray-800 dark:text-white/90">{evento.titulo}</h5>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{quando}</p>
        {evento.valor != null && (
          <p className="mt-3 text-2xl font-semibold text-gray-900 tabular-nums dark:text-white">
            {formatBRL(evento.valor)}
          </p>
        )}
        {evento.descricao && (
          <p className="mt-3 text-sm whitespace-pre-wrap text-gray-700 dark:text-gray-300">
            {evento.descricao}
          </p>
        )}
        {semDia && (
          <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            A dívida não tem o dia do vencimento cadastrado, então a parcela aparece no dia 1. O
            campo chega na próxima versão.
          </p>
        )}
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {linhasDoDetalhe(evento).map(([k, v]) => (
            <React.Fragment key={k}>
              <dt className="text-gray-500 dark:text-gray-400">{k}</dt>
              <dd className="text-gray-800 tabular-nums dark:text-gray-200">{v}</dd>
            </React.Fragment>
          ))}
        </dl>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03]"
          >
            Fechar
          </button>
          {evento.tipo === 'manual' && podeEditar && (
            <button
              type="button"
              onClick={() => onEditar(evento)}
              className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
            >
              Editar
            </button>
          )}
          {evento.link && (
            <Link
              href={evento.link}
              className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
            >
              {rotuloDoLink(evento.link)}
            </Link>
          )}
        </div>
      </div>
    </Modal>
  );
}
