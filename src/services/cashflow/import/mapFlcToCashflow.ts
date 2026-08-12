import type { CashflowGroup, CashflowItem } from '@/types/cashflow';
import { canonicalName } from '@/services/cashflow/groupMatchers';
import { snapParaLegenda } from './flcCellColors';
import {
  normalizeLabel,
  type FlcIgnorado,
  type FlcItem,
  type FlcParseResult,
  type FlcSecao,
  type FlcSecaoChave,
} from './parseFlcXlsx';

/**
 * Mapper puro: IR da planilha (parseFlcXlsx) + árvore mesclada do usuário
 * (getMergedCashflowGroups, já filtrada pelo ano-alvo) → plano de importação.
 * Não toca em Prisma; o commit executa o plano, o preview só o exibe.
 *
 * Regras (docs/plano-importacao-planilha-flc.md §3-§4):
 * - Grupo destino identificado por nome canônico (templateName, estável a
 *   renomes) normalizado. O import NUNCA cria grupos: as seções da planilha
 *   sem correspondente no template (§4.1, decisão 31/07/2026) são descartadas
 *   ou realocadas item a item — só correspondência DIRETA aloca; o resto é
 *   ignorado com motivo.
 * - Item casa por nome normalizado dentro do grupo; sem match → criação de
 *   item custom (leva significado/rank); com match → só grava valores, sem
 *   sobrescrever significado/rank pré-existentes.
 * - Célula a célula: sem valor no app → escrita; igual (2 casas) → nada a
 *   fazer; diferente → conflito (política escolhida no commit).
 * - Linha-espelho de sonho (objetivoId) é somente-leitura → ignorada.
 */

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

export interface FlcComentarioPlano {
  mes: number;
  texto: string;
  /** comentário já existente na célula do app (null = célula sem comentário) */
  textoApp: string | null;
}

export interface FlcCorPlano {
  mes: number;
  /** cor JÁ encaixada na legenda do app (CSS hex) */
  cor: string;
  /** cor já existente na célula do app (null = sem cor) */
  corApp: string | null;
}

export interface FlcItemPlano {
  linha: number;
  label: string;
  destino:
    | {
        tipo: 'existente';
        itemId: string;
        nome: string;
        /**
         * "O SEU PORQUÊ"/rank da planilha a gravar no item — só preenchidos
         * quando o item do app está VAZIO nesses campos (nunca sobrescreve).
         * Report 10/08 (bug #1): antes o significado só chegava em itens
         * CRIADOS; item existente sem significado nunca recebia o da planilha.
         */
        significado?: string | null;
        rank?: string | null;
      }
    | { tipo: 'criar'; significado: string | null; rank: string | null };
  escritas: FlcEscrita[];
  conflitos: FlcConflito[];
  /** meses cujo valor no app já é o da planilha (nada a fazer) */
  jaIguais: number[];
  /** comentários de célula da planilha a importar (idênticos ao app são omitidos) */
  comentarios: FlcComentarioPlano[];
  /** cores de texto da planilha a importar, já na legenda (idênticas omitidas) */
  cores: FlcCorPlano[];
}

export interface FlcGrupoPlano {
  chave: FlcSecaoChave;
  nomePlanilha: string;
  destino: { groupId: string; nome: string };
  itens: FlcItemPlano[];
}

export interface FlcImportResumo {
  itensNovos: number;
  celulas: number;
  conflitos: number;
  jaIguais: number;
  ignorados: number;
  comentarios: number;
  cores: number;
}

export interface FlcImportPlan {
  grupos: FlcGrupoPlano[];
  ignorados: FlcIgnorado[];
  avisos: string[];
  resumo: FlcImportResumo;
}

/** seção da planilha → grupo do app (nomes canônicos do template/seed) */
const DESTINOS: Partial<Record<FlcSecaoChave, string>> = {
  'entradas-fixas': 'Entradas Fixas',
  'sem-tributacao': 'Sem Tributação',
  'com-tributacao': 'Com Tributação',
  habitacao: 'Habitação',
  transporte: 'Transporte',
  saude: 'Saúde',
  'despesas-pessoais': 'Despesas Pessoais',
  lazer: 'Lazer',
  educacao: 'Educação',
  'animais-estimacao': 'Animais de Estimação',
  impostos: 'Impostos',
  // grupo template desde 05/08/2026 — antes era realocação item a item (§4.1)
  'despesas-dependentes': 'Despesas com Dependentes',
  'despesas-empresa': 'Despesas Empresa',
  'despesas-temporarias': 'Despesas Variáveis',
  'conta-corrente': 'Conta Corrente',
};

