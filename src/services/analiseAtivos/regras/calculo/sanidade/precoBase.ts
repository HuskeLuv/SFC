/**
 * R3 — base de cotação mudada sem evento (grupo preco_base; escopo TICKER; múltiplos ocultos, cotação
 * com selo). Função pura. Limiares: ScoringParams.sanidade.conferencia.precoBase.
 *
 * Nos últimos `janelaDias` dias, entre dois pregões COM negócio consecutivos:
 *  - salto |fech/fech_ant − 1| > `salto` (40%);
 *  - razão a ±`tolFator` de um fator de evento {2,3,4,5,8,10,20,50,100} ou do inverso (a cara de um
 *    desdobramento/grupamento);
 *  - persistência: os `persistir` pregões seguintes ficam a ±`tolPersist` do novo nível;
 *  - liquidez: ≥ `negociosMin` negócios no pregão do salto (sem isso entravam INHF11, LPLP11,
 *    PRSN11 e DAMT11 — preço de 1 ou 2 negócios);
 *  - nenhum evento (bruto, qualquer status) a ±`eventoDias` dias.
 * Chave = data do salto (liberação por data). Ex.: SBSP3 ×0,20 em 29/04/2026 com 24.324 negócios e
 * sem desdobramento na base: DY 12m de 12,85% inflado escapava da trava de proventos.
 */
import type { CfgConferencia, DeteccaoConf } from './aplicarConferencia';

export interface PregaoSerie {
  date: string;
  closeRaw: number;
  negocios: number;
}

const DIA_MS = 24 * 60 * 60 * 1000;
const ms = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));

export function menosDias(data: string, dias: number): string {
  return new Date(ms(data) - dias * DIA_MS).toISOString().slice(0, 10);
}

/** Fator de evento mais próximo da razão (ou do inverso), dentro da tolerância; null se nenhum. */
export function fatorDeEvento(
  razao: number,
  fatores: readonly number[],
  tol: number,
): number | null {
  if (!(razao > 0)) return null;
  for (const f of fatores) {
    if (Math.abs(razao / f - 1) <= tol) return f;
    if (Math.abs(razao * f - 1) <= tol) return 1 / f;
  }
  return null;
}

export function detectarPrecoBase(
  serie: readonly PregaoSerie[],
  eventos: readonly { dataEvento: string }[],
  hoje: string,
  cfg: CfgConferencia['precoBase'],
): DeteccaoConf | null {
  const desde = menosDias(hoje, cfg.janelaDias);
  const s = serie
    .filter((p) => p.negocios > 0 && p.closeRaw > 0 && p.date >= desde && p.date <= hoje)
    .sort((a, b) => a.date.localeCompare(b.date));
  let achado: DeteccaoConf | null = null;
  for (let i = 1; i < s.length; i++) {
    const ant = s[i - 1];
    const dia = s[i];
    const r = dia.closeRaw / ant.closeRaw;
    if (Math.abs(r - 1) <= cfg.salto) continue;
    if (fatorDeEvento(r, cfg.fatores, cfg.tolFator) === null) continue;
    if (dia.negocios < cfg.negociosMin) continue;
    const seguintes = s.slice(i + 1, i + 1 + cfg.persistir);
    if (seguintes.length < cfg.persistir) continue;
    if (seguintes.some((x) => Math.abs(x.closeRaw / dia.closeRaw - 1) > cfg.tolPersist)) continue;
    const t = ms(dia.date);
    const comEvento = eventos.some(
      (ev) => Math.abs(ms(ev.dataEvento) - t) <= cfg.eventoDias * DIA_MS,
    );
    if (comEvento) continue;
    achado = {
      tipo: 'conf',
      grupo: 'preco_base',
      regra: 'base_sem_evento',
      chave: dia.date,
      valor: r,
    };
  }
  return achado;
}
