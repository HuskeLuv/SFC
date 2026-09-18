/**
 * Feed iCal (.ics) da Agenda — para assinar no Google Agenda, Apple Calendário
 * ou Outlook.
 *
 * Duas regras que vêm da decisão do plano (11/09/2026):
 *  - **Sem valores.** O feed sai por uma URL pública protegida só pelo token e
 *    costuma acabar sincronizado na conta pessoal de calendário. Título e
 *    descrição vão sem nenhum R$ — quem quiser o valor abre o app.
 *  - **Token revogável.** Regerar o token derruba o link antigo na hora.
 *
 * Datas civis viram evento de dia inteiro (DTSTART;VALUE=DATE, DTEND
 * exclusivo). Quando o evento tem hora, vira instante em UTC: o Brasil está
 * fixo em UTC−3 desde 2019 (sem horário de verão), então não precisa de
 * VTIMEZONE.
 */
import type { EventoAgenda, Periodo } from './types';
import { hojeCivil, partes, somarDias } from './datas';

/** Janela publicada: um mês para trás dá contexto, um ano para frente planeja. */
export const DIAS_ANTES = 30;
export const DIAS_DEPOIS = 365;

const PRODID = '-//My Finance//Agenda//PT-BR';
const DOMINIO = 'appmyfinance.com.br';

/** RFC 5545 §3.3.11: barra, ponto e vírgula, vírgula e quebra de linha. */
export function escaparTexto(valor: string): string {
  return valor
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * RFC 5545 §3.1: linha de no máximo 75 octetos, continuação começando com um
 * espaço. Conta em BYTES (acentos ocupam 2), senão o cliente recusa o arquivo.
 */
export function dobrarLinha(linha: string): string {
  const bytes = Buffer.from(linha, 'utf8');
  if (bytes.length <= 75) return linha;
  const partes: string[] = [];
  let atual = '';
  let tamanho = 0;
  for (const char of linha) {
    const n = Buffer.byteLength(char, 'utf8');
    // A continuação já gasta 1 octeto com o espaço da margem.
    const limite = partes.length === 0 ? 75 : 74;
    if (tamanho + n > limite) {
      partes.push(atual);
      atual = '';
      tamanho = 0;
    }
    atual += char;
    tamanho += n;
  }
  if (atual) partes.push(atual);
  return partes.map((p, i) => (i === 0 ? p : ` ${p}`)).join('\r\n');
}

const soData = (civil: string): string => civil.replace(/-/g, '');

/** "AAAA-MM-DD" + "HH:MM" em Brasília (UTC−3) → carimbo UTC do iCal. */
export function instanteUtc(civil: string, hora: string): string {
  const { ano, mes, dia } = partes(civil);
  const [h, m] = hora.split(':').map(Number);
  const d = new Date(Date.UTC(ano, mes, dia, h + 3, m, 0));
  return `${d.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`;
}

export function carimboAgora(agora: Date = new Date()): string {
  return `${agora.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`;
}

/** UID estável por ocorrência: o mesmo evento não duplica a cada atualização. */
export function uidDoEvento(evento: EventoAgenda): string {
  return `${evento.id.replace(/[^A-Za-z0-9._-]/g, '-')}@${DOMINIO}`;
}

const ROTULO_TIPO: Record<string, string> = {
  divida: 'Dívida',
  provento: 'Provento',
  rf: 'Renda fixa',
  ir: 'Imposto de renda',
  planejamento: 'Planejamento',
  mercado: 'Mercado',
  manual: 'Meu evento',
};

function linhasDoEvento(evento: EventoAgenda, dtstamp: string): string[] {
  const linhas = ['BEGIN:VEVENT', `UID:${uidDoEvento(evento)}`, `DTSTAMP:${dtstamp}`];

  if (evento.hora) {
    linhas.push(`DTSTART:${instanteUtc(evento.data, evento.hora)}`);
    linhas.push(`DTEND:${instanteUtc(evento.data, evento.hora)}`);
  } else {
    // DTEND de evento de dia inteiro é EXCLUSIVO: o dia seguinte ao último.
    const fim = somarDias(evento.dataFim ?? evento.data, 1);
    linhas.push(`DTSTART;VALUE=DATE:${soData(evento.data)}`);
    linhas.push(`DTEND;VALUE=DATE:${soData(fim)}`);
  }

  linhas.push(`SUMMARY:${escaparTexto(evento.titulo)}`);

  // Sem valores, de propósito: só o rótulo do tipo e a descrição da fonte.
  const descricao = [ROTULO_TIPO[evento.tipo] ?? 'Agenda', evento.descricao]
    .filter(Boolean)
    .join(' — ');
  linhas.push(`DESCRIPTION:${escaparTexto(descricao)}`);
  if (evento.link) linhas.push(`URL:https://${DOMINIO}${evento.link}`);
  linhas.push('END:VEVENT');
  return linhas;
}

export function gerarIcs(eventos: EventoAgenda[], agora: Date = new Date()): string {
  const dtstamp = carimboAgora(agora);
  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Agenda My Finance',
    'X-WR-TIMEZONE:America/Sao_Paulo',
    // O cliente respeita isso para não buscar o feed de minuto em minuto.
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    'X-PUBLISHED-TTL:PT12H',
    ...eventos.flatMap((e) => linhasDoEvento(e, dtstamp)),
    'END:VCALENDAR',
  ];
  return `${linhas.map(dobrarLinha).join('\r\n')}\r\n`;
}

/** Janela publicada no feed, a partir de hoje. */
export function periodoDoFeed(agora: Date = new Date()): Periodo {
  const hoje = hojeCivil(agora);
  return { de: somarDias(hoje, -DIAS_ANTES), ate: somarDias(hoje, DIAS_DEPOIS) };
}
