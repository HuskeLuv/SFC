/**
 * Lucro do período e lucro atribuível à controladora (regra 12).
 *
 * - O lucro é a linha de 2º nível do DRE com descrição de "Lucro/Prejuízo (Consolidado/Líquido) do
 *   Período" (3.11 na maioria; 3.09 no Itaú; 3.13/3.15 em alguns bancos) e o código vem da MESMA linha.
 * - "Atribuído à controladora" tem de ser FILHA dessa linha (evita 3.10.xx de operações
 *   descontinuadas) e nunca 3.99 (LPA).
 * - Controladora = 0 com lucro ≠ 0 ⇒ AUSENTE ('controladora_zero'), no DFP e no ITR: é linha não
 *   preenchida (KLBN11 2025 publica 3.11.01 = 0 com lucro de R$ 1,68 bi). Usar o lucro total no lugar
 *   é decisão de quem consome, com a flag 'lucro_total_fallback'.
 * - Demonstração individual sem linha de controladora: o lucro individual É o da controladora.
 * - Controladora E não controladores zerados (ou sem a linha de não controladores) com lucro ≠ 0 ⇒
 *   flag extra 'atribuicoes_zeradas': a companhia não preencheu a divisão (SBSP3 2025: 3.11.01 e
 *   3.11.02 = 0). Nesse caso o lucro do escopo INDIVIDUAL do mesmo documento — no BR GAAP, o lucro
 *   atribuído à controladora — entra no lugar, com a flag 'lucro_individual' (aplicarLucroIndividual).
 */
import type { LinhaDemonstrativo } from '@/services/analiseAtivos/regras/acoes/extrairFundamentos';
import { ausente, ok } from '@/services/analiseAtivos/regras/comum/valor';
import type { Escopo, Valor } from '@/services/analiseAtivos/tipos';

export const RE_LUCRO =
  /^Lucro\/Preju[ií]zo (Consolidado |L[ií]quido )?do Per[ií]odo$|^Lucro ou Preju[ií]zo L[ií]quido/i;
export const RE_NAO_CONTROLADORES = /N[aã]o Controlador/i;
export const RE_CONTROLADORA =
  /Atribu[ií]d[oa] (a|aos) (S[óo]cios|Acionistas)( da (Empresa )?| )Controlador|Acionistas Controladores/i;

export function nivelConta(cdConta: string): number {
  return cdConta.split('.').length;
}

/** Ordena códigos de conta numericamente por segmento ('3.2' < '3.11'). */
export function compararContas(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}

export interface LucroDoPeriodo {
  lucroTotal: Valor;
  lucroAtribuivel: Valor;
  codContaLucro: string | null;
  flags: string[];
}

export function lucroDoPeriodo(
  linhasDre: LinhaDemonstrativo[],
  opts: { escopo?: Escopo } = {},
): LucroDoPeriodo {
  const dre = linhasDre
    .filter((l) => l.demonstrativo === 'DRE' && !l.cdConta.startsWith('3.99'))
    .sort((a, b) => compararContas(a.cdConta, b.cdConta));
  const linhaLucro = dre.find(
    (l) => nivelConta(l.cdConta) === 2 && RE_LUCRO.test(l.dsConta.trim()),
  );
  if (!linhaLucro) {
    return {
      lucroTotal: ausente('sem_dado_fonte'),
      lucroAtribuivel: ausente('sem_dado_fonte'),
      codContaLucro: null,
      flags: [],
    };
  }
  const lucroTotal = linhaLucro.valor;
  const prefixo = `${linhaLucro.cdConta}.`;
  const ctrl = dre.find(
    (l) => l.cdConta.startsWith(prefixo) && RE_CONTROLADORA.test(l.dsConta.trim()),
  );
  if (ctrl) {
    if (ctrl.valor === 0 && lucroTotal !== 0) {
      const naoCtrl = dre.find(
        (l) =>
          l.cdConta.startsWith(prefixo) &&
          l.cdConta !== ctrl.cdConta &&
          RE_NAO_CONTROLADORES.test(l.dsConta.trim()),
      );
      const zeradas = !naoCtrl || naoCtrl.valor === 0;
      return {
        lucroTotal: ok(lucroTotal),
        lucroAtribuivel: ausente('controladora_zero', `${ctrl.cdConta} = 0 com lucro ≠ 0`),
        codContaLucro: ctrl.cdConta,
        flags: zeradas ? ['controladora_zero', 'atribuicoes_zeradas'] : ['controladora_zero'],
      };
    }
    return {
      lucroTotal: ok(lucroTotal),
      lucroAtribuivel: ok(ctrl.valor),
      codContaLucro: ctrl.cdConta,
      flags: [],
    };
  }
  if (opts.escopo === 'ind') {
    return {
      lucroTotal: ok(lucroTotal),
      lucroAtribuivel: ok(lucroTotal),
      codContaLucro: linhaLucro.cdConta,
      flags: [],
    };
  }
  return {
    lucroTotal: ok(lucroTotal),
    lucroAtribuivel: ausente('sem_dado_fonte', 'sem linha de controladora'),
    codContaLucro: linhaLucro.cdConta,
    flags: [],
  };
}

/** Campos mínimos de um período extraído para aplicarLucroIndividual. */
export interface PeriodoComLucro {
  escopo: Escopo;
  tipoPeriodo: string;
  dtIni: string;
  lucroAtribuivel: number | null;
  flags: string[];
}

/**
 * Regra 12, atribuições zeradas: no consolidado com 'atribuicoes_zeradas', o lucro atribuível passa a
 * ser o do escopo individual do MESMO documento e período (flag 'lucro_individual', sai
 * 'controladora_zero'). Sem individual com lucro, fica como está (ausente). Devolve cópias.
 */
export function aplicarLucroIndividual<T extends PeriodoComLucro>(periodos: T[]): T[] {
  return periodos.map((f) => {
    if (f.escopo !== 'con' || !f.flags.includes('atribuicoes_zeradas')) return f;
    const ind = periodos.find(
      (g) => g.escopo === 'ind' && g.tipoPeriodo === f.tipoPeriodo && g.dtIni === f.dtIni,
    );
    if (!ind || ind.lucroAtribuivel === null) return f;
    return {
      ...f,
      lucroAtribuivel: ind.lucroAtribuivel,
      flags: [...f.flags.filter((x) => x !== 'controladora_zero'), 'lucro_individual'],
    };
  });
}
