/**
 * Linhas do fluxo de caixa em que um lançamento pode entrar (assistente e lançamento rápido do
 * celular). Módulo puro e isomórfico — sem next/server nem Prisma — para o sheet do celular listar
 * e buscar as mesmas linhas que o servidor aceita.
 */

export interface CashGroupLike {
  id?: string;
  name: string;
  type?: string;
  hidden?: boolean;
  items?: Array<{
    id?: string;
    name: string;
    hidden?: boolean;
    objetivoId?: string | null;
    dividaId?: string | null;
    values?: Array<{ month: number; value: number | string | null }>;
  }>;
  children?: CashGroupLike[];
}

export interface LinhaEditavel {
  itemId: string;
  itemNome: string;
  /** Trilha completa do grupo, ex.: "Despesas > Despesas Fixas > Transporte". */
  grupoNome: string;
  grupoTipo: string;
}

/**
 * Linhas em que o assistente pode lançar: grupos de entrada/despesa (em
 * qualquer nível), sem espelho de sonho/dívida e não ocultas. Inclui as
 * linhas ainda zeradas — é a lista completa, não só o que tem valor.
 */
export function listarLinhasEditaveis(groups: CashGroupLike[]): LinhaEditavel[] {
  const out: LinhaEditavel[] = [];
  const walk = (g: CashGroupLike, trail: string[]) => {
    if (g.hidden) return;
    const nome = [...trail, g.name].join(' > ');
    if (g.type === 'entrada' || g.type === 'despesa') {
      for (const item of g.items ?? []) {
        if (item.hidden || item.objetivoId || item.dividaId) continue;
        out.push({
          itemId: item.id ?? '',
          itemNome: item.name,
          grupoNome: nome,
          grupoTipo: g.type,
        });
      }
    }
    for (const c of g.children ?? []) walk(c, [...trail, g.name]);
  };
  for (const g of groups) walk(g, []);
  return out;
}
