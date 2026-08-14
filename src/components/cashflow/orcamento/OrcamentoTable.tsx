'use client';

import { useState } from 'react';
import { formatBRL, formatPct } from '@/utils/format';

export type OrcamentoTipoMeta = 'valor' | 'percentual';

export interface OrcamentoLinha {
  /** groupId da categoria ou o literal 'investimentos'. */
  key: string;
  nome: string;
  parentNome: string | null;
  /** Valor persistido e editável: R$ mensal ou % conforme tipoMeta. */
  metaBase: number | null;
  /** Como a meta é definida — categorias são sempre 'valor'; investimentos escolhe. */
  tipoMeta: OrcamentoTipoMeta;
  /** Meta na janela exibida (mês ou acumulado), em R$. */
  metaJanela: number | null;
  /** Real na janela exibida, em R$. */
  real: number;
  isInvestimentos: boolean;
}

interface OrcamentoTableProps {
  linhas: OrcamentoLinha[];
  investimentos: OrcamentoLinha | null;
  totais: { meta: number; real: number; diferenca: number };
  onSaveMeta: (key: string, valor: number | null, tipoMeta: OrcamentoTipoMeta) => Promise<void>;
}

/**
 * Tabela do Orçamento vs Real: Categoria | Orçamento (editável) | Real |
 * Diferença | Consumo. Diferença de categoria = meta − real (sobrou verde);
 * na linha Investimentos o sinal inverte (investir acima da meta é bom).
 */
