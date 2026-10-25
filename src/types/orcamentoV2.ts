/**
 * Contrato do `GET /api/cashflow/orcamento/v2` (Orçamento v2, ticket 86e3v8p3u; desenho técnico
 * §6.3). Montado no servidor por `services/cashflow/orcamentoV2/montarOrcamento` com as funções
 * puras de `lib/orcamento/regras`: status, contadores, ritmo e KPIs chegam prontos, e o front
 * nunca os calcula sozinho (a UI otimista reusa as mesmas regras).
 *
 * Convenções: mês 1–12 em todo o payload (o banco usa 0–11); valores em R$ com 2 casas;
 * `consumido` é FRAÇÃO (0,9083); `pctReceita`, `orcadoPctReceita`, `realizadoPctOrcado` e
 * `indicePoupanca` são pontos percentuais com 1 casa (75,1).
 */
import type { IconeCategoria } from '@/lib/orcamento/catalogo';
import type { ContagensOrcamento, FaseMes, StatusOrcamento } from '@/lib/orcamento/regras';

export type VisaoOrcamento = 'mes' | 'ano';
export type FonteOrcamento = 'lancado' | 'consolidado';
export type OrigemReceita = 'fluxo' | 'media3m' | 'nenhuma';
export type EspelhoSubcategoria = 'objetivo' | 'divida' | null;

/** Mês de calendário na convenção da API (1–12). */
export interface AnoMes {
  ano: number;
  mes: number;
}

/**
 * Rótulo da coluna/KPI de realizado (§6.1, Q18), decidido no servidor:
 * - 'previsto': mês futuro no Lançado ("Previsto no mês", sem "dias para fechar");
 * - 'lancado': Lançado no passado/corrente ("Lançado no mês · dia 23 de 31");
 * - 'realizado': Consolidado ("Realizado até dia 23").
 */
export type RotuloRealizado = 'previsto' | 'lancado' | 'realizado';

export interface ReferenciaOrcamento {
  /** Dia de referência (mês passado = último dia; futuro = 0). */
  dia: number;
  diasNoMes: number;
  /** R-06 (mês) ou R-15 (acumulado); 1 em mês fechado e em mês futuro. */
  ritmo: number;
  fase: FaseMes;
  rotuloRealizado: RotuloRealizado;
  /** ISO 8601 do momento da montagem. */
  atualizadoEm: string;
}

export interface ReceitaPrevistaV2 {
  /** R$ do mês (visão mês) ou Σ jan..mês (visão ano); `null` = sem receita. */
  valor: number | null;
  origem: OrigemReceita;
  /** Meses usados na média (só `origem === 'media3m'` na visão mês), do mais antigo ao mais novo. */
  mesesBase?: AnoMes[];
}

export interface SubcategoriaV2 {
  /** Id do `CashflowItem` (o mesmo da Planilha, D11). */
  id: string;
  /** `CashflowItem.name` mesclado. */
  nome: string;
  geral: boolean;
  fixa: boolean;
  espelho: EspelhoSubcategoria;
  /** Orçado efetivo em R$ (R-17: `pct` já convertido pela receita). */
  orcado: number;
  /** Valor gravado em R$ (`null` se não há orçado ou se está em %). Na visão ano = orçado acumulado. */
  valor: number | null;
  /** % da receita gravado (só poupança). Na visão ano = `null`. */
  pct: number | null;
  realizado: number;
  diferenca: number;
  consumido: number | null;
  status: StatusOrcamento;
  /** Renomear/excluir/mover: nunca na Geral nem em espelho de objetivo/dívida. */
  editavelEstrutura: boolean;
  /** Orçado editável: só na visão mês (Q7, acumulado é somente leitura). */
  editavelOrcado: boolean;
}

export interface CategoriaV2 {
  /** Id do `CashflowGroup` mesclado. */
  id: string;
  /** Sempre `CashflowGroup.name` mesclado (D11), nunca o nome do catálogo. */
  nome: string;
  icone: IconeCategoria | string;
  abreviacao: string;
  poupanca: boolean;
  /** Derivado: grupo de template (ou override de template). */
  sistema: boolean;
  orcado: number;
  realizado: number;
  diferenca: number;
  consumido: number | null;
  pctReceita: number | null;
  status: StatusOrcamento;
  qtdEstouro: number;
  qtdAFrente: number;
  qtdComOrcamento: number;
  subcategorias: SubcategoriaV2[];
}

export interface ResumoOrcamentoV2 {
  orcado: number;
  orcadoPctReceita: number | null;
  realizado: number;
  realizadoPctOrcado: number | null;
  disponivel: number;
  sobraPrevista: number | null;
  indicePoupanca: number | null;
  totalCategorias: number;
  totalSubcategorias: number;
  contagens: ContagensOrcamento;
  status: StatusOrcamento;
}

export interface PrefsOrcamentoV2 {
  categoriasRecolhidas: string[];
  graficoVisivel: boolean;
  /** Aviso de primeira visita ("Seus orçados anteriores estão em Geral…"). */
  avisoGeralPendente: boolean;
}

export interface OrcamentoV2Response {
  versao: 2;
  ano: number;
  /** 1–12. */
  mes: number;
  visao: VisaoOrcamento;
  fonte: FonteOrcamento;
  referencia: ReferenciaOrcamento;
  receitaPrevista: ReceitaPrevistaV2;
  resumo: ResumoOrcamentoV2;
  /** Alvo do botão "Copiar de <mês anterior>". */
  copiarDe: AnoMes & { temOrcado: boolean };
  prefs: PrefsOrcamentoV2;
  /** Só na visão ano: meses (1–12) de jan..mês sem nenhum orçado. */
  mesesSemOrcamento?: number[];
  categorias: CategoriaV2[];
}
