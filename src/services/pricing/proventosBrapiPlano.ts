/**
 * Plano de gravação dos proventos da BRAPI em asset_dividend_history (funções puras).
 *
 * Backtest de 18/10/2026 (A1, docs/analise-ativos/backtest-out2026/ATIVACAO.md): a chave antiga
 * (symbol, date = pagamento, tipo) fazia o sync SOMAR numa linha só os proventos com o mesmo
 * pagamento e datas-com diferentes (VIVT3: 7 JCPs mensais de 2025 pagos em 14/04/2026 viraram uma
 * linha de 1,0041 com a data-com de dez/2025; SAPR11: 1,4082 de jun/2025 + 0,5524 de dez/2025 pagos
 * em 26/06/2026 = 1,9606 com data-com 30/12/2025). A chave nova inclui a data-com
 * (symbol, date, tipo, dataCom — migration 20261018000000): cada data-com fica na sua linha, e só
 * parcelas da MESMA data-com e do MESMO pagamento continuam somadas (BBAS3 jun/2025: JCP do 1º e do
 * 2º trimestre declarados juntos).
 *
 * Reconciliação com o que já está gravado (só linhas source BRAPI do símbolo):
 *  - mesma chave ⇒ atualiza o valor se mudou (a linha somada antiga cuja data-com coincide com uma
 *    das parcelas volta ao valor da parcela);
 *  - 'soma_orfa': linha com (pagamento, tipo) que a BRAPI ainda devolve, mas com uma data-com que
 *    não está entre as dela — é a soma antiga (ou uma data-com corrigida pela fonte);
 *  - 'versao_antiga': linha COM pagamento informado cuja chave a BRAPI não devolve mais, enquanto a
 *    BRAPI devolve um provento do mesmo tipo com data-com a até 1 pregão — a mesma declaração com
 *    outro pagamento/data-com (ITUB4 JCP de 18/06/2026 pago em 28/08 e de novo em 31/08; CPFE3
 *    parcelas de 30/04/2026 que a fonte trocou pelo total de 29/04). Linhas "sem pagamento" do
 *    legado (pagamento = data-com, ou o pregão seguinte) e linhas sem provento vizinho na resposta
 *    (histórico que a BRAPI não cobre) NUNCA são apagadas.
 */
import { nextBusinessDayB3, prevBusinessDayB3 } from '@/utils/feriadosB3';

const DIA_MS = 24 * 60 * 60 * 1000;

export interface ProventoBrapiParaGravar {
  /** pagamento, meia-noite UTC */
  date: Date;
  tipo: string;
  valorUnitario: number;
  /** data-com, meia-noite UTC (null quando a fonte não informou) */
  dataCom: Date | null;
}

export interface LinhaProventoGravada {
  id: string;
  date: Date;
  dataCom: Date | null;
  tipo: string;
  valorUnitario: number;
  source: string;
}

export type MotivoRemocaoProvento = 'soma_orfa' | 'versao_antiga';

export interface PlanoGravacaoProventos {
  criar: ProventoBrapiParaGravar[];
  atualizar: Array<{ id: string; valorUnitario: number; antes: number }>;
  apagar: Array<{ id: string; motivo: MotivoRemocaoProvento; linha: LinhaProventoGravada }>;
}

const dia = (d: Date | null): string => (d ? d.toISOString().slice(0, 10) : '');
const chave = (date: Date, tipo: string, dataCom: Date | null): string =>
  `${dia(date)}\0${tipo}\0${dia(dataCom)}`;
const chaveGrupo = (date: Date, tipo: string): string => `${dia(date)}\0${tipo}`;

/** Valores iguais até a 8ª casa relativa (a BRAPI arredonda ora com 8, ora com 11 casas). */
function mesmoValor(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/**
 * Linha "sem pagamento" do legado BRAPI: a fonte não informava o pagamento e o app gravou a data-com
 * (ou a data ex, o pregão seguinte) no campo de pagamento. Pagamento a ≤ 1 pregão da data-com não
 * existe na B3 (liquidação D+2) — mesma regra de regras/calculo/proventos.semPagamento.
 */
export function linhaSemPagamento(l: Pick<LinhaProventoGravada, 'date' | 'dataCom'>): boolean {
  if (!l.dataCom) return false;
  const pag = l.date.getTime();
  const com = l.dataCom.getTime();
  if (Math.abs(pag - com) <= DIA_MS) return true;
  return pag > com && pag <= nextBusinessDayB3(com + DIA_MS);
}

/** Datas-com a até 1 pregão uma da outra (sexta × segunda contam como vizinhas). */
function dataComVizinha(a: Date, b: Date): boolean {
  const [x, y] =
    a.getTime() <= b.getTime() ? [a.getTime(), b.getTime()] : [b.getTime(), a.getTime()];
  if (x === y) return true;
  return nextBusinessDayB3(x + DIA_MS) >= y && prevBusinessDayB3(y - DIA_MS) <= x;
}

export function planejarGravacaoProventosBrapi(
  existentes: readonly LinhaProventoGravada[],
  agregados: readonly ProventoBrapiParaGravar[],
): PlanoGravacaoProventos {
  const brapi = existentes.filter((l) => l.source === 'BRAPI');
  const porChave = new Map<string, LinhaProventoGravada[]>();
  for (const l of brapi) {
    const k = chave(l.date, l.tipo, l.dataCom);
    porChave.set(k, [...(porChave.get(k) ?? []), l]);
  }
  const plano: PlanoGravacaoProventos = { criar: [], atualizar: [], apagar: [] };
  const usadas = new Set<string>();
  const chavesFonte = new Set<string>();
  const datasComDoGrupo = new Map<string, Set<string>>();
  for (const a of agregados) {
    const k = chave(a.date, a.tipo, a.dataCom);
    chavesFonte.add(k);
    const g = chaveGrupo(a.date, a.tipo);
    datasComDoGrupo.set(g, (datasComDoGrupo.get(g) ?? new Set()).add(dia(a.dataCom)));
    const [atual, ...repetidas] = porChave.get(k) ?? [];
    if (!atual) {
      plano.criar.push(a);
      continue;
    }
    usadas.add(atual.id);
    if (!mesmoValor(atual.valorUnitario, a.valorUnitario)) {
      plano.atualizar.push({
        id: atual.id,
        valorUnitario: a.valorUnitario,
        antes: atual.valorUnitario,
      });
    }
    // a chave nova não deixa repetir; sobra só de dados gravados fora do sync (defensivo)
    for (const r of repetidas) {
      usadas.add(r.id);
      plano.apagar.push({ id: r.id, motivo: 'soma_orfa', linha: r });
    }
  }
  for (const l of brapi) {
    if (usadas.has(l.id) || chavesFonte.has(chave(l.date, l.tipo, l.dataCom))) continue;
    const grupo = datasComDoGrupo.get(chaveGrupo(l.date, l.tipo));
    if (grupo && !grupo.has(dia(l.dataCom))) {
      plano.apagar.push({ id: l.id, motivo: 'soma_orfa', linha: l });
      continue;
    }
    if (!l.dataCom || linhaSemPagamento(l)) continue;
    const vizinha = agregados.some(
      (a) => a.tipo === l.tipo && a.dataCom !== null && dataComVizinha(a.dataCom, l.dataCom!),
    );
    if (vizinha) plano.apagar.push({ id: l.id, motivo: 'versao_antiga', linha: l });
  }
  return plano;
}

export function planoVazio(p: PlanoGravacaoProventos): boolean {
  return p.criar.length === 0 && p.atualizar.length === 0 && p.apagar.length === 0;
}
