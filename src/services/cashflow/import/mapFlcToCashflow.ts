import type { CashflowGroup, CashflowItem } from '@/types/cashflow';
import { canonicalName } from '@/services/cashflow/groupMatchers';
import {
  normalizeLabel,
  type FlcIgnorado,
  type FlcParseResult,
  type FlcSecaoChave,
} from './parseFlcXlsx';

/**
 * Mapper puro: IR da planilha (parseFlcXlsx) + árvore mesclada do usuário
 * (getMergedCashflowGroups, já filtrada pelo ano-alvo) → plano de importação.
 * Não toca em Prisma; o commit executa o plano, o preview só o exibe.
 *
 * Regras (docs/plano-importacao-planilha-flc.md §3-§4):
 * - Grupo destino identificado por nome canônico (templateName, estável a
 *   renomes) normalizado; seções sem correspondente no template (§4.1) viram
 *   grupos custom sob o pai correto — a menos que já existam de um import
 *   anterior (idempotência).
 * - Item casa por nome normalizado dentro do grupo; sem match → criação de
 *   item custom (leva significado/rank); com match → só grava valores, sem
 *   sobrescrever significado/rank pré-existentes.
 * - Célula a célula: sem valor no app → escrita; igual (2 casas) → nada a
 *   fazer; diferente → conflito (política escolhida no commit).
 * - Linha-espelho de sonho (objetivoId) é somente-leitura → ignorada.
 */

export interface FlcDestinoGrupoExistente {
  tipo: 'existente';
  groupId: string;
  nome: string;
}

export interface FlcDestinoGrupoCriar {
  tipo: 'criar';
  nome: string;
  type: string;
  paiGroupId: string;
  paiNome: string;
}

export interface FlcEscrita {
  /** 0 = jan */
  mes: number;
  valor: number;
}

export interface FlcConflito {
  mes: number;
  valorPlanilha: number;
  valorApp: number;
}

export interface FlcItemPlano {
  linha: number;
  label: string;
  destino:
    | { tipo: 'existente'; itemId: string; nome: string }
    | { tipo: 'criar'; significado: string | null; rank: string | null };
  escritas: FlcEscrita[];
  conflitos: FlcConflito[];
  /** meses cujo valor no app já é o da planilha (nada a fazer) */
  jaIguais: number[];
}

export interface FlcGrupoPlano {
  chave: FlcSecaoChave;
  nomePlanilha: string;
  destino: FlcDestinoGrupoExistente | FlcDestinoGrupoCriar;
  itens: FlcItemPlano[];
}

export interface FlcImportResumo {
  gruposNovos: number;
  itensNovos: number;
  celulas: number;
  conflitos: number;
  jaIguais: number;
  ignorados: number;
}

export interface FlcImportPlan {
  grupos: FlcGrupoPlano[];
  ignorados: FlcIgnorado[];
  avisos: string[];
  resumo: FlcImportResumo;
}

type DestinoSpec =
  | { tipo: 'template'; nome: string }
  | { tipo: 'criar'; nome: string; pai: string; type: 'entrada' | 'despesa' };