export function OrcamentoTable({ linhas, investimentos, totais, onSaveMeta }: OrcamentoTableProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>('');
  const [draftTipo, setDraftTipo] = useState<OrcamentoTipoMeta>('valor');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const startEdit = (linha: OrcamentoLinha) => {
    setEditingKey(linha.key);
    setDraftTipo(linha.tipoMeta);
    setDraft(linha.metaBase !== null ? String(linha.metaBase).replace('.', ',') : '');
  };

  const commitEdit = async (linha: OrcamentoLinha, tipoOverride?: OrcamentoTipoMeta) => {
    if (editingKey !== linha.key) return;
    const tipo = tipoOverride ?? draftTipo;
    const raw = draft.trim().replace(/\./g, '').replace(',', '.');
    setEditingKey(null);
    const valor = raw === '' ? null : Number(raw);
    if (valor !== null && (!Number.isFinite(valor) || valor < 0)) return;
    if (valor !== null && tipo === 'percentual' && valor > 100) return;
    if (valor === linha.metaBase && tipo === linha.tipoMeta) return;
    if (valor === null && linha.metaBase === null) return;
    setSavingKey(linha.key);
    try {
      await onSaveMeta(linha.key, valor, tipo);
    } finally {
      setSavingKey(null);
    }
  };

  const renderMetaCell = (linha: OrcamentoLinha) => {
    if (editingKey === linha.key) {
      return (
        <span className="inline-flex items-center gap-1">
          {/* Investimentos escolhe o modo da meta: R$ fixo ou % da renda
              (reintroduzido ago/2026 — o R$ do mês passa a seguir a renda). */}
          {linha.isInvestimentos && (
            <span className="inline-flex overflow-hidden rounded border border-gray-300 dark:border-gray-700">
              {(['valor', 'percentual'] as const).map((tipo) => (
                <button
                  key={tipo}
                  type="button"
                  // mousedown pra trocar o modo sem disparar o blur do input.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setDraftTipo(tipo);
                  }}
                  className={`px-1.5 py-0.5 text-xs font-medium ${
                    draftTipo === tipo
                      ? 'bg-brand-500 text-white'
                      : 'bg-white text-gray-500 dark:bg-gray-900 dark:text-gray-400'
                  }`}
                  aria-pressed={draftTipo === tipo}
                >
                  {tipo === 'valor' ? 'R$' : '%'}
                </button>
              ))}
            </span>
          )}
          <input
            autoFocus
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commitEdit(linha)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commitEdit(linha);
              if (e.key === 'Escape') setEditingKey(null);
            }}
            className="w-24 rounded border border-brand-300 bg-white px-2 py-0.5 text-right text-sm dark:border-brand-700 dark:bg-gray-900"
            aria-label={`Meta de ${linha.nome}${draftTipo === 'percentual' ? ' (% da renda)' : ''}`}
          />
        </span>
      );
    }
    // Exibe a meta DA JANELA (mês = mensal; acumulado = mensal × meses).
    // Meta percentual mostra o % definido + o R$ que ele vale na janela.
    const label =
      linha.metaJanela === null
        ? 'Definir'
        : linha.tipoMeta === 'percentual'
          ? `${formatPct(linha.metaBase ?? 0, 0)} · ${formatBRL(linha.metaJanela)}`
          : formatBRL(linha.metaJanela);
    return (
      <button
        type="button"
        onClick={() => startEdit(linha)}
        disabled={savingKey === linha.key}
        className={`rounded px-1.5 py-0.5 text-right text-sm transition hover:bg-brand-50 dark:hover:bg-brand-500/10 ${
          linha.metaJanela === null
            ? 'italic text-gray-400 hover:text-brand-600 dark:text-gray-500'
            : 'text-gray-800 dark:text-gray-100'
        } ${savingKey === linha.key ? 'opacity-50' : ''}`}
        title={
          linha.tipoMeta === 'percentual'
            ? '% da renda — o R$ acompanha as entradas do mês. Clique para editar (vazio remove)'
            : 'Meta mensal em R$ — clique para editar (vazio remove)'
        }
      >
        {label}
      </button>
    );
  };

  const renderLinha = (linha: OrcamentoLinha) => {
    const temMeta = linha.metaJanela !== null;
    // Categoria: sobra = meta − real. Investimentos: excedente = real − meta.
    const diferenca = temMeta
      ? linha.isInvestimentos
        ? linha.real - linha.metaJanela!
        : linha.metaJanela! - linha.real
      : null;
    const consumo =
      temMeta && linha.metaJanela! > 0 ? (linha.real / linha.metaJanela!) * 100 : null;
    const consumoCor =
      consumo === null
        ? ''
        : linha.isInvestimentos
          ? consumo >= 100
            ? 'bg-success-500'
            : consumo >= 70
              ? 'bg-warning-500'
              : 'bg-error-500'
          : consumo <= 80
            ? 'bg-success-500'
            : consumo <= 100
              ? 'bg-warning-500'
              : 'bg-error-500';

    return (
      <tr key={linha.key} className="border-b border-gray-100 last:border-b-0 dark:border-gray-800">
        <td className="py-2.5 pr-4">
          <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{linha.nome}</span>
          {linha.parentNome && (
            <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
              {linha.parentNome}
            </span>
          )}
        </td>
        <td className="py-2.5 pr-4 text-right">{renderMetaCell(linha)}</td>
        <td className="py-2.5 pr-4 text-right text-sm text-gray-700 dark:text-gray-200">
          {formatBRL(linha.real)}
        </td>
        <td
          className={`py-2.5 pr-4 text-right text-sm font-medium ${
            diferenca === null
              ? 'text-gray-400 dark:text-gray-500'
              : diferenca >= 0
                ? 'text-success-600 dark:text-success-500'
                : 'text-error-600 dark:text-error-500'
          }`}
        >
          {diferenca === null
            ? '—'
            : `${diferenca >= 0 ? '+' : '−'}${formatBRL(Math.abs(diferenca))}`}
        </td>
        <td className="py-2.5">
          {consumo === null ? (
            <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
          ) : (
            <div className="flex items-center gap-2">
              <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div
                  className={`h-full rounded-full ${consumoCor}`}
                  style={{ width: `${Math.min(100, consumo)}%` }}
                />
              </div>
              <span className="w-12 text-right text-xs tabular-nums text-gray-500 dark:text-gray-400">
                {formatPct(consumo, 0)}
              </span>
            </div>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
      <table className="w-full min-w-[640px] text-left">
        <thead>
          {/* Cabeçalho no oliva exato da planilha-base (#9E8A58, texto branco) */}
          <tr className="border-b border-gray-200 bg-[#9E8A58] text-xs uppercase tracking-wide text-white dark:border-gray-800">
            <th className="py-3 pl-4 pr-4 font-medium">Categoria</th>
            <th className="py-3 pr-4 text-right font-medium">Orçamento</th>
            <th className="py-3 pr-4 text-right font-medium">Real</th>
            <th className="py-3 pr-4 text-right font-medium">Diferença</th>
            <th className="py-3 font-medium">Consumo</th>
          </tr>
        </thead>
        <tbody className="[&>tr>td:first-child]:pl-4">
          {linhas.map(renderLinha)}

          {/* Investimentos entre as categorias e o Total, como na planilha
              (linha 36 do modelo); diferença invertida: investir mais é bom. */}
          {investimentos && renderLinha(investimentos)}

          {/* Total de despesas (sem investimentos — aporte não é despesa,
              mesma convenção do SUM(D25:D35) da planilha) */}
          <tr className="border-b border-gray-200 bg-gray-50 font-medium dark:border-gray-800 dark:bg-white/[0.02]">
            <td className="py-2.5 pr-4 text-sm text-gray-800 dark:text-gray-100">Total</td>
            <td className="py-2.5 pr-4 text-right text-sm text-gray-800 dark:text-gray-100">
              {formatBRL(totais.meta)}
            </td>
            <td className="py-2.5 pr-4 text-right text-sm text-gray-800 dark:text-gray-100">
              {formatBRL(totais.real)}
            </td>
            <td
              className={`py-2.5 pr-4 text-right text-sm ${
                totais.diferenca >= 0
                  ? 'text-success-600 dark:text-success-500'
                  : 'text-error-600 dark:text-error-500'
              }`}
            >
              {`${totais.diferenca >= 0 ? '+' : '−'}${formatBRL(Math.abs(totais.diferenca))}`}
            </td>
            <td className="py-2.5" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
