/**
 * Cobertura do FGC agrupada por banco emissor (ClickUp 86e2xqh69). Função pura: a rota
 * /api/analises/cobertura-fgc monta os itens a partir do banco e esta função agrupa e soma.
 *
 * Regra:
 * - titular = emissor gravado (só quando o investimento aceita emissor e o catálogo tem o
 *   registro) ou, sem ele, a corretora da compra mais antiga (como era antes).
 * - chave do grupo = raiz do CNPJ do titular ?? id do titular ?? 'desconhecida'. O limite de
 *   R$ 250 mil continua por raiz de CNPJ; o conglomerado do Bacen só gera um aviso.
 * - Depósitos (poupança, conta corrente) e itens que não aceitam emissor (debênture e fundo
 *   gravados como CDB, Pluggy com subtipo sem emissor) nunca contam como "sem emissor".
 * - Totais por grupo, teto de R$ 1 milhão e arredondamentos são os mesmos de antes.
 */
import { ehInstituicaoEmissora } from '@/lib/fgc/produtosCobertos';
import { cnpjRaiz } from '@/lib/instituicoes/cnpj';

/** Limite do FGC por CPF por instituição (raiz do CNPJ). */
export const FGC_LIMIT_PER_INSTITUTION = 250_000;

/** Teto global do FGC por CPF (renovado a cada 4 anos). */
export const FGC_TOTAL_CAP = 1_000_000;

/** Chave e nome do grupo sem emissor e sem corretora. */
export const CHAVE_DESCONHECIDA = 'desconhecida';
export const NOME_EMISSOR_DESCONHECIDO = 'Emissor não identificado';

export type OrigemFgc = 'manual' | 'openFinance';

/**
 * De onde vem a instituição que dá o limite do FGC a este ativo:
 * - 'emissor': emissor gravado, que é de fato emissor;
 * - 'emissor-nao-emissor': emissor gravado, mas é corretora (N2), instituição de pagamento (N4)
 *   ou linha antiga não emissora;
 * - 'corretora': sem emissor, usando a corretora (aceita emissor);
 * - 'desconhecida': sem emissor e sem corretora (aceita emissor);
 * - 'nao-se-aplica': não aceita emissor ou é depósito.
 */
export type FonteInstituicao =
  | 'emissor'
  | 'emissor-nao-emissor'
  | 'corretora'
  | 'desconhecida'
  | 'nao-se-aplica';

/** Instituição do catálogo como a cobertura precisa dela. */
export interface InstRef {
  id: string;
  nome: string;
  cnpj: string | null;
  cnpjCalculado: boolean;
  tipoBacen: string | null;
  codigo: string | null;
  conglomerado: string | null;
}

/** Campos do ativo que já existiam na resposta. */
export interface AtivoFgcBase {
  id: string;
  nome: string;
  produto: string;
  valorAtual: number;
  valorInvestido: number;
  vencimento: string | null;
  coberto: boolean;
  isentoIR: boolean;
}

/** Ativo na resposta: os campos de antes + os do emissor (aditivos). */
export interface AssetFgcInfo extends AtivoFgcBase {
  corretoraNome: string | null;
  fonteInstituicao: FonteInstituicao;
  aceitaEmissor: boolean;
  origem: OrigemFgc;
  /** Texto do emissor que veio do Open Finance quando não casou com o catálogo. */
  emissorInformadoTexto: string | null;
  /** Link para informar o emissor na edição; null quando a edição não aceita emissor. */
  editarEmissorHref: string | null;
}

/** Grupo por titular (emissor, ou a corretora no fallback). */
export interface InstitutionFgcGroup {
  /** Titular do grupo. */
  instituicaoId: string;
  instituicaoNome: string;
  cnpj: string | null;
  ativos: AssetFgcInfo[];
  totalCoberto: number;
  totalNaoCoberto: number;
  totalValor: number;
  limiteFgc: number;
  percentualUtilizado: number;
  excedente: number;
  // Aditivos (86e2xqh69)
  chave: string;
  /** Corretoras por onde os ativos do grupo foram comprados, sem repetir. */
  corretoras: { id: string; nome: string }[];
  /** Ativos que aceitam emissor e estão sem ele. */
  ativosSemEmissor: number;
  /** Algum ativo aceita emissor, está sem ele e usa a corretora. */
  usaCorretoraComoEmissor: boolean;
  /** O emissor gravado em algum ativo é corretora/instituição de pagamento. */
  titularNaoEmissor: boolean;
  conglomerado: string | null;
  temOpenFinance: boolean;
  cnpjCalculado: boolean;
}

