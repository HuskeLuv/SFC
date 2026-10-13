'use client';

/**
 * Modal "Registrar operação · ‹ticker›" (fatia C1, rec. 2) — lançamento rápido sobre as rotas que
 * JÁ EXISTEM na Carteira:
 *  - Compra → POST /api/carteira/operacao, SEMPRE com a seção (estrategia da ação / tipoFii do FII):
 *    recompra usa a da posição sem perguntar; 1ª compra de planejado preserva a do plano; FII novo
 *    sugere pelo tipo na CVM; ação nova pede (secaoOperacao). Instituição pelo seletor do app
 *    (recompra já vem com a da última aquisição).
 *  - Venda (só com posição) → POST /api/carteira/resgate SEM instituicaoId: a rota usa a da última
 *    aquisição (com o campo, devolveria 400 se fosse outra). O campo Seção some.
 * Resumo ao vivo (total, nova posição, preço médio), aviso de preço fora do fechamento
 * (usePriceDeviationWarning), erros reais da rota no próprio modal e link "abrir o formulário
 * completo" (AddAssetWizard, para taxas/observações/instituição nova). Sucesso →
 * invalidatePortfolioDerivedQueries (no hook). Consultor agindo: registra na carteira do cliente,
 * com o aviso (rec. 9). 44 px em todos os controles.
 */
import { useEffect, useId, useMemo, useState } from 'react';
import ModalAnalise, {
  AvisoConsultor,
  BOTAO_MODAL_PRIMARIO,
  BOTAO_MODAL_SECUNDARIO,
  DICA_RODAPE,
  FOCO_MODAL,
  SUBTITULO_MODAL,
} from '@/components/analiseAtivos/ativo/acoes/ModalAnalise';
import { useNaCarteiraAtivo } from '@/components/analiseAtivos/ativo/usuario/useNaCarteiraAtivo';
import InstitutionPicker from '@/components/carteira/wizard/shared/InstitutionPicker';
import { usePriceDeviationWarning } from '@/components/carteira/wizard/usePriceDeviationWarning';
import { mostrarToastMover } from '@/components/carteira/mover/moverToast';
import {
  useMutacoesCarteiraAnalise,
  usePosicaoCarteira,
  type PosicaoCarteiraResposta,
} from '@/hooks/useAcoesCarteiraAnalise';
import {
  montarCorpoCompra,
  montarCorpoVenda,
  validarOperacao,
  type ErroOperacao,
} from '@/services/analiseAtivos/regras/carteira/registroOperacao';
import {
  SECOES_OPERACAO,
  secaoOperacao,
} from '@/services/analiseAtivos/regras/carteira/secaoOperacao';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import {
  CLASSE_CARTEIRA,
  ROTULOS_SECAO,
  TEXTOS_ACOES_CARTEIRA,
  TEXTOS_OPERACAO,
} from '@/services/analiseAtivos/textosAcoesCarteira';
import { formatBRL, formatNumber } from '@/utils/format';
import type { ModalRegistrarOperacaoProps } from '@/types/analiseAtivosCriterios';

export type { ModalRegistrarOperacaoProps };

const T = TEXTOS_ACOES_CARTEIRA.registrar;

const LINHA_FORM =
  'flex items-center justify-between gap-3 border-b border-dashed border-gray-200 py-2 text-[13.5px] text-gray-700 dark:border-gray-800 dark:text-gray-300';
const CAMPO = `min-h-11 rounded-lg border border-gray-300 bg-gray-50 px-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 ${FOCO_MODAL}`;
const ERRO = 'mt-1.5 text-[12.5px] text-[#D92D20] dark:text-[#F97066]';

/** AAAA-MM-DD do dia local. */
export function hojeLocal(agora: Date = new Date()): string {
  const m = String(agora.getMonth() + 1).padStart(2, '0');
  const d = String(agora.getDate()).padStart(2, '0');
  return `${agora.getFullYear()}-${m}-${d}`;
}

/** '1.234,5' / '1234.5' / '52,30' → número; vazio ou inválido → NaN. */
export function lerNumero(texto: string): number {
  const t = texto.trim();
  if (!t) return NaN;
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  return Number(normal);
}

