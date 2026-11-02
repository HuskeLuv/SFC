/**
 * Migração das linhas padrão do Fluxo de Caixa para a planilha-base do Pedro de 30/10/2026
 * (decisões do Wellington em 02/11/2026). Puro: recebe o estado do banco e devolve o plano; o
 * script `scripts/cashflow/migrar-linhas-padrao-2026-11.ts` lê, grava e relata.
 *
 * Regras:
 * - Template (userId null): linha que continua → só ganha a posição nova; linha renomeada →
 *   muda o nome NO LUGAR (as cópias dos usuários guardam o nome próprio, então quem já tem dados
 *   continua vendo o nome antigo); linha nova → criada; linha que saiu → aposentada (apagada).
 *   O "porquê"/prioridade das linhas-template é limpo (a planilha-base não traz).
 * - Usuários com dados (as cópias): ganham as linhas novas (vazias); das cópias de linhas que
 *   saíram, as que têm qualquer dado (valor, comentário, transação do banco, orçado, vínculo)
 *   viram linhas do próprio usuário (sem templateId; se estavam ocultas, continuam ocultas) e as
 *   sem dados somem. Nenhum valor muda de linha.
 * - Clone legado (cópia sem templateId, casada pelo nome no grupo personalizado) de linha que
 *   saiu ou foi renomeada é vinculado antes, senão a árvore o perderia de vista no rename.
 * - Linha nova (ou nome novo) que colide, sem acento/caixa, com uma linha que o usuário já tem
 *   no grupo personalizado: se a do usuário é custom, ela vira a cópia da nova (some a
 *   duplicata); se já é cópia de outra linha padrão, a nova nasce oculta para esse usuário.
 *
 * Investimentos, Conta Corrente e Planejamento Financeiro ficam de fora (não mudaram).
 */
import type { LinhaTemplate } from '@/lib/cashflow/linhasPadrao';

/** Grupo-template → (nome antigo → nome novo). Só renomeações de mesmo significado. */
export const RENOMEAR_LINHAS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'Entradas Fixas': {
    Salário: 'Pró-labore / Salário 1',
    "Receita Proventos FII's": "Proventos FII's",
    Aluguéis: 'Aluguel 1',
  },
  Habitação: { 'Empregados/ Diaristas': 'Empregados / Diaristas' },
  Transporte: {
    'Prestação Moto/ Carro': 'Prestação Moto / Carro',
    'IPVA + Seguro Obrigatório Carro': 'IPVA + Licenciamento',
    'Ônibus (Buser)': 'Ônibus',
    Uber: 'Uber / Táxi',
    Metro: 'Metrô',
  },
  Saúde: { Medicamentos: 'Medicamentos / Farmácia', 'Seguro Vida': 'Seguro de Vida' },
  'Despesas Pessoais': { Roupas: 'Vestuário', 'Cuidados pessoais': 'Higiene pessoal' },
  Impostos: { 'Outros impostos': 'Outros' },
  'Despesas Empresa': {
    'Administrativas/Operacionais': 'Administrativas / Operacionais',
    'Taxas, Alvarás, Etc.': 'Taxas e Alvarás',
  },
};

export const GRUPOS_FORA_DA_MIGRACAO = new Set([
  'Investimentos',
  'Conta Corrente',
  'Planejamento Financeiro',
]);

/** Mesma normalização da unicidade de nome do Orçamento v2 (sem acento/caixa, barra espaçada). */
export const normalizarNomeLinha = (nome: string): string =>
  nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim();

// ─── Entrada ────────────────────────────────────────────────────────────────────────────────

export interface GrupoTemplateIn {
  id: string;
  name: string;
}

export interface ItemTemplateIn {
  id: string;
  groupId: string;
  name: string;
  orderIndex: number;
  significado: string | null;
  rank: string | null;
}

export interface GrupoUsuarioIn {
  id: string;
  userId: string;
  templateId: string | null;
}

export interface ItemUsuarioIn {
  id: string;
  userId: string;
  groupId: string;
  templateId: string | null;
  name: string;
  hidden: boolean;
  /** valores (inclusive só comentário/cor), transações do banco, orçados, espelho ou Geral */
  temDados: boolean;
  /** espelho de sonho/dívida ou Geral do Orçamento v2: nunca vira cópia de linha padrão */
  espelhoOuGeral: boolean;
}

export interface EstadoMigracao {
  gruposTemplate: GrupoTemplateIn[];
  itensTemplate: ItemTemplateIn[];
  gruposUsuario: GrupoUsuarioIn[];
  itensUsuario: ItemUsuarioIn[];
}

// ─── Plano ──────────────────────────────────────────────────────────────────────────────────

