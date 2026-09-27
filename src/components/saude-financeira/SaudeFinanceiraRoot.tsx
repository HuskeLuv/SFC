'use client';

import Link from 'next/link';
import { useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import Button from '@/components/ui/button/Button';
import { useAuth } from '@/hooks/useAuth';
import { useSaudeFinanceira, useSaudeFinanceiraEvolucao } from '@/hooks/useSaudeFinanceira';
import { useSeguros } from '@/hooks/useSeguros';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { MobileCollapsible } from '@/components/ui/mobile/MobileCollapsible';
import { MobileActionSheet, MobileMoreButton } from '@/components/ui/sheet/MobileActionSheet';
import { MONTH_NAMES_PT, STATUS_META, formatBRL, formatPercent } from './utils';
import SaudeSkeleton from './mobile/SaudeSkeleton';
import StatusHero from './StatusHero';
import ClienteHeader from './ClienteHeader';
import DadosEconomicos from './DadosEconomicos';
import FluxoCards from './FluxoCards';
import MetasPatrimoniais from './MetasPatrimoniais';
import BalancoPatrimonial from './BalancoPatrimonial';
import EvolucaoChart from './EvolucaoChart';
import GestaoRisco from './GestaoRisco';

/**
 * Abre (pelo DOM, de forma síncrona) os blocos recolhidos do celular dentro de `root` antes de
 * imprimir. O CSS já imprime o conteúdo fechado (`mscreen:hidden` não vale na impressão); isto só
 * garante que a tela volte com o que foi impresso aberto. PWA fase 3.
 */
function abrirBlocosRecolhidos(root: HTMLElement | null) {
  if (!root) return;
  const fechados = root.querySelectorAll<HTMLButtonElement>(
    'button[data-mf-mobile][aria-expanded="false"][aria-controls]',
  );
  if (fechados.length === 0) return;
  flushSync(() => fechados.forEach((b) => b.click()));
}

/** Resumo do bloco de seguros no celular ("n seguros"); só montado no ramo mobile. */
function SegurosResumo() {
  const { seguros, loading } = useSeguros();
  if (loading) return null;
  return <>{seguros.length === 1 ? '1 seguro' : `${seguros.length} seguros`}</>;
}

/** Resumo do bloco de evolução no celular (mês da última foto); só montado no ramo mobile. */
function EvolucaoResumo() {
  const { snapshots } = useSaudeFinanceiraEvolucao();
  const ultimo = snapshots[snapshots.length - 1];
  if (!ultimo) return null;
  return (
    <>{`${MONTH_NAMES_PT[ultimo.month] ?? ultimo.month + 1}/${String(ultimo.year).slice(-2)}`}</>
  );
}

/**
 * Container raiz da Saúde Financeira: diagnóstico live derivado de carteira +
 * fluxo de caixa + dívidas (metodologia da planilha "Saúde Financeira Após
 * Recomendações" — ver docs/plano-saude-financeira-ago2026.md).
 */
export default function SaudeFinanceiraRoot() {
  const { data, loading, error } = useSaudeFinanceira();
  const { user, actingClient } = useAuth();
  const isBelowLg = useIsBelowLg();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [menuAberto, setMenuAberto] = useState(false);
  const [configurandoMetas, setConfigurandoMetas] = useState(false);

  if (loading) {
    return isBelowLg ? (
      <SaudeSkeleton />
    ) : (
      <LoadingSpinner size="lg" text="Calculando sua saúde financeira..." />
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
        {error ?? 'Não foi possível carregar o diagnóstico.'}
      </div>
    );
  }

  const { indicadores, fontes, composicao, tendencias } = data;
  const semFluxo = fontes.cashflow.activeMonths === 0;

  const nomeCliente = actingClient?.name ?? user?.name ?? '';

  const exportarPdf = () => {
    abrirBlocosRecolhidos(rootRef.current);
    window.print();
  };

  // Celular: blocos recolhíveis (fechados). Desktop: o bloco como hoje, sem nenhum invólucro.
  const bloco = (id: string, title: string, summary: ReactNode, children: ReactNode) =>
    isBelowLg ? (
      <MobileCollapsible id={id} title={title} summary={summary}>
        {children}
      </MobileCollapsible>
    ) : (
      children
    );

  // Celular: o Status sobe para o topo (depois do título e do aviso) só na TELA — `mscreen:` não
  // vale na impressão, que segue a ordem da planilha em qualquer aparelho.
  const topo = isBelowLg ? ' mscreen:order-first' : '';

  return (
    <div
      ref={rootRef}
      className={`space-y-6${
        isBelowLg ? ' mscreen:flex mscreen:flex-col mscreen:gap-4 mscreen:space-y-0' : ''
      }`}
    >
      {/* Cabeçalho de relatório — só aparece na impressão/PDF */}
      <div className="hidden print:block">
        <h1 className="text-xl font-bold text-gray-900">Relatório de Saúde Financeira</h1>
        <p className="mt-1 text-sm text-gray-600">
          {nomeCliente ? `${nomeCliente} · ` : ''}
          {new Date(data.asOf).toLocaleDateString('pt-BR')} · Status:{' '}
          {STATUS_META[indicadores.status.codigo].label}
        </p>
      </div>

      <div
        className={`flex items-start justify-between gap-3 print:hidden${
          isBelowLg ? `${topo} mscreen:items-center` : ''
        }`}
      >
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white/90">
            Saúde Financeira
          </h2>
          <p
            className={`mt-0.5 text-sm text-gray-500 dark:text-gray-400${
              isBelowLg ? ' mscreen:hidden' : ''
            }`}
          >
            Diagnóstico calculado com seus dados de carteira, fluxo de caixa e dívidas.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={exportarPdf}
          className={isBelowLg ? 'mscreen:hidden' : ''}
        >
          Exportar PDF
        </Button>
        {isBelowLg ? (
          <div className="hidden mscreen:flex">
            <MobileMoreButton
              onClick={() => setMenuAberto(true)}
              label="Mais ações da Saúde Financeira"
            />
          </div>
        ) : null}
      </div>
      {isBelowLg ? (
        <MobileActionSheet
          isOpen={menuAberto}
          onClose={() => setMenuAberto(false)}
          title="Saúde Financeira"
          actions={[
            { id: 'pdf', label: 'Exportar PDF', onSelect: exportarPdf },
            {
              id: 'metas',
              label: 'Configurar metas',
              onSelect: () => {
                setConfigurandoMetas(true);
                // O formulário de hoje (MetasConfigForm) abre dentro do bloco de metas.
                requestAnimationFrame(() =>
                  document
                    .getElementById('cfg-reserva')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
                );
              },
            },
          ]}
        />
      ) : null}

      {semFluxo ? (
        <div
          className={`rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300 print:hidden${topo}`}
        >
          Seu fluxo de caixa ainda não tem lançamentos — os indicadores de renda, gasto e as metas
          patrimoniais dependem dele. Preencha o Fluxo de Caixa para um diagnóstico completo.
          {isBelowLg ? (
            <span data-mf-mobile="" className="hidden mscreen:inline">
              {' '}
              <Link
                href="/fluxodecaixa"
                className="font-semibold text-[#396CAA] underline underline-offset-2 dark:text-[#6E9DC4]"
              >
                Abrir o Fluxo de Caixa
              </Link>
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Ordem das seções segue a aba "Saúde Financeira" da planilha-base. */}
      <ClienteHeader nome={nomeCliente} fontes={fontes} asOf={data.asOf} />
      {bloco(
        'saude-bloco-dados',
        'Dados Econômicos',
        indicadores.economia.ganhoRealAA != null
          ? `ganho real ${formatPercent(indicadores.economia.ganhoRealAA)}`
          : null,
        <DadosEconomicos indicadores={indicadores} />,
      )}
      <FluxoCards
        indicadores={indicadores}
        tendencias={tendencias}
        cashflowYear={fontes.cashflow.year}
      />
      {isBelowLg ? (
        <MetasPatrimoniais
          indicadores={indicadores}
          idade={fontes.idade}
          config={data.config}
          configurando={configurandoMetas}
          onConfigurandoChange={setConfigurandoMetas}
        />
      ) : (
        <MetasPatrimoniais indicadores={indicadores} idade={fontes.idade} config={data.config} />
      )}
      {bloco(
        'saude-bloco-balanco',
        'Balanço Patrimonial',
        `PL ${formatBRL(indicadores.balanco.patrimonioLiquido)}`,
        <BalancoPatrimonial
          indicadores={indicadores}
          composicao={composicao}
          tendencias={tendencias}
        />,
      )}
      <StatusHero indicadores={indicadores} tendencias={tendencias} className={topo || undefined} />
      {bloco('saude-bloco-evolucao', 'Evolução', <EvolucaoResumo />, <EvolucaoChart />)}
      {/* Aba 2 da planilha (seguros). Saiu no PR #87 (escopo aba 1) e voltou em
          02/09/2026 a pedido do QA — o cadastro de apólices não tinha nenhuma
          porta de entrada na UI. */}
      {bloco(
        'saude-bloco-seguros',
        'Gestão de Risco (seguros)',
        <SegurosResumo />,
        <GestaoRisco />,
      )}
    </div>
  );
}
