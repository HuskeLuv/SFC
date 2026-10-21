/**
 * Calendário de pregões da B3 para a Análise de Ativos (funções puras, datas 'AAAA-MM-DD' em UTC).
 *
 * Base: `feriadosB3` (src/utils/feriadosB3.ts, só leitura — feriados nacionais, 20/11 desde 2024,
 * Carnaval, Sexta-feira Santa, Corpus Christi) + os dias sem pregão do calendário da B3 que não são
 * feriado bancário: 24/12 e o último dia útil do ano (31/12, ou a sexta anterior quando 31/12 cai
 * no fim de semana). Usado pela fatia C (liquidez/lacunas do COTAHIST), D (data-com
 * real = pregão anterior à data ex) e E (data estimada no próximo pregão). fundamentei-regras (F2,
 * A4.b): data-ex = pregão seguinte à data-com real (pregaoSeguinte).
 */
import { feriadosB3 } from '@/utils/feriadosB3';

const DIA_MS = 24 * 60 * 60 * 1000;
const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

function paraMs(data: string): number {
  const m = RE_DATA.exec(data);
  if (!m) throw new Error(`Data inválida (esperado AAAA-MM-DD): ${data}`);
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (new Date(ms).toISOString().slice(0, 10) !== data) throw new Error(`Data inválida: ${data}`);
  return ms;
}

function paraData(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Dia (29–31) do último dia de semana de dezembro do ano. */
function ultimoDiaUtilDoAno(ano: number): number {
  const dow31 = new Date(Date.UTC(ano, 11, 31)).getUTCDay();
  return dow31 === 6 ? 30 : dow31 === 0 ? 29 : 31;
}

function ehPregaoMs(ms: number): boolean {
  const d = new Date(ms);
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  const mes = d.getUTCMonth();
  const dia = d.getUTCDate();
  // B3 não abre em 24/12 nem no último dia útil do ano (31/12; se 31/12 cair no sábado ou no
  // domingo, a sexta anterior — 30/12/2022, 29/12/2023), que não são feriados bancários nacionais.
  if (mes === 11 && (dia === 24 || dia === ultimoDiaUtilDoAno(d.getUTCFullYear()))) return false;
  return !feriadosB3(d.getUTCFullYear()).has(ms);
}

export function ehPregaoB3(data: string): boolean {
  return ehPregaoMs(paraMs(data));
}

/** Último pregão ESTRITAMENTE anterior a `data`. */
export function pregaoAnterior(data: string): string {
  let ms = paraMs(data) - DIA_MS;
  while (!ehPregaoMs(ms)) ms -= DIA_MS;
  return paraData(ms);
}

/**
 * Primeiro pregão ESTRITAMENTE posterior a `data` (fundamentei-regras F2, A4.b: data-ex = pregão
 * seguinte à data-com real; sexta ⇒ segunda; véspera de feriado ⇒ o dia útil depois do feriado).
 * Inversa de pregaoAnterior para datas que são pregão: pregaoSeguinte(pregaoAnterior(ex)) = ex.
 */
export function pregaoSeguinte(data: string): string {
  let ms = paraMs(data) + DIA_MS;
  while (!ehPregaoMs(ms)) ms += DIA_MS;
  return paraData(ms);
}

/** `data` se for pregão; senão o próximo pregão. */
export function proximoPregaoOuMesmo(data: string): string {
  let ms = paraMs(data);
  while (!ehPregaoMs(ms)) ms += DIA_MS;
  return paraData(ms);
}

/** Pregões em [de, ate] (inclusivo), em ordem crescente. `de > ate` ⇒ []. */
export function pregoesEntre(de: string, ate: string): string[] {
  const fim = paraMs(ate);
  const out: string[] = [];
  for (let ms = paraMs(de); ms <= fim; ms += DIA_MS) {
    if (ehPregaoMs(ms)) out.push(paraData(ms));
  }
  return out;
}

/**
 * Distância em pregões entre duas datas: nº de pregões em (min, max]. Mesma data ⇒ 0; dois pregões
 * consecutivos ⇒ 1 (sexta × segunda também). Simétrica.
 */
export function distanciaEmPregoes(a: string, b: string): number {
  const [de, ate] = a <= b ? [a, b] : [b, a];
  if (de === ate) return 0;
  const n = pregoesEntre(de, ate).length;
  return ehPregaoMs(paraMs(de)) ? n - 1 : n;
}
