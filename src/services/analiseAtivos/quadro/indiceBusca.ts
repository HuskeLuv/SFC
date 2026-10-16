/**
 * Índice de busca da Análise de Ativos (Fase 1). PURO e sem dependência de servidor: a rota monta
 * o índice com `montarIndiceBusca` e o componente BuscaAtivos filtra no cliente com `filtrarBusca`
 * (o índice inteiro chega uma vez; nenhuma requisição por tecla).
 *
 * - Índice: TODAS as linhas (inclusive fora do Quadro, com o motivo), chaves curtas (ItemBusca)
 *   {t, n, c, q, f, m}. v2.4: sem i/e (o indicador antigo saiu da superfície). v2.5: f = tipo
 *   EXIBIDO do FII (Tijolo | Papel pelo perfil dos critérios, tipoFiiExibido).
 * - Filtro: sem acento e sem caixa (NFD); relevância prefixo do ticker > prefixo de palavra do nome
 *   > substring (ticker ou nome); desempate: do Quadro antes, depois ticker; no máximo 8.
 */
import { tipoFiiExibido } from '@/services/analiseAtivos/quadro/tipoFiiExibido';
import type { ClasseQuadro, ForaDoQuadroMotivo, ItemBusca } from '@/types/analiseAtivosApi';

export const MAX_RESULTADOS_BUSCA = 8;

/** Campos da linha gravada que o índice usa (AnaliseQuadroLinha ou fixture). */
export interface LinhaParaBusca {
  symbol: string;
  nome: string;
  classe: string;
  noQuadro: boolean;
  fiiTipo: string | null;
  foraDoQuadroMotivo: string | null;
  /** v2.5: perfil dos critérios (decide o tipo exibido do FII); ausente/null = pelo tipo CVM */
  perfilCriterios?: string | null;
}

export function montarIndiceBusca(linhas: readonly LinhaParaBusca[]): ItemBusca[] {
  return linhas
    .map(
      (l): ItemBusca => ({
        t: l.symbol,
        n: l.nome,
        c: l.classe as ClasseQuadro,
        q: l.noQuadro,
        f: l.classe === 'fii' ? tipoFiiExibido(l.perfilCriterios, l.fiiTipo) : null,
        m: l.noQuadro ? null : ((l.foraDoQuadroMotivo as ForaDoQuadroMotivo | null) ?? null),
      }),
    )
    .sort((a, b) => a.t.localeCompare(b.t));
}

/** Minúsculas sem acento (NFD). */
export function normalizarBusca(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export interface ResultadoBusca {
  item: ItemBusca;
  /** 0 = prefixo do ticker, 1 = prefixo de palavra do nome, 2 = substring */
  relevancia: number;
}

function relevancia(item: ItemBusca, q: string): number | null {
  const t = item.t.toLowerCase();
  if (t.startsWith(q)) return 0;
  const nome = normalizarBusca(item.n);
  if (nome.startsWith(q) || nome.split(/[\s.\-/&]+/).some((p) => p.startsWith(q))) return 1;
  if (t.includes(q) || nome.includes(q)) return 2;
  return null;
}

export function filtrarBusca(
  itens: readonly ItemBusca[],
  consulta: string,
  max: number = MAX_RESULTADOS_BUSCA,
): ResultadoBusca[] {
  const q = normalizarBusca(consulta).replace(/\s+/g, ' ');
  if (!q) return [];
  const achados: ResultadoBusca[] = [];
  for (const item of itens) {
    const r = relevancia(item, q);
    if (r !== null) achados.push({ item, relevancia: r });
  }
  return achados
    .sort(
      (a, b) =>
        a.relevancia - b.relevancia ||
        Number(b.item.q) - Number(a.item.q) ||
        a.item.t.localeCompare(b.item.t),
    )
    .slice(0, max);
}

/** Trecho [inicio, fim) do texto que casa com a consulta (para destacar); null sem casamento. */
export function trechoDestacado(texto: string, consulta: string): [number, number] | null {
  const q = normalizarBusca(consulta);
  if (!q) return null;
  // normaliza caractere a caractere para manter o alinhamento com o texto original
  const chars = texto.split('');
  const alinhado = chars
    .map(
      (c) =>
        c
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase() || c,
    )
    .map((c) => c.slice(0, 1))
    .join('');
  const i = alinhado.indexOf(q);
  return i >= 0 ? [i, i + q.length] : null;
}
