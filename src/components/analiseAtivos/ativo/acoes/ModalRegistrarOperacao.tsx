'use client';

/**
 * Modal "Registrar operação · ‹ticker›" (fatia C1, rec. 2) — lançamento rápido sobre as rotas que
 * JÁ EXISTEM na Carteira:
 *  - Compra → POST /api/carteira/operacao, SEMPRE com a seção (estrategia da ação / tipoFii do FII),
 *    escolhida SOZINHA (v2.5, decisão 2 — secaoOperacao): recompra → a da posição; plano antigo → a
 *    do plano; FoF → Fundo de fundos; FII → Tijolo/Papel (TVM) pelo perfil; ação → Value. Sem campo
 *    Seção: o resumo mostra "Na Carteira: Ações · Value (dá para mover depois)". Instituição pelo
 *    seletor do app (recompra já vem com a da última aquisição).
 *  - Venda (só com posição) → POST /api/carteira/resgate SEM instituicaoId: a rota usa a da última
 *    aquisição (com o campo, devolveria 400 se fosse outra).
 * Resumo ao vivo (total, nova posição, preço médio), aviso de preço fora do fechamento
 * (usePriceDeviationWarning), erros reais da rota no próprio modal e link "abrir o formulário
 * completo" (AddAssetWizard, para taxas/observações/instituição nova). Sucesso →
 * invalidatePortfolioDerivedQueries (no hook). Consultor agindo: registra na carteira do cliente,
 * com o aviso (rec. 9). 44 px em todos os controles.
 *
 * Stocks e REITs (feature EUA, fatia D): o preço é em US$ e vem EM BRANCO sem a cotação EUA
 * (ANALISE_ATIVOS_EUA_PRECO_HABILITADO desligada); a cotação do dólar (US$ → R$) vem preenchida com
 * a da aba da Carteira e é editável. O corpo é o do wizard (montarCorpoCompra EUA) e, com posição,
 * leva o Asset manual da posição (overlay) — a recompra não cria um 2º Asset. Sem posição:
 * STOCK-MANUAL / REIT-MANUAL. Total em R$; posição e preço médio na unidade da aba, como a Carteira
 * mostra. Sem o link do formulário completo (o wizard não tem preset EUA).
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
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
  precoNaCarteira,
  totalEmReais,
  validarOperacao,
  type ErroOperacao,
} from '@/services/analiseAtivos/regras/carteira/registroOperacao';
import { TEXTOS_EUA } from '@/services/analiseAtivos/textosEua';
import { ehClasseEua } from '@/types/analiseAtivosApi';
import { secaoOperacao } from '@/services/analiseAtivos/regras/carteira/secaoOperacao';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import {
  CLASSE_CARTEIRA,
  ROTULOS_SECAO,
  TEXTOS_ACOES_CARTEIRA,
  TEXTOS_OPERACAO,
} from '@/services/analiseAtivos/textosAcoesCarteira';
import { formatBRL, formatNumber, formatUSD } from '@/utils/format';
import type { ModalRegistrarOperacaoProps } from '@/types/analiseAtivosCriterios';

export type { ModalRegistrarOperacaoProps };

const T = TEXTOS_ACOES_CARTEIRA.registrar;

const LINHA_FORM =
  'flex items-center justify-between gap-3 border-b border-dashed border-gray-200 py-2 text-[13.5px] text-gray-700 dark:border-gray-800 dark:text-gray-300';
const CAMPO = `min-h-12 rounded-lg border border-gray-300 bg-gray-50 px-2.5 text-base text-gray-800 lg:min-h-11 lg:text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 ${FOCO_MODAL}`;
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
 * Quantidade (inteira) no formato brasileiro: '1.000' / '2.500' / '1.000.000' = milhar, nunca 1 ou
 * 2,5 (QA 13/10: '1.000' gravava 1 ação). Fora do padrão de milhar vale lerNumero, e o '1.5' que
 * sobra cai na validação de inteiro.
 */