/**
 * Instituição da última aquisição: a transação mais recente (a rota devolve em ordem decrescente)
 * que não é saída ('Resgate…') e tem notes.operation.instituicaoId — a mesma regra que a rota de
 * resgate usa para validar a instituição.
 */
export function instituicaoUltimaAquisicao(
  dados: PosicaoCarteiraResposta | undefined,
): { id: string; nome: string | null } | null {
  if (!dados) return null;
  for (const tx of dados.transacoes ?? []) {
    if (/^resgate/i.test(tx.tipoOperacao.trim())) continue;
    try {
      const id = (JSON.parse(tx.notes ?? '') as { operation?: { instituicaoId?: string } })
        .operation?.instituicaoId;
      if (id) {
        const conhecida = dados.ativo.instituicao;
        return { id, nome: conhecida?.id === id ? (conhecida.nome ?? null) : null };
      }
    } catch {
      // notes livres: segue para a próxima
    }
  }
  return null;
}

export default function ModalRegistrarOperacao({
  aberto,
  onFechar,
  ticker,
  classe,
  assetId,
  preco,
  fiiTipo,
  operacaoInicial = 'compra',
  onFormularioCompleto,
}: ModalRegistrarOperacaoProps & { onFormularioCompleto?: () => void }) {
  const t = ticker.toUpperCase();
  const cl = CLASSE_CARTEIRA[classe];
  const ids = { q: useId(), p: useId(), d: useId(), s: useId(), oper: useId(), dica: useId() };
  const dados = useNaCarteiraAtivo(t, classe);
  const comPosicao = dados.status === 'posicao' && !!dados.portfolioId;
  const posQtd = comPosicao ? (dados.linha?.quantidade ?? dados.quantidade ?? 0) : 0;
  const pm = comPosicao ? (dados.linha?.precoAquisicao ?? null) : null;
  const posicaoQ = usePosicaoCarteira(dados.portfolioId, aberto && comPosicao);
  const ultima = useMemo(() => instituicaoUltimaAquisicao(posicaoQ.data), [posicaoQ.data]);
  const { registrarCompra, registrarVenda } = useMutacoesCarteiraAnalise();

  const secao = secaoOperacao({
    classe,
    posicao: comPosicao ? { estrategia: dados.estrategia, tipoFii: dados.tipoFii } : null,
    planejado: dados.status === 'planejado' ? { secao: dados.secaoPlanejada } : null,
    tipoCvm: fiiTipo,
  });

  const [operacao, setOperacao] = useState<'compra' | 'venda'>(operacaoInicial);
  const [qtdTexto, setQtdTexto] = useState('');
  const [precoTexto, setPrecoTexto] = useState('');
  const [data, setData] = useState(() => hojeLocal());
  const [secaoEscolhida, setSecaoEscolhida] = useState<string>('');
  const [inst, setInst] = useState<{ id: string; nome: string }>({ id: '', nome: '' });
  const [erros, setErros] = useState<ErroOperacao[]>([]);
  const [erroServidor, setErroServidor] = useState<string | null>(null);

  // Abrir começa do zero: cotação do cabeçalho, data de hoje, seção resolvida.
  useEffect(() => {
    if (!aberto) return;
    setOperacao(operacaoInicial === 'venda' && comPosicao ? 'venda' : 'compra');
    setQtdTexto('');
    setPrecoTexto(preco !== null && preco > 0 ? formatNumber(preco, 2) : '');
    setData(hojeLocal());
    setErros([]);
    setErroServidor(null);
    setInst({ id: '', nome: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir
  }, [aberto]);
  // A seção resolvida chega com o overlay (pode ser depois de abrir).
  useEffect(() => {
    if (aberto) setSecaoEscolhida(secao.valor ?? '');
  }, [aberto, secao.valor]);
  // Recompra: a instituição da última aquisição já vem escolhida (se o nome for conhecido).
  useEffect(() => {
    if (aberto && ultima?.nome)
      setInst((atual) => (atual.id ? atual : { id: ultima.id, nome: ultima.nome as string }));
  }, [aberto, ultima]);

  const venda = operacao === 'venda';
  const quantidade = lerNumero(qtdTexto);
  const cotacao = lerNumero(precoTexto);
  const desvioPreco = usePriceDeviationWarning({
    enteredPrice: Number.isFinite(cotacao) ? cotacao : null,
    currentPrice: preco,
    symbol: aberto ? t : null,
    referenceDate: aberto ? data : null,
  });

  const qOk = Number.isFinite(quantidade) && quantidade > 0 ? quantidade : 0;
  const pOk = Number.isFinite(cotacao) && cotacao > 0 ? cotacao : 0;
  const total = qOk * pOk;
  const novaQtd = venda ? Math.max(0, posQtd - qOk) : posQtd + qOk;
  const novoPm = !venda && novaQtd > 0 ? ((pm ?? 0) * posQtd + qOk * pOk) / novaQtd : (pm ?? null);

  const secaoFinal = secao.editavel ? secaoEscolhida || null : secao.valor;
  const pendente = registrarCompra.isPending || registrarVenda.isPending;

  const registrar = async () => {
    if (pendente) return;
    setErroServidor(null);
    const lista = validarOperacao({
      operacao,
      quantidade,
      data,
      hoje: hojeLocal(),
      posicao: comPosicao ? posQtd : null,
      secao: venda ? null : secaoFinal,
      cotacao: Number.isFinite(cotacao) ? cotacao : null,
      ...(venda ? {} : { instituicaoId: inst.id || null }),
    });
    setErros(lista);
    if (lista.length > 0) {
      const alvoFoco: Record<ErroOperacao, string> = {
        quantidade_invalida: ids.q,
        acima_da_posicao: ids.q,
        preco_invalido: ids.p,
        data_futura: ids.d,
        sem_secao: ids.s,
        sem_instituicao: 'instituicao',
      };
      document.getElementById(alvoFoco[lista[0]])?.focus();
      return;
    }
    try {
      if (venda) {
        await registrarVenda.mutateAsync(
          montarCorpoVenda({
            portfolioId: dados.portfolioId as string,
            data,
            quantidade,
            cotacao,
          }),
        );
      } else {
        await registrarCompra.mutateAsync(
          montarCorpoCompra({
            classe,
            assetId: assetId as string,
            ticker: t,
            instituicaoId: inst.id,
            data,
            quantidade,
            cotacao,
            secao: secaoFinal as string,
          }),
        );
      }
      mostrarToastMover({
        tipo: 'ok',
        mensagem: formatarTexto(T.registrada, {
          qtd: quantidade.toLocaleString('pt-BR'),
          un: cl.un,
          ticker: t,
          preco: formatBRL(cotacao),
          pos: novaQtd.toLocaleString('pt-BR'),
        }),
      });
      onFechar();
    } catch (e: unknown) {
      setErroServidor(
        formatarTexto(T.erroServidor, { erro: e instanceof Error ? e.message : String(e) }),
      );
    }
  };

  const textoErro = (e: ErroOperacao) =>
    formatarTexto(T.erros[e], { qtd: posQtd.toLocaleString('pt-BR'), un: cl.un });
  const erroDe = (...tipos: ErroOperacao[]) => erros.find((e) => tipos.includes(e)) ?? null;

  const semCatalogo = !venda && !assetId;
  const opcoesSecao = SECOES_OPERACAO[classe];
  const rotuloSecao = classe === 'acao' ? T.rotuloEstrategia : T.rotuloTipoFii;
  const rotuloCampoSecao =
    secao.origem === 'planejado'
      ? T.secaoDoPlano
      : secao.origem === 'sugestao_cvm'
        ? T.secaoCvm
        : T.secao;

  const rodape = (
    <>
      <span className={DICA_RODAPE}>
        {comPosicao
          ? formatarTexto(T.hintPosicao, {
              qtd: posQtd.toLocaleString('pt-BR'),
              un: cl.un,
              pm: pm !== null ? formatBRL(pm) : '—',
            })
          : T.hintSemPosicao}
      </span>
      <button type="button" className={BOTAO_MODAL_SECUNDARIO} onClick={onFechar}>
        {TEXTOS_ACOES_CARTEIRA.modal.cancelar}
      </button>
      <button
        type="button"
        className={BOTAO_MODAL_PRIMARIO}
        disabled={pendente || semCatalogo || dados.status === 'carregando'}
        onClick={() => void registrar()}
        data-registrar-operacao=""
      >
        {pendente ? T.registrando : T.registrar}
      </button>
    </>
  );

  const botaoOperacao = (op: 'compra' | 'venda') => {
    const ativo = operacao === op;
    const desabilitado = op === 'venda' && !comPosicao;
    return (
      <button
        type="button"
        aria-pressed={ativo}
        disabled={desabilitado}
        aria-describedby={desabilitado ? ids.dica : undefined}
        onClick={() => {
          setOperacao(op);
          setErros([]);
          setErroServidor(null);
        }}
        data-operacao={op}
        className={`min-h-11 px-4 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50 ${FOCO_MODAL} ${
          ativo
            ? 'bg-[#396CAA] font-semibold text-white'
            : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-transparent dark:text-gray-300 dark:hover:bg-white/5'
        }`}
      >
        {TEXTOS_OPERACAO[op]}
      </button>
    );
  };

  return (
    <ModalAnalise
      aberto={aberto}
      onFechar={onFechar}
      titulo={formatarTexto(T.titulo, { ticker: t })}
      rodape={rodape}
    >
      <p className={SUBTITULO_MODAL}>{T.subtitulo}</p>
      <AvisoConsultor className="mb-2" />
      <div className="flex flex-col" data-modal-registrar="" data-operacao-atual={operacao}>
        <div className={LINHA_FORM}>
          <span id={ids.oper}>{T.operacao}</span>
          <span
            role="group"
            aria-labelledby={ids.oper}
            className="inline-flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700 [&>button+button]:border-l [&>button+button]:border-gray-300 dark:[&>button+button]:border-gray-700"
          >
            {botaoOperacao('compra')}
            {botaoOperacao('venda')}
          </span>
        </div>
        {!comPosicao ? (
          <p id={ids.dica} className="mt-1 text-[12.5px] text-gray-500 dark:text-gray-400">
            {T.semPosicaoParaSaida}
          </p>
        ) : null}

        <div className={LINHA_FORM}>
          <label htmlFor={ids.q}>{formatarTexto(T.quantidade, { un: cl.un })}</label>
          <input
            id={ids.q}
            data-autofocus=""
            inputMode="numeric"
            autoComplete="off"
            value={qtdTexto}
            onChange={(e) => setQtdTexto(e.target.value)}
            aria-invalid={!!erroDe('quantidade_invalida', 'acima_da_posicao')}
            className={`${CAMPO} w-[130px] text-right tabular-nums lg:w-40`}
          />
        </div>
        {erroDe('quantidade_invalida', 'acima_da_posicao') ? (
          <p role="alert" className={ERRO}>
            {textoErro(erroDe('quantidade_invalida', 'acima_da_posicao') as ErroOperacao)}
          </p>
        ) : null}

        <div className={LINHA_FORM}>
          <label htmlFor={ids.p}>{formatarTexto(T.preco, { unSingular: cl.unSingular })}</label>
          <span className="inline-flex items-center gap-1.5">
            <em className="text-[13px] not-italic text-gray-500 dark:text-gray-400">R$</em>
            <input
              id={ids.p}
              inputMode="decimal"
              autoComplete="off"
              value={precoTexto}
              onChange={(e) => setPrecoTexto(e.target.value)}
              aria-invalid={!!erroDe('preco_invalido')}
              className={`${CAMPO} w-[100px] text-right tabular-nums lg:w-[120px]`}
            />
          </span>
        </div>
        {erroDe('preco_invalido') ? (
          <p role="alert" className={ERRO}>
            {textoErro('preco_invalido')}
          </p>
        ) : desvioPreco.warning ? (
          <p aria-live="polite" className="mt-1.5 text-[12.5px] text-gray-600 dark:text-gray-300">
            {desvioPreco.warning.message}
          </p>
        ) : null}

        <div className={LINHA_FORM}>
          <label htmlFor={ids.d}>{T.data}</label>
          <input
            id={ids.d}
            type="date"
            value={data}
            max={hojeLocal()}
            onChange={(e) => setData(e.target.value)}
            aria-invalid={!!erroDe('data_futura')}
            className={`${CAMPO} w-[170px]`}
          />
        </div>
        {erroDe('data_futura') ? (
          <p role="alert" className={ERRO}>
            {textoErro('data_futura')}
          </p>
        ) : null}

        {!venda ? (
          secao.editavel ? (
            <>
              <div className={LINHA_FORM}>
                <label htmlFor={ids.s}>{rotuloCampoSecao}</label>
                <select
                  id={ids.s}
                  value={secaoEscolhida}
                  onChange={(e) => setSecaoEscolhida(e.target.value)}
                  aria-invalid={!!erroDe('sem_secao')}
                  data-secao=""
                  className={`${CAMPO} w-[170px]`}
                >
                  {secaoEscolhida ? null : <option value="">{T.escolha}</option>}
                  {opcoesSecao.map((o) => (
                    <option key={o} value={o}>
                      {ROTULOS_SECAO[o] ?? o}
                    </option>
                  ))}
                </select>
              </div>
              {erroDe('sem_secao') ? (
                <p role="alert" className={ERRO}>
                  {textoErro('sem_secao')}
                </p>
              ) : null}
            </>
          ) : (
            <div className={LINHA_FORM} data-secao-posicao="">
              <span>{T.secao}</span>
              <span className="text-right text-[13px]">
                {formatarTexto(T.secaoPosicao, {
                  rotulo: rotuloSecao,
                  valor: ROTULOS_SECAO[secao.valor ?? ''] ?? secao.valor ?? '',
                })}
              </span>
            </div>
          )
        ) : null}

        {venda ? (
          <div className={LINHA_FORM} data-instituicao-venda="">
            <span>{T.instituicao}</span>
            <span className="text-right text-[13px]">
              {ultima?.nome
                ? formatarTexto(T.instituicaoUltima, { nome: ultima.nome })
                : T.instituicaoUltimaSemNome}
            </span>
          </div>
        ) : (
          <div className="border-b border-dashed border-gray-200 py-2 dark:border-gray-800 [&_input]:min-h-11 [&_label]:text-[13.5px]">
            <InstitutionPicker
              endpoint={aberto ? '/api/institutions' : null}
              responseShape="institutions"
              label={T.instituicao}
              placeholder={T.instituicaoPlaceholder}
              selectedId={inst.id}
              selectedName={inst.nome}
              onChange={(v) => setInst(v)}
              error={erroDe('sem_instituicao') ? textoErro('sem_instituicao') : undefined}
              onErrorClear={() => setErros((l) => l.filter((e) => e !== 'sem_instituicao'))}
            />
          </div>
        )}

        <div
          aria-live="polite"
          data-resumo-operacao=""
          className="mt-3 flex flex-wrap justify-between gap-2.5 rounded-[10px] bg-[#EDF2F8] px-3 py-2.5 text-[13px] text-gray-700 dark:bg-white/5 dark:text-gray-300"
        >
          <span>
            {T.total}
            <b className="block text-[14.5px] text-gray-900 tabular-nums dark:text-white">
              {formatBRL(total)}
            </b>
          </span>
          <span>
            {T.novaPosicao}
            <b className="block text-[14.5px] text-gray-900 tabular-nums dark:text-white">
              {novaQtd.toLocaleString('pt-BR')} {cl.un}
            </b>
          </span>
          <span>
            {venda ? T.pmMantido : T.novoPm}
            <b className="block text-[14.5px] text-gray-900 tabular-nums dark:text-white">
              {novoPm !== null && novoPm > 0 ? formatBRL(novoPm) : '—'}
            </b>
            {venda ? (
              <small className="text-xs text-gray-500 dark:text-gray-400">{T.pmMantidoNota}</small>
            ) : null}
          </span>
        </div>

        {semCatalogo ? (
          <p className="mt-2 text-[12.5px] text-gray-500 dark:text-gray-400">
            {T.semAtivoCatalogo}
          </p>
        ) : null}
        {erroServidor ? (
          <p role="alert" className={ERRO} data-erro-servidor="">
            {erroServidor}
          </p>
        ) : null}
        {onFormularioCompleto ? (
          <p className="mt-2.5 text-[12.5px] text-gray-500 dark:text-gray-400">
            {T.formCompletoAntes}{' '}
            <button
              type="button"
              onClick={onFormularioCompleto}
              className={`inline-flex min-h-11 items-center font-medium text-[#396CAA] underline-offset-2 hover:underline dark:text-[#6E9DC4] ${FOCO_MODAL}`}
            >
              {T.formCompleto}
            </button>
            .
          </p>
        ) : null}
      </div>
    </ModalAnalise>
  );
}
