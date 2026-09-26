/**
 * "Recentes" do lançamento rápido do Fluxo (PWA fase 2): as últimas 5 linhas em que o usuário
 * lançou, por usuário, no localStorage (conveniência por aparelho — nada depende disso).
 *
 * A primeira escrita numa linha de template personaliza a linha (clone-on-write) e o id muda. Por
 * isso cada recente guarda o id DEVOLVIDO pela rota junto com nome + trilha do grupo ("Outros"
 * existe em vários grupos), e a leitura resolve contra as linhas editáveis atuais: primeiro pelo
 * id, depois pelo par nome+trilha; o que não achar é descartado.
 */
import type { LinhaEditavel } from '@/services/cashflow/linhasEditaveis';

export interface LancamentoRecente {
  itemId: string;
  nome: string;
  /** Trilha do grupo, ex.: "Despesas > Alimentação". */
  trilha: string;
}

export const MAX_RECENTES = 5;

export function recentesStorageKey(userId: string): string {
  return `cashflow:lancamento:recentes:${userId}`;
}

function valido(x: unknown): x is LancamentoRecente {
  if (!x || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  return typeof r.itemId === 'string' && typeof r.nome === 'string' && typeof r.trilha === 'string';
}

/** Lista gravada (sem resolver). Vazia sem userId, sem storage ou com dado corrompido. */
export function lerRecentes(userId: string | null | undefined): LancamentoRecente[] {
  if (!userId || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(recentesStorageKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(valido).slice(0, MAX_RECENTES) : [];
  } catch {
    return [];
  }
}

/** Põe a linha no topo (sem repetir a mesma linha) e guarda no máximo 5. */
export function gravarRecente(userId: string | null | undefined, recente: LancamentoRecente): void {
  if (!userId || typeof window === 'undefined') return;
  const mesma = (r: LancamentoRecente) =>
    r.itemId === recente.itemId || (r.nome === recente.nome && r.trilha === recente.trilha);
  const lista = [recente, ...lerRecentes(userId).filter((r) => !mesma(r))].slice(0, MAX_RECENTES);
  try {
    window.localStorage.setItem(recentesStorageKey(userId), JSON.stringify(lista));
  } catch {
    // Storage cheio/bloqueado: os recentes são só conveniência.
  }
}

/**
 * Recentes → linhas editáveis atuais (id primeiro, depois nome+trilha), sem repetir linha.
 * Recente que não existe mais (linha excluída/oculta/renomeada) é descartado.
 */
export function resolverRecentes(
  recentes: LancamentoRecente[],
  linhas: LinhaEditavel[],
): LinhaEditavel[] {
  const out: LinhaEditavel[] = [];
  const vistos = new Set<string>();
  for (const r of recentes) {
    const linha =
      linhas.find((l) => l.itemId === r.itemId) ??
      linhas.find((l) => l.itemNome === r.nome && l.grupoNome === r.trilha);
    if (!linha || vistos.has(linha.itemId)) continue;
    vistos.add(linha.itemId);
    out.push(linha);
  }
  return out;
}
