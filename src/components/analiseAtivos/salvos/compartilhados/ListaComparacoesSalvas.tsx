'use client';

/**
 * ListaComparacoesSalvas (bloco 1, fatia 0) — as comparações salvas do usuário: reabrir (com os
 * dados de hoje), renomear e apagar com confirmação NA PRÓPRIA LINHA (sem caixa extra).
 *
 * - variante 'popover': conteúdo do "Comparações salvas (n) ▾" do Comparador (fatia B monta a
 *   moldura: popover no computador, BottomSheet no celular). Instrução curta e "Fechar".
 * - variante 'pagina': seção da página Salvos (fatia C), só com recursos.comparador.
 * - Filtra pela classe (ausente = todas). Rodapé "n de 30". Carregando, erro com "Tentar de
 *   novo" e vazio. Consultor: a rota devolve vazio; os botões de gravar nem aparecem.
 * - Alvos de 44 px; foco visível #0079F2/#6E9DC4; cópia de textosSalvos.comparacoes.
 */
import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { FOCO_MODAL } from '@/components/analiseAtivos/ativo/acoes/ModalAnalise';
import { formatarDataLonga } from '@/components/analiseAtivos/salvos/compartilhados/formatosSalvos';
import { mostrarToastSalvo } from '@/components/analiseAtivos/salvos/compartilhados/mostrarToastSalvo';
import {
  useApagarComparacao,
  useComparacoesSalvas,
  useRenomearComparacao,
} from '@/hooks/useAnaliseAtivosSalvos';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { LIMITES_SALVOS, normalizarNome } from '@/services/analiseAtivos/salvos/contrato';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import type { ComparacaoSalvaApi, ListaComparacoesSalvasProps } from '@/types/analiseAtivosSalvos';

export type { ListaComparacoesSalvasProps };

const T = TEXTOS_SALVOS.comparacoes;
const L = T.lista;

const BOTAO_PEQ = `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-medium whitespace-nowrap transition-colors ${FOCO_MODAL}`;
const BOTAO_SEC = `${BOTAO_PEQ} border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:bg-transparent dark:text-white/90 dark:hover:bg-white/5`;
const BOTAO_PERIGO = `${BOTAO_PEQ} bg-[#D92D20] text-white hover:bg-[#B42318] dark:bg-[#F04438] dark:hover:bg-[#D92D20]`;
const ICONE_44 = `grid h-11 w-11 shrink-0 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5 ${FOCO_MODAL}`;

/** "Ações · WEGE3 · ITUB4 · 5 anos · salva em 14/10/2026" */
export function resumoComparacao(c: ComparacaoSalvaApi): string {
  return formatarTexto(L.item, {
    classe: L.classe[c.classe],
    tickers: c.tickers.join(L.separadorTickers),
    n: c.janela,
    data: formatarDataLonga(c.atualizadoEm),
  });
}

function Icone({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={d}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
const ICONE_LIXEIRA = 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13';
const ICONE_LAPIS = 'M4 20h4L19 9l-4-4L4 16z';

function LinhaRenomear({ c, onFim }: { c: ComparacaoSalvaApi; onFim: (focarEm?: string) => void }) {
  const renomear = useRenomearComparacao();
  const [nome, setNome] = useState(c.nome);
  const [erro, setErro] = useState('');
  const id = useId();
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const valor = normalizarNome(nome);
    if (!valor) {
      setErro(TEXTOS_SALVOS.comparacoes.modal.erroVazio);
      return;
    }
    try {
      await renomear.mutateAsync({ id: c.id, nome: valor });
      mostrarToastSalvo({ tipo: 'info', mensagem: T.toast.renomeada });
      onFim(`renomear-${c.id}`);
    } catch {
      setErro(TEXTOS_SALVOS.toast.erroGenerico);
    }
  };
  return (
    <form onSubmit={enviar} className="flex flex-col gap-1.5 py-1" data-comparacao-renomear={c.id}>
      <label htmlFor={id} className="sr-only">
        {L.rotuloNome}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={id}
          type="text"
          value={nome}
          maxLength={LIMITES_SALVOS.nome}
          autoFocus
          aria-invalid={erro ? true : undefined}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              onFim(`renomear-${c.id}`);
            }
          }}
          className={`min-h-11 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 ${FOCO_MODAL}`}
        />
        <button type="button" className={BOTAO_SEC} onClick={() => onFim(`renomear-${c.id}`)}>
          {L.cancelar}
        </button>
        <button
          type="submit"
          className={`${BOTAO_PEQ} bg-[#396CAA] text-white hover:bg-[#314666]`}
          disabled={renomear.isPending}
        >
          {L.salvarNome}
        </button>
      </div>
      {erro ? (
        <span role="alert" className="text-xs text-[#D92D20] dark:text-[#F97066]">
          {erro}
        </span>
      ) : null}
    </form>
  );
}

