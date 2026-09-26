'use client';

import React, { useState } from 'react';
import { MobileEditSheet, type MobileEditFailure } from '@/components/ui/sheet/MobileEditSheet';
import { formatBRL, formatPct } from '@/utils/format';
import { nivelOrcamento, type OrcamentoNivel } from '@/lib/cashflow/orcamentoNivel';
import type { OrcamentoLinha, OrcamentoTipoMeta } from './OrcamentoTable';

/**
 * Categorias do Orçamento vs Real no celular (PWA fase 2, protótipo cenário g): um cartão por
 * categoria com nome e pai, "R$ real de R$ meta", medidor de 8px (marcas em 80% e 100%) e o selo
 * do nível (ponto + TEXTO — os mesmos cortes do sino, `orcamentoNivel`). Tocar no cartão abre o
 * sheet da meta (vazio remove). Investimentos antes do Total (fora da soma) e o Total no fim.
 */

export type SaveMetaMobile = (
  key: string,
  valor: number | null,
  tipoMeta: OrcamentoTipoMeta,
) => Promise<void | MobileEditFailure>;

type Tom = 'ok' | 'atencao' | 'estourou' | 'neutro';

/** Tom visual do nível: atingir 100% é alerta numa categoria e é bom em Investimentos. */
export function tomDoNivel(nivel: OrcamentoNivel, isInvestimentos: boolean): Tom {
  switch (nivel.status) {
    case 'sem-meta':
      return 'neutro';
    case 'dentro':
      return 'ok';
    case 'atingido':
      return isInvestimentos ? 'ok' : 'atencao';
    case 'atencao':
      return 'atencao';
    case 'estourou':
      return 'estourou';
  }
}

/** Texto do selo (AA nos dois temas). Âmbar #B45309/#D97706 e vermelho semântico #D92D20/#F97066. */
const SELO_TEXTO: Record<Tom, string> = {
  ok: 'text-mf-patrimonio dark:text-mf-tranquilidade',
  atencao: 'text-[#B45309] dark:text-[#D97706]',
  estourou: 'text-[#D92D20] dark:text-[#F97066]',
  neutro: 'text-gray-500 dark:text-gray-400',
};

/** Ponto do selo e preenchimento do medidor (elementos não textuais). */
const TOM_FUNDO: Record<Tom, string> = {
  ok: 'bg-[#0079F2]',
  atencao: 'bg-[#D97706]',
  estourou: 'bg-[#D92D20] dark:bg-[#F97066]',
  neutro: 'bg-gray-300 dark:bg-gray-600',
};

export function OrcamentoSelo({ nivel, tom }: { nivel: OrcamentoNivel; tom: Tom }) {
  return (
    <span
      data-mf-orcamento-selo={nivel.status}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs font-semibold whitespace-nowrap dark:border-gray-700 dark:bg-white/[0.03] ${SELO_TEXTO[tom]}`}
    >
      <span aria-hidden="true" className={`h-[7px] w-[7px] rounded-full ${TOM_FUNDO[tom]}`} />
      {nivel.texto}
    </span>
  );
}

/**
 * Medidor do consumo: escala até 120% (ou mais, se passou disso), marcas de 2px em 80% e 100%.
 * `showScale` mostra os rótulos 80%/100% embaixo (resumo).
 */
export function OrcamentoMeter({
  pct,
  tom,
  height = 8,
  showScale = false,
}: {
  pct: number | null;
  tom: Tom;
  height?: 8 | 10;
  showScale?: boolean;
}) {
  const valor = pct ?? 0;
  const escala = Math.max(120, valor);
  const largura = Math.min(100, (valor / escala) * 100);
  const marca80 = (80 / escala) * 100;
  const marca100 = (100 / escala) * 100;
  return (
    <div aria-hidden="true">
      <div
        className="relative rounded-full bg-gray-100 dark:bg-gray-800"
        style={{ height: `${height}px` }}
      >
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${TOM_FUNDO[tom]}`}
          style={{ width: `${largura}%` }}
        />
        {[marca80, marca100].map((left) => (
          <span
            key={left}
            className="absolute -top-[3px] -bottom-[3px] w-[2px] rounded-[1px] bg-gray-400 dark:bg-gray-500"
            style={{ left: `${left}%` }}
          />
        ))}
      </div>
      {showScale ? (
        <div className="relative mt-0.5 h-4 text-[10.5px] text-gray-500 tabular-nums dark:text-gray-400">
          <span className="absolute -translate-x-1/2" style={{ left: `${marca80}%` }}>
            80%
          </span>
          <span className="absolute -translate-x-1/2" style={{ left: `${marca100}%` }}>
            100%
          </span>
        </div>
      ) : null}
    </div>
  );
}

