'use client';

/**
 * Seção "Imóveis e composição do fundo" da página do FII (A6, itens 1 e 2; fatia A,
 * docs/analise-ativos/fundamentei-trazer/desenho.json). A PaginaAtivo só o monta com
 * recursos.imoveisFii (chave ANALISE_ATIVOS_IMOVEIS_FII_HABILITADO), entre Fundamentos e Valuation,
 * dentro de uma SecaoPreguicosa — então a busca só sai quando a seção chega perto da tela.
 *
 * - Tijolo/híbrido: ComposicaoAtivoFii (1/3) + ListaImoveisFii (2/3) a partir de xl; abaixo,
 *   empilhados.
 * - Papel/FoF (pelo tipo CVM do topo ou pela lista 'não se aplica'): só a composição, na largura
 *   toda, com o "Como ler" ao lado.
 * - 404 (FII sem nenhum informe nas janelas): card da composição com 'sem dado' e o motivo.
 * - Erro: "Tentar de novo" (CartaoAnalise).
 */
import CartaoAnalise from '@/components/analiseAtivos/ativo/analise/CartaoAnalise';
import ComposicaoAtivoFii from '@/components/analiseAtivos/ativo/fii/ComposicaoAtivoFii';
import ListaImoveisFii from '@/components/analiseAtivos/ativo/fii/ListaImoveisFii';
import { ErroAnalise } from '@/hooks/useAnaliseAtivos';
import { useImoveisFii } from '@/hooks/useImoveisFii';
import { TEXTOS_IMOVEIS_FII } from '@/services/analiseAtivos/textosImoveisFii';
import type { BlocoImoveisFiiProps } from '@/types/analiseAtivosComplementos';

const T = TEXTOS_IMOVEIS_FII;

export default function BlocoImoveisFii({ ticker, fiiTipo }: BlocoImoveisFiiProps) {
  const q = useImoveisFii(ticker);
  const semListaPeloTipo = fiiTipo === 'papel' || fiiTipo === 'fof';

  if (q.isPending) {
    return (
      <CartaoAnalise
        id={`imoveis-fii-${ticker}`}
        titulo={semListaPeloTipo ? T.secao.rotuloSemLista : T.secao.rotuloComLista}
        carregando
        alturaEsqueleto={220}
      />
    );
  }
  if (q.isError) {
    if (q.error instanceof ErroAnalise && q.error.status === 404) {
      return (
        <CartaoAnalise id={`imoveis-fii-${ticker}`} titulo={T.composicao.titulo}>
          <p
            className="m-0 text-sm text-gray-600 dark:text-gray-300"
            data-imoveis-fii-sem-informe=""
          >
            {T.motivos.sem_informe_mensal}
          </p>
        </CartaoAnalise>
      );
    }
    return (
      <CartaoAnalise
        id={`imoveis-fii-${ticker}`}
        titulo={semListaPeloTipo ? T.secao.rotuloSemLista : T.secao.rotuloComLista}
        erro
        onTentarNovamente={() => void q.refetch()}
      />
    );
  }

  const d = q.data;
  const semLista = semListaPeloTipo || d.imoveis.estado === 'nao_se_aplica';
  if (semLista) {
    return (
      <div data-bloco-imoveis-fii="sem-lista">
        <ComposicaoAtivoFii ticker={ticker} composicao={d.composicao} largo semLista />
      </div>
    );
  }
  return (
    <div
      className="grid min-w-0 items-start gap-4 md:gap-6 xl:grid-cols-3"
      data-bloco-imoveis-fii="com-lista"
    >
      <div className="min-w-0 xl:col-span-1">
        <ComposicaoAtivoFii ticker={ticker} composicao={d.composicao} />
      </div>
      <div className="min-w-0 xl:col-span-2">
        <ListaImoveisFii ticker={ticker} imoveis={d.imoveis} />
      </div>
    </div>
  );
}
