/**
 * Nº de ações do fim do exercício (regra 10), com validação cruzada pelo LPA publicado.
 *
 * Candidatos: DFP composicao_capital em unidades e ×1000 (598 company-years vêm em MILHARES sem aviso:
 * VALE3 2024 = "4.539.008") e o FRE 3.1 item f "Número de Ações, Ex-Tesouraria" (até FY2021, valor do
 * fim do exercício). O FRE `capital_social` NUNCA é candidato: é o capital da data da versão, reexpresso
 * depois de splits (WEGE3 2019 daria 4.197 mi em vez de 2.098,66 mi).
 *
 * Ordem (Fase A: consistência 63,7% → 93,6%):
 *  1. aceita o 1º candidato com Σ(LPA_classe × ações_classe)/lucro ∈ razaoLpaAceita [0,8; 1,25];
 *  2. razão ≈ 1000 ou ≈ 0,001 ⇒ LPA publicado em escala errada: aceita o candidato e corrige o LPA;
 *  3. FRE reexpresso por evento até 2 anos depois (FRE ≈ implícito × fator) ⇒ FRE ÷ fator (UGPA3 2018);
 *  4. sem LPA útil: vizinhança — candidato mais próximo de ações(ano±1..2) × eventos entre as datas;
 *  5. com LPA sem acerto: candidato a ≤ fatorImplicitoMaxDistanciaPct do implícito; senão lucro ÷ LPA;
 *  6. último recurso: FRE sem verificação ou limiar (< 20 mi ações com PL > R$ 1 bi ⇒ milhares).
 * Status: razão verificável fora de ±razaoLpaAlertaPct ⇒ 'alerta'; sem razão ⇒ 'nao_verificavel'.
 * O salto de ações sem evento validado (regra 13) é da fatia D.
 */
import type { FatorEscalaLpa } from '@/services/analiseAtivos/regras/acoes/lpa';
import type { EventoCorporativoBruto, ScoringParams } from '@/services/analiseAtivos/tipos';

export interface ComposicaoCapital {
  on: number;
  pn: number;
  tesOn: number;
  tesPn: number;
}

export interface EventoAcoes {
  date: string;
  fator: number;
}

export interface EntradaResolucaoAcoes {
  ano: number;
  lucroAtribuivel: number | null;
  lucroTotal: number | null;
  lpaOn: number | null;
  lpaPn: number | null;
  pl: number | null;
  /** DFP/ITR composicao_capital como publicada (unidade desconhecida) */
  composicao: ComposicaoCapital | null;
  /** FRE 3.1 item f do exercício (entregue no ano seguinte) */
  freAcoes: number | null;
  /** eventos brutos já deduplicados (deduplicarEventos) */
  eventos: EventoAcoes[];
  /** anos já resolvidos COM verificação (lpa/escala/FRE reexpresso) — base da vizinhança */
  vizinhos?: Array<{ ano: number; acoes: number }>;
  /** 'dfp' (fim de exercício) ou 'itr' (fim de trimestre): muda só o nome da fonte */
  documento?: 'dfp' | 'itr';
}

export type FonteAcoes =
  | 'dfp'
  | 'dfp_x1000'
  | 'itr'
  | 'itr_x1000'
  | 'fre_f'
  | 'lpa_implicito'
  | 'vizinho'
  | 'limiar'
  | 'sem_verificacao';

export interface ResolucaoAcoes {
  acoes: number | null;
  on: number | null;
  pn: number | null;
  tesouraria: number | null;
  fonte: FonteAcoes | null;
  razaoLpa: number | null;
  status: 'ok' | 'alerta' | 'nao_verificavel';
  fatorEscalaLpa: FatorEscalaLpa;
  flags: string[];
}

interface Candidato {
  nome: 'dfp' | 'dfp_x1000' | 'fre_f';
  acoes: number;
  on: number;
  pn: number;
  tesouraria: number | null;
}

const DIA_MS = 86_400_000;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);

/**
 * Dedup local de eventos brutos (BRAPI×YAHOO, YAHOO×YAHOO): mesmo fator (±dedupFatorTolPct) em até
 * dedupDias = 1 evento. Só os tipos de params.sanidade.eventos.tipos. A validação definitiva é da D.
 */
