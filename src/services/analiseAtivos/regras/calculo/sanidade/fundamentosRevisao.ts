/**
 * R7 (bloqueante) e R8 (revisão) sobre os dois últimos exercícios (FY) de uma empresa. Funções puras.
 * Limiares em ScoringParams.sanidade.conferencia (fundamentosRazao, rev.*).
 *
 *  - fundamentos_escala / salto_escala: ≥ 2 de {receita, ativo total, PL} a ≥ fundamentosRazao×
 *    (ou ≤ 1/×) do FY anterior, na MESMA direção, sem 'escala_corrigida' em nenhum dos dois. Erro de
 *    escala (×1000) move o documento inteiro; uma conta sozinha ×10 é real (PL minúsculo de BEEF3,
 *    CTKA3, MGEL4, PTBL3; receita de RCSL3) — com "qualquer conta" o dry-run do DEV marcava 7 no
 *    último par, contra 0 medidos na spec. A ingestão já corrige ×1000 em 147 períodos; é rede de
 *    proteção. Empresa; ocultar.
 *  - rev:variacao_nivel: receita, PL ou ativo com variação > rev.variacaoNivel (40%) e base (o MENOR
 *    dos dois valores) ≥ rev.variacaoNivelBaseMin (R$ 100 mi). Só caso (decisão 1: a regra literal de
 *    40% marcaria 57% das empresas).
 *  - rev:variacao_lucro: lucro líquido ≥ rev.variacaoLucroFator× (ou ≤ 1/×) do anterior, base (o
 *    MENOR dos dois, em módulo) ≥ rev.variacaoLucroBaseMin (R$ 50 mi) e MESMO sinal. Só caso
 *    (decisão 2: a regra ×/÷3 marcava a PRIO3, queda real de 10,3 bi para 2,25 bi).
 * Chave = ano fiscal do último FY. Os dois FY têm de ser de anos consecutivos.
 */
import type { CfgConferencia, DeteccaoConf, DeteccaoRev } from './aplicarConferencia';

export interface FySanidade {
  anoFiscal: number;
  receita: number | null;
  ativoTotal: number | null;
  pl: number | null;
  plControladora?: number | null;
  lucroAtribuivel: number | null;
  lucroLiquido: number | null;
  flags: readonly string[];
}

const CONTAS_NIVEL = ['receita', 'ativoTotal', 'pl'] as const;
/** contas que precisam saltar juntas (na mesma direção) para ser erro de escala do documento */
const MIN_CONTAS_ESCALA = 2;

function par(fys: readonly FySanidade[]): [FySanidade, FySanidade] | null {
  const s = [...fys].sort((a, b) => a.anoFiscal - b.anoFiscal);
  if (s.length < 2) return null;
  const ult = s[s.length - 1];
  const ant = s[s.length - 2];
  return ult.anoFiscal - ant.anoFiscal === 1 ? [ant, ult] : null;
}

const plDe = (f: FySanidade) => f.pl ?? f.plControladora ?? null;
const valorConta = (f: FySanidade, k: (typeof CONTAS_NIVEL)[number]) =>
  k === 'pl' ? plDe(f) : f[k];

export function detectarSaltoEscalaFundamentos(
  fys: readonly FySanidade[],
  cfg: Pick<CfgConferencia, 'fundamentosRazao'>,
): DeteccaoConf | null {
  const p = par(fys);
  if (!p) return null;
  const [ant, ult] = p;
  if (ant.flags.includes('escala_corrigida') || ult.flags.includes('escala_corrigida')) return null;
  const subiu: number[] = [];
  const caiu: number[] = [];
  for (const k of CONTAS_NIVEL) {
    const a = valorConta(ant, k);
    const b = valorConta(ult, k);
    if (typeof a !== 'number' || typeof b !== 'number' || !(a > 0) || !(b > 0)) continue;
    const r = b / a;
    if (r >= cfg.fundamentosRazao) subiu.push(r);
    else if (r <= 1 / cfg.fundamentosRazao) caiu.push(r);
  }
  const lado =
    subiu.length >= MIN_CONTAS_ESCALA ? subiu : caiu.length >= MIN_CONTAS_ESCALA ? caiu : null;
  if (!lado) return null;
  return {
    tipo: 'conf',
    grupo: 'fundamentos_escala',
    regra: 'salto_escala',
    chave: String(ult.anoFiscal),
    valor: lado[0],
  };
}

export function revisaoVariacaoNivel(
  fys: readonly FySanidade[],
  cfg: Pick<CfgConferencia['rev'], 'variacaoNivel' | 'variacaoNivelBaseMin'>,
): DeteccaoRev | null {
  const p = par(fys);
  if (!p) return null;
  const [ant, ult] = p;
  for (const k of CONTAS_NIVEL) {
    const a = valorConta(ant, k);
    const b = valorConta(ult, k);
    if (typeof a !== 'number' || typeof b !== 'number' || !(a > 0) || !(b > 0)) continue;
    if (Math.min(a, b) < cfg.variacaoNivelBaseMin) continue;
    const v = b / a - 1;
    if (Math.abs(v) > cfg.variacaoNivel) {
      return { tipo: 'rev', regra: 'variacao_nivel', chave: String(ult.anoFiscal), valor: v + 1 };
    }
  }
  return null;
}

export function revisaoVariacaoLucro(
  fys: readonly FySanidade[],
  cfg: Pick<CfgConferencia['rev'], 'variacaoLucroFator' | 'variacaoLucroBaseMin'>,
): DeteccaoRev | null {
  const p = par(fys);
  if (!p) return null;
  const [ant, ult] = p;
  const a = ant.lucroLiquido ?? ant.lucroAtribuivel;
  const b = ult.lucroLiquido ?? ult.lucroAtribuivel;
  if (typeof a !== 'number' || typeof b !== 'number' || a === 0 || b === 0) return null;
  if (Math.sign(a) !== Math.sign(b)) return null;
  if (Math.min(Math.abs(a), Math.abs(b)) < cfg.variacaoLucroBaseMin) return null;
  const r = Math.abs(b) / Math.abs(a);
  if (r >= cfg.variacaoLucroFator || r <= 1 / cfg.variacaoLucroFator) {
    return { tipo: 'rev', regra: 'variacao_lucro', chave: String(ult.anoFiscal), valor: r };
  }
  return null;
}
