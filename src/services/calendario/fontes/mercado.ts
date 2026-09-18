/**
 * Fonte "mercado": o que acontece no mercado, não na carteira de uma pessoa.
 *
 *  - **Feriados da B3** (pregão e bancos fechados): saem do nosso próprio
 *    calendário, `src/utils/feriadosB3.ts`, que já é a fonte única de dia útil
 *    do app. Servem para o usuário entender por que o dinheiro "não andou" e
 *    por que o vencimento caiu noutro dia.
 *  - **Eventos corporativos** dos ativos em carteira (desdobramento,
 *    grupamento, bonificação) — ver `acoesCorporativas.ts`.
 *
 * FORA daqui, de propósito: calendário do Copom e datas de divulgação do IPCA.
 * Não temos fonte confiável dessas datas futuras dentro do app, e chutar data
 * em produto financeiro é pior do que não mostrar. Entra quando houver uma
 * fonte oficial para ler (decisão 18/09/2026).
 */
import { feriadosB3Nomeados } from '@/utils/feriadosB3';
import type { EventoAgenda, Periodo } from '../types';
import { dataCivil, partes } from '../datas';
import { eventosAcoesCorporativas } from './acoesCorporativas';

export function feriadosComoEventos(periodo: Periodo): EventoAgenda[] {
  const { ano: anoDe } = partes(periodo.de);
  const { ano: anoAte } = partes(periodo.ate);
  const out: EventoAgenda[] = [];
  for (let ano = anoDe; ano <= anoAte; ano++) {
    for (const { ts, nome } of feriadosB3Nomeados(ano)) {
      const data = dataCivil(new Date(ts));
      if (data < periodo.de || data > periodo.ate) continue;
      out.push({
        id: `mercado:feriado:${data}`,
        tipo: 'mercado',
        titulo: `Feriado · ${nome}`,
        data,
        dataFim: null,
        hora: null,
        valor: null,
        descricao: 'Sem pregão na B3 e sem compensação bancária.',
        link: null,
        detalhe: { evento: 'feriado', nome },
      });
    }
  }
  return out;
}

export async function eventosMercado(userId: string, periodo: Periodo): Promise<EventoAgenda[]> {
  // O feriado não depende de posição nenhuma e nunca falha; os eventos
  // corporativos consultam o banco.
  const feriados = feriadosComoEventos(periodo);
  const corporativos = await eventosAcoesCorporativas(userId, periodo);
  return [...feriados, ...corporativos];
}