interface OrcamentoMobileListProps {
  linhas: OrcamentoLinha[];
  investimentos: OrcamentoLinha | null;
  totais: { meta: number; real: number; diferenca: number };
  /** Acumulado do ano: a meta exibida é a mensal × meses (a edição continua sendo a mensal). */
  mesesNaJanela: number;
  onSaveMeta: SaveMetaMobile;
}

type Edicao =
  | { passo: 'tipo'; linha: OrcamentoLinha }
  | { passo: 'valor'; linha: OrcamentoLinha; tipo: OrcamentoTipoMeta };

const TIPO_OPCOES = [
  { value: 'valor', label: 'R$ por mês' },
  { value: 'percentual', label: '% da renda' },
];

function CartaoCategoria({
  linha,
  onEditar,
}: {
  linha: OrcamentoLinha;
  onEditar: (linha: OrcamentoLinha) => void;
}) {
  const nivel = nivelOrcamento(linha.real, linha.metaJanela, linha.isInvestimentos);
  const tom = tomDoNivel(nivel, linha.isInvestimentos);
  const meta =
    linha.metaJanela === null
      ? 'sem meta'
      : linha.tipoMeta === 'percentual'
        ? `${formatBRL(linha.metaJanela)} (${formatPct(linha.metaBase ?? 0, 0)} da renda)`
        : formatBRL(linha.metaJanela);
  const rotulo = [
    linha.nome,
    linha.parentNome ? `em ${linha.parentNome}` : null,
    `${linha.isInvestimentos ? 'aportado' : 'real'} ${formatBRL(linha.real)} de ${meta}`,
    nivel.texto,
    'Editar meta',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <button
      type="button"
      data-mf-card=""
      data-mf-orcamento-card={linha.key}
      onClick={() => onEditar(linha)}
      aria-label={rotulo}
      className="flex w-full flex-col gap-1.5 border-t border-gray-100 px-3.5 py-3 text-left first:border-t-0 active:bg-gray-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0079F2] dark:border-gray-800 dark:active:bg-white/5"
    >
      <span className="flex min-w-0 flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <span className="min-w-[6rem] flex-1">
          <span className="block truncate text-[14.5px] font-semibold text-gray-800 dark:text-white/90">
            {linha.nome}
          </span>
          {linha.parentNome ? (
            <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
              {linha.parentNome}
            </span>
          ) : null}
        </span>
        <OrcamentoSelo nivel={nivel} tom={tom} />
      </span>
      <OrcamentoMeter pct={nivel.pct} tom={tom} />
      <span className="flex items-baseline justify-between gap-2 text-[12.5px] text-gray-500 tabular-nums dark:text-gray-400">
        <span className="min-w-0">
          <b className="font-semibold text-gray-800 dark:text-white/90">{formatBRL(linha.real)}</b>{' '}
          de {meta}
          {linha.isInvestimentos ? ' · fora do total' : ''}
        </span>
        <span className="shrink-0 font-medium text-mf-patrimonio dark:text-mf-tranquilidade">
          {nivel.pct !== null ? `${nivel.pct}% · ` : ''}Editar meta
        </span>
      </span>
    </button>
  );
}

