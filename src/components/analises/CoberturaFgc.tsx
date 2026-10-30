'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import {
  useCoberturaFgc,
  type AssetFgcInfo,
  type AvisoConglomerado,
  type InstitutionFgcGroup,
} from '@/hooks/useCoberturaFgc';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import Tooltip from '@/components/ui/tooltip/Tooltip';
import {
  TABLE_STYLES,
  TABLE_HEADER_STYLE,
  TABLE_MOBILE_STYLES,
} from '@/components/ui/table/tableStyles';
import { ResponsiveCardList } from '@/components/ui/table/ResponsiveTable';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import type { SemCoberturaFgc } from '@/services/analises/semCoberturaFgc';
import { rotuloCnpj } from '@/lib/instituicoes/cnpj';

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function ProgressBar({ percent, color }: { percent: number; color: string }) {
  const clamped = Math.min(percent, 100);
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${clamped}%`, backgroundColor: color }}
      />
    </div>
  );
}

function getBarColor(percent: number): string {
  if (percent >= 100) return '#EF4444'; // red — over limit
  if (percent >= 80) return '#F59E0B'; // amber — approaching limit
  return '#10B981'; // green — safe
}

/**
 * Bug #12: explicação do FGC para a coluna "Não coberto" e cards do resumo.
 * Texto exibido em title= (tooltip nativo) e em <abbr> próximos ao "ⓘ".
 */
export const FGC_NAO_COBERTO_TOOLTIP =
  'CRI, CRA, debêntures não-incentivadas, LF, Tesouro Direto e fundos de investimento são explicitamente excluídos do FGC. Em caso de inadimplência do emissor, o capital não é ressarcido pelo Fundo Garantidor.';

export interface StatusLabel {
  text: string;
  className: string;
  tooltip?: string;
}

export function getStatusLabel(
  percent: number,
  totalCoberto: number,
  totalNaoCoberto: number,
): StatusLabel {
  // Bug #12: quando a instituição só tem produtos fora do FGC (CRI/CRA/debêntures
  // não-incentivadas/LF), totalCoberto=0 e percentualUtilizado=0. A função
  // antiga caía no fallback "Dentro do limite" (verde), passando a falsa
  // impressão de proteção. Detectar esse caso e mostrar "Sem cobertura FGC".
  if (totalCoberto === 0 && totalNaoCoberto > 0) {
    return {
      text: 'Sem cobertura FGC',
      className: 'text-red-600 dark:text-red-400',
      tooltip:
        'Esta instituição possui apenas produtos que não são protegidos pelo FGC (CRI, CRA, debêntures não-incentivadas, LF). Em caso de inadimplência do emissor, o investidor não recupera o capital via FGC.',
    };
  }
  if (percent >= 100)
    return { text: 'Limite excedido', className: 'text-red-600 dark:text-red-400' };
  if (percent >= 80) return { text: 'Atenção', className: 'text-amber-600 dark:text-amber-400' };
  return { text: 'Dentro do limite', className: 'text-emerald-600 dark:text-emerald-400' };
}

// ── Emissor (ClickUp 86e2xqh69) ─────────────────────────────────────────────────────────────

/** Chave estável do grupo (respostas antigas sem `chave` caem no CNPJ/id, como antes). */
export function chaveDoGrupo(
  inst: Pick<InstitutionFgcGroup, 'chave' | 'cnpj' | 'instituicaoId'>,
): string {
  return inst.chave || inst.cnpj || inst.instituicaoId;
}

/**
 * O ativo pede o emissor? Só quando a edição aceita emissor (há link) e o limite está vindo da
 * corretora, de lugar nenhum ou de um emissor gravado que é corretora.
 */
export function pedeEmissor(
  ativo: Pick<AssetFgcInfo, 'editarEmissorHref' | 'fonteInstituicao'>,
): boolean {
  return (
    Boolean(ativo.editarEmissorHref) &&
    (ativo.fonteInstituicao === 'corretora' ||
      ativo.fonteInstituicao === 'desconhecida' ||
      ativo.fonteInstituicao === 'emissor-nao-emissor')
  );
}

/** Grupo sem emissor identificado (nem emissor nem corretora). */
export function ehGrupoDesconhecido(
  inst: Pick<InstitutionFgcGroup, 'chave' | 'instituicaoId'>,
): boolean {
  return (inst.chave || inst.instituicaoId) === 'desconhecida';
}

/** Grupo que está usando a corretora no lugar do emissor (borda tracejada). */
export function grupoUsaCorretora(
  inst: Pick<InstitutionFgcGroup, 'usaCorretoraComoEmissor' | 'ativosSemEmissor'>,
): boolean {
  return Boolean(inst.usaCorretoraComoEmissor) && (inst.ativosSemEmissor ?? 0) > 0;
}

/** 2ª linha do cabeçalho: 'CNPJ 33.264.668 · via BTG Pactual e XP Investimentos'. */
export function linhaViaGrupo(inst: InstitutionFgcGroup): string {
  const corretoras = (inst.corretoras ?? []).map((c) => c.nome);
  const via = corretoras.length > 0 ? `via ${corretoras.join(' e ')}` : null;
  const cnpj = ehGrupoDesconhecido(inst)
    ? 'Sem CNPJ do emissor'
    : rotuloCnpj({ cnpj: inst.cnpj, cnpjCalculado: inst.cnpjCalculado });
  const prefixo = grupoUsaCorretora(inst) && !inst.titularNaoEmissor ? 'Corretora' : null;
  return [prefixo, cnpj, via].filter(Boolean).join(' · ');
}

/** 'R$ 60.730,00 acima do limite FGC, somando 2 títulos de 2 corretoras'. */
export function textoExcedente(inst: InstitutionFgcGroup): string {
  const base = `${formatBRL(inst.excedente)} acima do limite FGC`;
  const nCorretoras = inst.corretoras?.length ?? 0;
  if (nCorretoras <= 1) return base;
  const n = inst.ativos.length;
  return `${base}, somando ${n} ${n === 1 ? 'título' : 'títulos'} de ${nCorretoras} corretoras`;
}

export type PillGrupo =
  | 'usando-corretora'
  | 'confira-emissor'
  | 'emissor-a-confirmar'
  | 'open-finance'
  | 'conglomerado';

/** Pills do cabeçalho do grupo, na ordem em que aparecem. */
export function pillsDoGrupo(
  inst: InstitutionFgcGroup,
  avisos: AvisoConglomerado[] = [],
): PillGrupo[] {
  const pills: PillGrupo[] = [];
  if (grupoUsaCorretora(inst)) pills.push('usando-corretora');
  if (inst.titularNaoEmissor) pills.push('confira-emissor');
  if (ehGrupoDesconhecido(inst) && inst.ativos.some(pedeEmissor)) {
    pills.push('emissor-a-confirmar');
  }
  if (inst.temOpenFinance) pills.push('open-finance');
  const chave = chaveDoGrupo(inst);
  if (avisos.some((a) => a.chaves.includes(chave))) pills.push('conglomerado');
  return pills;
}

/** Nota abaixo do cabeçalho (com o botão 'Informar emissor'); null quando não há o que pedir. */
export function notaDoGrupo(inst: InstitutionFgcGroup): string | null {
  const pendentes = inst.ativos.filter(pedeEmissor).length;
  if (pendentes === 0) return null;
  if (inst.titularNaoEmissor) {
    return `${inst.instituicaoNome} é corretora ou instituição de pagamento e não emite títulos. Informe o banco que emitiu o título.`;
  }
  if (ehGrupoDesconhecido(inst) && inst.ativos.some((a) => a.emissorInformadoTexto)) {
    return 'Não reconhecemos o banco que veio do Open Finance.';
  }
  return `Emissor não informado em ${pendentes} ${pendentes === 1 ? 'investimento' : 'investimentos'}.`;
}

const PILL_BASE =
  'inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-medium leading-4';
const PILL_AMBAR =
  'border-[#B45309]/30 bg-[#B45309]/[0.07] text-[#B45309] dark:border-[#FBBF24]/30 dark:bg-[#FBBF24]/[0.07] dark:text-[#FBBF24]';
const PILL_CLASS: Record<PillGrupo, string> = {
  'usando-corretora':
    'border-dashed border-gray-400 bg-transparent text-gray-600 dark:border-gray-500 dark:text-gray-400',
  'confira-emissor': PILL_AMBAR,
  'emissor-a-confirmar': PILL_AMBAR,
  'open-finance':
    'border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-transparent dark:text-gray-400',
  conglomerado:
    'border-[#DCE6F2] bg-[#EDF2F8] text-[#314666] dark:border-gray-700 dark:bg-white/5 dark:text-gray-300',
};
const PILL_TEXTO: Record<PillGrupo, string> = {
  'usando-corretora': 'Usando a corretora',
  'confira-emissor': 'Confira o banco emissor',
  'emissor-a-confirmar': 'Emissor a confirmar',
  'open-finance': 'Open Finance',
  conglomerado: 'Mesmo grupo financeiro',
};
export const TOOLTIP_CONFIRA_EMISSOR =
  'Corretoras normalmente não emitem títulos. Informe o banco emissor para o limite do FGC ficar certo.';

function Pill({ tipo }: { tipo: PillGrupo }) {
  const pill = (
    <span data-fgc-pill={tipo} className={`${PILL_BASE} ${PILL_CLASS[tipo]}`}>
      {PILL_TEXTO[tipo]}
    </span>
  );
  if (tipo === 'confira-emissor') {
    return <Tooltip content={TOOLTIP_CONFIRA_EMISSOR}>{pill}</Tooltip>;
  }
  return pill;
}

/** Link de 44px que leva à edição do ativo com o seletor de emissor aberto. */
const LINK_EMISSOR =
  'inline-flex min-h-11 items-center rounded-lg px-1 text-[13px] font-medium text-mf-patrimonio hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mf-outside dark:text-mf-tranquilidade';

function LinkInformarEmissor({ href, className = '' }: { href: string; className?: string }) {
  return (
    <Link href={href} data-fgc-informar-emissor="" className={`${LINK_EMISSOR} ${className}`}>
      Informar emissor
    </Link>
  );
}

/** 'O Open Finance informou "ARBI".' quando o emissor recebido não casou com o catálogo. */
function TextoOpenFinance({ ativo }: { ativo: AssetFgcInfo }) {
  if (!ativo.emissorInformadoTexto) return null;
  return (
    <span className="mt-0.5 block text-xs font-normal text-gray-500 dark:text-gray-400">
      O Open Finance informou &ldquo;{ativo.emissorInformadoTexto}&rdquo;.
    </span>
  );
}

function PillOpenFinanceAtivo({ ativo }: { ativo: AssetFgcInfo }) {
  if (ativo.origem !== 'openFinance') return null;
  return (
    <span className={`${PILL_BASE} ${PILL_CLASS['open-finance']} ml-1.5 align-middle`}>
      Open Finance
    </span>
  );
}

/** Célula FGC do ativo no cartão do celular. */
function statusFgcCurto(ativo: AssetFgcInfo, inst: InstitutionFgcGroup): React.ReactNode {
  if (ativo.coberto && inst.excedente > 0) {
    return <span className="text-[#B45309] dark:text-amber-300">Parcial</span>;
  }
  if (ativo.coberto && ativo.fonteInstituicao === 'corretora') {
    return (
      <span>
        Coberto
        <span className="block text-xs font-normal text-gray-500 dark:text-gray-400">
          pela corretora
        </span>
      </span>
    );
  }
  if (ativo.coberto) return 'Coberto';
  return <span className="text-gray-500 dark:text-gray-400">Não coberto</span>;
}

/** Aviso de bancos do mesmo conglomerado (não muda os números: o limite segue por emissor). */
function AvisosConglomerado({
  avisos,
  instituicoes,
  limite,
}: {
  avisos: AvisoConglomerado[];
  instituicoes: InstitutionFgcGroup[];
  limite: number;
}) {
  if (avisos.length === 0) return null;
  return (
    <>
      {avisos.map((a) => {
        const total = instituicoes
          .filter((g) => a.chaves.includes(chaveDoGrupo(g)))
          .reduce((s, g) => s + g.totalCoberto, 0);
        const acima = Math.max(0, total - limite);
        const nomes =
          a.nomes.length > 1
            ? `${a.nomes.slice(0, -1).join(', ')} e ${a.nomes[a.nomes.length - 1]}`
            : a.nomes.join('');
        return (
          <div
            key={a.conglomerado}
            role="note"
            data-fgc-aviso-conglomerado=""
            className="flex items-start gap-2.5 rounded-[10px] border border-[#B45309]/30 bg-[#B45309]/[0.07] px-3 py-2.5 text-[13px] text-gray-700 dark:border-[#FBBF24]/30 dark:bg-[#FBBF24]/[0.07] dark:text-gray-200"
          >
            <svg
              className="mt-px shrink-0 text-[#B45309] dark:text-[#FBBF24]"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            </svg>
            <span>
              <strong className="font-semibold">{nomes} são do mesmo grupo financeiro:</strong> para
              o FGC, o limite de R$ 250 mil pode ser um só. Juntos somam {formatBRL(total)}
              {acima > 0 ? `, ${formatBRL(acima)} acima do limite` : ''}.
            </span>
          </div>
        );
      })}
    </>
  );
}

export default function CoberturaFgc() {
  const { data, loading, error } = useCoberturaFgc();
  const isBelowLg = useIsBelowLg();
  const [expandedInstitutions, setExpandedInstitutions] = useState<Set<string>>(new Set());

  if (loading) {
    return <LoadingSpinner text="Carregando dados de cobertura FGC..." />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-16">
        <div className="text-center">
          <h3 className="mb-2 text-lg font-semibold text-red-600 dark:text-red-400">
            Erro ao carregar dados
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  const temRendaFixa = (data?.instituicoes.length ?? 0) > 0;
  const temForaDoFgc = (data?.semCobertura?.classes.length ?? 0) > 0;

  if (!data || (!temRendaFixa && !temForaDoFgc)) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-16">
        <svg
          className="text-gray-300 dark:text-gray-600"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
            Nenhum investimento encontrado
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Adicione investimentos para visualizar a cobertura do FGC.
          </p>
        </div>
      </div>
    );
  }

  const { resumo, instituicoes } = data;

  const toggleInstitution = (key: string) => {
    setExpandedInstitutions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const openInstitution = (key: string) => {
    setExpandedInstitutions((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  };

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-900/20">
        <div className="flex items-start gap-3">
          <svg
            className="mt-0.5 shrink-0 text-blue-500 dark:text-blue-400"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <p className="font-medium">O que o FGC cobre?</p>
            <p className="mt-1 text-blue-700 dark:text-blue-300">
              O FGC garante até <strong>R$ 250 mil</strong> por CPF em cada banco emissor, não na
              corretora. O limite vale por banco emissor (mesmo CNPJ), com teto global de{' '}
              <strong>{formatBRL(resumo.limiteGlobal)}</strong> a cada 4 anos. Bancos do mesmo grupo
              financeiro podem dividir o mesmo limite. Produtos cobertos: CDB, LC, LCI, LCA, RDB,
              DPGE, LIG e Poupança. <strong>Não</strong> são cobertos: CRI, CRA, debêntures, LF,
              Tesouro Direto e fundos de investimento.
            </p>
          </div>
        </div>
      </div>

      {temRendaFixa && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Total coberto pelo FGC"
              value={formatBRL(resumo.totalEfetivamenteCoberto)}
              subtext={`de ${formatBRL(resumo.limiteGlobal)} (teto global)`}
              color="text-emerald-600 dark:text-emerald-400"
            />
            <SummaryCard
              label="Não coberto pelo FGC"
              value={formatBRL(resumo.totalNaoCoberto)}
              subtext="Produtos sem cobertura (CRI, CRA, etc.)"
              color="text-gray-700 dark:text-gray-300"
              tooltip={FGC_NAO_COBERTO_TOOLTIP}
            />
            <SummaryCard
              label="Excedente (acima do limite)"
              value={formatBRL(resumo.totalExcedente)}
              subtext="Valor acima de R$ 250 mil por emissor"
              color={
                resumo.totalExcedente > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-700 dark:text-gray-300'
              }
            />
            <SummaryCard
              label="Cobertura da carteira"
              value={formatPercent(resumo.percentualCoberto)}
              subtext={`${resumo.totalAtivos} ${resumo.totalAtivos === 1 ? 'título' : 'títulos'} em ${resumo.totalInstituicoes} ${resumo.totalInstituicoes === 1 ? 'emissor' : 'emissores'}`}
              color="text-mf-patrimonio dark:text-mf-tranquilidade"
            />
          </div>

          {/* Global coverage bar */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] max-lg:p-4">
            <div className="mb-3 flex items-center justify-between max-lg:flex-wrap max-lg:gap-x-3 max-lg:gap-y-1">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Utilização do teto global FGC
              </h3>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                {formatBRL(resumo.totalEfetivamenteCoberto)} / {formatBRL(resumo.limiteGlobal)}
              </span>
            </div>
            <ProgressBar
              percent={(resumo.totalEfetivamenteCoberto / resumo.limiteGlobal) * 100}
              color={getBarColor((resumo.totalEfetivamenteCoberto / resumo.limiteGlobal) * 100)}
            />
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {formatPercent((resumo.totalEfetivamenteCoberto / resumo.limiteGlobal) * 100)}{' '}
              utilizado do teto global de {formatBRL(resumo.limiteGlobal)} (renovado a cada 4 anos)
            </p>
          </div>

          {/* Grupos por banco emissor (86e2xqh69) */}
          <div className="space-y-3">
            <h3 className="text-base font-medium text-gray-800 dark:text-white/90">
              Cobertura por banco emissor
            </h3>

            <AvisosConglomerado
              avisos={data.avisosConglomerado ?? []}
              instituicoes={instituicoes}
              limite={resumo.limitePorInstituicao}
            />

            {instituicoes.map((inst) => {
              const key = chaveDoGrupo(inst);
              return (
                <GrupoEmissor
                  key={key}
                  inst={inst}
                  avisos={data.avisosConglomerado ?? []}
                  isExpanded={expandedInstitutions.has(key)}
                  onToggle={() => toggleInstitution(key)}
                  onOpen={() => openInstitution(key)}
                  isBelowLg={isBelowLg}
                />
              );
            })}
          </div>
        </>
      )}

      {data.semCobertura && temForaDoFgc && (
        <ForaDoFgc semCobertura={data.semCobertura} isBelowLg={isBelowLg} />
      )}
    </div>
  );
}

function formatData(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—';
}

/** Um grupo da cobertura: o banco emissor (ou a corretora no fallback) e os títulos nele. */
function GrupoEmissor({
  inst,
  avisos,
  isExpanded,
  onToggle,
  onOpen,
  isBelowLg,
}: {
  inst: InstitutionFgcGroup;
  avisos: AvisoConglomerado[];
  isExpanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
  isBelowLg: boolean;
}) {
  const key = chaveDoGrupo(inst);
  const bodyId = `fgc-grupo-${key.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const status = getStatusLabel(inst.percentualUtilizado, inst.totalCoberto, inst.totalNaoCoberto);
  const barColor = getBarColor(inst.percentualUtilizado);
  const pills = pillsDoGrupo(inst, avisos);
  const nota = notaDoGrupo(inst);
  const tracejado = grupoUsaCorretora(inst) || Boolean(inst.titularNaoEmissor);
  const linhaVia = linhaViaGrupo(inst);

  return (
    <div
      data-fgc-grupo={key}
      className={`overflow-hidden rounded-xl border bg-white dark:bg-white/[0.03] ${
        tracejado
          ? 'border-dashed border-gray-400 dark:border-gray-600'
          : 'border-gray-200 dark:border-gray-800'
      }`}
    >
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={bodyId}
        className="flex w-full items-center justify-between p-5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02] max-lg:p-4"
        onClick={onToggle}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
              <svg
                className="text-gray-500 dark:text-gray-400"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M3 21h18" />
                <path d="M3 10h18" />
                <path d="M5 6l7-3 7 3" />
                <path d="M4 10v11" />
                <path d="M20 10v11" />
                <path d="M8 14v4" />
                <path d="M12 14v4" />
                <path d="M16 14v4" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h4 className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-white max-lg:whitespace-normal">
                  {inst.instituicaoNome}
                </h4>
                {pills.map((p) => (
                  <Pill key={p} tipo={p} />
                ))}
              </div>
              {linhaVia && (
                <p
                  data-fgc-via=""
                  className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 [overflow-wrap:anywhere]"
                >
                  {linhaVia}
                </p>
              )}
              <div className="flex items-center gap-2 max-lg:flex-wrap max-lg:gap-x-2 max-lg:gap-y-0.5">
                {status.tooltip ? (
                  <Tooltip content={status.tooltip}>
                    <span className={`text-xs font-medium ${status.className} cursor-help`}>
                      {status.text}
                      <span className="ml-1 opacity-60" aria-hidden>
                        ⓘ
                      </span>
                    </span>
                  </Tooltip>
                ) : (
                  <span className={`text-xs font-medium ${status.className}`}>{status.text}</span>
                )}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-xs max-lg:flex-wrap max-lg:gap-x-2">
              <span className="text-gray-500 dark:text-gray-400">
                {formatBRL(inst.totalCoberto)} coberto
              </span>
              <span className="text-gray-500 dark:text-gray-400">
                {formatPercent(inst.percentualUtilizado)} de {formatBRL(inst.limiteFgc)}
              </span>
            </div>
            <ProgressBar percent={inst.percentualUtilizado} color={barColor} />
          </div>

          {inst.excedente > 0 && (
            <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400 max-lg:text-[#D92D20] max-lg:dark:text-[#F97066]">
              {textoExcedente(inst)}
            </p>
          )}

          {inst.totalNaoCoberto > 0 && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              + {formatBRL(inst.totalNaoCoberto)} em produtos não cobertos
            </p>
          )}
        </div>

        {/* Expand icon */}
        <div className="ml-4 shrink-0 max-lg:ml-2">
          <svg
            className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </button>

      {/* Fallback: emissor não informado / corretora gravada como emissor / Open Finance */}
      {nota && (
        <div
          data-fgc-nota=""
          className="-mt-2 flex flex-wrap items-center gap-x-1.5 px-5 pb-2 pl-[72px] text-xs text-gray-600 dark:text-gray-400 max-lg:px-4 max-lg:pl-4"
        >
          <span>{nota}</span>
          <button
            type="button"
            aria-controls={bodyId}
            onClick={onOpen}
            data-fgc-abrir-grupo=""
            className={LINK_EMISSOR}
          >
            Informar emissor
          </button>
        </div>
      )}

      {/* Expanded asset list */}
      {isExpanded && (
        <div id={bodyId} className="border-t border-gray-100 p-4 dark:border-gray-800 max-lg:p-3">
          {isBelowLg ? (
            <ResponsiveCardList<AssetFgcInfo>
              ariaLabel={`Títulos em ${inst.instituicaoNome}`}
              rows={inst.ativos}
              getRowKey={(a) => a.id}
              columns={[
                { id: 'nome', header: 'Ativo', mobile: 'primary', cell: (a) => a.nome },
                {
                  id: 'atual',
                  header: 'Valor atual',
                  mobile: 'value',
                  cell: (a) => formatBRL(a.valorAtual),
                },
              ]}
              renderMobileCard={(a) => (
                <div className={TABLE_MOBILE_STYLES.card}>
                  <div className={TABLE_MOBILE_STYLES.cardHeader}>
                    <div className="min-w-0">
                      <div className={TABLE_MOBILE_STYLES.cardTitle}>
                        {a.nome}
                        <PillOpenFinanceAtivo ativo={a} />
                      </div>
                      <div className={TABLE_MOBILE_STYLES.cardSubtitle}>
                        {[
                          a.produto,
                          a.isentoIR ? 'Isento de IR' : null,
                          a.vencimento ? `vence ${formatData(a.vencimento)}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                      <TextoOpenFinance ativo={a} />
                    </div>
                    <div className={TABLE_MOBILE_STYLES.valuePrimary}>
                      {formatBRL(a.valorAtual)}
                    </div>
                  </div>
                  {/* Via ocupa a linha toda: a 320 px, três colunas encavalavam o valor. */}
                  <dl className="mt-2 grid grid-cols-2 gap-2">
                    <div className="col-span-2 min-w-0">
                      <dt className={TABLE_MOBILE_STYLES.dt}>Via</dt>
                      <dd className={`${TABLE_MOBILE_STYLES.dd} [overflow-wrap:anywhere]`}>
                        {a.corretoraNome ?? '—'}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className={TABLE_MOBILE_STYLES.dt}>Investido</dt>
                      <dd className={TABLE_MOBILE_STYLES.dd}>{formatBRL(a.valorInvestido)}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className={TABLE_MOBILE_STYLES.dt}>FGC</dt>
                      <dd className={TABLE_MOBILE_STYLES.dd}>{statusFgcCurto(a, inst)}</dd>
                    </div>
                  </dl>
                  {pedeEmissor(a) && a.editarEmissorHref && (
                    <Link
                      href={a.editarEmissorHref}
                      data-fgc-informar-emissor=""
                      className="mt-3 flex min-h-11 w-full items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-mf-patrimonio focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mf-outside dark:border-gray-700 dark:bg-transparent dark:text-mf-tranquilidade"
                    >
                      Informar emissor
                    </Link>
                  )}
                </div>
              )}
            />
          ) : (
            <div className={TABLE_STYLES.wrapper}>
              <table className={TABLE_STYLES.table}>
                <thead>
                  <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
                    <th className={`${TABLE_STYLES.th} text-left`}>Ativo</th>
                    <th className={`${TABLE_STYLES.th} text-left`}>Produto</th>
                    <th className={`${TABLE_STYLES.th} text-left`}>Via</th>
                    <th className={`${TABLE_STYLES.th} text-right`}>Valor investido</th>
                    <th className={`${TABLE_STYLES.th} text-right`}>Valor atual</th>
                    <th className={`${TABLE_STYLES.th} text-left`}>Vencimento</th>
                    <th className={`${TABLE_STYLES.th} text-center`}>FGC</th>
                  </tr>
                </thead>
                <tbody>
                  {inst.ativos.map((ativo) => (
                    <tr key={ativo.id} className={`${TABLE_STYLES.row} ${TABLE_STYLES.rowHover}`}>
                      <td className={`${TABLE_STYLES.td} whitespace-nowrap`}>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {ativo.nome}
                          <PillOpenFinanceAtivo ativo={ativo} />
                        </div>
                        {ativo.isentoIR && (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400">
                            Isento de IR
                          </span>
                        )}
                        <TextoOpenFinance ativo={ativo} />
                        {pedeEmissor(ativo) && ativo.editarEmissorHref && (
                          <div>
                            <LinkInformarEmissor
                              href={ativo.editarEmissorHref}
                              className="-my-2 -ml-1"
                            />
                          </div>
                        )}
                      </td>
                      <td className={`${TABLE_STYLES.td} whitespace-nowrap`}>
                        <span className="inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                          {ativo.produto}
                        </span>
                      </td>
                      <td className={`${TABLE_STYLES.td} whitespace-nowrap`} data-fgc-col-via="">
                        {ativo.corretoraNome ?? '—'}
                      </td>
                      <td className={`${TABLE_STYLES.td} whitespace-nowrap text-right`}>
                        {formatBRL(ativo.valorInvestido)}
                      </td>
                      <td
                        className={`${TABLE_STYLES.td} whitespace-nowrap text-right font-medium text-gray-900 dark:text-white`}
                      >
                        {formatBRL(ativo.valorAtual)}
                      </td>
                      <td className={`${TABLE_STYLES.td} whitespace-nowrap`}>
                        {formatData(ativo.vencimento)}
                      </td>
                      <td className={`${TABLE_STYLES.td} whitespace-nowrap text-center`}>
                        {/* 2.7 (auditoria jul/2026): o limite FGC é por INSTITUIÇÃO (agora, por
                        emissor), não por ativo. Se a soma dos ativos cobertos excede o limite,
                        TODOS os ativos cobertos dele estão parcialmente expostos. */}
                        {ativo.coberto && inst.excedente > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden
                            >
                              <path d="M12 9v4" />
                              <path d="M12 17h.01" />
                              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            </svg>
                            Parcialmente Coberto
                          </span>
                        ) : ativo.coberto ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Coberto
                          </span>
                        ) : (
                          <Tooltip content={FGC_NAO_COBERTO_TOOLTIP}>
                            <span className="inline-flex cursor-help items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden
                              >
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                              Não coberto
                              <span className="ml-0.5 opacity-60" aria-hidden>
                                ⓘ
                              </span>
                            </span>
                          </Tooltip>
                        )}
                        {ativo.coberto && ativo.fonteInstituicao === 'corretora' && (
                          <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                            pela corretora
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** O resto da carteira, sem a proteção do FGC, por classe (ClickUp 86e2vvde3). */
function ForaDoFgc({
  semCobertura,
  isBelowLg,
}: {
  semCobertura: SemCoberturaFgc;
  isBelowLg: boolean;
}) {
  const pctDaCarteira = (valor: number) =>
    semCobertura.totalInvestimentos > 0 ? (valor / semCobertura.totalInvestimentos) * 100 : 0;
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-medium text-gray-800 dark:text-white/90">
          Investimentos fora do FGC
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          <strong className="text-gray-800 dark:text-gray-100">
            {formatPercent(semCobertura.percentualSemProtecao)}
          </strong>{' '}
          dos seus investimentos ({formatBRL(semCobertura.totalSemProtecao)} de{' '}
          {formatBRL(semCobertura.totalInvestimentos)}) não têm a proteção do FGC, somando a renda
          fixa não coberta ou acima do limite e as classes abaixo.
        </p>
      </div>
      {/* Celular: cartões (a tabela de 3 colunas passava da largura a 390/320 px). */}
      {isBelowLg ? (
        <ResponsiveCardList<SemCoberturaFgc['classes'][number]>
          ariaLabel="Investimentos fora do FGC"
          rows={semCobertura.classes}
          getRowKey={(c) => c.classe}
          columns={[
            { id: 'classe', header: 'Classe', mobile: 'primary', cell: (c) => c.rotulo },
            {
              id: 'valor',
              header: 'Valor atual',
              mobile: 'value',
              cell: (c) => formatBRL(c.valor),
            },
            {
              id: 'ativos',
              header: 'Ativos',
              mobile: 'subtitle',
              cell: (c) =>
                [
                  `${c.quantidadeAtivos} ${c.quantidadeAtivos === 1 ? 'ativo' : 'ativos'}`,
                  `${formatPercent(pctDaCarteira(c.valor))} dos investimentos`,
                ].join(' · '),
            },
            { id: 'nota', header: 'Garantia', mobile: 'detail', cell: (c) => c.nota ?? '—' },
          ]}
          total={{
            label: 'Total fora do FGC',
            cells: { valor: formatBRL(semCobertura.total) },
          }}
        />
      ) : (
        <div className={TABLE_STYLES.wrapper}>
          <table className={TABLE_STYLES.table}>
            <thead>
              <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
                <th className={`${TABLE_STYLES.th} text-left`}>Classe</th>
                <th className={`${TABLE_STYLES.th} text-right`}>Valor atual</th>
                <th className={`${TABLE_STYLES.th} text-right`}>% dos investimentos</th>
              </tr>
            </thead>
            <tbody>
              {semCobertura.classes.map((c) => (
                <tr key={c.classe} className={TABLE_STYLES.row}>
                  <td className={TABLE_STYLES.td}>
                    <span className="font-medium text-gray-900 dark:text-white">{c.rotulo}</span>
                    <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                      {c.quantidadeAtivos} {c.quantidadeAtivos === 1 ? 'ativo' : 'ativos'}
                    </span>
                    {c.nota && (
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{c.nota}</p>
                    )}
                  </td>
                  <td className={`${TABLE_STYLES.td} text-right whitespace-nowrap`}>
                    {formatBRL(c.valor)}
                  </td>
                  <td className={`${TABLE_STYLES.td} text-right whitespace-nowrap`}>
                    {formatPercent(pctDaCarteira(c.valor))}
                  </td>
                </tr>
              ))}
              <tr className={TABLE_STYLES.totalRow}>
                <td className={TABLE_STYLES.td}>Total fora do FGC</td>
                <td className={`${TABLE_STYLES.td} text-right whitespace-nowrap`}>
                  {formatBRL(semCobertura.total)}
                </td>
                <td className={`${TABLE_STYLES.td} text-right whitespace-nowrap`}>
                  {formatPercent(pctDaCarteira(semCobertura.total))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  subtext,
  color,
  tooltip,
}: {
  label: string;
  value: string;
  subtext: string;
  color: string;
  tooltip?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
        {tooltip && (
          <Tooltip content={tooltip}>
            <span className="ml-1 cursor-help opacity-60 normal-case" aria-label={tooltip}>
              ⓘ
            </span>
          </Tooltip>
        )}
      </p>
      <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{subtext}</p>
    </div>
  );
}
