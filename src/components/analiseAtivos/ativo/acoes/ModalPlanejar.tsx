'use client';

/**
 * Modal "Planejar na carteira · ‹ticker›" / "Ajustar plano" (v2.5, spec §3.2, caso 33). Campo
 * "Peso-alvo na carteira (%)" (em branco, placeholder "ex.: 5"), a classe no Planejamento, a posição
 * atual e o resumo ao vivo (valor equivalente, quantidade equivalente e "Posição atual vs. alvo:
 * −2,2 p.p. (R$ 3.633 · 69 ações)"). "Salvar no Planejamento" grava em planning_asset_targets
 * (PUT /api/analise-ativos/alvos/[ticker]) e acende o chip "Planejado"; "Remover do plano" apaga.
 *
 * Base ÚNICA = carteira TOTAL (totalDinheiro do resumo). NÃO lê nem grava o Objetivo da Carteira
 * (rotas /objetivo e /planejados ficam de fora); quando a aba tem Objetivo > 0, só a linha
 * informativa (decisão 1). Linguagem de desvio (nunca "faltam"). Consultor agindo: pode planejar,
 * com o aviso de que grava no Planejamento do cliente (rec. 9).
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import ModalAnalise, {
  AvisoConsultor,
  BOTAO_MODAL_PRIMARIO,
  BOTAO_MODAL_SECUNDARIO,
  FOCO_MODAL,
  SUBTITULO_MODAL,
} from '@/components/analiseAtivos/ativo/acoes/ModalAnalise';
import { useNaCarteiraAtivo } from '@/components/analiseAtivos/ativo/usuario/useNaCarteiraAtivo';
import { mostrarToastMover } from '@/components/carteira/mover/moverToast';
import { useMutacoesCarteiraAnalise } from '@/hooks/useAcoesCarteiraAnalise';
import { desvioAlvo } from '@/services/analiseAtivos/regras/carteira/desvioAlvo';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import {
  CLASSE_CARTEIRA,
  TEXTOS_ACOES_CARTEIRA,
} from '@/services/analiseAtivos/textosAcoesCarteira';
import { formatNumber } from '@/utils/format';
import type { ModalPlanejarProps } from '@/types/analiseAtivosCriterios';

export type { ModalPlanejarProps };

const T = TEXTOS_ACOES_CARTEIRA.planejar;
const MENOS = '−';

/** '25,0%' (1 casa). */
export const pct1 = (v: number) => `${formatNumber(v, 1)}%`;
/** '−4,6 p.p.' / '+1,2 p.p.' / '0,0 p.p.' (sinal tipográfico). */
export function ppComSinal(v: number): string {
  const s = formatNumber(Math.abs(v), 1);
  if (s === '0,0') return '0,0 p.p.';
  return `${v < 0 ? MENOS : '+'}${s} p.p.`;
}
/** R$ sem centavos ('R$ 1.349'). */
export const reais0 = (v: number) =>
  `R$ ${Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
const inteiro = (v: number) => Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/** '25' / '25,5' / '25.5' → número; vazio ou inválido → null. */
export function lerPercentual(texto: string): number | null {
  const t = texto.trim().replace('%', '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const LINHA_FORM =
  'flex items-center justify-between gap-3 border-b border-dashed border-gray-200 py-2 text-[13.5px] text-gray-700 dark:border-gray-800 dark:text-gray-300';

export default function ModalPlanejar({
  aberto,
  onFechar,
  ticker,
  classe,
  assetId,
  preco,
}: ModalPlanejarProps) {
  const t = ticker.toUpperCase();
  const cl = CLASSE_CARTEIRA[classe];
  const dados = useNaCarteiraAtivo(t, classe, { base: aberto });
  const { salvarAlvo, removerAlvo } = useMutacoesCarteiraAnalise();
  const campoId = useId();
  const resumoId = useId();
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const alvoAtual = dados.alvoPct;
  const temPlano = alvoAtual !== null;
  const aba = dados.abaNome ?? dados.abaBaseNome ?? cl.aba;
  const pendente = salvarAlvo.isPending || removerAlvo.isPending;

  // Ao abrir, o campo começa com o alvo gravado (ou em branco) — também quando o overlay chega
  // depois de abrir, enquanto o usuário não tiver digitado.
  const editadoRef = useRef(false);
  useEffect(() => {
    if (!aberto) {
      editadoRef.current = false;
      return;
    }
    if (editadoRef.current) return;
    setTexto(alvoAtual !== null ? formatNumber(alvoAtual, alvoAtual % 1 === 0 ? 0 : 1) : '');
    setErro(null);
  }, [aberto, alvoAtual]);

  const valor = lerPercentual(texto);
  const linha = dados.linha;
  const valorPosicao = dados.status === 'posicao' ? (linha?.valorAtualizado ?? 0) : 0;
  const cotacao = preco ?? (linha && linha.cotacaoAtual > 0 ? linha.cotacaoAtual : null);
  const conta = useMemo(
    () =>
      dados.valorBase === null
        ? null
        : desvioAlvo({
            valorPosicao,
            valorBase: dados.valorBase,
            alvoPct: valor,
            preco: cotacao,
          }),
    [dados.valorBase, valorPosicao, valor, cotacao],
  );

  const podeGravar = !!assetId && dados.status !== 'carregando' && dados.status !== 'erro';

  const salvar = async () => {
    if (!podeGravar || pendente) return;
    if (valor === null || !(valor > 0) || valor > 100) {
      setErro(T.erroFaixa);
      document.getElementById(campoId)?.focus();
      return;
    }
    setErro(null);
    const pct = Math.round(valor * 1000) / 1000;
    try {
      await salvarAlvo.mutateAsync({ ticker: t, targetPct: pct });
      mostrarToastMover({
        tipo: 'ok',
        mensagem: formatarTexto(T.salvo, { ticker: t, pct: pct1(pct) }),
      });
      onFechar();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  const remover = async () => {
    if (!podeGravar || pendente) return;
    setErro(null);
    try {
      await removerAlvo.mutateAsync(t);
      mostrarToastMover({ tipo: 'ok', mensagem: formatarTexto(T.removido, { ticker: t }) });
      onFechar();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  const classeLinha =
    dados.classePct !== null
      ? formatarTexto(
          dados.classeAlvo !== null && dados.classeAlvo > 0 ? T.classeValor : T.classeSemAlvo,
          {
            aba,
            pct: pct1(dados.classePct),
            alvo: `${formatNumber(dados.classeAlvo ?? 0, 0)}%`,
          },
        )
      : '—';
  const posicaoLinha =
    dados.status === 'posicao' && linha && conta
      ? formatarTexto(T.posicaoValor, {
          qtd: inteiro(linha.quantidade),
          un: cl.un,
          pct: pct1(conta.posicaoPct),
          valor: reais0(linha.valorAtualizado),
        })
      : dados.status === 'posicao'
        ? '—'
        : T.semPosicao;

  const rodape = (
    <>
      {temPlano ? (
        <button
          type="button"
          className={BOTAO_MODAL_SECUNDARIO}
          disabled={!podeGravar || pendente}
          onClick={() => void remover()}
          data-remover-plano=""
        >
          {T.remover}
        </button>
      ) : null}
      <button type="button" className={BOTAO_MODAL_SECUNDARIO} onClick={onFechar}>
        {TEXTOS_ACOES_CARTEIRA.modal.cancelar}
      </button>
      <button
        type="button"
        className={BOTAO_MODAL_PRIMARIO}
        disabled={!podeGravar || pendente}
        onClick={() => void salvar()}
        data-salvar-plano=""
      >
        {salvarAlvo.isPending ? TEXTOS_ACOES_CARTEIRA.modal.salvando : T.salvar}
      </button>
    </>
  );

  const carregando = dados.status === 'carregando' || dados.carregandoNumeros;

  return (
    <ModalAnalise
      aberto={aberto}
      onFechar={onFechar}
      titulo={formatarTexto(temPlano ? T.tituloAjustar : T.tituloNovo, { ticker: t })}
      rodape={rodape}
    >
      <p className={SUBTITULO_MODAL}>{formatarTexto(T.subtitulo, { ticker: t })}</p>
      <AvisoConsultor className="mb-2" />
      <div className="flex flex-col" data-modal-planejar="">
        <div className={LINHA_FORM}>
          <label htmlFor={campoId}>{T.campo}</label>
          <span className="inline-flex items-center gap-1.5">
            <input
              id={campoId}
              data-autofocus=""
              inputMode="decimal"
              autoComplete="off"
              value={texto}
              placeholder={T.placeholder}
              aria-describedby={resumoId}
              aria-invalid={erro === T.erroFaixa}
              onChange={(e) => {
                editadoRef.current = true;
                setTexto(e.target.value);
                if (erro) setErro(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void salvar();
              }}
              className={`min-h-12 w-[110px] rounded-lg border border-gray-300 bg-gray-50 px-2.5 text-right text-base text-gray-800 lg:min-h-11 lg:text-sm tabular-nums dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 ${FOCO_MODAL}`}
            />
            <em className="text-[13px] not-italic text-gray-500 dark:text-gray-400">%</em>
          </span>
        </div>
        <div className={LINHA_FORM}>
          <span>{T.classe}</span>
          <span className="text-right text-[13px]">{carregando ? '…' : classeLinha}</span>
        </div>
        <div className={LINHA_FORM}>
          <span>{T.posicao}</span>
          <span className="text-right text-[13px] tabular-nums">
            {carregando ? '…' : posicaoLinha}
          </span>
        </div>
        {dados.objetivoAbaPct !== null ? (
          <p className="mt-1.5 text-[12.5px] text-gray-500 dark:text-gray-400" data-objetivo-aba="">
            {formatarTexto(T.objetivoAba, {
              aba,
              pct: `${formatNumber(dados.objetivoAbaPct, 0)}%`,
            })}
          </p>
        ) : null}
        <div
          id={resumoId}
          aria-live="polite"
          data-resumo-plano=""
          className="mt-3 flex flex-wrap justify-between gap-2.5 rounded-[10px] bg-[#EDF2F8] px-3 py-2.5 text-[13px] text-gray-700 dark:bg-white/5 dark:text-gray-300"
        >
          {conta && valor !== null && conta.alvoValor !== null && conta.desvioPp !== null ? (
            <>
              <span>
                {T.valorAlvo}
                <b className="block text-[14.5px] text-gray-900 tabular-nums dark:text-white">
                  {reais0(conta.alvoValor)}
                </b>
              </span>
              {conta.alvoQtd !== null ? (
                <span>
                  {formatarTexto(T.qtdAlvo, { un: cl.un })}
                  <b className="block text-[14.5px] text-gray-900 tabular-nums dark:text-white">
                    {inteiro(conta.alvoQtd)}
                  </b>
                </span>
              ) : null}
              <span>
                {T.desvio}
                <b className="block text-[14.5px] text-gray-900 tabular-nums dark:text-white">
                  {formatarTexto(conta.desvioQtd !== null ? T.desvioValor : T.desvioSemQtd, {
                    pp: ppComSinal(conta.desvioPp),
                    valor: reais0(conta.desvioValor ?? 0),
                    qtd: inteiro(conta.desvioQtd ?? 0),
                    un: cl.un,
                  })}
                </b>
              </span>
            </>
          ) : (
            <span>{T.resumoVazio}</span>
          )}
        </div>
        {erro ? (
          <p role="alert" className="mt-1.5 text-[12.5px] text-[#D92D20] dark:text-[#F97066]">
            {erro}
          </p>
        ) : null}
        {dados.erroNumeros ? (
          <p role="alert" className="mt-1.5 text-[12.5px] text-[#D92D20] dark:text-[#F97066]">
            {formatarTexto(T.erroBase, { aba })}
          </p>
        ) : null}
        {!assetId ? (
          <p className="mt-2 text-[12.5px] text-gray-500 dark:text-gray-400">
            {TEXTOS_ACOES_CARTEIRA.registrar.semAtivoCatalogo}
          </p>
        ) : null}
        <p className="mt-2.5 text-[12.5px] leading-normal text-gray-500 dark:text-gray-400">
          {formatarTexto(T.nota, { ticker: t, aba })}
        </p>
      </div>
    </ModalAnalise>
  );
}