/** Linha-template do plano: id existente ou a chave `grupo|nome` de uma linha a criar. */
export type RefTemplate = { id: string } | { criar: string };

export interface PlanoMigracao {
  renomear: { id: string; grupo: string; de: string; para: string }[];
  criar: { chave: string; grupo: string; groupId: string; name: string; orderIndex: number }[];
  /** linhas-template que continuam (inclusive as renomeadas): posição nova e porquê limpo */
  atualizar: { id: string; orderIndex: number; limparPorque: boolean }[];
  aposentar: { id: string; grupo: string; name: string }[];
  vincularLegado: { itemId: string; userId: string; templateId: string }[];
  /** cópia de linha que saiu, com dados → linha do usuário (a oculta continua oculta) */
  desvincular: { itemId: string; userId: string; name: string; templateId: string }[];
  /** cópia de linha que saiu, sem dados → apagada */
  apagar: { itemId: string; userId: string; name: string; hidden: boolean; templateId: string }[];
  /** custom do usuário que vira a cópia de uma linha nova/renomeada de mesmo nome */
  adotar: { itemId: string; userId: string; template: RefTemplate; name: string }[];
  /** linha nova/renomeada que nasce oculta para o usuário (colide com outra cópia dele) */
  ocultar: { userId: string; userGroupId: string; template: RefTemplate; name: string }[];
  avisos: string[];
}

export const chaveLinha = (grupo: string, nome: string) => `${grupo}|${nome}`;