// ---------------------------------------------------------------------------
// §4.1 — seções da planilha sem correspondente no template (decisão 31/07/2026):
// nada de grupo custom. "Despesas Financeiras" é descartada inteira;
// "Receita Investimentos" realoca APENAS os itens com correspondência direta
// no template, renomeando para o nome do item de destino; o resto é ignorado
// com motivo. ("Despesas com dependentes" saiu deste regime em 05/08/2026 —
// virou grupo template próprio, ver DESTINOS.)
// ---------------------------------------------------------------------------

const SECAO_DESCARTADA: Partial<Record<FlcSecaoChave, string>> = {
  'despesas-financeiras':
    'seção "Despesas Financeiras" descartada no import (sem correspondente no app; decisão 31/07/2026)',
};

interface RemapAlvo {
  /** seção-destino (chave do parser) cujo grupo do app receberá o item */
  secao: FlcSecaoChave;
  /** nome do item no template — o item é renomeado para casar com ele */
  item: string;
}

const REMAP_ITENS: Partial<Record<FlcSecaoChave, Record<string, RemapAlvo>>> = {
  'receita-investimentos': {
    'proventos fii s': { secao: 'entradas-fixas', item: "Receita Proventos FII's" },
  },
};

/** motivos específicos por item (normalizado) para os não-realocados */
const MOTIVOS_ITEM: Partial<Record<FlcSecaoChave, Record<string, string>>> = {
  'receita-investimentos': {
    'dividendos jcp': 'automático no app (proventos da carteira)',
    'juros renda fixa':
      'sem correspondência direta (o app separa Receita Renda Fixa em Pré/Pós/Híbridos)',
  },
};

/** rótulo exibido quando a seção-destino não existe na planilha do cliente */
const NOME_SECAO_SINTETICA: Partial<Record<FlcSecaoChave, string>> = {
  'entradas-fixas': 'Entradas Fixas',
};

const somarValores = (a: (number | null)[], b: (number | null)[]): (number | null)[] =>
  a.map((v, m) => {
    const o = b[m] ?? null;
    if (o === null) return v;
    return (v ?? 0) + o;
  });

/** merge mês a mês dos comentários de linhas somadas (homônimos/realocação) */
const mesclarComentarios = (a: (string | null)[], b: (string | null)[]): (string | null)[] =>
  a.map((c, m) => {
    const o = b[m] ?? null;
    if (o === null) return c;
    return c === null ? o : `${c}\n${o}`;
  });

/** merge de cores de linhas somadas: primeira cor não-nula do mês vence */
const mesclarCores = (a: (string | null)[], b: (string | null)[]): (string | null)[] =>
  a.map((c, m) => c ?? b[m] ?? null);

/**
 * Pré-passe puro: aplica as decisões §4.1 sobre o IR antes do mapeamento —
 * descarta/realoca as seções sem correspondente no template. Não muta a entrada.
 */
