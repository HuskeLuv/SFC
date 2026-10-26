'use client';

import { useEffect, useRef, useState } from 'react';
import { TABLE_STYLES } from '@/components/ui/table/tableStyles';
import { parsePctBR, parseValorBR, pctDe, validarNomeSubcategoria } from '@/lib/orcamento/regras';
import { SELO_TEXTO } from '@/lib/orcamento/tons';
import type { SubcategoriaV2 } from '@/types/orcamentoV2';
import type { SalvarOrcadoEntrada } from '@/hooks/useOrcamentoV2';
import { formatNumber } from '@/utils/format';
import BarraConsumo from './BarraConsumo';
import MenuSubcategoria, { type MenuSubcategoriaProps } from './MenuSubcategoria';
import { ETIQUETA_STATUS, TOM_DO_STATUS, num, pct, textoDiferenca } from './apresentacao';

export interface LinhaSubcategoriaProps {
  sub: SubcategoriaV2;
  categoriaNome: string;
  poupanca: boolean;
  /** Nomes das outras subcategorias da categoria (R-12, validação do renomear). */
  irmaos: string[];
  /** Receita do payload (`null` = sem receita): só para o "% da receita" da linha. */
  receita: number | null;
  ritmo: number;
  tituloRitmo: string;
  /** Última sub da categoria: a linha-guia fecha na metade. */
  ultima: boolean;
  onSalvarOrcado: (entrada: SalvarOrcadoEntrada) => Promise<unknown>;
  onAlternarFixa: () => void;
  /** Renomeia; lança com a mensagem do servidor. */
  onRenomear: (nome: string) => Promise<void>;
  onBuscarImpacto: MenuSubcategoriaProps['onBuscarImpacto'];
  onExcluir: MenuSubcategoriaProps['onExcluir'];
}

const ETIQUETA = 'ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold';
const ETIQUETA_NEUTRA = `${ETIQUETA} bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400`;

const INPUT =
  'w-28 rounded-md border border-transparent bg-transparent px-2 py-1 text-right text-sm tabular-nums text-gray-800 transition hover:border-gray-300 focus:border-[#0079F2] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0079F2]/20 dark:text-gray-100 dark:hover:border-gray-600 dark:focus:bg-gray-900';

const MOTIVO_NOME = {
  vazio: 'Informe um nome.',
  longo: 'Use no máximo 60 caracteres.',
  duplicado: 'Já existe uma subcategoria com esse nome nesta categoria.',
} as const;

/** Texto do campo de orçado a partir do payload ('' = sem orçado). */
function textoOrcado(sub: SubcategoriaV2): string {
  if (sub.pct !== null) return formatNumber(sub.pct, 1);
  return sub.valor !== null ? num(sub.valor) : '';
}

/**
 * Linha de subcategoria (spec §4.5): nome com recuo e linha-guia, etiquetas "padrão" (Geral),
 * "fixa" e de status; % da receita; orçado editável inline (R$, ou % nas subs que já estão em %
 * — o botão R$/% é da E2) só quando o payload deixa (`editavelOrcado`); realizado, diferença e
 * consumo; menu ⋯.
 *
 * Orçado (R-18, Q6): Enter ou sair do campo confirma; inválido NÃO salva, mostra o erro junto ao
 * campo e restaura o anterior; vazio limpa; Esc desfaz. A gravação é otimista no hook.
 */
