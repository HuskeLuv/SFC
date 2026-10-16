'use client';

/**
 * "Salvar filtros" do Quadro (bloco 1, fatia B): guarda janela, critérios, setor/segmento e "Na
 * minha carteira" da classe com um nome (1..40). ModalAnalise (diálogo no computador, BottomSheet
 * no celular). "O que fica salvo" lista a combinação; o nome vem sugerido pelo resumo.
 * - 409 (mesmo nome na classe) → "Já existe um filtro com esse nome. Substituir?" com o botão
 *   Substituir (PATCH estado no existente).
 * - No limite (20 por classe): aviso, campo e botão desabilitados.
 * Sucesso: aviso "Filtro X salvo…" / "Filtro X atualizado." e onSalvo(filtro) — o Quadro aplica
 * ?filtro=<id>.
 */
import { useEffect, useId, useState, type FormEvent } from 'react';
import ModalAnalise, {
  BOTAO_MODAL_PRIMARIO,
  BOTAO_MODAL_SECUNDARIO,
  FOCO_MODAL,
  SUBTITULO_MODAL,
} from '@/components/analiseAtivos/ativo/acoes/ModalAnalise';
import { mostrarToastSalvo } from '@/components/analiseAtivos/salvos/compartilhados/mostrarToastSalvo';
import { resumoFiltro, rotuloCriterio } from '@/components/analiseAtivos/quadro/FiltrosSalvos';
import { ErroAnalise } from '@/hooks/useAnaliseAtivos';
import { useAtualizarFiltro, useCriarFiltro } from '@/hooks/useAnaliseAtivosSalvos';
import {
  LIMITES_SALVOS,
  MAX_NOME,
  nomeNormalizado,
  normalizarNome,
} from '@/services/analiseAtivos/salvos/contrato';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import type { ClasseQuadro } from '@/types/analiseAtivosApi';
import type { DefCriterioChip } from '@/types/analiseAtivosCriterios';
import type {
  EstadoFiltroSalvoV1,
  FiltroSalvoApi,
  LimitesSalvos,
} from '@/types/analiseAtivosSalvos';

const T = TEXTOS_SALVOS.filtros.modal;
const NOME_CLASSE: Record<ClasseQuadro, string> = TEXTOS_SALVOS.pagina.abas;

/** Nome sugerido: o resumo da combinação, cortado em 40. */
export function nomeSugeridoFiltro(
  estado: EstadoFiltroSalvoV1,
  classe: ClasseQuadro,
  definicoes: readonly DefCriterioChip[],
): string {
  return resumoFiltro(estado, classe, definicoes).slice(0, MAX_NOME).trim();
}

export interface ModalSalvarFiltroProps {
  aberto: boolean;
  onFechar: () => void;
  classe: ClasseQuadro;
  estado: EstadoFiltroSalvoV1;
  definicoes: readonly DefCriterioChip[];
  /** filtros da classe (limite e o "Substituir") */
  filtros: readonly FiltroSalvoApi[];
  limites?: LimitesSalvos;
  onSalvo: (filtro: FiltroSalvoApi) => void;
}

