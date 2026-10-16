'use client';

/**
 * Tabela da lista na página Salvos (bloco 1, fatia C). As MESMAS colunas e células do Quadro
 * (TabelaQuadro ≥ lg, CartoesQuadro < lg) + "Adicionado em" (DD/MM/AAAA) + o "×" de 44px
 * ("Remover WEGE3 de <lista>"; o clique não abre o ativo). Embaixo da célula Critérios, "antes 5 de
 * 6 · 16/10" quando a contagem mudou depois de o ativo entrar na lista (só na janela de 5 anos, a
 * do marco 'criterios:5').
 *
 * Remover: some na hora (oculto localmente até a releitura), aviso "<T> removido de <lista>" com
 * Desfazer (POST do item, idempotente); erro → aviso com "Tentar de novo" e a linha volta.
 * "Fora do Quadro": itens que saíram do Quadro, só para poder tirá-los da lista.
 */
import { useState } from 'react';
import CartoesQuadro from '@/components/analiseAtivos/quadro/CartoesQuadro';
import TabelaQuadro, {
  type ColunaExtraQuadro,
} from '@/components/analiseAtivos/quadro/TabelaQuadro';
import type { InfoNaCarteira } from '@/components/analiseAtivos/quadro/CelulaNaCarteira';
import {
  formatarDataCurta,
  formatarDataLonga,
} from '@/components/analiseAtivos/salvos/compartilhados/formatosSalvos';
import { mostrarToastSalvo } from '@/components/analiseAtivos/salvos/compartilhados/mostrarToastSalvo';
import { useAdicionarItem, useRemoverItem } from '@/hooks/useAnaliseAtivosSalvos';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import type { ClasseQuadro, DirecaoOrdem, ModoQuadro, OrdemQuadro } from '@/types/analiseAtivosApi';
import type { DefCriterioChip, Janela } from '@/types/analiseAtivosCriterios';
import type { ItemForaDoQuadro, LinhaLista } from '@/types/analiseAtivosSalvos';

const T = TEXTOS_SALVOS.pagina.tabela;
const FOCO =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';
const BOTAO_X = `-my-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-[#D92D20] dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-[#F97066] ${FOCO}`;

/** Janela do marco "antes n de 6" (o detector grava 'criterios:5'). */
const JANELA_MARCO: Janela = 5;

function IconeX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6L6 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** "antes 5 de 6 · 16/10" (null sem marco ou fora da janela de 5 anos). */
export function textoCriteriosAntes(linha: LinhaLista, janela: Janela): string | null {
  const a = linha.criteriosAnterior;
  if (!a || janela !== JANELA_MARCO) return null;
  return formatarTexto(T.criteriosAntes, {
    n: a.atendidos,
    total: a.aplicaveis,
    data: formatarDataCurta(a.mudouEm),
  });
}

export interface ListaDaTabela {
  id: string;
  nome: string;
}

/** Remover com Desfazer (tabela, cartões e "Fora do Quadro"). */
export function useRemoverDaLista(lista: ListaDaTabela) {
  const remover = useRemoverItem();
  const adicionar = useAdicionarItem();
  const [ocultos, setOcultos] = useState<ReadonlySet<string>>(() => new Set());
  const [listaDosOcultos, setListaDosOcultos] = useState(lista.id);
  // trocar de lista zera o que estava oculto (estado derivado no render)
  if (listaDosOcultos !== lista.id) {
    setListaDosOcultos(lista.id);
    setOcultos(new Set());
  }

  const mudar = (ticker: string, oculto: boolean) =>
    setOcultos((s) => {
      const n = new Set(s);
      if (oculto) n.add(ticker);
      else n.delete(ticker);
      return n;
    });

  const removerTicker = (ticker: string) => {
    mudar(ticker, true);
    remover.mutate(
      { listaId: lista.id, ticker },
      {
        onSuccess: () =>
          mostrarToastSalvo({
            tipo: 'removido',
            ticker,
            lista: lista.nome,
            desfazer: () => {
              mudar(ticker, false);
              adicionar.mutate(
                { listaId: lista.id, ticker },
                {
                  onError: () =>
                    mostrarToastSalvo({
                      tipo: 'erro',
                      mensagem: formatarTexto(TEXTOS_SALVOS.toast.erroSalvar, { ticker }),
                    }),
                },
              );
            },
          }),
        onError: () => {
          mudar(ticker, false);
          mostrarToastSalvo({
            tipo: 'erro',
            mensagem: formatarTexto(TEXTOS_SALVOS.toast.erroRemover, { ticker }),
            tentarDeNovo: () => removerTicker(ticker),
          });
        },
      },
    );
  };

  return { ocultos, removerTicker };
}

