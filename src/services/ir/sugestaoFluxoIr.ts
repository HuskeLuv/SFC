import type { CashGroupLike } from '@/services/cashflow/linhasEditaveis';

/**
 * Sugestão da simulação do IR (aba PGBL) a partir do Fluxo de Caixa do ano (ticket 86e2xnyrg,
 * "puxar renda e gastos dedutíveis do fluxo de caixa").
 *
 * É SÓ SUGESTÃO: o usuário confere e ajusta. Limites conhecidos, explicados na tela:
 * - salário e pró-labore costumam ser lançados LÍQUIDOS no fluxo; o IR usa o bruto;
 * - o fluxo não tem linha de INSS nem de IR retido (ficam manuais);
 * - medicamentos, material escolar e cursos livres NÃO são dedutíveis e ficam de fora;
 * - gastos de Animais de Estimação (veterinário, exames) também ficam de fora.
 */

export interface LinhaSugerida {
  grupo: string;
  linha: string;
  total: number;
}

export interface ItemSugerido {
  total: number;
  linhas: LinhaSugerida[];
}

export interface SugestaoFluxoIr {
  rendaTributavel: ItemSugerido;
  saude: ItemSugerido;
  educacao: ItemSugerido;
}

const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Entradas tributáveis no ajuste anual (13º, férias e PLR têm tributação exclusiva). */
const RENDA_RE = /pro-?\s?labore|salario|aluguel|aluguéis|notas? fiscais|honorario/;
const RENDA_FORA_RE = /13|decimo|ferias|bonus|plr|participacao/;
/** Saúde dedutível: plano, médicos, terapeutas, dentista, exames, hospital. */
const SAUDE_RE =
  /plano de saude|medic(o|os)\b|medicos|terapeut|odont|dentist|exame|hospita|fisioter|psicolog/;
const SAUDE_FORA_RE = /medicament|farmac/;
/** Educação dedutível: escola e faculdade (cursos livres e material escolar não entram). */
const EDUCACAO_RE = /escola|faculdade|mensalidade escolar|creche|pos-?graduacao|graduacao/;
const EDUCACAO_FORA_RE = /material|livro|uniforme|transporte/;
const GRUPO_FORA_RE = /animais|pet\b/;

const arred = (v: number) => Math.round(v * 100) / 100;

function totalDoAno(item: NonNullable<CashGroupLike['items']>[number]): number {
  let t = 0;
  for (const v of item.values ?? []) {
    if (typeof v.month === 'number' && v.month >= 0 && v.month < 12) t += Number(v.value ?? 0);
  }
  return arred(t);
}

export function sugerirDoFluxo(groups: CashGroupLike[]): SugestaoFluxoIr {
  const vazio = (): ItemSugerido => ({ total: 0, linhas: [] });
  const out: SugestaoFluxoIr = { rendaTributavel: vazio(), saude: vazio(), educacao: vazio() };
  const somar = (alvo: ItemSugerido, grupo: string, linha: string, total: number) => {
    alvo.linhas.push({ grupo, linha, total });
    alvo.total = arred(alvo.total + total);
  };

  const walk = (g: CashGroupLike, tipoHerdado: string | undefined) => {
    const tipo = g.type ?? tipoHerdado;
    if (g.hidden) return;
    const grupoN = normalizar(g.name);
    for (const it of g.items ?? []) {
      if (it.hidden) continue;
      const total = totalDoAno(it);
      if (total <= 0) continue;
      const linhaN = normalizar(it.name);
      if (tipo === 'entrada') {
        if (RENDA_RE.test(linhaN) && !RENDA_FORA_RE.test(linhaN)) {
          somar(out.rendaTributavel, g.name, it.name, total);
        }
        continue;
      }
      if (tipo !== 'despesa' || GRUPO_FORA_RE.test(grupoN)) continue;
      if (SAUDE_RE.test(linhaN) && !SAUDE_FORA_RE.test(linhaN)) {
        somar(out.saude, g.name, it.name, total);
      } else if (EDUCACAO_RE.test(linhaN) && !EDUCACAO_FORA_RE.test(linhaN)) {
        somar(out.educacao, g.name, it.name, total);
      }
    }
    for (const c of g.children ?? []) walk(c, tipo);
  };
  for (const g of groups) walk(g, undefined);
  return out;
}