export default function OrcamentoMobileList({
  linhas,
  investimentos,
  totais,
  mesesNaJanela,
  onSaveMeta,
}: OrcamentoMobileListProps) {
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  // Mantidos montados (o aviso "Salvo" vive no sheet): só o isOpen muda.
  const [ultimaLinha, setUltimaLinha] = useState<OrcamentoLinha | null>(null);

  const abrir = (linha: OrcamentoLinha) => {
    setUltimaLinha(linha);
    setEdicao(
      linha.isInvestimentos
        ? { passo: 'tipo', linha }
        : { passo: 'valor', linha, tipo: linha.tipoMeta },
    );
  };

  const nivelTotal = nivelOrcamento(totais.real, totais.meta > 0 ? totais.meta : null);
  const tomTotal = tomDoNivel(nivelTotal, false);
  const linhaValor =
    edicao?.passo === 'valor' ? edicao.linha : (ultimaLinha ?? linhas[0] ?? investimentos);
  const tipoValor: OrcamentoTipoMeta =
    edicao?.passo === 'valor' ? edicao.tipo : (linhaValor?.tipoMeta ?? 'valor');
  const isPercent = tipoValor === 'percentual';

  return (
    <section aria-labelledby="orcamento-por-categoria" className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3
          id="orcamento-por-categoria"
          className="text-[15px] font-semibold text-gray-800 dark:text-white/90"
        >
          Por categoria
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">Toque para mudar a meta</span>
      </div>

      {linhas.length === 0 && !investimentos ? (
        <p className="rounded-2xl border border-gray-200 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
          Nenhuma categoria de despesa na planilha deste ano.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          {linhas.map((linha) => (
            <CartaoCategoria key={linha.key} linha={linha} onEditar={abrir} />
          ))}
          {investimentos ? <CartaoCategoria linha={investimentos} onEditar={abrir} /> : null}
          <div
            data-mf-card=""
            data-mf-orcamento-card="total"
            className="flex flex-col gap-1.5 border-t border-gray-200 bg-gray-50 px-3.5 py-3 dark:border-gray-800 dark:bg-white/[0.02]"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-[14.5px] font-semibold text-gray-800 dark:text-white/90">
                Total
              </span>
              <OrcamentoSelo nivel={nivelTotal} tom={tomTotal} />
            </span>
            <span className="flex items-baseline justify-between gap-2 text-[12.5px] text-gray-500 tabular-nums dark:text-gray-400">
              <span>
                <b className="font-semibold text-gray-800 dark:text-white/90">
                  {formatBRL(totais.real)}
                </b>{' '}
                de {formatBRL(totais.meta)}
              </span>
              <span
                className={`shrink-0 font-semibold ${
                  totais.diferenca >= 0
                    ? 'text-mf-patrimonio dark:text-mf-tranquilidade'
                    : 'text-[#D92D20] dark:text-[#F97066]'
                }`}
              >
                {totais.diferenca >= 0 ? 'Sobram ' : 'Passou '}
                {formatBRL(Math.abs(totais.diferenca))}
              </span>
            </span>
          </div>
        </div>
      )}

      {/* Investimentos: primeiro o modo da meta (R$ por mês ou % da renda), depois o valor. */}
      <MobileEditSheet
        isOpen={edicao?.passo === 'tipo'}
        // O sheet chama onClose DEPOIS do onSubmit: só fecha se ainda estiver neste passo.
        onClose={() => setEdicao((e) => (e?.passo === 'tipo' ? null : e))}
        title="Meta de Investimentos"
        subject="Investimentos"
        label="Como definir a meta"
        kind="select"
        options={TIPO_OPCOES}
        initialValue={investimentos?.tipoMeta ?? 'valor'}
        submitLabel="Continuar"
        showSavedToast={false}
        onSubmit={(valor) => {
          const tipo: OrcamentoTipoMeta = valor === 'percentual' ? 'percentual' : 'valor';
          if (!investimentos) return;
          // Troca de conteúdo em vez de empilhar: o sheet do tipo fecha e o do valor abre.
          setEdicao({ passo: 'valor', linha: investimentos, tipo });
        }}
      />

      <MobileEditSheet
        isOpen={edicao?.passo === 'valor'}
        onClose={() => setEdicao((e) => (e?.passo === 'valor' ? null : e))}
        title={isPercent ? 'Meta em % da renda' : 'Meta mensal'}
        subject={linhaValor?.nome}
        label={isPercent ? 'Percentual da renda do mês' : 'Meta por mês'}
        kind={isPercent ? 'percent' : 'currency'}
        min={0}
        max={isPercent ? 100 : undefined}
        allowEmpty
        // Mesmo modo: pré-preenche a meta atual; trocou R$ ↔ %, começa vazio.
        initialValue={linhaValor && linhaValor.tipoMeta === tipoValor ? linhaValor.metaBase : null}
        hint={
          mesesNaJanela > 1
            ? `Vale para cada mês (no acumulado, × ${mesesNaJanela} meses). Deixe vazio para remover a meta.`
            : 'Deixe vazio para remover a meta.'
        }
        submitLabel="Salvar meta"
        savedMessage={(valor) => (valor === null ? 'Meta removida' : 'Meta salva')}
        onSubmit={async (valor) => {
          if (!linhaValor) return;
          const numero = typeof valor === 'number' ? valor : null;
          if (numero === linhaValor.metaBase && tipoValor === linhaValor.tipoMeta) return;
          if (numero === null && linhaValor.metaBase === null) return;
          return onSaveMeta(linhaValor.key, numero, tipoValor);
        }}
      />
    </section>
  );
}

export { OrcamentoMobileList };
