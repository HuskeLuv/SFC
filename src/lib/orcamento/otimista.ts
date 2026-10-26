/**
 * UI otimista do Orçamento v2 (desenho técnico §7, T35): aplica uma edição no payload em cache
 * (`OrcamentoV2Response`) recalculando a linha, a categoria e o resumo com as MESMAS funções puras
 * do servidor (`regras.ts`), e troca o palpite pela resposta do servidor quando ela chega. Puro.
 *
 * Só a visão mês é editável (Q7): na visão ano o payload é devolvido como está (o refetch acerta).
 */
import type {
  CategoriaV2,
  OrcadoEscritaResponse,
  OrcamentoV2Response,
  SubcategoriaV2,
} from '@/types/orcamentoV2';
import { calcularCategoria, calcularResumo, calcularSubcategoria, type Orcado } from './regras';

/** Recalcula a linha a partir de valor/pct/fixa (receita e ritmo do próprio payload). */
function recalcularSub(
  sub: SubcategoriaV2,
  receita: number | null,
  ritmo: number,
  mudanca: Partial<Pick<SubcategoriaV2, 'valor' | 'pct' | 'fixa'>>,
): SubcategoriaV2 {
  const nova = { ...sub, ...mudanca };
  const calc = calcularSubcategoria(
    {
      geral: nova.geral,
      fixa: nova.fixa,
      valor: nova.valor,
      pct: nova.pct,
      realizado: nova.realizado,
    },
    receita,
    ritmo,
  );
  return { ...nova, ...calc };
}

/**
 * Aplica `mudanca` na subcategoria `itemId` e recalcula categoria e resumo. Item não encontrado
 * (ou visão ano) → o próprio payload.
 */
export function aplicarNaSubcategoria(
  data: OrcamentoV2Response,
  itemId: string,
  mudanca: Partial<Pick<SubcategoriaV2, 'valor' | 'pct' | 'fixa'>>,
): OrcamentoV2Response {
  if (data.visao !== 'mes') return data;
  const receita = data.receitaPrevista.valor;
  const ritmo = data.referencia.ritmo;
  let achou = false;
  const categorias: CategoriaV2[] = data.categorias.map((cat) => {
    if (!cat.subcategorias.some((s) => s.id === itemId)) return cat;
    achou = true;
    const subcategorias = cat.subcategorias.map((s) =>
      s.id === itemId ? recalcularSub(s, receita, ritmo, mudanca) : s,
    );
    return { ...cat, ...calcularCategoria(subcategorias, receita), subcategorias };
  });
  if (!achou) return data;
  return { ...data, categorias, resumo: calcularResumo(categorias, receita) };
}

/** Orçado novo (`null` = limpar) aplicado de forma otimista. */
export function aplicarOrcadoOtimista(
  data: OrcamentoV2Response,
  itemId: string,
  orcado: Orcado | null,
): OrcamentoV2Response {
  return aplicarNaSubcategoria(data, itemId, {
    valor: orcado?.valor ?? null,
    pct: orcado?.pct ?? null,
  });
}

/**
 * Resposta do servidor (`{subcategoria, categoria, resumo}`) por cima do cache: a categoria
 * inteira é trocada (o id da sub pode ter mudado ao personalizar um item-template).
 */
export function aplicarRespostaEscrita(
  data: OrcamentoV2Response,
  resposta: OrcadoEscritaResponse,
): OrcamentoV2Response {
  if (data.visao !== 'mes') return data;
  const temCategoria = data.categorias.some((c) => c.id === resposta.categoria.id);
  if (!temCategoria) return data;
  return {
    ...data,
    categorias: data.categorias.map((c) =>
      c.id === resposta.categoria.id ? resposta.categoria : c,
    ),
    resumo: resposta.resumo,
  };
}