export interface FgcResumo {
  totalEfetivamenteCoberto: number;
  totalNaoCoberto: number;
  totalExcedente: number;
  totalValorRendaFixa: number;
  percentualCoberto: number;
  limiteGlobal: number;
  limitePorInstituicao: number;
  totalAtivos: number;
  totalInstituicoes: number;
}

/** Dois ou mais grupos do mesmo conglomerado prudencial do Bacen (só aviso). */
export interface AvisoConglomerado {
  conglomerado: string;
  chaves: string[];
  nomes: string[];
}

/** Um investimento já valorizado, pronto para agrupar. */
export interface ItemFgc {
  ativo: AtivoFgcBase;
  coberto: boolean;
  valorAtual: number;
  temFi: boolean;
  /** aceitaEmissor() do produto/símbolo/subtipo. */
  aceita: boolean;
  /** Poupança ou conta corrente. */
  deposito: boolean;
  /** Emissor gravado e presente no catálogo. */
  emissor: InstRef | null;
  /** Corretora da compra mais antiga (pode não estar no catálogo: nome genérico). */
  corretora: InstRef | null;
  origem: OrigemFgc;
  emissorInformadoTexto: string | null;
}

export interface ResultadoCoberturaFgc {
  grupos: InstitutionFgcGroup[];
  avisosConglomerado: AvisoConglomerado[];
  resumo: FgcResumo;
  /** Sem arredondar, para o resumo do que está fora do FGC (igual a antes). */
  totais: { totalValorRendaFixa: number; totalEfetivamenteCoberto: number };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function fonteInstituicao(item: ItemFgc): FonteInstituicao {
  if (!item.aceita || item.deposito) return 'nao-se-aplica';
  if (item.emissor) {
    return ehInstituicaoEmissora(item.emissor) === false ? 'emissor-nao-emissor' : 'emissor';
  }
  if (item.corretora) return 'corretora';
  return 'desconhecida';
}

/** Titular e chave do grupo de um item. */
export function titularDoItem(item: ItemFgc): { titular: InstRef | null; chave: string } {
  const emissor = item.aceita && !item.deposito ? item.emissor : null;
  const titular = emissor ?? item.corretora;
  if (!titular) return { titular: null, chave: CHAVE_DESCONHECIDA };
  return { titular, chave: cnpjRaiz(titular.cnpj) ?? titular.id };
}

interface GrupoAcumulado extends Omit<InstitutionFgcGroup, 'corretoras'> {
  corretorasMap: Map<string, string>;
}

export function agruparCoberturaFgc(
  itens: ItemFgc[],
  limite: number = FGC_LIMIT_PER_INSTITUTION,
  tetoGlobal: number = FGC_TOTAL_CAP,
): ResultadoCoberturaFgc {
  const grupos = new Map<string, GrupoAcumulado>();

  for (const item of itens) {
    const { titular, chave } = titularDoItem(item);
    const fonte = fonteInstituicao(item);

    let g = grupos.get(chave);
    if (!g) {
      g = {
        instituicaoId: titular?.id ?? CHAVE_DESCONHECIDA,
        instituicaoNome: titular?.nome ?? NOME_EMISSOR_DESCONHECIDO,
        cnpj: titular?.cnpj ?? null,
        ativos: [],
        totalCoberto: 0,
        totalNaoCoberto: 0,
        totalValor: 0,
        limiteFgc: limite,
        percentualUtilizado: 0,
        excedente: 0,
        chave,
        corretorasMap: new Map(),
        ativosSemEmissor: 0,
        usaCorretoraComoEmissor: false,
        titularNaoEmissor: false,
        conglomerado: titular?.conglomerado ?? null,
        temOpenFinance: false,
        cnpjCalculado: titular?.cnpjCalculado ?? false,
      };
      grupos.set(chave, g);
    }

    if (item.corretora && !g.corretorasMap.has(item.corretora.id)) {
      g.corretorasMap.set(item.corretora.id, item.corretora.nome);
    }
    if (fonte === 'corretora' || fonte === 'desconhecida') g.ativosSemEmissor += 1;
    if (fonte === 'corretora') g.usaCorretoraComoEmissor = true;
    if (fonte === 'emissor-nao-emissor') g.titularNaoEmissor = true;
    if (item.origem === 'openFinance') g.temOpenFinance = true;

    g.ativos.push({
      ...item.ativo,
      corretoraNome: item.corretora?.nome ?? null,
      fonteInstituicao: fonte,
      aceitaEmissor: item.aceita && !item.deposito,
      origem: item.origem,
      emissorInformadoTexto: item.emissor ? null : (item.emissorInformadoTexto ?? null),
      editarEmissorHref:
        item.aceita && !item.deposito ? `/ativos/${item.ativo.id}/editar?editar=emissor` : null,
    });

    if (item.coberto) {
      g.totalCoberto += item.valorAtual;
    } else {
      g.totalNaoCoberto += item.valorAtual;
    }
    g.totalValor += item.valorAtual;
  }

  // Percentual e excedente por grupo (mesma conta de antes).
  const lista: InstitutionFgcGroup[] = Array.from(grupos.values()).map(
    ({ corretorasMap, ...group }) => {
      const percentual = (group.totalCoberto / limite) * 100;
      const excedente = Math.max(0, group.totalCoberto - limite);
      return {
        ...group,
        corretoras: Array.from(corretorasMap, ([id, nome]) => ({ id, nome })),
        percentualUtilizado: r2(percentual),
        excedente: r2(excedente),
        totalCoberto: r2(group.totalCoberto),
        totalNaoCoberto: r2(group.totalNaoCoberto),
        totalValor: r2(group.totalValor),
      };
    },
  );

  lista.sort((a, b) => b.totalCoberto - a.totalCoberto);

  const totalCoberto = lista.reduce((sum, i) => sum + Math.min(i.totalCoberto, limite), 0);
  const totalEfetivamenteCoberto = Math.min(totalCoberto, tetoGlobal);
  const totalNaoCoberto = lista.reduce((sum, i) => sum + i.totalNaoCoberto, 0);
  const totalExcedente = lista.reduce((sum, i) => sum + i.excedente, 0);
  const totalValorRendaFixa = lista.reduce((sum, i) => sum + i.totalValor, 0);
  const totalAtivos = lista.reduce((sum, i) => sum + i.ativos.length, 0);

  // Conglomerado: só o aviso, na ordem em que os grupos aparecem.
  const porConglomerado = new Map<string, InstitutionFgcGroup[]>();
  for (const g of lista) {
    if (!g.conglomerado || g.chave === CHAVE_DESCONHECIDA) continue;
    const arr = porConglomerado.get(g.conglomerado) ?? [];
    arr.push(g);
    porConglomerado.set(g.conglomerado, arr);
  }
  const avisosConglomerado: AvisoConglomerado[] = [];
  for (const [conglomerado, gs] of porConglomerado) {
    if (gs.length < 2) continue;
    avisosConglomerado.push({
      conglomerado,
      chaves: gs.map((g) => g.chave),
      nomes: gs.map((g) => g.instituicaoNome),
    });
  }

  return {
    grupos: lista,
    avisosConglomerado,
    resumo: {
      totalEfetivamenteCoberto: r2(totalEfetivamenteCoberto),
      totalNaoCoberto: r2(totalNaoCoberto),
      totalExcedente: r2(totalExcedente),
      totalValorRendaFixa: r2(totalValorRendaFixa),
      percentualCoberto:
        totalValorRendaFixa > 0
          ? Math.round((totalEfetivamenteCoberto / totalValorRendaFixa) * 100 * 100) / 100
          : 0,
      limiteGlobal: tetoGlobal,
      limitePorInstituicao: limite,
      totalAtivos,
      totalInstituicoes: lista.length,
    },
    totais: { totalValorRendaFixa, totalEfetivamenteCoberto },
  };
}
