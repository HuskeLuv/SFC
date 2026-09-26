'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import MobileSaveToast from '@/components/ui/sheet/MobileSaveToast';
import {
  MOBILE_FIELD_CLASS,
  MOBILE_FIELD_ERROR_TEXT_CLASS,
  MOBILE_FIELD_HINT_CLASS,
  MOBILE_FIELD_LABEL_CLASS,
  MobileNumberField,
} from '@/components/ui/sheet/MobileNumberField';
import { useAuthOptional } from '@/context/AuthContext';
import { useCashflowYear } from '@/context/CashflowYearContext';
import { useCashflowData } from '@/hooks/useCashflow';
import {
  LancamentoRapidoError,
  useLancamentoRapido,
  type LancamentoRapidoCampos,
} from '@/hooks/useLancamentoRapido';
import { useUndoAlteracao } from '@/hooks/useUndoAlteracao';
import { emitCashflowFlash } from '@/lib/cashflow/cashflowEvents';
import type { PreviaLancamento } from '@/lib/cashflow/lancamentoRapidoSchema';
import { gravarRecente, lerRecentes, resolverRecentes } from '@/lib/cashflow/lancamentoRecentes';
import { parseDecimalInput } from '@/lib/ui/numberInput';
import { listarLinhasEditaveis, type LinhaEditavel } from '@/services/cashflow/linhasEditaveis';
import { formatBRL } from '@/utils/format';

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];
const MESES_CURTOS = MESES.map((m) => m.slice(0, 3));

type Tipo = 'despesa' | 'entrada';
type Painel = 'form' | 'busca' | 'previa';

/** Mês que o sheet abre: hoje no ano corrente; dezembro num ano passado; janeiro num futuro. */
export function mesInicialLancamento(ano: number, hoje: Date = new Date()): number {
  const anoAtual = hoje.getFullYear();
  if (ano === anoAtual) return hoje.getMonth();
  return ano < anoAtual ? 11 : 0;
}