export default function LinhaSubcategoria({
  sub,
  categoriaNome,
  poupanca,
  irmaos,
  receita,
  ritmo,
  tituloRitmo,
  ultima,
  onSalvarOrcado,
  onAlternarFixa,
  onRenomear,
  onBuscarImpacto,
  onExcluir,
}: LinhaSubcategoriaProps) {
  const emPct = sub.pct !== null;
  const [texto, setTexto] = useState(() => textoOrcado(sub));
  const [erroOrcado, setErroOrcado] = useState<string | null>(null);
  const focadoRef = useRef(false);
  const cancelarRef = useRef(false);

  // O payload muda (resposta do servidor, outra visão): o campo acompanha, menos durante a edição.
  const atual = textoOrcado(sub);
  useEffect(() => {
    if (!focadoRef.current) setTexto(atual);
  }, [atual]);

  const confirmarOrcado = () => {
    const t = texto.trim();
    let entrada: SalvarOrcadoEntrada | null = null;
    if (t === '') {
      if (sub.valor !== null || sub.pct !== null) entrada = { itemId: sub.id, valor: null };
    } else if (emPct) {
      const p = parsePctBR(t);
      if (p === null) {
        setErroOrcado('Use um percentual entre 0 e 100, com até 1 casa (ex.: 6,5).');
        setTexto(atual);
        return;
      }
      if (p !== sub.pct) entrada = { itemId: sub.id, pct: p };
    } else {
      const v = parseValorBR(t);
      if (v === null) {
        setErroOrcado('Valor inválido. Use o formato 1.500,00.');
        setTexto(atual);
        return;
      }
      if (v !== sub.valor) entrada = { itemId: sub.id, valor: v };
    }
    setErroOrcado(null);
    if (!entrada) {
      setTexto(atual);
      return;
    }
    onSalvarOrcado(entrada).catch((e: unknown) => {
      setErroOrcado(e instanceof Error ? e.message : 'Não foi possível salvar o orçado.');
    });
  };

  // ── Renomear ───────────────────────────────────────────────────────────────────────────────
  const [renomeando, setRenomeando] = useState(false);
  const [nome, setNome] = useState(sub.nome);
  const [erroNome, setErroNome] = useState<string | null>(null);
  const [salvandoNome, setSalvandoNome] = useState(false);
  const cancelarNomeRef = useRef(false);

  const iniciarRenomear = () => {
    cancelarNomeRef.current = false;
    setNome(sub.nome);
    setErroNome(null);
    setRenomeando(true);
  };
  const confirmarNome = async () => {
    if (salvandoNome) return;
    const v = validarNomeSubcategoria(nome, irmaos);
    if (!v.ok) {
      setErroNome(MOTIVO_NOME[v.motivo]);
      return;
    }
    if (v.nome === sub.nome) {
      setRenomeando(false);
      return;
    }
    setSalvandoNome(true);
    try {
      await onRenomear(v.nome);
      setRenomeando(false);
    } catch (e: unknown) {
      setErroNome(e instanceof Error ? e.message : 'Não foi possível renomear.');
    } finally {
      setSalvandoNome(false);
    }
  };

  const tom = TOM_DO_STATUS[sub.status];
  const etiquetaStatus = ETIQUETA_STATUS[sub.status];
  const pctReceita = sub.orcado > 0 ? pctDe(sub.orcado, receita) : null;
  const dif = textoDiferenca(sub.diferenca);

  return (
    <tr
      data-mf-linha="sub"
      data-item-id={sub.id}
      className={`sub ${TABLE_STYLES.row} ${TABLE_STYLES.rowHover}`}
    >
      <td className={`${TABLE_STYLES.td} relative pl-12`}>
        <span
          aria-hidden
          className={`absolute left-7 top-0 w-px bg-gray-200 dark:bg-gray-700 ${ultima ? 'h-1/2' : 'h-full'}`}
        />
        <span
          aria-hidden
          className="absolute left-7 top-1/2 h-px w-3 bg-gray-200 dark:bg-gray-700"
        />
        {renomeando ? (
          <span className="inline-flex flex-col">
            <input
              autoFocus
              value={nome}
              maxLength={80}
              disabled={salvandoNome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void confirmarNome();
                if (e.key === 'Escape') {
                  cancelarNomeRef.current = true;
                  setRenomeando(false);
                }
              }}
              onBlur={() => {
                if (cancelarNomeRef.current) {
                  cancelarNomeRef.current = false;
                  return;
                }
                if (renomeando) void confirmarNome();
              }}
              aria-label={`Novo nome de ${sub.nome}`}
              aria-invalid={erroNome ? true : undefined}
              className="w-56 rounded-md border border-[#0079F2] bg-white px-2 py-1 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#0079F2]/20 dark:bg-gray-900 dark:text-gray-100"
            />
            {erroNome && (
              <span role="alert" className={`mt-1 text-xs ${SELO_TEXTO.estourou}`}>
                {erroNome}
              </span>
            )}
          </span>
        ) : (
          <span className="text-sm text-gray-800 dark:text-gray-100">
            {sub.nome}
            {sub.geral && (
              <span className={ETIQUETA_NEUTRA} title="Recebe os lançamentos sem subcategoria">
                padrão
              </span>
            )}
            {sub.fixa && !sub.geral && !poupanca && (
              <span
                className={ETIQUETA_NEUTRA}
                title="Despesa fixa: valor igual todo mês — só avisa se passar do orçado"
              >
                fixa
              </span>
            )}
            {etiquetaStatus && (
              <span
                className={`${ETIQUETA} bg-gray-100 dark:bg-white/[0.06] ${SELO_TEXTO[tom]}`}
                data-mf-etiqueta={sub.status}
              >
                {etiquetaStatus}
              </span>
            )}
          </span>
        )}
      </td>
      <td className={`${TABLE_STYLES.td} text-right tabular-nums text-gray-500 dark:text-gray-400`}>
        {pct(pctReceita)}
      </td>
      <td className={`${TABLE_STYLES.td} text-right`}>
        {sub.editavelOrcado ? (
          <span className="inline-flex flex-col items-end">
            <span className="inline-flex items-center gap-1">
              <input
                type="text"
                inputMode="decimal"
                value={texto}
                placeholder={emPct ? '0,0' : '0,00'}
                onFocus={() => {
                  focadoRef.current = true;
                }}
                onChange={(e) => {
                  setTexto(e.target.value);
                  if (erroOrcado) setErroOrcado(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') {
                    cancelarRef.current = true;
                    e.currentTarget.blur();
                  }
                }}
                onBlur={() => {
                  focadoRef.current = false;
                  if (cancelarRef.current) {
                    cancelarRef.current = false;
                    setErroOrcado(null);
                    setTexto(atual);
                    return;
                  }
                  confirmarOrcado();
                }}
                aria-label={
                  emPct
                    ? `Orçado de ${sub.nome} em % da receita`
                    : `Orçado de ${sub.nome} em ${categoriaNome}`
                }
                aria-invalid={erroOrcado ? true : undefined}
                className={INPUT}
              />
              {emPct && <span className="text-xs text-gray-500 dark:text-gray-400">%</span>}
            </span>
            {emPct && (
              <small className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                = {num(sub.orcado)}
              </small>
            )}
            {erroOrcado && (
              <span role="alert" className={`mt-0.5 max-w-[14rem] text-xs ${SELO_TEXTO.estourou}`}>
                {erroOrcado}
              </span>
            )}
          </span>
        ) : (
          <span className="tabular-nums text-gray-700 dark:text-gray-200">
            {sub.orcado > 0 ? num(sub.orcado) : '—'}
          </span>
        )}
      </td>
      <td className={`${TABLE_STYLES.td} text-right tabular-nums`}>
        {sub.realizado !== 0 ? (
          num(sub.realizado)
        ) : (
          <span className="text-gray-400 dark:text-gray-500">—</span>
        )}
      </td>
      <td
        className={`${TABLE_STYLES.td} text-right tabular-nums ${
          dif.negativa
            ? SELO_TEXTO.estourou
            : dif.texto === '—'
              ? 'text-gray-400 dark:text-gray-500'
              : ''
        }`}
      >
        {dif.texto}
      </td>
      <td className={TABLE_STYLES.td}>
        <BarraConsumo
          consumido={sub.consumido}
          status={sub.status}
          ritmo={ritmo}
          tituloRitmo={tituloRitmo}
        />
      </td>
      <td className={`${TABLE_STYLES.td} text-center`}>
        <MenuSubcategoria
          sub={sub}
          poupanca={poupanca}
          onRenomear={iniciarRenomear}
          onAlternarFixa={onAlternarFixa}
          onBuscarImpacto={onBuscarImpacto}
          onExcluir={onExcluir}
        />
      </td>
    </tr>
  );
}
