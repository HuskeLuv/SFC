'use client';

/**
 * Modal "Planejar na carteira · ‹ticker›" / "Ajustar plano". Desde 17/10/2026 (ticket do Pedro)
 * grava o OBJETIVO DA CARTEIRA — % DENTRO da aba, o mesmo da coluna Objetivo — por
 * PUT /api/analise-ativos/alvos/[ticker]: com posição, Portfolio.objetivo; sem posição, a linha
 * planejada da aba (Watchlist), criada na seção da Carteira. Antes ia para planning_asset_targets
 * (% da carteira total), que a Carteira nunca lia.
 *
 * Mostra o campo "Peso-alvo dentro de ‹aba› (%)", a seção na Carteira (da posição, do plano ou a
 * de secaoOperacao — a mesma escolha automática do Registrar operação; quando a Análise não sabe,
 * o usuário escolhe), a classe no Planejamento, a posição atual (% da aba), a linha informativa
 * "≈ X% da carteira total" (objetivo × peso atual da aba) e o resumo ao vivo do desvio NA BASE DA
 * ABA. "Remover do plano": posição → objetivo 0; planejado → sai da aba. Linguagem de desvio
 * (nunca "faltam"). Consultor agindo: pode planejar, com o aviso da carteira do cliente (rec. 9).
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useAtivoTopo } from '@/hooks/useAnaliseAtivos';
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
import {
  SECAO_PADRAO,
  SECOES_OPERACAO,
  secaoOperacao,
  tipoCvmDoTopo,
} from '@/services/analiseAtivos/regras/carteira/secaoOperacao';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import {
  CLASSE_CARTEIRA,
  ROTULOS_SECAO,
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
  // tipo do FII da página (mesma key do topo, sem requisição nova) → seção sugerida pela CVM
  const topo = useAtivoTopo(t, { enabled: aberto && classe === 'fii' });
  const { salvarAlvo, removerAlvo } = useMutacoesCarteiraAnalise();
  const campoId = useId();
  const secaoId = useId();
  const resumoId = useId();
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [secaoEscolhida, setSecaoEscolhida] = useState<string | null>(null);

  const objetivoAtual = dados.objetivoAbaPct;
  const temPlano = dados.temPlano;
  const aba = dados.abaNome ?? dados.abaBaseNome ?? cl.aba;
  const pendente = salvarAlvo.isPending || removerAlvo.isPending;

  // Seção na Carteira: a da posição, a do plano ou a automática do Registrar operação. Só sem
  // posição nem plano e sem indicação (origem 'padrao') o usuário escolhe.
  const secao = secaoOperacao({
    classe,
    posicao:
      dados.status === 'posicao' ? { estrategia: dados.estrategia, tipoFii: dados.tipoFii } : null,
    planejado: dados.status === 'planejado' ? { secao: dados.secaoPlanejada } : null,
    tipoCvm: topo.data ? tipoCvmDoTopo(topo.data) : null,
  });
  const criaPlanejado = dados.status === 'nada';
  const secaoEditavel = criaPlanejado && secao.origem === 'padrao';
  const secaoFinal =
    (secaoEditavel ? (secaoEscolhida ?? secao.valor) : secao.valor) ?? SECAO_PADRAO[classe];
  const rotuloSecao = ROTULOS_SECAO[secaoFinal] ?? secaoFinal;

  // Ao abrir, o campo começa com o objetivo gravado (ou em branco) — também quando o overlay chega
  // depois de abrir, enquanto o usuário não tiver digitado.
  const editadoRef = useRef(false);
  useEffect(() => {
    if (!aberto) {
      editadoRef.current = false;
      setSecaoEscolhida(null);
      return;
    }
    if (editadoRef.current) return;
    setTexto(
      objetivoAtual !== null ? formatNumber(objetivoAtual, objetivoAtual % 1 === 0 ? 0 : 1) : '',
    );
    setErro(null);
  }, [aberto, objetivoAtual]);

  const valor = lerPercentual(texto);
  // fora de (0, 100]: o resumo não calcula e o erro aparece já na digitação
  const foraDaFaixa = valor !== null && !(valor > 0 && valor <= 100);
  const valorOk = valor !== null && !foraDaFaixa ? valor : null;
  const linha = dados.linha;
  const valorPosicao = dados.status === 'posicao' ? (linha?.valorAtualizado ?? 0) : 0;
  // com posição, valor e quantidade usam a MESMA cotação (a da linha da Carteira, caso 33)
  const cotacaoLinha =
    dados.status === 'posicao' && linha && linha.cotacaoAtual > 0 ? linha.cotacaoAtual : null;
  const cotacao =
    cotacaoLinha ?? preco ?? (linha && linha.cotacaoAtual > 0 ? linha.cotacaoAtual : null);
  // Base do desvio = a ABA (o objetivo é % dentro dela, como a coluna Objetivo da Carteira).
  const valorAba = dados.valorAba;
  const carteiraVazia = dados.totalCarteira === 0;
  const abaVazia = !carteiraVazia && valorAba === 0;
  const conta = useMemo(
    () =>
      carteiraVazia || valorAba === null || !(valorAba > 0)
        ? null
        : desvioAlvo({ valorPosicao, valorBase: valorAba, alvoPct: valorOk, preco: cotacao }),
    [carteiraVazia, valorAba, valorPosicao, valorOk, cotacao],
  );

  const podeGravar = !!assetId && dados.status !== 'carregando' && dados.status !== 'erro';

  const salvar = async () => {
    if (!podeGravar || pendente) return;
    if (valor === null || foraDaFaixa) {
      setErro(T.erroFaixa);
      document.getElementById(campoId)?.focus();
      return;
    }
    setErro(null);
    const pct = Math.round(valor * 100) / 100;
    try {
      const r = await salvarAlvo.mutateAsync({
        ticker: t,
        objetivoPct: pct,
        ...(criaPlanejado && SECOES_OPERACAO[classe].includes(secaoFinal)
          ? { secao: secaoFinal }
          : {}),
      });
      mostrarToastMover({
        tipo: 'ok',
        mensagem: formatarTexto(T.salvo, { ticker: t, pct: pct1(pct), aba: r.alvo.abaNome || aba }),
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
      const r = await removerAlvo.mutateAsync(t);
      mostrarToastMover({
        tipo: 'ok',
        mensagem: formatarTexto(
          r.origem === 'planejado' ? T.removidoPlanejado : T.removidoPosicao,
          { ticker: t, aba },
        ),
      });
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
    dados.status === 'posicao' && linha
      ? formatarTexto(T.posicaoValor, {
          qtd: inteiro(linha.quantidade),
          un: cl.un,
          pct: pct1(linha.percentualCarteira),
          valor: reais0(linha.valorAtualizado),
        })
      : dados.status === 'posicao'
        ? '—'
        : T.semPosicao;
  // "≈ X% da carteira total" = objetivo × peso atual da aba na carteira (informativo)
  const equivalenteLinha = carteiraVazia
    ? T.equivalenteCarteiraVazia
    : abaVazia
      ? formatarTexto(T.equivalenteAbaVazia, { aba })
      : valorOk !== null && dados.classePct !== null
        ? formatarTexto(T.equivalenteTotal, {
            pct: pct1((valorOk * dados.classePct) / 100),
            aba,
            peso: pct1(dados.classePct),
          })
        : null;

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
        disabled={!podeGravar || pendente || foraDaFaixa}
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
      <p className={SUBTITULO_MODAL}>{formatarTexto(T.subtitulo, { ticker: t, aba })}</p>
      <AvisoConsultor className="mb-2" />
      <div className="flex flex-col" data-modal-planejar="">
        <div className={LINHA_FORM}>
          <label htmlFor={campoId}>{formatarTexto(T.campo, { aba })}</label>
          <span className="inline-flex items-center gap-1.5">
            <input
              id={campoId}
              data-autofocus=""
              inputMode="decimal"
              autoComplete="off"
              value={texto}
              placeholder={T.placeholder}
              aria-describedby={resumoId}
              aria-invalid={erro === T.erroFaixa || foraDaFaixa}
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
        {equivalenteLinha ? (
          <p
            className="pt-1.5 text-right text-[12.5px] text-gray-500 tabular-nums dark:text-gray-400"
            data-equivalente-total=""
          >
            {equivalenteLinha}
          </p>
        ) : null}
        <div className={LINHA_FORM} data-secao-carteira={secaoFinal}>
          {secaoEditavel ? (
            <>
              <label htmlFor={secaoId}>{T.secaoEscolha}</label>
              <select
                id={secaoId}
                value={secaoFinal}
                onChange={(e) => setSecaoEscolhida(e.target.value)}
                className={`min-h-12 rounded-lg border border-gray-300 bg-gray-50 px-2.5 text-base text-gray-800 lg:min-h-11 lg:text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 ${FOCO_MODAL}`}
              >
                {SECOES_OPERACAO[classe].map((s) => (
                  <option key={s} value={s}>
                    {ROTULOS_SECAO[s] ?? s}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <span>{T.secao}</span>
              <span className="text-right text-[13px]">
                {dados.status === 'carregando' ? '…' : rotuloSecao}
              </span>
            </>
          )}
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
        <div
          id={resumoId}
          aria-live="polite"
          data-resumo-plano=""
          className="mt-3 flex flex-wrap justify-between gap-2.5 rounded-[10px] bg-[#EDF2F8] px-3 py-2.5 text-[13px] text-gray-700 dark:bg-white/5 dark:text-gray-300"
        >
          {conta && valorOk !== null && conta.alvoValor !== null && conta.desvioPp !== null ? (
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
            <span>
              {valorOk !== null && carteiraVazia
                ? T.resumoCarteiraVazia
                : valorOk !== null && abaVazia
                  ? formatarTexto(T.resumoAbaVazia, { aba })
                  : T.resumoVazio}
            </span>
          )}
        </div>
        {erro || foraDaFaixa ? (
          <p role="alert" className="mt-1.5 text-[12.5px] text-[#D92D20] dark:text-[#F97066]">
            {erro ?? T.erroFaixa}
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
          {criaPlanejado ? (
            <> {formatarTexto(T.notaPlanejado, { ticker: t, aba, secao: rotuloSecao })}</>
          ) : null}
        </p>
      </div>
    </ModalAnalise>
  );
}