/** Minúsculas e sem acento ("Farmácia" → "farmacia"). */
export function normalizarBusca(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

const trilhaLegivel = (trilha: string) => trilha.split(' > ').join(' › ');

const PRIMARY_BUTTON =
  'inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-mf-patrimonio px-3 text-base font-semibold text-white disabled:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0079F2]';
const SECONDARY_BUTTON =
  'h-12 flex-1 rounded-xl border border-gray-300 text-base font-medium text-gray-700 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200';
const RED_TEXT = 'text-[#D92D20] dark:text-[#F97066]';

function Spinner() {
  return (
    <svg className="h-4 w-4 motion-safe:animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

interface Erros {
  valor?: string;
  linha?: string;
  ack?: string;
  geral?: string;
}

export interface LancamentoFeito {
  mensagem: string;
  changeLogId: string | null;
}

/**
 * Conteúdo do lançamento rápido (montado só com o sheet aberto: é ele que busca a árvore do fluxo).
 * Painéis no mesmo sheet: formulário → busca da linha → prévia (confirmar:false) → Lançar.
 */
function LancamentoRapidoConteudo({
  onClose,
  onLancado,
}: {
  onClose: () => void;
  onLancado: (feito: LancamentoFeito) => void;
}) {
  const { year: ano } = useCashflowYear();
  const auth = useAuthOptional();
  const userId = auth?.actingClient?.id ?? auth?.user?.id ?? null;
  const { data: groups, loading } = useCashflowData(ano);
  const { preview, confirmar } = useLancamentoRapido();

  const linhas = useMemo(() => listarLinhasEditaveis(groups ?? []), [groups]);
  const [recentes] = useState(() => lerRecentes(userId));

  const [painel, setPainel] = useState<Painel>('form');
  const [tipo, setTipo] = useState<Tipo>('despesa');
  const [valorTxt, setValorTxt] = useState('');
  const [linha, setLinha] = useState<LinhaEditavel | null>(null);
  const [mes, setMes] = useState(() => mesInicialLancamento(ano));
  const [recorrente, setRecorrente] = useState(false);
  const [mesFim, setMesFim] = useState(11);
  const [descricao, setDescricao] = useState('');
  const [busca, setBusca] = useState('');
  const [erros, setErros] = useState<Erros>({});
  const [previa, setPrevia] = useState<PreviaLancamento | null>(null);
  const [aceita, setAceita] = useState(false);
  const [pendente, setPendente] = useState<'previa' | 'lancar' | null>(null);

  const formId = useId();
  const ids = {
    valor: `${formId}-valor`,
    linha: `${formId}-linha`,
    linhaErro: `${formId}-linha-erro`,
    mes: `${formId}-mes`,
    ate: `${formId}-ate`,
    desc: `${formId}-desc`,
    busca: `${formId}-busca`,
    previa: `${formId}-previa`,
    ack: `${formId}-ack`,
    ackErro: `${formId}-ack-erro`,
  };
  const pickerRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const previaTitleRef = useRef<HTMLHeadingElement>(null);
  const voltarParaPicker = useRef(false);

  useEffect(() => {
    if (painel === 'form') {
      // O mês escolhido visível no trilho (o de hoje ao abrir).
      const chip = railRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (chip && typeof chip.scrollIntoView === 'function') {
        chip.scrollIntoView({ block: 'nearest', inline: 'center' });
      }
      if (voltarParaPicker.current) {
        voltarParaPicker.current = false;
        pickerRef.current?.focus();
      }
    }
    if (painel === 'previa') previaTitleRef.current?.focus();
  }, [painel]);

  const valor = useMemo(() => {
    const n = parseDecimalInput(valorTxt);
    return n === null ? null : Math.round(n * 100) / 100;
  }, [valorTxt]);
  const valorOk = valor !== null && valor > 0 && valor <= 1e10;

  const sugestoes = useMemo(
    () => resolverRecentes(recentes, linhas).filter((l) => l.grupoTipo === tipo),
    [recentes, linhas, tipo],
  );

  const resultadosBusca = useMemo(() => {
    const q = normalizarBusca(busca);
    const grupos = new Map<string, LinhaEditavel[]>();
    for (const l of linhas) {
      if (l.grupoTipo !== tipo) continue;
      if (
        q &&
        !normalizarBusca(l.itemNome).includes(q) &&
        !normalizarBusca(l.grupoNome).includes(q)
      )
        continue;
      const lista = grupos.get(l.grupoNome) ?? [];
      lista.push(l);
      grupos.set(l.grupoNome, lista);
    }
    return [...grupos.entries()];
  }, [linhas, tipo, busca]);

  const campos = useCallback((): LancamentoRapidoCampos | null => {
    if (!linha || !valorOk || valor === null) return null;
    const desc = descricao.trim();
    return {
      itemId: linha.itemId,
      valor,
      ano,
      mes,
      recorrente,
      ...(recorrente ? { mesFim } : {}),
      ...(desc ? { descricao: desc } : {}),
    };
  }, [linha, valorOk, valor, descricao, ano, mes, recorrente, mesFim]);

  const trocarTipo = (novo: Tipo) => {
    if (novo === tipo) return;
    setTipo(novo);
    if (linha && linha.grupoTipo !== novo) setLinha(null);
  };

  const escolherLinha = (l: LinhaEditavel) => {
    setLinha(l);
    setErros((e) => ({ ...e, linha: undefined, geral: undefined }));
  };

  const revisar = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const novos: Erros = {};
    if (!valorOk) novos.valor = 'Digite um valor maior que zero, como 45,90.';
    if (!linha) novos.linha = 'Escolha em qual linha do fluxo o valor entra.';
    setErros(novos);
    if (novos.valor) {
      document.getElementById(ids.valor)?.focus();
      return;
    }
    if (novos.linha) {
      pickerRef.current?.focus();
      return;
    }
    const c = campos();
    if (!c) return;
    setPendente('previa');
    try {
      const p = await preview(c);
      setPrevia(p);
      setAceita(false);
      setPainel('previa');
    } catch (error: unknown) {
      setErros({
        geral: error instanceof Error ? error.message : 'Não foi possível montar a prévia.',
      });
    } finally {
      setPendente(null);
    }
  };

  const lancar = async () => {
    const c = campos();
    if (!c || !previa) return;
    const reducoes = previa.celulas.filter((cel) => cel.diminui).length;
    if (reducoes > 0 && !aceita) {
      setErros({ ack: 'Marque a confirmação acima: alguns meses vão ficar com valor menor.' });
      document.getElementById(ids.ack)?.focus();
      return;
    }
    setErros({});
    setPendente('lancar');
    try {
      const feito = await confirmar({ ...c, aceitaReducao: aceita });
      const primeiroMes = feito.resultado.celulas[0]?.mes ?? c.mes;
      gravarRecente(userId, {
        itemId: feito.resultado.itemId,
        nome: feito.previa.itemNome,
        trilha: feito.resultado.grupoNome,
      });
      const quando =
        recorrente && mesFim !== mes
          ? `${MESES[mes].toLowerCase()} a ${MESES[mesFim].toLowerCase()}`
          : MESES[mes].toLowerCase();
      onLancado({
        mensagem: `Lançado: ${formatBRL(c.valor)}${recorrente ? '/mês' : ''} em ${feito.previa.itemNome} (${quando})`,
        changeLogId: feito.changeLogId,
      });
      // Se a visão do mês estiver montada, ela vai para o mês, abre o grupo e pisca a linha.
      emitCashflowFlash({ itemId: feito.resultado.itemId, year: ano, month: primeiroMes });
    } catch (error: unknown) {
      if (error instanceof LancamentoRapidoError && error.status === 409 && error.previa) {
        setPrevia(error.previa);
        setAceita(false);
      }
      setErros({
        geral: error instanceof Error ? error.message : 'Não foi possível lançar agora.',
      });
      setPendente(null);
    }
  };

  const erroGeral = erros.geral ? (
    <p role="alert" className={twMerge(MOBILE_FIELD_ERROR_TEXT_CLASS, 'mt-0')}>
      {erros.geral}
    </p>
  ) : null;

  let footer: React.ReactNode;
  if (painel === 'form') {
    footer = (
      <div className="flex flex-col gap-2">
        {erroGeral}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
            Cancelar
          </button>
          <button
            type="submit"
            form={formId}
            disabled={pendente !== null}
            aria-busy={pendente === 'previa' || undefined}
            className={PRIMARY_BUTTON}
          >
            {pendente === 'previa' && <Spinner />}
            Revisar
          </button>
        </div>
      </div>
    );
  } else if (painel === 'busca') {
    footer = (
      <button
        type="button"
        onClick={() => {
          voltarParaPicker.current = true;
          setPainel('form');
        }}
        className={twMerge(SECONDARY_BUTTON, 'w-full')}
      >
        Voltar
      </button>
    );
  } else {
    footer = (
      <div className="flex flex-col gap-2">
        {erroGeral}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setErros({});
              setPainel('form');
            }}
            disabled={pendente === 'lancar'}
            className={SECONDARY_BUTTON}
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={lancar}
            disabled={pendente === 'lancar'}
            aria-busy={pendente === 'lancar' || undefined}
            className={twMerge(PRIMARY_BUTTON, 'flex-[2] leading-tight')}
          >
            {pendente === 'lancar' && <Spinner />}
            {pendente === 'lancar'
              ? 'Lançando…'
              : `Lançar ${formatBRL(valor ?? 0)}${recorrente ? '/mês' : ''}`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <BottomSheet
      isOpen
      onClose={onClose}
      title="Lançar despesa ou receita"
      footer={footer}
      className="h-[calc(100dvh-env(safe-area-inset-top)-12px)]"
    >
      <div data-mf-lancamento-rapido="" data-painel={painel} className="pb-3">
        {painel === 'form' && (
          <form id={formId} onSubmit={revisar} noValidate className="flex flex-col gap-4 pt-1">
            <div
              role="radiogroup"
              aria-label="Tipo de lançamento"
              className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1 dark:bg-white/5"
            >
              {(
                [
                  ['despesa', 'Despesa'],
                  ['entrada', 'Receita'],
                ] as const
              ).map(([valorTipo, rotulo]) => {
                const ativo = tipo === valorTipo;
                return (
                  <button
                    key={valorTipo}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    onClick={() => trocarTipo(valorTipo)}
                    className={twMerge(
                      'h-11 rounded-lg text-[15px] font-medium text-gray-600 dark:text-gray-300',
                      ativo &&
                        'bg-white font-semibold text-mf-patrimonio shadow-sm dark:bg-gray-800 dark:text-mf-tranquilidade',
                    )}
                  >
                    {rotulo}
                  </button>
                );
              })}
            </div>

            <MobileNumberField
              id={ids.valor}
              label={recorrente ? 'Valor por mês' : 'Valor'}
              kind="currency"
              prefix="R$"
              value={valorTxt}
              onChange={(v) => {
                setValorTxt(v);
                if (erros.valor) setErros((e) => ({ ...e, valor: undefined }));
              }}
              error={erros.valor}
              enterKeyHint="next"
              autoFocus
            />

            <div>
              <span id={ids.linha} className={MOBILE_FIELD_LABEL_CLASS}>
                Linha do fluxo
              </span>
              <button
                ref={pickerRef}
                type="button"
                onClick={() => {
                  setBusca('');
                  setPainel('busca');
                }}
                aria-labelledby={ids.linha}
                aria-describedby={erros.linha ? ids.linhaErro : undefined}
                className={twMerge(
                  MOBILE_FIELD_CLASS,
                  'flex h-auto min-h-12 items-center gap-2 py-2 text-left',
                  erros.linha && 'border-[#D92D20] dark:border-[#F97066]',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {linha ? linha.itemNome : 'Escolher linha'}
                  </span>
                  <span className="block truncate text-[13px] text-gray-500 dark:text-gray-400">
                    {linha
                      ? trilhaLegivel(linha.grupoNome)
                      : tipo === 'despesa'
                        ? 'Ex.: Supermercado, Farmácia, Combustível'
                        : 'Ex.: Salário, Freelas'}
                  </span>
                </span>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                  className="shrink-0 text-gray-400"
                >
                  <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
                  <path
                    d="M16 16l4 4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              {erros.linha && (
                <p id={ids.linhaErro} role="alert" className={MOBILE_FIELD_ERROR_TEXT_CLASS}>
                  {erros.linha}
                </p>
              )}
              {sugestoes.length > 0 && (
                <div role="group" aria-label="Recentes" className="mt-2 flex flex-wrap gap-2">
                  {sugestoes.map((s) => (
                    <button
                      key={s.itemId}
                      type="button"
                      aria-pressed={linha?.itemId === s.itemId}
                      onClick={() => escolherLinha(s)}
                      className={twMerge(
                        'min-h-11 max-w-full truncate rounded-full border border-gray-300 px-4 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-200',
                        linha?.itemId === s.itemId &&
                          'border-mf-patrimonio bg-mf-patrimonio/10 font-semibold text-mf-patrimonio dark:border-mf-tranquilidade dark:bg-mf-tranquilidade/15 dark:text-mf-tranquilidade',
                      )}
                    >
                      {s.itemNome}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <span id={ids.mes} className={MOBILE_FIELD_LABEL_CLASS}>
                {recorrente ? 'A partir de' : 'Mês'} ({ano})
              </span>
              <div
                ref={railRef}
                data-mf-scroll-x=""
                role="group"
                aria-labelledby={ids.mes}
                className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
              >
                {MESES_CURTOS.map((curto, i) => {
                  const ativo = mes === i;
                  return (
                    <button
                      key={curto}
                      type="button"
                      aria-pressed={ativo}
                      aria-label={MESES[i]}
                      onClick={() => {
                        setMes(i);
                        if (mesFim < i) setMesFim(11);
                      }}
                      className={twMerge(
                        'h-11 min-w-[52px] shrink-0 rounded-full border border-gray-300 px-3 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200',
                        ativo &&
                          'border-mf-patrimonio bg-mf-patrimonio text-white dark:border-mf-tranquilidade dark:bg-mf-tranquilidade dark:text-mf-potencia',
                      )}
                    >
                      {curto}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <button
                type="button"
                role="switch"
                aria-checked={recorrente}
                onClick={() => setRecorrente((r) => !r)}
                className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-gray-200 px-3.5 py-2 text-left dark:border-gray-800"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-gray-800 dark:text-white/90">
                    Definir este valor em todo mês até
                  </span>
                  <span className="block text-[13px] leading-snug text-gray-500 dark:text-gray-400">
                    {recorrente
                      ? `De ${MESES[mes].toLowerCase()} até ${MESES[mesFim].toLowerCase()}. Substitui o valor de cada mês; não soma.`
                      : 'Para contas fixas: aluguel, escola, salário.'}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={twMerge(
                    'relative h-7 w-12 shrink-0 rounded-full bg-gray-300 transition-colors dark:bg-gray-700',
                    recorrente && 'bg-mf-patrimonio dark:bg-mf-tranquilidade',
                  )}
                >
                  <span
                    className={twMerge(
                      'absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform',
                      recorrente && 'translate-x-5',
                    )}
                  />
                </span>
              </button>
              {recorrente && (
                <div className="mt-3">
                  <label htmlFor={ids.ate} className={MOBILE_FIELD_LABEL_CLASS}>
                    Até
                  </label>
                  <select
                    id={ids.ate}
                    value={mesFim}
                    onChange={(e) => setMesFim(Number(e.target.value))}
                    className={MOBILE_FIELD_CLASS}
                  >
                    {MESES.map((nome, i) =>
                      i >= mes ? (
                        <option key={nome} value={i}>
                          {nome} de {ano}
                        </option>
                      ) : null,
                    )}
                  </select>
                  <p className={MOBILE_FIELD_HINT_CLASS}>
                    Substitui o valor de cada mês; não soma. Meses anteriores não mudam.
                  </p>
                </div>
              )}
            </div>

            <div>
              <label htmlFor={ids.desc} className={MOBILE_FIELD_LABEL_CLASS}>
                Descrição <span className="font-normal text-gray-500">(opcional)</span>
              </label>
              <input
                id={ids.desc}
                type="text"
                value={descricao}
                maxLength={200}
                enterKeyHint="done"
                autoComplete="off"
                placeholder="Ex.: remédio da Laura"
                onChange={(e) => setDescricao(e.target.value)}
                aria-describedby={`${ids.desc}-dica`}
                className={MOBILE_FIELD_CLASS}
              />
              <p id={`${ids.desc}-dica`} className={MOBILE_FIELD_HINT_CLASS}>
                Vai para o comentário da célula. Sem descrição, o comentário não muda.
              </p>
            </div>
          </form>
        )}

        {painel === 'busca' && (
          <div className="flex flex-col gap-2 pt-1">
            <div className="sticky top-0 z-[1] bg-white pb-2 dark:bg-gray-900">
              <label htmlFor={ids.busca} className={MOBILE_FIELD_LABEL_CLASS}>
                Buscar linha de {tipo === 'despesa' ? 'despesa' : 'receita'}
              </label>
              <input
                id={ids.busca}
                type="search"
                value={busca}
                autoFocus
                enterKeyHint="search"
                autoComplete="off"
                placeholder="Ex.: mercado, escola, luz"
                onChange={(e) => setBusca(e.target.value)}
                className={MOBILE_FIELD_CLASS}
              />
            </div>
            {loading && linhas.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                Carregando linhas…
              </p>
            ) : resultadosBusca.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                {busca.trim()
                  ? `Nenhuma linha de ${tipo === 'despesa' ? 'despesa' : 'receita'} com "${busca.trim()}". Crie a linha no ⋯ do grupo, na aba Fluxo.`
                  : 'Nenhuma linha disponível.'}
              </p>
            ) : (
              <ul aria-label="Linhas encontradas" className="flex flex-col gap-3">
                {resultadosBusca.map(([trilha, itens]) => (
                  <li key={trilha}>
                    <p className="mb-1 px-1 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
                      {trilhaLegivel(trilha)}
                    </p>
                    <ul className="flex flex-col">
                      {itens.map((l) => (
                        <li key={l.itemId}>
                          <button
                            type="button"
                            aria-current={linha?.itemId === l.itemId ? 'true' : undefined}
                            onClick={() => {
                              escolherLinha(l);
                              voltarParaPicker.current = true;
                              setPainel('form');
                            }}
                            className="flex min-h-12 w-full items-center rounded-xl px-3 text-left text-[15px] text-gray-800 active:bg-gray-100 dark:text-white/90 dark:active:bg-white/5"
                          >
                            <span className="min-w-0 flex-1 truncate">{l.itemNome}</span>
                            {linha?.itemId === l.itemId && (
                              <span className="ml-2 text-sm font-semibold text-mf-patrimonio dark:text-mf-tranquilidade">
                                Escolhida
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {painel === 'previa' && previa && (
          <PreviaPainel
            previa={previa}
            titleId={ids.previa}
            titleRef={previaTitleRef}
            comDescricao={descricao.trim().length > 0}
            aceita={aceita}
            onAceitaChange={(v) => {
              setAceita(v);
              if (v) setErros((e) => ({ ...e, ack: undefined }));
            }}
            ackId={ids.ack}
            ackErroId={ids.ackErro}
            erroAck={erros.ack}
          />
        )}
      </div>
    </BottomSheet>
  );
}

function PreviaPainel({
  previa,
  titleId,
  titleRef,
  comDescricao,
  aceita,
  onAceitaChange,
  ackId,
  ackErroId,
  erroAck,
}: {
  previa: PreviaLancamento;
  titleId: string;
  titleRef: React.RefObject<HTMLHeadingElement | null>;
  comDescricao: boolean;
  aceita: boolean;
  onAceitaChange: (v: boolean) => void;
  ackId: string;
  ackErroId: string;
  erroAck?: string;
}) {
  const reducoes = previa.celulas.filter((c) => c.diminui);
  const comFormula = previa.celulas.filter((c) => c.temFormula).length;
  const definir = previa.modo === 'definir';

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3 pt-1" aria-live="polite">
      <div>
        <h3
          id={titleId}
          ref={titleRef}
          tabIndex={-1}
          className="text-lg font-semibold text-gray-800 outline-none dark:text-white/90"
        >
          {previa.itemNome}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {previa.tipo === 'despesa' ? 'Despesa' : 'Receita'} · {trilhaLegivel(previa.trilha)}
        </p>
      </div>

      <ul className="flex flex-col divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
        {previa.celulas.map((c) => {
          const muda = c.valorAtual !== c.valorNovo;
          return (
            <li
              key={c.mes}
              data-diminui={c.diminui ? '' : undefined}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3.5 py-2.5"
            >
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {MESES[c.mes]}/{previa.ano}
              </span>
              <span className="text-[15px] text-gray-800 tabular-nums dark:text-white/90">
                {muda ? (
                  <>
                    <span className="text-gray-500 dark:text-gray-400">
                      {formatBRL(c.valorAtual)}
                    </span>
                    <span aria-hidden="true"> → </span>
                    <span className="sr-only"> passa para </span>
                  </>
                ) : null}
                <span className={twMerge('font-semibold', c.diminui && RED_TEXT)}>
                  {formatBRL(c.valorNovo)}
                </span>
                {!muda ? (
                  <span className="text-sm text-gray-500 dark:text-gray-400"> (sem mudança)</span>
                ) : null}
              </span>
              {c.diminui && (
                <span className={twMerge('w-full text-right text-[13px] font-medium', RED_TEXT)}>
                  <span aria-hidden="true">↓ </span>diminui {formatBRL(c.valorAtual - c.valorNovo)}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-[13px] leading-snug text-gray-500 dark:text-gray-400">
        {definir
          ? `Nos meses listados a linha passa a valer ${formatBRL(previa.valor)}: o valor que estava lá é trocado, não somado.`
          : `Soma ${formatBRL(previa.valor)} ao que já está no mês.`}{' '}
        {comDescricao
          ? 'A descrição vai para o comentário da célula.'
          : 'Sem descrição, o comentário da célula não muda.'}
      </p>

      {comFormula > 0 && (
        <p className="rounded-xl bg-gray-100 px-3.5 py-2.5 text-[13px] text-gray-700 dark:bg-white/5 dark:text-gray-200">
          {comFormula === 1 && previa.celulas.length === 1
            ? 'A fórmula desta célula será substituída por valor fixo.'
            : `A fórmula de ${comFormula} ${comFormula === 1 ? 'mês' : 'meses'} será substituída por valor fixo.`}
        </p>
      )}

      {reducoes.length > 0 && (
        <div>
          <label
            htmlFor={ackId}
            className="flex min-h-11 items-start gap-3 rounded-xl border border-[#D92D20]/40 px-3.5 py-2.5 dark:border-[#F97066]/40"
          >
            <input
              id={ackId}
              type="checkbox"
              checked={aceita}
              onChange={(e) => onAceitaChange(e.target.checked)}
              aria-describedby={erroAck ? ackErroId : undefined}
              aria-invalid={erroAck ? true : undefined}
              className="mt-0.5 h-5 w-5 shrink-0 accent-mf-patrimonio"
            />
            <span className="text-sm text-gray-800 dark:text-white/90">
              Entendi que{' '}
              {reducoes.length === 1
                ? '1 mês vai diminuir'
                : `${reducoes.length} meses vão diminuir`}
              .
            </span>
          </label>
          {erroAck && (
            <p id={ackErroId} role="alert" className={MOBILE_FIELD_ERROR_TEXT_CLASS}>
              {erroAck}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export interface LancamentoRapidoSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * "+ Lançar → Despesa ou receita" (PWA fase 2), em qualquer tela: sheet alto com tipo, valor,
 * linha (Recentes + busca sem acento), mês, "Definir este valor em todo mês até…", descrição,
 * prévia antes → depois pela rota (confirmar:false) e Lançar. Depois de lançar fica na tela e mostra
 * o aviso com Desfazer (único lugar da fase 2 com Desfazer). Mantenha MONTADO: o aviso vive aqui.
 */
export default function LancamentoRapidoSheet({ isOpen, onClose }: LancamentoRapidoSheetProps) {
  const [aviso, setAviso] = useState<LancamentoFeito | null>(null);
  const undo = useUndoAlteracao();
  // A barra de abas vem do servidor: o aviso (portal no body) só entra depois da hidratação, senão
  // o HTML do servidor (sem portal) não bate com o do cliente.
  const [hidratado, setHidratado] = useState(false);
  useEffect(() => setHidratado(true), []);

  const desfazer = useCallback(
    (changeLogId: string) => {
      undo
        .mutateAsync(changeLogId)
        .then(() => setAviso({ mensagem: 'Lançamento desfeito', changeLogId: null }))
        .catch((error: unknown) =>
          setAviso({
            mensagem:
              error instanceof Error ? error.message : 'Não foi possível desfazer o lançamento.',
            changeLogId: null,
          }),
        );
    },
    [undo],
  );

  const changeLogId = aviso?.changeLogId ?? null;

  return (
    <>
      {isOpen ? (
        <LancamentoRapidoConteudo
          onClose={onClose}
          onLancado={(feito) => {
            onClose();
            setAviso(feito);
          }}
        />
      ) : null}
      {hidratado ? (
        <MobileSaveToast
          message={aviso?.mensagem ?? null}
          onDismiss={() => setAviso(null)}
          action={
            changeLogId ? { label: 'Desfazer', onClick: () => desfazer(changeLogId) } : undefined
          }
        />
      ) : null}
    </>
  );
}