const aplicarDecisoes411 = (parse: FlcParseResult): FlcParseResult => {
  const secoes: FlcSecao[] = [];
  const ignorados: FlcIgnorado[] = [...parse.ignorados];
  const avisos: string[] = [...parse.avisos];
  const realocados: {
    item: FlcItem;
    labelOriginal: string;
    secaoOriginal: string;
    alvo: RemapAlvo;
  }[] = [];

  for (const secao of parse.secoes) {
    const motivoDescarte = SECAO_DESCARTADA[secao.chave];
    if (motivoDescarte) {
      for (const item of secao.itens) {
        ignorados.push({
          linha: item.linha,
          label: item.label,
          motivo: motivoDescarte,
          valores: item.valores,
        });
      }
      continue;
    }

    const remap = REMAP_ITENS[secao.chave];
    if (remap) {
      const motivos = MOTIVOS_ITEM[secao.chave] ?? {};
      for (const item of secao.itens) {
        const norm = normalizeLabel(item.label);
        const alvo = remap[norm];
        if (alvo) {
          realocados.push({
            item: { ...item, label: alvo.item },
            labelOriginal: item.label,
            secaoOriginal: secao.nome,
            alvo,
          });
        } else {
          ignorados.push({
            linha: item.linha,
            label: item.label,
            motivo:
              motivos[norm] ??
              `seção "${secao.nome}" não existe no app — item sem correspondência direta`,
            valores: item.valores,
          });
        }
      }
      continue;
    }

    secoes.push({ ...secao, itens: [...secao.itens] });
  }

  for (const r of realocados) {
    let alvoSecao = secoes.find((s) => s.chave === r.alvo.secao);
    if (!alvoSecao) {
      alvoSecao = {
        chave: r.alvo.secao,
        nome: NOME_SECAO_SINTETICA[r.alvo.secao] ?? r.alvo.item,
        linha: r.item.linha,
        itens: [],
      };
      secoes.push(alvoSecao);
    }
    const idx = alvoSecao.itens.findIndex(
      (i) => normalizeLabel(i.label) === normalizeLabel(r.alvo.item),
    );
    if (idx >= 0) {
      // a planilha também preenche o item na seção-destino: soma mês a mês
      // (alocação sem perda) e avisa no preview
      const existente = alvoSecao.itens[idx];
      alvoSecao.itens[idx] = {
        ...existente,
        valores: somarValores(existente.valores, r.item.valores),
        comentarios: mesclarComentarios(existente.comentarios, r.item.comentarios),
        cores: mesclarCores(existente.cores, r.item.cores),
      };
      if (r.item.valores.some((v) => v !== null)) {
        avisos.push(
          `linha ${r.item.linha} ("${r.labelOriginal}", seção "${r.secaoOriginal}") somada a "${existente.label}" em ${alvoSecao.nome} — mesmo destino no app`,
        );
      }
    } else {
      alvoSecao.itens.push(r.item);
      if (r.item.valores.some((v) => v !== null)) {
        avisos.push(
          `linha ${r.item.linha} ("${r.labelOriginal}", seção "${r.secaoOriginal}") realocada para "${r.alvo.item}" em ${alvoSecao.nome}`,
        );
      }
    }
  }

  return { secoes, ignorados, avisos };
};

// ---------------------------------------------------------------------------
// mapeamento
// ---------------------------------------------------------------------------

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

/** busca por nome canônico normalizado; nome exibido cobre grupos custom */
const findGroup = (index: GrupoIndexado[], nome: string): CashflowGroup | null => {
  const alvo = normalizeLabel(nome);
  const hit = index.find((e) => e.norm === alvo || normalizeLabel(e.group.name) === alvo);
  return hit ? hit.group : null;
};

/**
 * Cor de texto DOMINANTE da planilha = tinta padrão de digitação, não status.
 * O modelo FLC formata TODAS as células de entrada com fonte azul (#0000FF);
 * os status da legenda são os desvios esparsos por cima (vermelho=Pago etc.).
 * Verificado nos arquivos reais (10/08/2026): template 2016/2016 azul; cópia
 * de cliente 1890 azul + 98 vermelho + 28 cartão. Sem este filtro o import
 * pintaria a planilha inteira de "Lançamento Futuro".
 */
const MIN_CELULAS_PARA_DOMINANTE = 24;
const FRACAO_DOMINANTE = 0.5;

const detectarCorPadraoPlanilha = (
  secoes: FlcSecao[],
): { corPadrao: string | null; ocorrencias: number; total: number } => {
  const contagem = new Map<string, number>();
  let total = 0;
  for (const secao of secoes) {
    for (const item of secao.itens) {
      for (const hex of item.cores) {
        if (hex === null) continue;
        const cor = snapParaLegenda(hex);
        if (cor === null) continue;
        total += 1;
        contagem.set(cor, (contagem.get(cor) ?? 0) + 1);
      }
    }
  }
  if (total < MIN_CELULAS_PARA_DOMINANTE) return { corPadrao: null, ocorrencias: 0, total };
  for (const [cor, n] of contagem) {
    if (n / total >= FRACAO_DOMINANTE) return { corPadrao: cor, ocorrencias: n, total };
  }
  return { corPadrao: null, ocorrencias: 0, total };
};

