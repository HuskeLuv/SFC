'use client';

/**
 * ModalNomeLista (bloco 1, fatia 0) — criar ou renomear uma lista dos Salvos. Usado pela fatia B
 * ("Nova lista com TAEE11" no Salvar em…) e pela C (Criar lista da casca, Nova lista, Renomear).
 *
 * - ModalAnalise: diálogo no computador, BottomSheet + useMobileHistoryLayer no celular.
 * - Nome 1..40 (o contador "n/40" acompanha); vazio ⇒ "Dê um nome à lista."; 409 do servidor
 *   ⇒ erro inline (nome repetido ou o limite de 20 listas).
 * - Com `totalListas >= limites.listas` (criar): aviso do limite, campo e botão desabilitados.
 * - "Avisar resultado e provento anunciado" (marcada) só ao criar e com `alertasLigados`
 *   (recursos.alertas); desmarcada ⇒ a lista nasce com resultado e provento desligados.
 * - Sucesso: onConcluir(lista) e o aviso "Lista X criada." / "Nome da lista atualizado." — quem
 *   abriu decide a navegação (C vai para /analise-ativos/salvos?lista=<id>).
 */
import { useEffect, useId, useState, type FormEvent } from 'react';
import ModalAnalise, {
  BOTAO_MODAL_PRIMARIO,
  BOTAO_MODAL_SECUNDARIO,
  FOCO_MODAL,
  SUBTITULO_MODAL,
} from '@/components/analiseAtivos/ativo/acoes/ModalAnalise';
import { mostrarToastSalvo } from '@/components/analiseAtivos/salvos/compartilhados/mostrarToastSalvo';
import { ErroAnalise } from '@/hooks/useAnaliseAtivos';
import { useCriarLista, useRenomearLista } from '@/hooks/useAnaliseAtivosSalvos';
import { LIMITES_SALVOS, normalizarNome } from '@/services/analiseAtivos/salvos/contrato';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import type { ListaPostBody, ModalNomeListaProps } from '@/types/analiseAtivosSalvos';

export type { ModalNomeListaProps };

const T = TEXTOS_SALVOS.modalNome;

/** Erro inline de um 409: limite de listas (mensagem do servidor) ou nome repetido. */
export function erroDo409(mensagemServidor: string, maxListas: number): string {
  const limite = formatarTexto(TEXTOS_SALVOS.servidor.limiteListas, { max: maxListas });
  return mensagemServidor === limite ? formatarTexto(T.limite, { max: maxListas }) : T.erroRepetido;
}