export function deduplicarEventos(
  brutos: EventoCorporativoBruto[],
  p: ScoringParams,
): EventoAcoes[] {
  const e = p.sanidade.eventos;
  const tipos = new Set<string>(e.tipos);
  const ordenados = brutos
    .filter((b) => tipos.has(b.type) && Number.isFinite(b.factor) && b.factor > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const out: EventoAcoes[] = [];
  for (const b of ordenados) {
    const dup = out.find(
      (o) =>
        Math.abs(ms(o.date) - ms(b.date)) <= e.dedupDias * DIA_MS &&
        Math.abs(o.fator / b.factor - 1) * 100 <= e.dedupFatorTolPct,
    );
    if (!dup) out.push({ date: b.date, fator: b.factor });
  }
  return out;
}

/** Π dos eventos com data em (de, ate]. */
export function fatorEventosEntre(eventos: EventoAcoes[], de: string, ate: string): number {
  return eventos
    .filter((ev) => ev.date > de && ev.date <= ate)
    .reduce((acc, ev) => acc * ev.fator, 1);
}

function candidatos(e: EntradaResolucaoAcoes): Candidato[] {
  const out: Candidato[] = [];
  const c = e.composicao;
  if (c) {
    const on = c.on - c.tesOn;
    const pn = c.pn - c.tesPn;
    if (on + pn > 0) {
      const tes = c.tesOn + c.tesPn;
      out.push({ nome: 'dfp', acoes: on + pn, on, pn, tesouraria: tes });
      out.push({
        nome: 'dfp_x1000',
        acoes: (on + pn) * 1000,
        on: on * 1000,
        pn: pn * 1000,
        tesouraria: tes * 1000,
      });
    }
  }
  if (e.freAcoes && e.freAcoes > 0) {
    out.push({ nome: 'fre_f', acoes: e.freAcoes, on: 0, pn: 0, tesouraria: null });
  }
  return out;
}

function lucroBase(
  e: EntradaResolucaoAcoes,
  p: ScoringParams,
): { lucro: number; fallback: boolean } | null {
  const min = p.sanidade.acoes.lucroMinVerificavel;
  if (e.lucroAtribuivel !== null && Number.isFinite(e.lucroAtribuivel)) {
    return Math.abs(e.lucroAtribuivel) >= min
      ? { lucro: e.lucroAtribuivel, fallback: false }
      : null;
  }
  if (e.lucroTotal !== null && Number.isFinite(e.lucroTotal) && Math.abs(e.lucroTotal) >= min) {
    return { lucro: e.lucroTotal, fallback: true };
  }
  return null;
}

/** LPA por classe com fallback entre classes (companhia de uma classe só publica uma linha). */
function lpas(e: EntradaResolucaoAcoes): { on: number; pn: number } | null {
  const on = e.lpaOn ?? e.lpaPn;
  const pn = e.lpaPn ?? e.lpaOn;
  return on !== null && pn !== null ? { on, pn } : null;
}

function razaoLpa(e: EntradaResolucaoAcoes, c: Candidato, lucro: number): number | null {
  const l = lpas(e);
  if (!l || lucro === 0) return null;
  const implicito = c.on + c.pn > 0 ? l.on * c.on + l.pn * c.pn : l.on * c.acoes;
  return implicito ? implicito / lucro : null;
}

/** Ações implícitas = lucro ÷ LPA (só quando as classes têm LPA parecido: senão é ambíguo). */
function acoesImplicitas(e: EntradaResolucaoAcoes, lucro: number): number | null {
  const l = lpas(e);
  if (!l || l.on === 0) return null;
  // classes com LPA muito diferente (PN com prêmio): lucro ÷ LPA não identifica o nº de ações
  if (Math.abs(l.on / l.pn - 1) > 0.15) return null;
  const n = lucro / l.on;
  return n > 0 ? n : null;
}

const distLog = (a: number, b: number) => Math.abs(Math.log(a / b));

export function resolverAcoesExercicio(e: EntradaResolucaoAcoes, p: ScoringParams): ResolucaoAcoes {
  const s = p.sanidade.acoes;
  const cands = candidatos(e);
  const base = lucroBase(e, p);
  const flagsBase = base?.fallback ? ['lucro_total_fallback'] : [];
  const nomeFonte = (n: Candidato['nome']): FonteAcoes =>
    e.documento === 'itr' && n !== 'fre_f' ? (n === 'dfp' ? 'itr' : 'itr_x1000') : n;
  const statusPorRazao = (r: number | null): ResolucaoAcoes['status'] =>
    r === null ? 'nao_verificavel' : Math.abs(r - 1) * 100 > s.razaoLpaAlertaPct ? 'alerta' : 'ok';
  const resultado = (
    c:
      | Candidato
      | { acoes: number; on: number | null; pn: number | null; tesouraria: number | null },
    fonte: FonteAcoes,
    razao: number | null,
    extras: { flags?: string[]; fator?: FatorEscalaLpa; status?: ResolucaoAcoes['status'] } = {},
  ): ResolucaoAcoes => {
    const porClasse = 'nome' in c && c.nome !== 'fre_f';
    const flags = [...flagsBase, ...(extras.flags ?? [])];
    if ('nome' in c && c.nome === 'dfp_x1000') flags.push('escala_x1000');
    return {
      acoes: c.acoes,
      on: porClasse ? c.on : null,
      pn: porClasse ? c.pn : null,
      tesouraria: c.tesouraria,
      fonte,
      razaoLpa: razao,
      status: extras.status ?? statusPorRazao(razao),
      fatorEscalaLpa: extras.fator ?? 1,
      flags,
    };
  };

  if (cands.length === 0) {
    return {
      acoes: null,
      on: null,
      pn: null,
      tesouraria: null,
      fonte: null,
      razaoLpa: null,
      status: 'nao_verificavel',
      fatorEscalaLpa: 1,
      flags: [...flagsBase, 'sem_fonte'],
    };
  }

  // 1. razão LPA coerente
  if (base) {
    for (const c of cands) {
      const r = razaoLpa(e, c, base.lucro);
      if (r !== null && r > s.razaoLpaAceita[0] && r < s.razaoLpaAceita[1]) {
        return resultado(c, nomeFonte(c.nome), r);
      }
    }
    // 2. LPA publicado em escala errada (razão ~1000 ou ~0,001)
    for (const c of cands) {
      const r = razaoLpa(e, c, base.lucro);
      if (r === null) continue;
      const fator: FatorEscalaLpa | null =
        r > s.escalaLpaMil[0] && r < s.escalaLpaMil[1]
          ? 0.001
          : r > s.escalaLpaMilesimo[0] && r < s.escalaLpaMilesimo[1]
            ? 1000
            : null;
      if (fator) {
        return resultado(c, nomeFonte(c.nome), r * fator, {
          fator,
          flags: ['lpa_escala_corrigida'],
        });
      }
    }
    // 3. FRE reexpresso por evento posterior (≤ 2 anos depois do exercício)
    const fre = cands.find((c) => c.nome === 'fre_f');
    const impl = acoesImplicitas(e, base.lucro);
    if (fre && impl) {
      const fator = fatorEventosEntre(e.eventos, `${e.ano}-12-31`, `${e.ano + 2}-12-31`);
      const tol = p.sanidade.eventos.confirmacaoTolPct / 100;
      if (
        Math.abs(fator - 1) * 100 > s.razaoLpaAlertaPct &&
        Math.abs(fre.acoes / (impl * fator) - 1) < tol
      ) {
        const acoes = fre.acoes / fator;
        const r = razaoLpa(e, { ...fre, acoes }, base.lucro);
        return resultado({ ...fre, acoes }, 'fre_f', r, { flags: ['fre_reexpresso'] });
      }
    }
  }

  // 4. vizinhança (anos já validados ± eventos entre as datas)
  const vizinhos = e.vizinhos ?? [];
  const ordem = [e.ano - 1, e.ano + 1, e.ano - 2, e.ano + 2];
  const viz = ordem
    .map((a) => vizinhos.find((v) => v.ano === a && v.acoes > 0))
    .find((v) => v !== undefined);
  if (viz) {
    const fator =
      viz.ano < e.ano
        ? fatorEventosEntre(e.eventos, `${viz.ano}-12-31`, `${e.ano}-12-31`)
        : 1 / fatorEventosEntre(e.eventos, `${e.ano}-12-31`, `${viz.ano}-12-31`);
    const esperado = viz.acoes * fator;
    const melhor = [...cands].sort(
      (a, b) => distLog(a.acoes, esperado) - distLog(b.acoes, esperado),
    )[0];
    if (melhor && distLog(melhor.acoes, esperado) < Math.log(1 + s.vizinhancaToleranciaPct / 100)) {
      const r = base ? razaoLpa(e, melhor, base.lucro) : null;
      return resultado(melhor, 'vizinho', r, {
        flags: [`origem:${nomeFonte(melhor.nome)}`],
        status: 'nao_verificavel',
      });
    }
  }

  // 5. LPA sem acerto: candidato próximo do implícito, senão o próprio implícito
  if (base) {
    const impl = acoesImplicitas(e, base.lucro);
    if (impl) {
      const melhor = [...cands].sort((a, b) => distLog(a.acoes, impl) - distLog(b.acoes, impl))[0];
      if (
        melhor &&
        distLog(melhor.acoes, impl) < Math.log(1 + s.fatorImplicitoMaxDistanciaPct / 100)
      ) {
        return resultado(melhor, nomeFonte(melhor.nome), razaoLpa(e, melhor, base.lucro), {
          flags: ['lpa_aproximado'],
        });
      }
      return resultado(
        { acoes: impl, on: null, pn: null, tesouraria: null },
        'lpa_implicito',
        null,
      );
    }
  }

  // 6. último recurso
  const fre = cands.find((c) => c.nome === 'fre_f');
  if (fre) return resultado(fre, 'sem_verificacao', null, { flags: ['origem:fre_f'] });
  const dfp = cands.find((c) => c.nome === 'dfp');
  const dfpMil = cands.find((c) => c.nome === 'dfp_x1000');
  if (dfp && dfpMil) {
    const milhares = dfp.acoes < s.limiarMilhares.acoesMax && (e.pl ?? 0) > s.limiarMilhares.plMin;
    const c = milhares ? dfpMil : dfp;
    return resultado(c, 'limiar', null, { flags: [`origem:${nomeFonte(c.nome)}`] });
  }
  return resultado(cands[0], 'sem_verificacao', null);
}

/**
 * Contagem do ITR (fim do trimestre) com a MESMA escolha unidade/×1000 do DFP mais recente da
 * empresa. A razão Σ(LPA YTD × ações)/lucro YTD só dá o status; LPA em escala errada é corrigido.
 */
export function contagemComEscalaFixa(
  e: EntradaResolucaoAcoes,
  x1000: boolean,
  p: ScoringParams,
): ResolucaoAcoes {
  const cand = candidatos({ ...e, freAcoes: null }).find(
    (c) => c.nome === (x1000 ? 'dfp_x1000' : 'dfp'),
  );
  if (!cand) {
    return {
      acoes: null,
      on: null,
      pn: null,
      tesouraria: null,
      fonte: null,
      razaoLpa: null,
      status: 'nao_verificavel',
      fatorEscalaLpa: 1,
      flags: ['sem_fonte'],
    };
  }
  const s = p.sanidade.acoes;
  const flags = x1000 ? ['escala_x1000', 'escala_do_dfp'] : ['escala_do_dfp'];
  const base = lucroBase(e, p);
  let razao = base ? razaoLpa(e, cand, base.lucro) : null;
  let fator: FatorEscalaLpa = 1;
  if (razao !== null && razao > s.escalaLpaMil[0] && razao < s.escalaLpaMil[1]) fator = 0.001;
  else if (razao !== null && razao > s.escalaLpaMilesimo[0] && razao < s.escalaLpaMilesimo[1]) {
    fator = 1000;
  }
  if (razao !== null) razao *= fator;
  if (base?.fallback) flags.push('lucro_total_fallback');
  if (fator !== 1) flags.push('lpa_escala_corrigida');
  const status: ResolucaoAcoes['status'] =
    razao === null
      ? 'nao_verificavel'
      : Math.abs(razao - 1) * 100 > s.razaoLpaAlertaPct
        ? 'alerta'
        : 'ok';
  return {
    acoes: cand.acoes,
    on: cand.on,
    pn: cand.pn,
    tesouraria: cand.tesouraria,
    fonte: x1000 ? 'itr_x1000' : 'itr',
    razaoLpa: razao,
    status,
    fatorEscalaLpa: fator,
    flags,
  };
}