const planejarItem = (
  item: FlcItem,
  existente: CashflowItem | null,
  corPadraoPlanilha: string | null,
): FlcItemPlano => {
  const escritas: FlcEscrita[] = [];
  const conflitos: FlcConflito[] = [];
  const jaIguais: number[] = [];
  const comentarios: FlcComentarioPlano[] = [];
  const cores: FlcCorPlano[] = [];

  const valoresApp = new Map<number, number>();
  const comentariosApp = new Map<number, string>();
  const coresApp = new Map<number, string>();
  if (existente) {
    for (const v of existente.values ?? []) {
      valoresApp.set(v.month, v.value);
      if (v.comment?.trim()) comentariosApp.set(v.month, v.comment.trim());
      if (v.color?.trim()) coresApp.set(v.month, v.color.trim().toUpperCase());
    }
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

  item.comentarios.forEach((texto, mes) => {
    if (texto === null) return;
    const app = comentariosApp.get(mes) ?? null;
    if (app === texto) return; // já igual: nada a fazer
    comentarios.push({ mes, texto, textoApp: app });
  });

  // Cor de texto da planilha → legenda do app (report 10/08, item 4): snap na
  // cor mais próxima da legenda; igual à do app é omitida, divergente segue a
  // mesma política de conflito dos valores.
  item.cores.forEach((hex, mes) => {
    if (hex === null) return;
    const cor = snapParaLegenda(hex);
    if (cor === null) return;
    if (cor === corPadraoPlanilha) return; // tinta de digitação, não status
    const app = coresApp.get(mes) ?? null;
    if (app === cor) return;
    cores.push({ mes, cor, corApp: app });
  });

  return {
    linha: item.linha,
    label: item.label,
    destino: existente
      ? {
          tipo: 'existente',
          itemId: existente.id,
          nome: existente.name,
          significado: !existente.significado?.trim() && item.significado ? item.significado : null,
          rank: !existente.rank?.trim() && item.rank !== null ? String(item.rank) : null,
        }
      : {
          tipo: 'criar',
          significado: item.significado,
          rank: item.rank !== null ? String(item.rank) : null,
        },
    escritas,
    conflitos,
    jaIguais,
    comentarios,
    cores,
  };
};

export const mapFlcToCashflow = (
  parseOriginal: FlcParseResult,
  arvore: CashflowGroup[],
): FlcImportPlan => {
  const parse = aplicarDecisoes411(parseOriginal);

  const grupos: FlcGrupoPlano[] = [];
  const ignorados: FlcIgnorado[] = [...parse.ignorados];
  const avisos: string[] = [...parse.avisos];

  const { corPadrao, ocorrencias, total } = detectarCorPadraoPlanilha(parse.secoes);
  if (corPadrao) {
    avisos.push(
      `cor de texto padrão da planilha detectada (${corPadrao} em ${ocorrencias} de ${total} células) — tratada como tinta de digitação, não como status; apenas as demais cores da legenda são importadas`,
    );
  }

  const index = flattenGroups(arvore);
  const chavesVistas = new Set<FlcSecaoChave>();

  for (const secao of parse.secoes) {
    if (chavesVistas.has(secao.chave)) {
      avisos.push(
        `seção "${secao.nome}" (linha ${secao.linha}) aparece mais de uma vez na planilha — ocorrências repetidas foram mescladas no mesmo destino`,
      );
    }
    chavesVistas.add(secao.chave);

    const nomeGrupo = DESTINOS[secao.chave];
    const grupoApp = nomeGrupo ? findGroup(index, nomeGrupo) : null;
    if (!grupoApp) {
      avisos.push(
        `seção "${secao.nome}": grupo "${nomeGrupo ?? secao.nome}" não encontrado no fluxo de caixa — seção ignorada`,
      );
      for (const item of secao.itens) {
        ignorados.push({
          linha: item.linha,
          label: item.label,
          motivo: `sem destino no app (grupo "${nomeGrupo ?? secao.nome}" ausente)`,
          valores: item.valores,
        });
      }
      continue;
    }

    // Itens homônimos na mesma seção (ex.: 3 linhas "Banco" na Conta Corrente,
    // vários "Outros"): no app viram UM item, então os meses são SOMADOS —
    // upsert por nome sobrescreveria o primeiro valor silenciosamente.
    const itensMesclados: FlcItem[] = [];
    const posPorLabel = new Map<string, number>();
    for (const item of secao.itens) {
      const norm = normalizeLabel(item.label);
      const pos = posPorLabel.get(norm);
      if (pos === undefined) {
        posPorLabel.set(norm, itensMesclados.length);
        itensMesclados.push(item);
        continue;
      }
      const base = itensMesclados[pos];
      itensMesclados[pos] = {
        ...base,
        valores: somarValores(base.valores, item.valores),
        comentarios: mesclarComentarios(base.comentarios, item.comentarios),
        cores: mesclarCores(base.cores, item.cores),
      };
      if (item.valores.some((v) => v !== null)) {
        avisos.push(
          `linha ${item.linha} ("${item.label}") somada à linha ${base.linha} — itens homônimos em "${secao.nome}"`,
        );
      }
    }

    const itensPlano: FlcItemPlano[] = [];
    for (const item of itensMesclados) {
      const temValor = item.valores.some((v) => v !== null);
      const temComentario = item.comentarios.some((c) => c !== null);
      const temCor = item.cores.some((c) => {
        if (c === null) return false;
        const cor = snapParaLegenda(c);
        return cor !== null && cor !== corPadrao;
      });
      const itemApp =
        grupoApp.items.find(
          (i) => !i.hidden && normalizeLabel(i.name) === normalizeLabel(item.label),
        ) ?? null;

      if (itemApp?.objetivoId) {
        ignorados.push({
          linha: item.linha,
          label: item.label,
          motivo: 'linha vinculada a um sonho no app (somente leitura no fluxo de caixa)',
          valores: item.valores,
        });
        continue;
      }
      if (itemApp?.dividaId) {
        ignorados.push({
          linha: item.linha,
          label: item.label,
          motivo: 'linha vinculada a uma dívida no app (somente leitura no fluxo de caixa)',
          valores: item.valores,
        });
        continue;
      }
      if (!temValor && !temComentario && !temCor && !itemApp) {
        ignorados.push({
          linha: item.linha,
          label: item.label,
          motivo: 'sem valores preenchidos na planilha',
        });
        continue;
      }
      // "O SEU PORQUÊ"/rank da planilha preenchendo item existente vazio conta
      // como trabalho a fazer — linha só de significado entrava aqui e o texto
      // se perdia (report 10/08, bug #1).
      const preencheMetadados =
        !!itemApp &&
        ((!itemApp.significado?.trim() && !!item.significado) ||
          (!itemApp.rank?.trim() && item.rank !== null));
      // item já existe no app e não traz valores, comentários, cores nem metadados
      if (!temValor && !temComentario && !temCor && !preencheMetadados) continue;

      itensPlano.push(planejarItem(item, itemApp, corPadrao));
    }

    grupos.push({
      chave: secao.chave,
      nomePlanilha: secao.nome,
      destino: { groupId: grupoApp.id, nome: grupoApp.name },
      itens: itensPlano,
    });
  }

  const resumo: FlcImportResumo = {
    itensNovos: grupos.reduce(
      (n, g) => n + g.itens.filter((i) => i.destino.tipo === 'criar').length,
      0,
    ),
    celulas: grupos.reduce((n, g) => n + g.itens.reduce((m, i) => m + i.escritas.length, 0), 0),
    conflitos: grupos.reduce((n, g) => n + g.itens.reduce((m, i) => m + i.conflitos.length, 0), 0),
    jaIguais: grupos.reduce((n, g) => n + g.itens.reduce((m, i) => m + i.jaIguais.length, 0), 0),
    ignorados: ignorados.length,
    comentarios: grupos.reduce(
      (n, g) => n + g.itens.reduce((m, i) => m + i.comentarios.length, 0),
      0,
    ),
    cores: grupos.reduce((n, g) => n + g.itens.reduce((m, i) => m + i.cores.length, 0), 0),
  };

  return { grupos, ignorados, avisos, resumo };
};
