/**
 * Formatos compartilhados do bloco 1 (fatia 0): nomes de listas ("Dividendos e Utilidade
 * pública"), resumo dos avisos de uma lista, datas DD/MM e DD/MM/AAAA (horário de Brasília) e
 * contagem de ativos. Puros; a cópia vem de textosSalvos/textosAlertas.
 */
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_ALERTAS } from '@/services/analiseAtivos/textosAlertas';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import type { AlertasLista } from '@/types/analiseAtivosSalvos';

const FUSO = 'America/Sao_Paulo';

/** "Dividendos", "Dividendos e Utilidade pública", "A, B e C". */
export function juntarNomesListas(nomes: readonly string[]): string {
  const e = TEXTOS_SALVOS.salvar.juntarListas;
  if (nomes.length <= 1) return nomes[0] ?? '';
  return `${nomes.slice(0, -1).join(', ')}${e}${nomes[nomes.length - 1]}`;
}

/** Os avisos ligados, em texto curto ("resultado entregue, provento anunciado"); '' sem nenhum. */
export function resumoAlertasLista(alertas: AlertasLista): string {
  const t = TEXTOS_ALERTAS.tipos;
  return (['resultado', 'provento', 'criterios'] as const)
    .filter((k) => alertas[k])
    .map((k) => t[k].curto)
    .join(t.separador);
}

/** União dos avisos de várias listas (um ativo em 2 listas recebe o que qualquer uma liga). */
export function uniaoAlertas(listas: ReadonlyArray<{ alertas: AlertasLista }>): AlertasLista {
  return {
    resultado: listas.some((l) => l.alertas.resultado),
    provento: listas.some((l) => l.alertas.provento),
    criterios: listas.some((l) => l.alertas.criterios),
  };
}

/** DD/MM/AAAA no horário de Brasília ('—' se inválida). */
export function formatarDataLonga(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { timeZone: FUSO });
}

/** DD/MM no horário de Brasília ('—' se inválida). */
export function formatarDataCurta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' });
}

/** HH:MM no horário de Brasília ('' se inválida). */
export function formatarHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });
}

/** "1 ativo" / "N ativos" (escolha de listas). */
export function textoContagemAtivos(n: number): string {
  const t = TEXTOS_SALVOS.escolherListas;
  return n === 1 ? t.umAtivo : formatarTexto(t.nAtivos, { n });
}