function BotaoRemover({
  ticker,
  lista,
  onRemover,
}: {
  ticker: string;
  lista: string;
  onRemover: (ticker: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onRemover(ticker);
      }}
      aria-label={formatarTexto(T.removerAria, { ticker, lista })}
      data-remover={ticker}
      className={BOTAO_X}
    >
      <IconeX />
    </button>
  );
}

export interface TabelaSalvosProps {
  lista: ListaDaTabela;
  classe: ClasseQuadro;
  modo: ModoQuadro;
  ordem: OrdemQuadro;
  dir: DirecaoOrdem;
  janela: Janela;
  linhas: LinhaLista[];
  foraDoQuadro: ItemForaDoQuadro[];
  onOrdenar: (ordem: OrdemQuadro) => void;
  naCarteira: (ticker: string) => InfoNaCarteira;
  definicoes?: DefCriterioChip[];
  carregando?: boolean;
  atualizando?: boolean;
  /** < lg: cartões */
  celular: boolean;
}

export default function TabelaSalvos({
  lista,
  classe,
  modo,
  ordem,
  dir,
  janela,
  linhas,
  foraDoQuadro,
  onOrdenar,
  naCarteira,
  definicoes,
  carregando = false,
  atualizando = false,
  celular,
}: TabelaSalvosProps) {
  const { ocultos, removerTicker } = useRemoverDaLista(lista);
  const visiveis = ocultos.size ? linhas.filter((l) => !ocultos.has(l.ticker)) : linhas;
  const fora = foraDoQuadro.filter((f) => !ocultos.has(f.ticker));

  const acaoLinha = (l: LinhaLista) => (
    <BotaoRemover ticker={l.ticker} lista={lista.nome} onRemover={removerTicker} />
  );
  const complementoCriterios = (l: LinhaLista) => {
    const t = textoCriteriosAntes(l, janela);
    return t ? (
      <small data-criterios-antes="" className="text-xs text-gray-500 dark:text-gray-400">
        {t}
      </small>
    ) : null;
  };
  const colunasExtras: ColunaExtraQuadro<LinhaLista>[] = [
    {
      id: 'adicionadoEm',
      rotulo: T.adicionadoEm,
      conteudo: (l) => (
        <span className="text-xs whitespace-nowrap text-gray-500 tabular-nums dark:text-gray-400">
          {formatarDataLonga(l.adicionadoEm)}
        </span>
      ),
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {celular ? (
        <CartoesQuadro<LinhaLista>
          classe={classe}
          modo={modo}
          linhas={visiveis}
          naCarteira={naCarteira}
          carregando={carregando}
          atualizando={atualizando}
          definicoes={definicoes}
          acaoLinha={acaoLinha}
          complementoCriterios={complementoCriterios}
          rodapeCartao={(l) => (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {formatarTexto(T.cartaoAdicionado, { data: formatarDataLonga(l.adicionadoEm) })}
            </span>
          )}
        />
      ) : (
        <TabelaQuadro<LinhaLista>
          classe={classe}
          modo={modo}
          ordem={ordem}
          dir={dir}
          linhas={visiveis}
          onOrdenar={onOrdenar}
          naCarteira={naCarteira}
          carregando={carregando}
          atualizando={atualizando}
          legenda={formatarTexto(classe === 'acao' ? T.legendaAcao : T.legendaFii, {
            lista: lista.nome,
          })}
          definicoes={definicoes}
          acaoLinha={acaoLinha}
          rotuloColunaAcao={T.remover}
          complementoCriterios={complementoCriterios}
          colunasExtras={colunasExtras}
        />
      )}
      <p className="text-center text-xs text-gray-500 dark:text-gray-400">{T.nota}</p>
      {fora.length > 0 ? (
        <section
          aria-labelledby="salvos-fora-do-quadro"
          data-salvos-fora=""
          className="rounded-xl border border-gray-200 p-3 dark:border-gray-800"
        >
          <h3
            id="salvos-fora-do-quadro"
            className="text-sm font-semibold text-gray-800 dark:text-white/90"
          >
            {TEXTOS_SALVOS.pagina.foraDoQuadro.titulo}
          </h3>
          <p className="mt-1 text-[13px] text-gray-500 dark:text-gray-400">
            {TEXTOS_SALVOS.pagina.foraDoQuadro.texto}
          </p>
          <ul className="mt-2 flex flex-col">
            {fora.map((f) => (
              <li
                key={f.ticker}
                className="flex min-h-11 items-center justify-between gap-3 border-t border-gray-100 py-1 first:border-t-0 dark:border-gray-800"
              >
                <span className="min-w-0 text-sm">
                  <b className="font-semibold text-gray-800 dark:text-white/90">{f.ticker}</b>{' '}
                  <span className="text-gray-500 dark:text-gray-400">
                    · {TEXTOS_SALVOS.pagina.foraDoQuadro.motivos[f.motivo]}
                  </span>
                </span>
                <BotaoRemover ticker={f.ticker} lista={lista.nome} onRemover={removerTicker} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