export default function ModalNomeLista({
  aberto,
  modo,
  onFechar,
  onConcluir,
  lista,
  tickerInicial,
  alertasLigados = false,
  totalListas,
  limites = LIMITES_SALVOS,
}: ModalNomeListaProps) {
  const criar = useCriarLista();
  const renomear = useRenomearLista();
  const [nome, setNome] = useState('');
  const [avisar, setAvisar] = useState(true);
  const [erro, setErro] = useState('');
  const idCampo = useId();
  const idErro = useId();
  const idAjuda = useId();
  const idAvisar = useId();

  // Reabre limpo (ou com o nome atual, ao renomear).
  useEffect(() => {
    if (!aberto) return;
    setNome(modo === 'renomear' ? (lista?.nome ?? '') : '');
    setAvisar(true);
    setErro('');
  }, [aberto, modo, lista?.nome]);

  const noLimite = modo === 'criar' && totalListas !== undefined && totalListas >= limites.listas;
  const enviando = criar.isPending || renomear.isPending;
  const titulo = modo === 'criar' ? T.criarTitulo : T.renomearTitulo;
  const subtitulo =
    modo === 'renomear'
      ? T.renomearSubtitulo
      : tickerInicial
        ? formatarTexto(T.criarSubtituloCom, { ticker: tickerInicial })
        : T.criarSubtitulo;

  const enviar = async (e?: FormEvent) => {
    e?.preventDefault();
    if (noLimite || enviando) return;
    const valor = normalizarNome(nome);
    if (!valor) {
      setErro(T.erroVazio);
      return;
    }
    setErro('');
    try {
      if (modo === 'renomear' && lista) {
        const r = await renomear.mutateAsync({ id: lista.id, nome: valor });
        mostrarToastSalvo({ tipo: 'info', mensagem: TEXTOS_SALVOS.toast.nomeAtualizado });
        onConcluir(r);
      } else {
        const body: ListaPostBody = { nome: valor };
        if (tickerInicial) body.tickerInicial = tickerInicial;
        if (alertasLigados && !avisar) body.alertas = { resultado: false, provento: false };
        const r = await criar.mutateAsync(body);
        mostrarToastSalvo({ tipo: 'listaCriada', lista: r.nome, ticker: tickerInicial });
        onConcluir(r);
      }
    } catch (err: unknown) {
      if (err instanceof ErroAnalise && err.status === 409) {
        setErro(erroDo409(err.message, limites.listas));
      } else {
        setErro(TEXTOS_SALVOS.toast.erroGenerico);
      }
    }
  };

  const rodape = (
    <>
      <span className="min-w-0 flex-1" />
      <button type="button" onClick={onFechar} className={BOTAO_MODAL_SECUNDARIO}>
        {T.cancelar}
      </button>
      <button
        type="submit"
        form={idCampo + '-form'}
        disabled={noLimite || enviando}
        aria-busy={enviando || undefined}
        className={BOTAO_MODAL_PRIMARIO}
        data-modal-nome-lista-enviar=""
      >
        {enviando ? T.salvando : modo === 'criar' ? T.criar : T.salvarNome}
      </button>
    </>
  );

  return (
    <ModalAnalise aberto={aberto} onFechar={onFechar} titulo={titulo} rodape={rodape}>
      <form
        id={idCampo + '-form'}
        noValidate
        onSubmit={enviar}
        data-modal-nome-lista={modo}
        className="flex flex-col gap-3"
      >
        <p className={SUBTITULO_MODAL}>{subtitulo}</p>
        {noLimite ? (
          <p
            role="alert"
            className="rounded-lg border-l-[3px] border-[#396CAA] bg-[#EDF2F8] px-3 py-2 text-[13px] text-gray-700 dark:border-[#6E9DC4] dark:bg-white/5 dark:text-gray-300"
          >
            {formatarTexto(T.limite, { max: limites.listas })}
          </p>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={idCampo} className="text-sm font-medium text-gray-800 dark:text-white/90">
            {T.rotulo}
          </label>
          <input
            id={idCampo}
            type="text"
            value={nome}
            maxLength={limites.nome}
            placeholder={T.placeholder}
            disabled={noLimite}
            autoComplete="off"
            data-autofocus=""
            aria-invalid={erro ? true : undefined}
            aria-describedby={`${idErro} ${idAjuda}`}
            onChange={(e) => {
              setNome(e.target.value);
              if (erro) setErro('');
            }}
            className={`min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 placeholder:text-gray-400 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-[#D92D20] dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 ${FOCO_MODAL}`}
          />
          <span className="flex items-start justify-between gap-3 text-xs">
            <span
              id={idErro}
              aria-live="polite"
              className="text-[#D92D20] dark:text-[#F97066]"
              data-modal-nome-lista-erro=""
            >
              {erro}
            </span>
            <span id={idAjuda} className="shrink-0 text-gray-500 tabular-nums dark:text-gray-400">
              {formatarTexto(T.contador, { n: nome.length, max: limites.nome })}
            </span>
          </span>
        </div>
        {modo === 'criar' && alertasLigados && !noLimite ? (
          <label
            htmlFor={idAvisar}
            className="flex min-h-[52px] cursor-pointer items-start gap-3 rounded-lg py-2 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-[#0079F2] dark:has-[:focus-visible]:ring-[#6E9DC4]"
          >
            <input
              id={idAvisar}
              type="checkbox"
              checked={avisar}
              onChange={(e) => setAvisar(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#396CAA] outline-none dark:[color-scheme:dark]"
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium text-gray-800 dark:text-white/90">
                {T.avisar}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{T.avisarAjuda}</span>
            </span>
          </label>
        ) : null}
      </form>
    </ModalAnalise>
  );
}
