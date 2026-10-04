'use client';

import Link from 'next/link';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import Button from '@/components/ui/button/Button';
import { useAdminOverview } from '@/hooks/useAdminOverview';
import BlocoUsuarios from './BlocoUsuarios';
import BlocoUso from './BlocoUso';
import BlocoAssistente from './BlocoAssistente';
import BlocoSistema from './BlocoSistema';
import { Bloco, Grade, Stat, fmtInt } from './shared';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import { ROTAS_CURADORIA } from '@/services/analiseAtivos/curadoria/contrato';
import type { AdminOverview } from '@/hooks/useAdminOverview';

const T_CARD = TEXTOS_TELA.curadoria.cardAdmin;

/**
 * Card "Curadoria de dados" (Análise de Ativos, bloco C): pendências com usuário, prazos e casos em
 * conferência, com link para a fila. O /admin continua só leitura; decidir é na fila.
 */
function BlocoCuradoria({ dados }: { dados: NonNullable<AdminOverview['curadoria']> }) {
  return (
    <Bloco
      titulo={T_CARD.titulo}
      descricao={TEXTOS_TELA.curadoria.sub}
      acao={
        <Link
          href={ROTAS_CURADORIA.fila}
          className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-[#396CAA] hover:bg-gray-50 dark:border-gray-700 dark:text-[#6E9DC4] dark:hover:bg-white/[0.03]"
        >
          {T_CARD.abrir}
        </Link>
      }
    >
      <Grade colunas={3}>
        <Stat rotulo={T_CARD.abertos} valor={fmtInt(dados.abertos)} />
        <Stat
          rotulo={T_CARD.vencendo}
          valor={fmtInt(dados.vencendo)}
          detalhe={
            dados.vencidos > 0
              ? `${fmtInt(dados.vencidos)} ${TEXTOS_TELA.curadoria.contadores.vencidos.toLowerCase()}`
              : undefined
          }
        />
        <Stat rotulo={T_CARD.emConferencia} valor={fmtInt(dados.emConferencia)} />
      </Grade>
    </Bloco>
  );
}

/**
 * Painel administrativo (11/09/2026) — só leitura, role admin. Quatro blocos:
 * Usuários, Uso por funcionalidade, Assistente de IA, Sistema.
 */
export default function AdminOverviewPage() {
  const { data, loading, isFetching, error, forbidden, refetch, atualizadoEm } = useAdminOverview();

  if (loading) {
    return <LoadingSpinner size="lg" text="Consolidando métricas..." />;
  }

  if (forbidden) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
        Esta área é restrita a administradores.
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
        {error ?? 'Não foi possível carregar o painel.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Visão somente leitura. Dados consolidados em{' '}
          {new Date(data.geradoEm).toLocaleString('pt-BR')}
          {atualizadoEm && isFetching ? ' · atualizando…' : ''}
        </p>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          Atualizar
        </Button>
      </div>
      {data.curadoria && <BlocoCuradoria dados={data.curadoria} />}
      <BlocoUsuarios dados={data.usuarios} />
      <BlocoUso dados={data.uso} />
      <BlocoAssistente dados={data.assistente} />
      <BlocoSistema dados={data.sistema} />
    </div>
  );
}