/** seção da planilha → grupo do app (nomes canônicos do template/seed) */
const DESTINOS: Record<FlcSecaoChave, DestinoSpec> = {
  'entradas-fixas': { tipo: 'template', nome: 'Entradas Fixas' },
  'sem-tributacao': { tipo: 'template', nome: 'Sem Tributação' },
  'receita-investimentos': {
    tipo: 'criar',
    nome: 'Receita Investimentos',
    pai: 'Entradas Variáveis',
    type: 'entrada',
  },
  'com-tributacao': { tipo: 'template', nome: 'Com Tributação' },
  habitacao: { tipo: 'template', nome: 'Habitação' },
  transporte: { tipo: 'template', nome: 'Transporte' },
  saude: { tipo: 'template', nome: 'Saúde' },
  'despesas-pessoais': { tipo: 'template', nome: 'Despesas Pessoais' },
  lazer: { tipo: 'template', nome: 'Lazer' },
  educacao: { tipo: 'template', nome: 'Educação' },
  'animais-estimacao': { tipo: 'template', nome: 'Animais de Estimação' },
  'despesas-financeiras': {
    tipo: 'criar',
    nome: 'Despesas Financeiras',
    pai: 'Despesas Fixas',
    type: 'despesa',
  },
  impostos: { tipo: 'template', nome: 'Impostos' },
  'despesas-dependentes': {
    tipo: 'criar',
    nome: 'Despesas com Dependentes',
    pai: 'Despesas Fixas',
    type: 'despesa',
  },
  'despesas-empresa': { tipo: 'template', nome: 'Despesas Empresa' },
  'despesas-temporarias': { tipo: 'template', nome: 'Despesas Variáveis' },
  'conta-corrente': { tipo: 'template', nome: 'Conta Corrente' },
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

interface GrupoIndexado {
  group: CashflowGroup;
  norm: string;
}

const flattenGroups = (groups: CashflowGroup[], out: GrupoIndexado[] = []): GrupoIndexado[] => {
  for (const g of groups) {
    if (!g.hidden) {
      out.push({ group: g, norm: normalizeLabel(canonicalName(g)) });
      if (g.children?.length) flattenGroups(g.children, out);
    }
  }
  return out;
};

/** busca por nome canônico normalizado; nome exibido cobre grupos custom de import anterior */
const findGroup = (index: GrupoIndexado[], nome: string): CashflowGroup | null => {
  const alvo = normalizeLabel(nome);
  const hit = index.find((e) => e.norm === alvo || normalizeLabel(e.group.name) === alvo);
  return hit ? hit.group : null;
};

const planejarItem = (
  item: {
    linha: number;
    label: string;
    significado: string | null;
    rank: number | null;
    valores: (number | null)[];
  },
  existente: CashflowItem | null,
): FlcItemPlano => {
  const escritas: FlcEscrita[] = [];
  const conflitos: FlcConflito[] = [];
  const jaIguais: number[] = [];

  const valoresApp = new Map<number, number>();
  if (existente) {
    for (const v of existente.values ?? []) valoresApp.set(v.month, v.value);
  }

  item.valores.forEach((valor, mes) => {
    if (valor === null) return;
    const planilha = round2(valor);
    if (!valoresApp.has(mes)) {
      escritas.push({ mes, valor: planilha });
      return;
    }
    const app = round2(valoresApp.get(mes) as number);
    if (app === planilha) {
      jaIguais.push(mes);
    } else {
      conflitos.push({ mes, valorPlanilha: planilha, valorApp: app });
    }
  });

  return {
    linha: item.linha,
    label: item.label,
    destino: existente
      ? { tipo: 'existente', itemId: existente.id, nome: existente.name }
      : {
          tipo: 'criar',
          significado: item.significado,
          rank: item.rank !== null ? String(item.rank) : null,
        },
    escritas,
    conflitos,
    jaIguais,
  };
};

export const mapFlcToCashflow = (parse: FlcParseResult, arvore: CashflowGroup[]): FlcImportPlan => {
  const grupos: FlcGrupoPlano[] = [];
  const ignorados: FlcIgnorado[] = [...parse.ignorados];
  const avisos: string[] = [...parse.avisos];

  const index = flattenGroups(arvore);
  const chavesVistas = new Set<FlcSecaoChave>();

  for (const secao of parse.secoes) {
    if (chavesVistas.has(secao.chave)) {
      avisos.push(
        `seção "${secao.nome}" (linha ${secao.linha}) aparece mais de uma vez na planilha — ocorrências repetidas foram mescladas no mesmo destino`,
      );
    }
    chavesVistas.add(secao.chave);

    const spec = DESTINOS[secao.chave];
    const grupoApp = findGroup(index, spec.nome);

    let destino: FlcDestinoGrupoExistente | FlcDestinoGrupoCriar;
    if (grupoApp) {
      destino = { tipo: 'existente', groupId: grupoApp.id, nome: grupoApp.name };
    } else if (spec.tipo === 'criar') {
      const pai = findGroup(index, spec.pai);
      if (!pai) {
        avisos.push(
          `seção "${secao.nome}": grupo-pai "${spec.pai}" não encontrado no fluxo de caixa — seção ignorada`,
        );
        for (const item of secao.itens) {
          ignorados.push({
            linha: item.linha,
            label: item.label,
            motivo: `sem destino no app (grupo-pai "${spec.pai}" ausente)`,
            valores: item.valores,
          });
        }
        continue;
      }
      destino = {
        tipo: 'criar',
        nome: spec.nome,
        type: spec.type,
        paiGroupId: pai.id,
        paiNome: pai.name,
      };
    } else {
      avisos.push(
        `seção "${secao.nome}": grupo "${spec.nome}" não encontrado no fluxo de caixa — seção ignorada`,
      );
      for (const item of secao.itens) {
        ignorados.push({
          linha: item.linha,
          label: item.label,
          motivo: `sem destino no app (grupo "${spec.nome}" ausente)`,
          valores: item.valores,
        });
      }
      continue;
    }

    const itensPlano: FlcItemPlano[] = [];
    for (const item of secao.itens) {
      const temValor = item.valores.some((v) => v !== null);
      const itemApp =
        destino.tipo === 'existente'
          ? ((grupoApp as CashflowGroup).items.find(
              (i) => !i.hidden && normalizeLabel(i.name) === normalizeLabel(item.label),
            ) ?? null)
          : null;

      if (itemApp?.objetivoId) {
        ignorados.push({
          linha: item.linha,
          label: item.label,
          motivo: 'linha vinculada a um sonho no app (somente leitura no fluxo de caixa)',
          valores: item.valores,
        });
        continue;
      }
      if (!temValor && !itemApp) {
        ignorados.push({
          linha: item.linha,
          label: item.label,
          motivo: 'sem valores preenchidos na planilha',
        });
        continue;
      }
      if (!temValor) continue; // item já existe no app e não traz valores: nada a fazer

      itensPlano.push(planejarItem(item, itemApp));
    }

    grupos.push({ chave: secao.chave, nomePlanilha: secao.nome, destino, itens: itensPlano });
  }

  const resumo: FlcImportResumo = {
    gruposNovos: grupos.filter((g) => g.destino.tipo === 'criar').length,
    itensNovos: grupos.reduce(
      (n, g) => n + g.itens.filter((i) => i.destino.tipo === 'criar').length,
      0,
    ),
    celulas: grupos.reduce((n, g) => n + g.itens.reduce((m, i) => m + i.escritas.length, 0), 0),
    conflitos: grupos.reduce((n, g) => n + g.itens.reduce((m, i) => m + i.conflitos.length, 0), 0),
    jaIguais: grupos.reduce((n, g) => n + g.itens.reduce((m, i) => m + i.jaIguais.length, 0), 0),
    ignorados: ignorados.length,
  };

  return { grupos, ignorados, avisos, resumo };
};
