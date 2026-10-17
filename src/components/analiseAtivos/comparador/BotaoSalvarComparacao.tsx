'use client';

/**
 * "Salvar comparação" do Comparador (bloco 1, fatia B; recursos.salvos && comparador). O MESMO
 * componente vai na barra e no slot `acao` da Leitura dos dados (§3.3).
 *
 * - Não salva ainda: navy (#314666), abre o modal "Salvar comparação" (nome 1..40, sugerido
 *   "WEGE3 · BBAS3"); POST com os tickers NA ORDEM DOS SLOTS + janela + tipo do FII. 201 →
 *   "Comparação X salva." (+ "Ver salvas"); 200 {atualizada} → "Comparação atualizada"; 409 → o
 *   limite de 30.
 * - Já salva (mesma chaveComparacao: tickers sem ordem + janela + tipo): "Comparação salva ✓"
 *   secundário com aria-pressed; o clique abre as Comparações salvas (onAbrirSalvas).
 * - Consultor: desabilitado com o title das comparações pessoais.
 * O modal Comparar da página do ativo continua sem gravar nada.
 */
import { useEffect, useId, useState, type FormEvent } from 'react';
import ModalAnalise, {
  BOTAO_MODAL_PRIMARIO,
  BOTAO_MODAL_SECUNDARIO,
  FOCO_MODAL,
  SUBTITULO_MODAL,
} from '@/components/analiseAtivos/ativo/acoes/ModalAnalise';
import { IconeMarcador } from '@/components/analiseAtivos/ativo/acoes/BotaoSalvarAtivo';
import { mostrarToastMover } from '@/components/carteira/mover/moverToast';
import { ErroAnalise } from '@/hooks/useAnaliseAtivos';
import { useComparacoesSalvas, useSalvarComparacao } from '@/hooks/useAnaliseAtivosSalvos';
import { useAuth } from '@/hooks/useAuth';
import {
  LIMITES_SALVOS,
  chaveComparacao,
  nomePadraoComparacao,
  normalizarNome,
} from '@/services/analiseAtivos/salvos/contrato';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import type { ClasseQuadro, TipoFiiExibido } from '@/types/analiseAtivosApi';
import type { Janela } from '@/types/analiseAtivosCriterios';
import type { ComparacaoSalvaApi } from '@/types/analiseAtivosSalvos';

