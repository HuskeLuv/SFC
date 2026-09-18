/**
 * Resumo do mês da Agenda: soma o que sai, o que entra e o que só vence,
 * a partir dos eventos JÁ carregados do período visível (nenhuma consulta
 * nova). Só conta o que os filtros da lateral estão mostrando.
 */
import type { EventoAgenda, TipoEvento } from '@/services/calendario/types';
import { hojeCivil } from '@/services/calendario/datas';

export interface ResumoAgenda {
  /** Parcelas de dívida ainda não pagas no período. */
  aPagar: { total: number; itens: number };
  /** Proventos com data de pagamento no período (data-com não entra). */
  aReceber: { total: number; itens: number };
  /** Títulos de renda fixa vencendo no período (valor aplicado). */
  vencimentosRf: { total: number; itens: number };
  /** DARF/come-cotas com valor estimado no período. */
  impostos: { total: number; itens: number };
  /** Parcelas já pagas — mostra o quanto do mês já saiu. */
  jaPago: { total: number; itens: number };
}

const vazio = () => ({ total: 0, itens: 0 });

function somar(alvo: { total: number; itens: number }, valor: number | null): void {
  alvo.itens += 1;
  alvo.total += valor ?? 0;
}

export function resumoDoPeriodo(
  eventos: EventoAgenda[],
  tiposVisiveis: Set<TipoEvento>,
): ResumoAgenda {
  const r: ResumoAgenda = {
    aPagar: vazio(),
    aReceber: vazio(),
    vencimentosRf: vazio(),
    impostos: vazio(),
    jaPago: vazio(),
  };
  for (const e of eventos) {
    if (!tiposVisiveis.has(e.tipo)) continue;
    switch (e.tipo) {
      case 'divida':
        if (e.detalhe.paga === true) somar(r.jaPago, e.valor);
        else somar(r.aPagar, e.valor);
        break;
      case 'provento':
        // Data-com não movimenta dinheiro — só o pagamento entra na conta.
        if (e.detalhe.evento === 'pagamento') somar(r.aReceber, e.valor);
        break;
      case 'rf':
        somar(r.vencimentosRf, e.valor);
        break;
      case 'ir':
        // Declaração não tem valor; DARF e come-cotas estimado entram.
        if (e.valor != null) somar(r.impostos, e.valor);
        break;
      default:
        break;
    }
  }
  return r;
}

/** Período dos próximos `dias` dias a partir de hoje (inclusive). */
export function periodoProximosDias(dias: number, agora: Date = new Date()) {
  const de = hojeCivil(agora);
  const [ano, mes, dia] = de.split('-').map(Number);
  const ate = new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
  return { de, ate };
}

/**
 * Eventos ordenados para a lista "próximos dias", sem o que já passou e sem
 * parcela paga (não é lembrete de nada). Limita para a lista não virar rolagem.
 */
export function proximosEventos(
  eventos: EventoAgenda[],
  tiposVisiveis: Set<TipoEvento>,
  limite = 8,
  hoje: string = hojeCivil(),
): EventoAgenda[] {
  return eventos
    .filter(
      (e) =>
        tiposVisiveis.has(e.tipo) && e.data >= hoje && !(e.tipo === 'divida' && e.detalhe.paga),
    )
    .slice(0, limite);
}
