'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import type { ResultadoIrpfAnual } from '@/services/ir/irpfAnual';
import { useCriarEvento } from '@/hooks/useAgenda';
import { requestQuickLaunch } from '@/layout/mobile/quickLaunch';
import { copiarTexto } from '@/components/analiseAtivos/comparador/BotaoCopiarLink';
import {
  htmlResumoDaa,
  lembreteAporte,
  textoLancamentos,
  type DadosResumoPgbl,
} from './pgblResumo';

/**
 * Botões da aba PGBL (HTML do Pedro, 86e2xnyrg): "Registrar aporte" e "Criar lembrete" na barra do
 * espaço de dedução; "Exportar resumo para a DAA (PDF)" e "Copiar lançamentos" em "Onde lançar".
 */

const BOTAO =
  'rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-mf-patrimonio hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 max-lg:min-h-11 dark:border-gray-700 dark:bg-gray-900 dark:text-mf-tranquilidade dark:hover:bg-white/5';
const BOTAO_PRIMARIO =
  'rounded-lg bg-mf-outside px-3 py-1.5 text-sm font-medium text-white hover:bg-mf-patrimonio disabled:cursor-not-allowed disabled:opacity-50 max-lg:min-h-11';
const AVISO = 'text-xs text-gray-600 dark:text-gray-300';

const dataBr = (iso: string) => iso.split('-').reverse().join('/');

export function AcoesAporte({
  ano,
  r,
  temRenda,
}: {
  ano: number;
  r: ResultadoIrpfAnual;
  temRenda: boolean;
}) {
  const criar = useCriarEvento();
  const [criadoEm, setCriadoEm] = useState<string | null>(null);

  const criarLembrete = () => {
    const evento = lembreteAporte(ano, r, new Date());
    criar.mutate(evento, { onSuccess: () => setCriadoEm(evento.data) });
  };

  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap gap-2">
        {/* Abre o lançamento da Carteira aqui mesmo (Aporte → Previdência e Seguros). */}
        <button
          type="button"
          className={BOTAO_PRIMARIO}
          onClick={() => requestQuickLaunch('novo-ativo')}
        >
          Registrar aporte
        </button>
        <button
          type="button"
          className={BOTAO}
          onClick={criarLembrete}
          disabled={!temRenda || criar.isPending || criadoEm !== null}
          title={temRenda ? undefined : 'Informe a renda para calcular o espaço que falta'}
        >
          {criar.isPending ? 'Criando…' : 'Criar lembrete'}
        </button>
      </div>
      {criadoEm && (
        <p className={AVISO} role="status">
          Lembrete criado na Agenda para {dataBr(criadoEm)}, com aviso na véspera.{' '}
          <Link href="/calendario" className="font-medium text-mf-outside hover:underline">
            Ver na Agenda
          </Link>
        </p>
      )}
      {criar.isError && (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          Não deu para criar o lembrete: {criar.error.message}
        </p>
      )}
    </div>
  );
}

type Status = { tipo: 'ok' | 'erro'; texto: string } | null;

export function AcoesExportar({ dados, temRenda }: { dados: DadosResumoPgbl; temRenda: boolean }) {
  const [status, setStatus] = useState<Status>(null);

  const exportarPdf = () => {
    const janela = window.open('', '_blank');
    if (!janela) {
      setStatus({
        tipo: 'erro',
        texto: 'O navegador bloqueou a janela. Permita pop-ups e tente de novo.',
      });
      return;
    }
    janela.document.open();
    janela.document.write(htmlResumoDaa(dados, new Date()));
    janela.document.close();
    janela.focus();
    // Dá tempo de o navegador montar a página antes da caixa de impressão ("Salvar como PDF").
    window.setTimeout(() => janela.print(), 300);
    setStatus({ tipo: 'ok', texto: 'Na janela de impressão, escolha “Salvar como PDF”.' });
  };

  const copiar = async () => {
    const ok = await copiarTexto(textoLancamentos(dados));
    setStatus(
      ok
        ? { tipo: 'ok', texto: 'Lançamentos copiados. Cole numa nota para usar na declaração.' }
        : { tipo: 'erro', texto: 'Não deu para copiar neste navegador.' },
    );
  };

  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BOTAO} onClick={exportarPdf} disabled={!temRenda}>
          Exportar resumo para a DAA (PDF)
        </button>
        <button type="button" className={BOTAO} onClick={copiar} disabled={!temRenda}>
          Copiar lançamentos
        </button>
      </div>
      {!temRenda && <p className={AVISO}>Informe a renda acima para exportar o resumo.</p>}
      {status && (
        <p
          className={status.tipo === 'ok' ? AVISO : 'text-xs text-red-600 dark:text-red-400'}
          role={status.tipo === 'ok' ? 'status' : 'alert'}
        >
          {status.texto}
        </p>
      )}
    </div>
  );
}