export function lerQuantidade(texto: string): number {
  const t = texto.trim();
  if (/^\d{1,3}(\.\d{3})+(,0*)?$/.test(t)) return Number(t.replace(/\./g, '').replace(/,0*$/, ''));
  return lerNumero(t);
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
  const eua = ehClasseEua(classe);
  const ids = { q: useId(), p: useId(), c: useId(), d: useId(), oper: useId(), dica: useId() };
  // EUA: a aba Stocks/REIT's traz a cotação do dólar da Carteira (pré-preenche o câmbio)
  const dados = useNaCarteiraAtivo(t, classe, { base: aberto && eua });
  /** valores da aba (posição, PM): US$ em Stocks/REIT's, como a Carteira mostra */
  const dinheiroAba = dados.moeda === 'USD' ? formatUSD : formatBRL;
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
  const [cambioTexto, setCambioTexto] = useState('');
  const cambioEditadoRef = useRef(false);
  const [data, setData] = useState(() => hojeLocal());
  const [inst, setInst] = useState<{ id: string; nome: string }>({ id: '', nome: '' });
  const [erros, setErros] = useState<ErroOperacao[]>([]);
  const [erroServidor, setErroServidor] = useState<string | null>(null);

  // Abrir começa do zero: cotação do cabeçalho, data de hoje, seção resolvida.
  useEffect(() => {
    if (!aberto) return;
    setOperacao(operacaoInicial === 'venda' && comPosicao ? 'venda' : 'compra');
    setQtdTexto('');
    setPrecoTexto(preco !== null && preco > 0 ? formatNumber(preco, 2) : '');
    setCambioTexto('');
    cambioEditadoRef.current = false;
    setData(hojeLocal());
    setErros([]);
    setErroServidor(null);
    setInst({ id: '', nome: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir
  }, [aberto]);
  // EUA: o câmbio começa com a cotação do dólar da aba (até o usuário editar).
  useEffect(() => {
    if (!aberto || !eua || cambioEditadoRef.current || dados.cotacaoDolar === null) return;
    setCambioTexto(formatNumber(dados.cotacaoDolar, 2));
  }, [aberto, eua, dados.cotacaoDolar]);
  // Recompra: a instituição da última aquisição já vem escolhida (se o nome for conhecido).
  useEffect(() => {
    if (aberto && ultima?.nome)
      setInst((atual) => (atual.id ? atual : { id: ultima.id, nome: ultima.nome as string }));
  }, [aberto, ultima]);

  const venda = operacao === 'venda';
  const quantidade = lerQuantidade(qtdTexto);
  const cotacao = lerNumero(precoTexto);
  const cambio = lerNumero(cambioTexto);
  // EUA sem cotação licenciada: sem aviso de divergência (não há preço de referência)
  const desvioPreco = usePriceDeviationWarning({
    enteredPrice: Number.isFinite(cotacao) ? cotacao : null,
    currentPrice: preco,
    symbol: aberto && !eua ? t : null,
    referenceDate: aberto && !eua ? data : null,
  });

  const qOk = Number.isFinite(quantidade) && quantidade > 0 ? quantidade : 0;
  const pOk = Number.isFinite(cotacao) && cotacao > 0 ? cotacao : 0;
  const cOk = eua && Number.isFinite(cambio) && cambio > 0 ? cambio : 0;
  const total = totalEmReais({ classe, quantidade: qOk, cotacao: pOk, cambio: cOk });
  // preço na unidade da aba (stock: US$ × câmbio; REIT: US$; BR: o próprio)
  const precoAba = precoNaCarteira({
    classe,
    cotacao: pOk,
    cambio: cOk,
    tipoAsset: dados.tipoAsset,
  });
  const novaQtd = venda ? Math.max(0, posQtd - qOk) : posQtd + qOk;
  const novoPm =
    !venda && novaQtd > 0 ? ((pm ?? 0) * posQtd + qOk * precoAba) / novaQtd : (pm ?? null);

  // v2.5: seção automática (nunca vazia); a aba é a efetiva da posição ou a da classe.
  const secaoFinal = secao.valor ?? '';
  const abaSecao = dados.abaNome ?? cl.aba;
  const unDe = (q: number) => (q === 1 ? cl.unSingular : cl.un);
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
      cotacao: Number.isFinite(cotacao) ? cotacao : null,
      ...(venda ? {} : { instituicaoId: inst.id || null }),
      ...(eua ? { cambio: Number.isFinite(cambio) ? cambio : null } : {}),
    });
    setErros(lista);
    if (lista.length > 0) {
      const alvoFoco: Record<ErroOperacao, string> = {
        quantidade_invalida: ids.q,
        acima_da_posicao: ids.q,
        preco_invalido: ids.p,
        data_futura: ids.d,
        sem_instituicao: 'instituicao',
        cambio_invalido: ids.c,
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
            ...(eua ? { classe, cambio, tipoAsset: dados.tipoAsset } : {}),
          }),
        );
      } else {
        await registrarCompra.mutateAsync(
          montarCorpoCompra({
            classe,
            // EUA: o Asset manual da posição (recompra sem 2º Asset); sem posição, *-MANUAL
            assetId: eua ? (comPosicao ? dados.assetIdPosicao : null) : (assetId as string),
            ticker: t,
            instituicaoId: inst.id,
            data,
            quantidade,
            cotacao,
            secao: secaoFinal,
            ...(eua ? { cambio, tipoAsset: dados.tipoAsset } : {}),
          }),
        );
      }
      mostrarToastMover({
        tipo: 'ok',
        mensagem: formatarTexto(T.registrada, {
          qtd: quantidade.toLocaleString('pt-BR'),
          un: unDe(quantidade),
          ticker: t,
          preco: eua ? formatUSD(cotacao) : formatBRL(cotacao),
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
    e === 'cambio_invalido'
      ? TEXTOS_EUA.carteira.cambioInvalido
      : formatarTexto(T.erros[e], { qtd: posQtd.toLocaleString('pt-BR'), un: unDe(posQtd) });
  const erroDe = (...tipos: ErroOperacao[]) => erros.find((e) => tipos.includes(e)) ?? null;

  // EUA não tem catálogo na Carteira: a compra cria (ou reaproveita) o Asset manual
  const semCatalogo = !venda && !assetId && !eua;

  const rodape = (
    <>
      <span className={DICA_RODAPE}>
        {comPosicao
          ? formatarTexto(T.hintPosicao, {
              qtd: posQtd.toLocaleString('pt-BR'),
              un: unDe(posQtd),
              pm: pm !== null ? dinheiroAba(pm) : '—',
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
            <em className="text-[13px] not-italic text-gray-500 dark:text-gray-400">
              {eua ? TEXTOS_EUA.cotacao.moeda : 'R$'}
            </em>
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
        ) : eua && !(preco !== null && preco > 0) ? (
          <p
            className="mt-1.5 text-[12.5px] text-gray-500 dark:text-gray-400"
            data-sem-preco-eua=""
          >
            {TEXTOS_EUA.carteira.semPrecoRegistrar}
          </p>
        ) : null}

        {eua ? (
          <>
            <div className={LINHA_FORM}>
              <label htmlFor={ids.c}>{TEXTOS_EUA.cotacao.cambio}</label>
              <span className="inline-flex items-center gap-1.5">
                <em className="text-[13px] not-italic text-gray-500 dark:text-gray-400">R$</em>
                <input
                  id={ids.c}
                  inputMode="decimal"
                  autoComplete="off"
                  value={cambioTexto}
                  onChange={(e) => {
                    cambioEditadoRef.current = true;
                    setCambioTexto(e.target.value);
                  }}
                  aria-invalid={!!erroDe('cambio_invalido')}
                  data-campo-cambio=""
                  className={`${CAMPO} w-[100px] text-right tabular-nums lg:w-[120px]`}
                />
              </span>
            </div>
            {erroDe('cambio_invalido') ? (
              <p role="alert" className={ERRO}>
                {textoErro('cambio_invalido')}
              </p>
            ) : null}
          </>
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
              {novaQtd.toLocaleString('pt-BR')} {unDe(novaQtd)}
            </b>
          </span>
          <span>
            {venda ? T.pmMantido : T.novoPm}
            <b className="block text-[14.5px] text-gray-900 tabular-nums dark:text-white">
              {novoPm !== null && novoPm > 0 ? dinheiroAba(novoPm) : '—'}
            </b>
            {venda ? (
              <small className="text-xs text-gray-500 dark:text-gray-400">{T.pmMantidoNota}</small>
            ) : null}
          </span>
          {!venda ? (
            <span
              className="w-full text-xs text-gray-500 dark:text-gray-400"
              data-secao-automatica={secaoFinal}
            >
              {formatarTexto(T.secaoAutomatica, {
                aba: abaSecao,
                secao: ROTULOS_SECAO[secaoFinal] ?? secaoFinal,
              })}
            </span>
          ) : null}
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