export function planejarMigracao(
  estado: EstadoMigracao,
  desejado: Readonly<Record<string, readonly LinhaTemplate[]>>,
): PlanoMigracao {
  const plano: PlanoMigracao = {
    renomear: [],
    criar: [],
    atualizar: [],
    aposentar: [],
    vincularLegado: [],
    desvincular: [],
    apagar: [],
    adotar: [],
    ocultar: [],
    avisos: [],
  };

  const grupoPorNome = new Map<string, GrupoTemplateIn>();
  for (const g of estado.gruposTemplate) {
    if (grupoPorNome.has(g.name)) plano.avisos.push(`grupo-template duplicado: ${g.name}`);
    grupoPorNome.set(g.name, g);
  }
  const itensTplPorGrupo = new Map<string, ItemTemplateIn[]>();
  for (const it of estado.itensTemplate) {
    const lista = itensTplPorGrupo.get(it.groupId) ?? [];
    lista.push(it);
    itensTplPorGrupo.set(it.groupId, lista);
  }

  // Template: o que continua, o que é renomeado, o que sai, o que nasce.
  const aposentados = new Map<string, ItemTemplateIn>();
  const renomeados = new Map<string, ItemTemplateIn>();
  /** por grupo-template: linhas que passam a existir com nome novo (renomeadas ou criadas) */
  const nomesNovos: { grupoId: string; grupo: string; ref: RefTemplate; name: string }[] = [];

  for (const [grupo, linhas] of Object.entries(desejado)) {
    if (GRUPOS_FORA_DA_MIGRACAO.has(grupo)) continue;
    const g = grupoPorNome.get(grupo);
    if (!g) {
      plano.avisos.push(`grupo-template ausente no banco: ${grupo} (pulado)`);
      continue;
    }
    const atuais = itensTplPorGrupo.get(g.id) ?? [];
    const atualPorNome = new Map(atuais.map((i) => [i.name, i]));
    const posicao = new Map(linhas.map((l) => [l.name, l.orderIndex]));
    const renomes = RENOMEAR_LINHAS[grupo] ?? {};
    const cobertos = new Set<string>();

    for (const atual of atuais) {
      if (posicao.has(atual.name) && !cobertos.has(atual.name)) {
        cobertos.add(atual.name);
        plano.atualizar.push({
          id: atual.id,
          orderIndex: posicao.get(atual.name)!,
          limparPorque: atual.significado !== null || atual.rank !== null,
        });
        continue;
      }
      const para = renomes[atual.name];
      if (para && posicao.has(para) && !cobertos.has(para) && !atualPorNome.has(para)) {
        cobertos.add(para);
        renomeados.set(atual.id, atual);
        plano.renomear.push({ id: atual.id, grupo, de: atual.name, para });
        plano.atualizar.push({
          id: atual.id,
          orderIndex: posicao.get(para)!,
          limparPorque: atual.significado !== null || atual.rank !== null,
        });
        nomesNovos.push({ grupoId: g.id, grupo, ref: { id: atual.id }, name: para });
        continue;
      }
      aposentados.set(atual.id, atual);
      plano.aposentar.push({ id: atual.id, grupo, name: atual.name });
    }

    for (const l of linhas) {
      if (cobertos.has(l.name)) continue;
      cobertos.add(l.name);
      const chave = chaveLinha(grupo, l.name);
      plano.criar.push({ chave, grupo, groupId: g.id, name: l.name, orderIndex: l.orderIndex });
      nomesNovos.push({ grupoId: g.id, grupo, ref: { criar: chave }, name: l.name });
    }
  }

  // Usuários: índices.
  const overrideDoGrupo = new Map<string, GrupoUsuarioIn>(); // `${userId}|${templateGroupId}`
  for (const g of estado.gruposUsuario) {
    if (g.templateId) overrideDoGrupo.set(`${g.userId}|${g.templateId}`, g);
  }
  const itensPorGrupoUsuario = new Map<string, ItemUsuarioIn[]>();
  const copiaPorTemplate = new Map<string, ItemUsuarioIn>(); // `${userId}|${templateId}`
  for (const it of estado.itensUsuario) {
    const lista = itensPorGrupoUsuario.get(it.groupId) ?? [];
    lista.push(it);
    itensPorGrupoUsuario.set(it.groupId, lista);
    if (it.templateId) copiaPorTemplate.set(`${it.userId}|${it.templateId}`, it);
  }
  const usuarios = [...new Set(estado.gruposUsuario.map((g) => g.userId))];
  // Grupo do usuário sem templateId é clone antigo casado pela árvore só pelo caminho de nomes:
  // fica fora da migração (em prod, 02/11/2026: nenhum). Avisa para a simulação mostrar.
  const semVinculo = estado.gruposUsuario.filter((g) => !g.templateId);
  if (semVinculo.length > 0) {
    const n = new Set(semVinculo.map((g) => g.userId)).size;
    plano.avisos.push(
      `${semVinculo.length} grupo(s) de ${n} usuário(s) sem templateId (clone antigo, casado por nome): fora da migração`,
    );
  }
  /** templateId efetivo depois do vínculo de legados */
  const templateEfetivo = new Map<string, string | null>(
    estado.itensUsuario.map((i) => [i.id, i.templateId]),
  );

  // 1) Vincular clones legados das linhas que saem ou mudam de nome.
  for (const tpl of [...aposentados.values(), ...renomeados.values()]) {
    for (const userId of usuarios) {
      if (copiaPorTemplate.has(`${userId}|${tpl.id}`)) continue;
      const og = overrideDoGrupo.get(`${userId}|${tpl.groupId}`);
      if (!og) continue;
      const legado = (itensPorGrupoUsuario.get(og.id) ?? []).find(
        (i) => templateEfetivo.get(i.id) === null && i.name === tpl.name,
      );
      if (!legado) continue;
      templateEfetivo.set(legado.id, tpl.id);
      copiaPorTemplate.set(`${userId}|${tpl.id}`, legado);
      plano.vincularLegado.push({ itemId: legado.id, userId, templateId: tpl.id });
    }
  }

  // 2) Cópias das linhas que saem: com dados ficam (sem templateId; oculta continua oculta, e a
  //    árvore não mostra custom oculto); sem dados somem.
  const saindo = new Set<string>();
  for (const it of estado.itensUsuario) {
    const tid = templateEfetivo.get(it.id);
    if (!tid || !aposentados.has(tid)) continue;
    if (it.temDados) {
      plano.desvincular.push({ itemId: it.id, userId: it.userId, name: it.name, templateId: tid });
      templateEfetivo.set(it.id, null);
    } else {
      saindo.add(it.id);
      plano.apagar.push({
        itemId: it.id,
        userId: it.userId,
        name: it.name,
        hidden: it.hidden,
        templateId: tid,
      });
    }
  }

  // 3) Nome novo que colide com linha que o usuário já tem no grupo personalizado.
  const adotados = new Set<string>();
  for (const novo of nomesNovos) {
    const alvo = normalizarNomeLinha(novo.name);
    for (const userId of usuarios) {
      const og = overrideDoGrupo.get(`${userId}|${novo.grupoId}`);
      if (!og) continue;
      if ('id' in novo.ref && copiaPorTemplate.has(`${userId}|${novo.ref.id}`)) continue;
      const colide = (itensPorGrupoUsuario.get(og.id) ?? []).find(
        (i) =>
          !i.hidden &&
          !saindo.has(i.id) &&
          !adotados.has(i.id) &&
          normalizarNomeLinha(i.name) === alvo,
      );
      if (!colide) continue;
      if (templateEfetivo.get(colide.id) === null && !colide.espelhoOuGeral) {
        adotados.add(colide.id);
        plano.adotar.push({ itemId: colide.id, userId, template: novo.ref, name: colide.name });
      } else {
        plano.ocultar.push({ userId, userGroupId: og.id, template: novo.ref, name: novo.name });
      }
    }
  }

  return plano;
}