const T = TEXTOS_SALVOS.comparacoes;
const FOCO =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';
const BASE = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${FOCO}`;
const NAVY = `${BASE} bg-[#314666] text-white hover:bg-[#396CAA] dark:bg-[#396CAA] dark:hover:bg-[#6E9DC4] dark:hover:text-gray-900`;
const SALVA = `${BASE} border border-[#DCE6F2] bg-white text-[#314666] hover:bg-[#EDF2F8] dark:border-[#6E9DC4]/40 dark:bg-transparent dark:text-[#6E9DC4] dark:hover:bg-white/5`;

/** A comparação salva com a mesma combinação (ordem dos slots não importa). */
export function comparacaoEquivalente(
  salvas: readonly ComparacaoSalvaApi[],
  tickers: readonly string[],
  janela: number,
  tipoFii: TipoFiiExibido | null,
): ComparacaoSalvaApi | null {
  const chave = chaveComparacao(tickers, janela, tipoFii);
  return salvas.find((c) => chaveComparacao(c.tickers, c.janela, c.tipoFii) === chave) ?? null;
}

/** "Comparação salva: <nome>" embaixo da instrução, quando a combinação da tela já está salva. */
export function LinhaComparacaoSalva({
  tickers,
  janela,
  tipoFii,
}: {
  tickers: readonly string[];
  janela: number;
  tipoFii: TipoFiiExibido | null;
}) {
  const consulta = useComparacoesSalvas();
  const salva = comparacaoEquivalente(consulta.data?.comparacoes ?? [], tickers, janela, tipoFii);
  if (!salva) return null;
  return (
    <p
      className="m-0 text-[13px] font-semibold text-gray-800 dark:text-white/90"
      data-comparacao-salva-nome=""
    >
      {formatarTexto(T.salvaNaBarra, { nome: salva.nome })}
    </p>
  );
}

export interface BotaoSalvarComparacaoProps {
  classe: ClasseQuadro;
  /** na ordem dos slots */
  tickers: readonly string[];
  janela: Janela;
  /** FII: tijolo | papel; ações: null */
  tipoFii: TipoFiiExibido | null;
  /** abre as Comparações salvas (clique em "Comparação salva ✓" e "Ver salvas" do aviso) */
  onAbrirSalvas?: () => void;
  larguraToda?: boolean;
  /** onde está (data-onde, para testes/QA) */
  onde?: 'barra' | 'leitura';
}

export default function BotaoSalvarComparacao({
  classe,
  tickers,
  janela,
  tipoFii,
  onAbrirSalvas,
  larguraToda = false,
  onde = 'barra',
}: BotaoSalvarComparacaoProps) {
  const consulta = useComparacoesSalvas();
  const salvar = useSalvarComparacao();
  const { actingClient } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState('');
  const idCampo = useId();
  const idErro = useId();

  const salvas = consulta.data?.comparacoes ?? [];
  const limites = consulta.data?.limites ?? LIMITES_SALVOS;
  const bloqueado = !!actingClient || consulta.data?.podeSalvar === false;
  const salva = bloqueado ? null : comparacaoEquivalente(salvas, tickers, janela, tipoFii);
  const nomeClasse = T.lista.classe[classe];

  useEffect(() => {
    if (!aberto) return;
    setNome(nomePadraoComparacao(tickers));
    setErro('');
    // só ao abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const clicar = () => {
    if (bloqueado || tickers.length === 0) return;
    if (salva) {
      onAbrirSalvas?.();
      return;
    }
    if (salvas.length >= limites.comparacoes) {
      mostrarToastMover({
        tipo: 'info',
        mensagem: formatarTexto(T.modal.limite, { max: limites.comparacoes }),
      });
      return;
    }
    setAberto(true);
  };

  const enviar = async (e?: FormEvent) => {
    e?.preventDefault();
    if (salvar.isPending) return;
    const valor = normalizarNome(nome);
    if (!valor) {
      setErro(T.modal.erroVazio);
      return;
    }
    setErro('');
    try {
      const r = await salvar.mutateAsync({
        classe,
        tickers: [...tickers],
        janela,
        tipoFii: classe === 'fii' ? tipoFii : null,
        nome: valor,
      });
      setAberto(false);
      if (r.atualizada) {
        mostrarToastMover({ tipo: 'ok', mensagem: T.toast.atualizada });
      } else {
        mostrarToastMover({
          tipo: 'ok',
          mensagem: formatarTexto(T.toast.salva, { nome: r.comparacao.nome }),
          ver: onAbrirSalvas ? { label: T.toast.verSalvas, onClick: onAbrirSalvas } : undefined,
        });
      }
    } catch (err: unknown) {
      if (err instanceof ErroAnalise && err.status === 409) {
        setErro(formatarTexto(T.modal.limite, { max: limites.comparacoes }));
      } else {
        setErro(TEXTOS_SALVOS.toast.erroGenerico);
      }
    }
  };

  const rodape = (
    <>
      <span className="min-w-0 flex-1" />
      <button type="button" onClick={() => setAberto(false)} className={BOTAO_MODAL_SECUNDARIO}>
        {T.modal.cancelar}
      </button>
      <button
        type="submit"
        form={`${idCampo}-form`}
        disabled={salvar.isPending}
        aria-busy={salvar.isPending || undefined}
        className={BOTAO_MODAL_PRIMARIO}
        data-enviar-comparacao=""
      >
        {salvar.isPending ? T.modal.salvando : T.modal.salvar}
      </button>
    </>
  );

  return (
    <>
      <button
        type="button"
        onClick={clicar}
        disabled={bloqueado || tickers.length === 0}
        title={bloqueado ? TEXTOS_SALVOS.consultor.titleComparacoes : undefined}
        aria-pressed={salva ? true : undefined}
        aria-haspopup="dialog"
        className={`${salva ? SALVA : NAVY} ${larguraToda ? 'w-full' : ''}`}
        data-salvar-comparacao={onde}
        data-salva={salva ? '' : undefined}
      >
        <IconeMarcador cheio={!!salva} />
        {salva ? T.salva : T.salvar}
      </button>
      {aberto ? (
        <ModalAnalise
          aberto
          onFechar={() => setAberto(false)}
          titulo={T.modal.titulo}
          rodape={rodape}
        >
          <form
            id={`${idCampo}-form`}
            noValidate
            onSubmit={enviar}
            data-modal-salvar-comparacao=""
            className="flex flex-col gap-3"
          >
            <p className={SUBTITULO_MODAL}>
              {formatarTexto(T.modal.subtitulo, {
                classe: nomeClasse,
                tickers: tickers.join(T.lista.separadorTickers),
                n: janela,
              })}
            </p>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={idCampo}
                className="text-sm font-medium text-gray-800 dark:text-white/90"
              >
                {T.modal.rotulo}
              </label>
              <input
                id={idCampo}
                type="text"
                value={nome}
                maxLength={limites.nome}
                autoComplete="off"
                data-autofocus=""
                aria-invalid={erro ? true : undefined}
                aria-describedby={idErro}
                onChange={(e) => {
                  setNome(e.target.value);
                  if (erro) setErro('');
                }}
                className={`min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 aria-[invalid=true]:border-[#D92D20] dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 ${FOCO_MODAL}`}
              />
              <span className="flex items-start justify-between gap-3 text-xs">
                <span
                  id={idErro}
                  aria-live="polite"
                  className="text-[#D92D20] dark:text-[#F97066]"
                  data-erro-comparacao=""
                >
                  {erro}
                </span>
                <span className="shrink-0 text-gray-500 dark:text-gray-400">
                  {formatarTexto(T.modal.ajuda, { max: limites.nome })}
                </span>
              </span>
            </div>
            <p className="text-[12.5px] leading-normal text-gray-500 dark:text-gray-400">
              {T.modal.nota}
            </p>
          </form>
        </ModalAnalise>
      ) : null}
    </>
  );
}