export default function ListaComparacoesSalvas({
  variante,
  classe,
  onFechar,
  onAbrir,
  className = '',
}: ListaComparacoesSalvasProps) {
  const router = useRouter();
  const celular = useIsBelowLg();
  const consulta = useComparacoesSalvas(classe);
  const apagar = useApagarComparacao();
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const tituloId = useId();

  const focar = (id?: string) => {
    if (!id || typeof document === 'undefined') return;
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  };

  const abrir = (c: ComparacaoSalvaApi) => {
    mostrarToastSalvo({ tipo: 'info', mensagem: formatarTexto(T.toast.aberta, { nome: c.nome }) });
    if (onAbrir) onAbrir(c);
    else router.push(c.href);
    onFechar?.();
  };

  const confirmarApagar = async (c: ComparacaoSalvaApi) => {
    try {
      await apagar.mutateAsync({ id: c.id });
      setConfirmando(null);
      mostrarToastSalvo({
        tipo: 'info',
        mensagem: formatarTexto(T.toast.apagada, { nome: c.nome }),
      });
    } catch {
      mostrarToastSalvo({ tipo: 'erro', mensagem: TEXTOS_SALVOS.toast.erroGenerico });
    }
  };

  const itens = consulta.data?.comparacoes ?? [];
  const limites = consulta.data?.limites ?? LIMITES_SALVOS;
  const podeSalvar = consulta.data?.podeSalvar ?? true;
  const total = itens.length;

  let corpo;
  if (consulta.isPending) {
    corpo = (
      <p aria-busy="true" className="px-2 py-4 text-sm text-gray-500 dark:text-gray-400">
        {L.carregando}
      </p>
    );
  } else if (consulta.isError) {
    corpo = (
      <div role="alert" className="flex flex-col items-start gap-2 px-2 py-4 text-sm">
        <span className="text-gray-700 dark:text-gray-300">{L.erro}</span>
        <button type="button" className={BOTAO_SEC} onClick={() => void consulta.refetch()}>
          {L.tentar}
        </button>
      </div>
    );
  } else if (total === 0) {
    corpo = (
      <p className="px-2 py-4 text-sm text-gray-500 dark:text-gray-400" data-comparacoes-vazio="">
        {classe && variante === 'pagina'
          ? formatarTexto(L.vazioClasse, { classe: L.classe[classe] })
          : L.vazio}
      </p>
    );
  } else {
    corpo = (
      <ul className="flex flex-col divide-y divide-gray-100 dark:divide-gray-800">
        {itens.map((c) => (
          <li key={c.id} data-comparacao-salva={c.id} className="py-1">
            {confirmando === c.id ? (
              <div role="alert" className="flex flex-wrap items-center gap-2 px-2 py-1 text-sm">
                <span className="min-w-0 flex-1 text-gray-800 dark:text-white/90">
                  {formatarTexto(L.confirmarApagar, { nome: c.nome })}
                </span>
                <button
                  type="button"
                  className={BOTAO_SEC}
                  onClick={() => {
                    setConfirmando(null);
                    focar(`apagar-${c.id}`);
                  }}
                >
                  {L.cancelar}
                </button>
                <button
                  type="button"
                  autoFocus
                  className={BOTAO_PERIGO}
                  disabled={apagar.isPending}
                  onClick={() => void confirmarApagar(c)}
                >
                  {L.apagar}
                </button>
              </div>
            ) : renomeando === c.id ? (
              <LinhaRenomear
                c={c}
                onFim={(id) => {
                  setRenomeando(null);
                  focar(id);
                }}
              />
            ) : (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => abrir(c)}
                  aria-label={formatarTexto(L.abrirAria, { nome: c.nome })}
                  className={`flex min-h-11 min-w-0 flex-1 flex-col items-start rounded-lg px-2 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-white/5 ${FOCO_MODAL}`}
                >
                  <span className="max-w-full truncate text-sm font-semibold text-gray-800 dark:text-white/90">
                    {c.nome}
                  </span>
                  <span className="max-w-full truncate text-xs text-gray-500 dark:text-gray-400">
                    {resumoComparacao(c)}
                  </span>
                </button>
                {podeSalvar ? (
                  <>
                    <button
                      type="button"
                      id={`renomear-${c.id}`}
                      className={ICONE_44}
                      aria-label={formatarTexto(L.renomearAria, { nome: c.nome })}
                      onClick={() => setRenomeando(c.id)}
                    >
                      <Icone d={ICONE_LAPIS} />
                    </button>
                    <button
                      type="button"
                      id={`apagar-${c.id}`}
                      className={ICONE_44}
                      aria-label={formatarTexto(L.apagarAria, { nome: c.nome })}
                      onClick={() => setConfirmando(c.id)}
                    >
                      <Icone d={ICONE_LIXEIRA} />
                    </button>
                  </>
                ) : null}
              </div>
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section
      aria-labelledby={tituloId}
      data-lista-comparacoes={variante}
      className={`flex flex-col gap-1 ${className}`}
    >
      <div className="px-2">
        <h3 id={tituloId} className="text-[15px] font-semibold text-gray-800 dark:text-white/90">
          {L.titulo}
        </h3>
        {variante === 'popover' ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {celular ? L.instrucaoCelular : L.instrucao}
          </p>
        ) : null}
      </div>
      {corpo}
      <div className="flex items-center justify-between gap-2 px-2 pt-1">
        <span className="text-xs text-gray-500 tabular-nums dark:text-gray-400">
          {formatarTexto(L.contador, { n: total, max: limites.comparacoes })}
        </span>
        {variante === 'popover' && onFechar ? (
          <button type="button" className={BOTAO_SEC} onClick={onFechar}>
            {L.fechar}
          </button>
        ) : null}
      </div>
    </section>
  );
}