export default function ModalSalvarFiltro({
  aberto,
  onFechar,
  classe,
  estado,
  definicoes,
  filtros,
  limites = LIMITES_SALVOS,
  onSalvo,
}: ModalSalvarFiltroProps) {
  const criar = useCriarFiltro();
  const atualizar = useAtualizarFiltro();
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState('');
  const [repetido, setRepetido] = useState(false);
  const idCampo = useId();
  const idErro = useId();
  const nomeClasse = NOME_CLASSE[classe];

  useEffect(() => {
    if (!aberto) return;
    setNome(nomeSugeridoFiltro(estado, classe, definicoes));
    setErro('');
    setRepetido(false);
    // só ao abrir: o nome sugerido não segue os chips com o modal aberto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const noLimite = filtros.length >= limites.filtrosPorClasse;
  const enviando = criar.isPending || atualizar.isPending;

  const enviar = async (e?: FormEvent) => {
    e?.preventDefault();
    if (noLimite || enviando) return;
    const valor = normalizarNome(nome);
    if (!valor) {
      setErro(T.erroVazio);
      return;
    }
    setErro('');
    setRepetido(false);
    try {
      const f = await criar.mutateAsync({ nome: valor, classe, estado });
      mostrarToastSalvo({
        tipo: 'info',
        mensagem: formatarTexto(TEXTOS_SALVOS.filtros.toast.salvo, { nome: f.nome }),
      });
      onSalvo(f);
    } catch (err: unknown) {
      if (err instanceof ErroAnalise && err.status === 409) {
        setRepetido(true);
        setErro(T.repetido);
      } else {
        setErro(TEXTOS_SALVOS.toast.erroGenerico);
      }
    }
  };

  const substituir = async () => {
    const chave = nomeNormalizado(nome);
    const existente = filtros.find((f) => nomeNormalizado(f.nome) === chave);
    if (!existente) {
      setErro(TEXTOS_SALVOS.toast.erroGenerico);
      return;
    }
    try {
      const f = await atualizar.mutateAsync({ id: existente.id, estado });
      mostrarToastSalvo({
        tipo: 'info',
        mensagem: formatarTexto(TEXTOS_SALVOS.filtros.toast.atualizado, { nome: f.nome }),
      });
      onSalvo(f);
    } catch {
      setErro(TEXTOS_SALVOS.toast.erroGenerico);
    }
  };

  const rodape = (
    <>
      <span className="min-w-0 flex-1" />
      <button type="button" onClick={onFechar} className={BOTAO_MODAL_SECUNDARIO}>
        {T.cancelar}
      </button>
      {repetido ? (
        <button
          type="button"
          onClick={() => void substituir()}
          disabled={enviando}
          aria-busy={atualizar.isPending || undefined}
          className={BOTAO_MODAL_PRIMARIO}
          data-substituir-filtro=""
        >
          {atualizar.isPending ? T.salvando : T.substituir}
        </button>
      ) : (
        <button
          type="submit"
          form={`${idCampo}-form`}
          disabled={noLimite || enviando}
          aria-busy={criar.isPending || undefined}
          className={BOTAO_MODAL_PRIMARIO}
          data-enviar-filtro=""
        >
          {criar.isPending ? T.salvando : T.salvar}
        </button>
      )}
    </>
  );

  return (
    <ModalAnalise aberto={aberto} onFechar={onFechar} titulo={T.titulo} rodape={rodape}>
      <form
        id={`${idCampo}-form`}
        noValidate
        onSubmit={enviar}
        data-modal-salvar-filtro=""
        className="flex flex-col gap-3"
      >
        <p className={SUBTITULO_MODAL}>{formatarTexto(T.subtitulo, { classe: nomeClasse })}</p>
        {noLimite ? (
          <p
            role="alert"
            className="rounded-lg border-l-[3px] border-[#396CAA] bg-[#EDF2F8] px-3 py-2 text-[13px] text-gray-700 dark:border-[#6E9DC4] dark:bg-white/5 dark:text-gray-300"
          >
            {formatarTexto(T.limite, { max: limites.filtrosPorClasse, classe: nomeClasse })}
          </p>
        ) : null}
        <div className="rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-700 dark:border-gray-800 dark:text-gray-300">
          <p className="font-semibold text-gray-800 dark:text-white/90">{T.oQueFica}</p>
          <ul className="mt-1 list-disc pl-5">
            <li>{formatarTexto(T.janela, { n: estado.janela })}</li>
            {estado.criterios.length ? (
              <li>
                {formatarTexto(T.criterios, {
                  lista: estado.criterios.map((id) => rotuloCriterio(id, definicoes)).join(', '),
                })}
              </li>
            ) : null}
            {estado.setor ? (
              <li>
                {formatarTexto(classe === 'acao' ? T.setor : T.segmento, { setor: estado.setor })}
              </li>
            ) : null}
            {estado.naCarteira ? <li>{T.naCarteira}</li> : null}
          </ul>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={idCampo} className="text-sm font-medium text-gray-800 dark:text-white/90">
            {T.rotulo}
          </label>
          <input
            id={idCampo}
            type="text"
            value={nome}
            maxLength={limites.nome}
            disabled={noLimite}
            autoComplete="off"
            data-autofocus=""
            aria-invalid={erro ? true : undefined}
            aria-describedby={idErro}
            onChange={(e) => {
              setNome(e.target.value);
              if (erro) setErro('');
              if (repetido) setRepetido(false);
            }}
            className={`min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-[#D92D20] dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 ${FOCO_MODAL}`}
          />
          <span className="flex items-start justify-between gap-3 text-xs">
            <span
              id={idErro}
              aria-live="polite"
              className="text-[#D92D20] dark:text-[#F97066]"
              data-erro-filtro=""
            >
              {erro}
            </span>
            <span className="shrink-0 text-gray-500 dark:text-gray-400">
              {formatarTexto(T.ajuda, { max: limites.nome })}
            </span>
          </span>
        </div>
        <p className="text-[12.5px] leading-normal text-gray-500 dark:text-gray-400">{T.nota}</p>
      </form>
    </ModalAnalise>
  );
}
