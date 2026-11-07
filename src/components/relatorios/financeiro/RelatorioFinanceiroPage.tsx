'use client';

import './relatorio-financeiro.css';
import { useCallback, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Button from '@/components/ui/button/Button';
import { useRelatorioFinanceiro } from '@/hooks/useRelatorioFinanceiro';
import {
  MESES_RELATORIO,
  type MesesRelatorio,
  type RelatorioFinanceiro,
} from '@/types/relatorioFinanceiro';
import { classeFontesRelatorio } from './fontes';
import { FormatoProvider } from './FormatoProvider';
import { SeletorPeriodo } from './SeletorPeriodo';
import { Capa } from './secoes/Capa';
import { SecaoResumo } from './secoes/SecaoResumo';
import { SecaoOrcamento } from './secoes/SecaoOrcamento';
import { SecaoDividas } from './secoes/SecaoDividas';
import { SecaoCarteira } from './secoes/SecaoCarteira';
import { SecaoPlanejamento } from './secoes/SecaoPlanejamento';
import { SecaoSonhos } from './secoes/SecaoSonhos';
import { SecaoSaude } from './secoes/SecaoSaude';
import { SecaoIr } from './secoes/SecaoIr';
import { SecaoComoLer } from './secoes/SecaoComoLer';

/** ?meses=N da URL (padrão 1; valor fora da lista = 1). */
export function mesesDaUrl(v: string | null | undefined): MesesRelatorio {
  const n = Number(v);
  return (MESES_RELATORIO as readonly number[]).includes(n) ? (n as MesesRelatorio) : 1;
}

/** O documento (capa + seções 1–9, ordem fixa), dentro de .doc. */
export function DocumentoRelatorio({ relatorio }: { relatorio: RelatorioFinanceiro }) {
  return (
    <FormatoProvider>
      <main className="doc" data-relatorio-plano={relatorio.plano}>
        <Capa relatorio={relatorio} />
        <SecaoResumo relatorio={relatorio} />
        <SecaoOrcamento relatorio={relatorio} />
        <SecaoDividas relatorio={relatorio} />
        <SecaoCarteira relatorio={relatorio} />
        <SecaoPlanejamento relatorio={relatorio} />
        <SecaoSonhos relatorio={relatorio} />
        <SecaoSaude relatorio={relatorio} />
        <SecaoIr relatorio={relatorio} />
        <SecaoComoLer relatorio={relatorio} />
      </main>
    </FormatoProvider>
  );
}

/** Esqueleto: a capa e duas folhas em branco, enquanto o servidor monta o relatório. */
function Esqueleto() {
  const barra = (largura: string, altura = 12) => (
    <div
      className="animate-pulse motion-reduce:animate-none"
      style={{ width: largura, height: altura, borderRadius: 6, background: '#e3e9f1' }}
    />
  );
  return (
    <main className="doc" aria-busy="true">
      <p className="sr-only" role="status">
        Gerando o relatório financeiro…
      </p>
      <section className="cover" style={{ minHeight: 320 }} aria-hidden="true" />
      {[0, 1].map((i) => (
        <section key={i} className="page" style={{ minHeight: 480 }} aria-hidden="true">
          {barra('40%', 24)}
          <div className="kpis">
            {[0, 1, 2, 3].map((k) => (
              <div key={k} className="kpi">
                {barra('60%')}
                {barra('80%', 20)}
              </div>
            ))}
          </div>
          {barra('100%', 160)}
        </section>
      ))}
    </main>
  );
}

function Erro({ mensagem, onTentar }: { mensagem: string; onTentar: () => void }) {
  return (
    <main className="doc">
      <section className="page" role="alert">
        <div className="callout warn">
          Não foi possível gerar o relatório agora ({mensagem}).{' '}
          <button
            type="button"
            onClick={onTentar}
            style={{
              font: 'inherit',
              fontWeight: 600,
              color: 'inherit',
              textDecoration: 'underline',
              background: 'none',
              border: 0,
              padding: 0,
              cursor: 'pointer',
            }}
          >
            Tentar de novo
          </button>
        </div>
      </section>
    </main>
  );
}

export interface RelatorioFinanceiroPageProps {
  /**
   * Modo demonstração (?fixture=exemplo&plano=…): o relatório de exemplo do Pedro, montado no
   * servidor (page.tsx) com o cadeado aplicado. null = dados reais pela API.
   */
  demonstracao?: RelatorioFinanceiro | null;
}

/**
 * Relatório financeiro (/relatorios/financeiro): a barra do app (período e Baixar PDF, fora do
 * documento e do PDF) e o documento do Pedro dentro de .mf-rel. O período mora na URL
 * (?meses=1|3|6|12) para compartilhar e recarregar.
 */
export default function RelatorioFinanceiroPage({
  demonstracao = null,
}: RelatorioFinanceiroPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [trocando, startTransition] = useTransition();
  const meses = mesesDaUrl(searchParams.get('meses'));
  const demo = demonstracao != null;

  const query = useRelatorioFinanceiro(meses, { enabled: !demo });
  const relatorio = demo ? demonstracao : (query.data ?? null);
  const carregando = demo ? trocando : query.isFetching;

  const trocarPeriodo = useCallback(
    (m: MesesRelatorio) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('meses', String(m));
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  const baixarPdf = useCallback(() => window.print(), []);

  return (
    <div>
      {/* Desktop: fixa no topo ao rolar, para trocar o período sem voltar ao começo (Pedro, 07/11).
          No celular fica como antes (a barra quebra em duas linhas e tomaria a tela). */}
      <div
        className="print-hidden mb-4 flex flex-wrap items-center justify-between gap-3 lg:sticky lg:top-0 lg:z-20 lg:-mx-6 lg:border-b lg:border-gray-200 lg:bg-gray-50/95 lg:px-6 lg:py-2 lg:backdrop-blur lg:dark:border-gray-800 lg:dark:bg-gray-900/95"
        data-relatorio-barra=""
      >
        <div className="flex flex-wrap items-center gap-3">
          <SeletorPeriodo valor={meses} onChange={trocarPeriodo} />
          {carregando && relatorio ? (
            <span className="text-sm text-gray-500 dark:text-gray-400" role="status">
              Atualizando…
            </span>
          ) : null}
          {demo ? (
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              Modo demonstração · dados de exemplo
            </span>
          ) : null}
        </div>
        <Button size="sm" onClick={baixarPdf} disabled={!relatorio}>
          Baixar PDF
        </Button>
      </div>
      <div
        className={`mf-rel ${classeFontesRelatorio} -mx-4 md:-mx-6 print:m-0`}
        data-relatorio-financeiro=""
      >
        {relatorio ? (
          <DocumentoRelatorio relatorio={relatorio} />
        ) : query.isError ? (
          <Erro mensagem={query.error.message} onTentar={() => void query.refetch()} />
        ) : (
          <Esqueleto />
        )}
      </div>
    </div>
  );
}
