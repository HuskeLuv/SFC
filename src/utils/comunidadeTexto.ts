/** Utilitários puros de exibição da Comunidade (tempo relativo e links). */

const MINUTO = 60 * 1000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

/** "agora", "há 5 min", "há 3 h", "há 2 d" ou a data (dd/mm/aaaa) após uma semana. */
export function tempoRelativo(iso: string, agora: Date = new Date()): string {
  const data = new Date(iso);
  const diff = agora.getTime() - data.getTime();
  if (diff < MINUTO) return 'agora';
  if (diff < HORA) return `há ${Math.floor(diff / MINUTO)} min`;
  if (diff < DIA) return `há ${Math.floor(diff / HORA)} h`;
  if (diff < 7 * DIA) return `há ${Math.floor(diff / DIA)} d`;
  return data.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export type TrechoTexto = { tipo: 'texto'; valor: string } | { tipo: 'link'; valor: string };

// URL http(s) sem espaço; pontuação final (".", ",", ")"...) fica fora do link.
const URL_RE = /https?:\/\/[^\s<>"]*[^\s<>".,;:!?)\]'”]/g;

/** Quebra o texto em trechos de texto puro e links http(s) clicáveis. */
export function separarLinks(texto: string): TrechoTexto[] {
  const trechos: TrechoTexto[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(URL_RE)) {
    const inicio = m.index ?? 0;
    if (inicio > ultimo) trechos.push({ tipo: 'texto', valor: texto.slice(ultimo, inicio) });
    trechos.push({ tipo: 'link', valor: m[0] });
    ultimo = inicio + m[0].length;
  }
  if (ultimo < texto.length) trechos.push({ tipo: 'texto', valor: texto.slice(ultimo) });
  return trechos;
}
