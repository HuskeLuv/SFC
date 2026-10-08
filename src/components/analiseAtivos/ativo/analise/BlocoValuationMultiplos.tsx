'use client';

/**
 * Valuation · Múltiplos (fatia C). Busca o próprio dado (useValuationAtivo, preguiçoso). Chips por
 * grupo, frase-resumo neutra (conta só as barras visíveis), cartões com a barra de 10 anos e a
 * nota de rodapé. Banco/papel: a explicação no lugar dos cartões. Sem referência a índice de
 * mercado (sem fonte) e sem cor semântica.
 *
 * Bloco C: cartões em conferência pelo CardMultiplo (mesma política do topo); o menu ⋯ e o frescor
 * do bloco vêm do CartaoAnalise, com os múltiplos reportáveis no "Qual dado?".
 *
 * Bloco D (fatia B): `cabecalhoExtra` (o SeletorNivel 'Múltiplos | Meus cenários') vai no slot
 * `acao` do cabeçalho; ausente = cabeçalho de hoje.
 */
import { useState } from 'react';
import CardMultiplo from '@/components/analiseAtivos/ativo/analise/CardMultiplo';
import CartaoAnalise from '@/components/analiseAtivos/ativo/analise/CartaoAnalise';
import ChipsGrupo from '@/components/analiseAtivos/ativo/analise/ChipsGrupo';
import { formatarEstado } from '@/components/analiseAtivos/comum/formatarAnalise';
import { useValuationAtivo } from '@/hooks/useAnaliseAtivos';
import { CAMPOS_REPORTAVEIS } from '@/services/analiseAtivos/curadoria/contrato';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { BlocoValuationMultiplosProps, GrupoValuation } from '@/types/analiseAtivosApi';
import type { DadoBlocoReporte } from '@/types/analiseAtivosCuradoria';

export type { BlocoValuationMultiplosProps };

const TV = TEXTOS_TELA.analise.valuation;

/** "Qual dado?" do relato: múltiplos reportáveis de todos os grupos (rótulo · valor 12m). */
function dadosReporte(grupos: GrupoValuation[]): DadoBlocoReporte[] | undefined {
  if (grupos.length === 0) return undefined;
  const reportaveis = CAMPOS_REPORTAVEIS.valuation as readonly string[];
  return grupos
    .flatMap((g) => g.itens)
    .filter((i) => reportaveis.includes(i.codigo))
    .map((i) => ({
      campo: i.codigo as DadoBlocoReporte['campo'],
      rotulo: i.rotulo,
      valorExibido: formatarEstado(i.atual, i.formato),
      periodo: TEXTOS_TELA.ativo.ult12m,
    }));
}

export default function BlocoValuationMultiplos({
  ticker,
  cabecalhoExtra,
}: BlocoValuationMultiplosProps) {
  const q = useValuationAtivo(ticker);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const grupos = q.data?.grupos ?? [];
  const grupo = grupos.find((g) => g.codigo === escolhido) ?? grupos[0];

  return (
    <CartaoAnalise
      id={`valuation-${ticker}`}
      titulo={TEXTOS_TELA.blocos.valuation}
      sub={TV.sub}
      carregando={q.isPending}
      erro={q.isError}
      onTentarNovamente={() => void q.refetch()}
      alturaEsqueleto={360}
      dadosReporte={dadosReporte(grupos)}
      acao={cabecalhoExtra}
    >
      {grupo ? (
        <>
          <ChipsGrupo
            rotulo={TV.gruposRotulo}
            opcoes={grupos.map((g) => ({ codigo: g.codigo, rotulo: g.rotulo }))}
            selecionado={grupo.codigo}
            onSelecionar={setEscolhido}
          />
          <p
            aria-live="polite"
            className="rounded-lg bg-gray-50 px-3 py-2 text-[13.5px] text-gray-700 dark:bg-white/[0.04] dark:text-gray-200"
          >
            {grupo.explicacao ?? grupo.resumo}
          </p>
          {grupo.itens.length > 0 ? (
            <div
              className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(230px,1fr))]"
              data-grupo={grupo.codigo}
            >
              {grupo.itens.map((item) => (
                <CardMultiplo key={item.codigo} item={item} />
              ))}
            </div>
          ) : null}
          <ul className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
            <li>{TV.nota}</li>
            {q.data?.nota ? <li>{q.data.nota}</li> : null}
          </ul>
        </>
      ) : null}
    </CartaoAnalise>
  );
}
