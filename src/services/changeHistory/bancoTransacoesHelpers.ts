/**
 * Detalhe das transações do banco no Histórico (lançar / ignorar / tirar do fluxo).
 *
 * As rotas da Caixa de entrada (api/pluggy/caixa-entrada) gravam uma entrada por ação com
 * `entityLabel` "N transações" e o snapshot de ids do desfazer. Aqui sai o `changes`: um par por
 * transação, que a tela mostra como lista (renderChange.ts, isListaBanco):
 *
 *   label  "05/11/2026 · UBER *TRIP · Nubank, Conta corrente"
 *   before valor com sinal (saída negativa), format 'currency'
 *   after  "entrou em Mercado (novembro de 2026)" no lançar, "saiu de …" no tirar, null no ignorar
 *
 * Até BANCO_DETALHE_MAX transações; o resto vira um par só, `banco:resto`, com a contagem em
 * `before`. Só o que a transação já tem (data, descrição do banco, valor, conta): sem documento,
 * contraparte ou CNPJ.
 */
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import type { FieldChange } from './types';

export const BANCO_DETALHE_MAX = 50;
export const BANCO_CAMPO_PREFIXO = 'banco:';
export const BANCO_CAMPO_RESTO = 'banco:resto';

export type AcaoBanco = 'banco.aplicar' | 'banco.ignorar' | 'banco.desaplicar';

export interface TransacaoBancoDetalhe {
  id: string;
  date: Date;
  description: string;
  amount: number;
  type: string;
  contaNome: string;
  bancoNome: string | null;
  /** Nome da linha do fluxo (lançar: onde entrou; tirar: de onde saiu). */
  linha: string | null;
  /** Mês do fluxo (0–11) e ano: a competência gravada ou o mês da data. */
  ano: number;
  mes: number;
}

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const DESCRICAO_MAX = 80;

const dataBr = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;

/** "Nubank, Conta corrente"; sem repetir o banco quando o nome da conta já o traz. */
function rotuloConta(t: Pick<TransacaoBancoDetalhe, 'contaNome' | 'bancoNome'>): string {
  const conta = t.contaNome.trim();
  const banco = t.bancoNome?.trim();
  if (!banco || conta.toLowerCase().includes(banco.toLowerCase())) return conta;
  return conta ? `${banco}, ${conta}` : banco;
}

function rotuloTransacao(t: TransacaoBancoDetalhe): string {
  const descricao = t.description.replace(/\s+/g, ' ').trim().slice(0, DESCRICAO_MAX);
  return [dataBr(t.date), descricao || 'Sem descrição', rotuloConta(t)].filter(Boolean).join(' · ');
}

/** Saída (DEBIT) negativa, entrada positiva — o sinal do provedor varia entre conta e cartão. */
const valorComSinal = (t: Pick<TransacaoBancoDetalhe, 'amount' | 'type'>) => {
  const abs = Math.round(Math.abs(t.amount) * 100) / 100;
  return t.type === 'DEBIT' ? -abs : abs;
};

function destino(acao: AcaoBanco, t: TransacaoBancoDetalhe): string | null {
  if (acao === 'banco.ignorar' || !t.linha) return null;
  const mes = `${MESES[t.mes] ?? ''} de ${t.ano}`;
  return `${acao === 'banco.aplicar' ? 'entrou em' : 'saiu de'} ${t.linha} (${mes})`;
}

/** Pares do Histórico, por data (as mais antigas primeiro), com teto e resumo do resto. */
export function bancoTransacoesChanges(
  acao: AcaoBanco,
  transacoes: TransacaoBancoDetalhe[],
): FieldChange[] {
  const ordenadas = [...transacoes].sort(
    (a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id),
  );
  const changes: FieldChange[] = ordenadas.slice(0, BANCO_DETALHE_MAX).map((t) => ({
    field: `${BANCO_CAMPO_PREFIXO}${t.id}`,
    label: rotuloTransacao(t),
    before: valorComSinal(t),
    after: destino(acao, t),
    format: 'currency',
  }));
  const resto = ordenadas.length - changes.length;
  if (resto > 0) {
    changes.push({
      field: BANCO_CAMPO_RESTO,
      label: resto === 1 ? 'Mais 1 transação' : `Mais ${resto} transações`,
      before: null,
      after: null,
    });
  }
  return changes;
}

/**
 * Lê as transações para o detalhe. `linhaPorId` (tirar do fluxo) diz a linha de onde cada uma
 * saiu, já que depois da ação ela não tem mais linha. Best-effort: erro vira `[]` (o registro
 * sai só com a contagem, como antes) — o histórico nunca quebra a ação.
 */
export async function carregarTransacoesBanco(
  userId: string,
  ids: string[],
  linhaPorId?: Map<string, string | null>,
): Promise<TransacaoBancoDetalhe[]> {
  if (ids.length === 0) return [];
  try {
    const rows = await prisma.bankTransaction.findMany({
      where: { id: { in: ids }, userId },
      select: {
        id: true,
        date: true,
        description: true,
        amount: true,
        type: true,
        competenciaAno: true,
        competenciaMes: true,
        cashflowItemId: true,
        account: { select: { name: true, connection: { select: { connectorName: true } } } },
      },
    });
    const itemIds = [
      ...new Set(
        rows
          .map((r) => (linhaPorId ? linhaPorId.get(r.id) : r.cashflowItemId))
          .filter((x): x is string => typeof x === 'string'),
      ),
    ];
    const itens =
      itemIds.length > 0
        ? await prisma.cashflowItem.findMany({
            where: { id: { in: itemIds } },
            select: { id: true, name: true },
          })
        : [];
    const nomeItem = new Map(itens.map((i) => [i.id, i.name]));
    return rows.map((r) => {
      const itemId = linhaPorId ? linhaPorId.get(r.id) : r.cashflowItemId;
      const temCompetencia = r.competenciaAno != null && r.competenciaMes != null;
      return {
        id: r.id,
        date: r.date,
        description: r.description,
        amount: Number(r.amount),
        type: r.type,
        contaNome: r.account?.name ?? '',
        bancoNome: r.account?.connection?.connectorName ?? null,
        linha: itemId ? (nomeItem.get(itemId) ?? null) : null,
        ano: temCompetencia ? r.competenciaAno! : r.date.getUTCFullYear(),
        mes: temCompetencia ? r.competenciaMes! : r.date.getUTCMonth(),
      };
    });
  } catch (error: unknown) {
    logger.error('[ChangeHistory] Erro ao detalhar transações do banco:', error);
    return [];
  }
}
