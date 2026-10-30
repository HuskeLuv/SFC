/**
 * Plano PURO do import do Bacen no catálogo de instituições (ClickUp 86e2xqh69): dado o catálogo
 * atual, o IF.data Cadastro e a lista do STR, diz o que criar, o que preencher em cada linha
 * existente e o que precisa de revisão humana. Não lê nem grava banco: o script
 * scripts/instituicoes/importar-bacen.ts aplica.
 *
 * Regras:
 * - Nunca sobrescreve campo preenchido; valor diferente vai para `conflitos`.
 * - Nunca muda nome, status nem codigo de linha existente.
 * - CNPJ preenchido só via cnpjMatriz(raiz), com cnpjCalculado=true.
 * - Casamento de linha existente, em ordem: (d) mapa manual {codigo: raiz | 'NAO_EMISSOR'};
 *   (a) cnpj com raiz no IF.data (nome de corretora + raiz de emissor sem nome em comum →
 *   `ambiguos`: cnpj errado no seed); codigo 'BCB-<raiz>' (linha criada por um import anterior);
 *   (b) codigo COMPE de 3 dígitos → STR → raiz, com um token forte do nome em comum (marca de
 *   corretora no nome + Tcb B1/B2 → `ambiguos`); (c) nome normalizado idêntico ao de exatamente
 *   um registro.
 * - Raiz já casada não gera linha nova; as demais ativas viram 'BCB-<raiz>'.
 * - Linhas que sobram sem casamento com prefixo não emissor (COR-, PREV-, INT-, ...), nome de
 *   corretora ou nome 'Reserva' recebem tipoBacen='NAO_EMISSOR' (só se o tipo for nulo).
 * - Rodar de novo sobre o resultado não muda nada.
 */
import {
  CODIGO_PREFIXOS_NAO_EMISSOR,
  TIPOS_BACEN_EMISSORES,
  TIPO_BACEN_NAO_EMISSOR,
} from '@/lib/fgc/produtosCobertos';
import { cnpjMatriz, cnpjRaiz } from '@/lib/instituicoes/cnpj';
import {
  NOME_DE_CORRETORA,
  normalizarBusca,
  normalizarNomeInstituicao,
} from '@/lib/instituicoes/normalizarNome';
import { APELIDOS_POR_RAIZ, frasesDeApelido, juntarApelidos } from './apelidos';
import type { RegistroBacen } from './ifdataCadastro';
import type { ParticipanteStr } from './participantesStr';

/** Linha do catálogo atual (tabela institutions). */
export interface InstituicaoCatalogo {
  id: string;
  codigo: string;
  nome: string;
  cnpj: string | null;
  tipoBacen: string | null;
  conglomeradoBacen: string | null;
  apelidos: string | null;
  cnpjCalculado: boolean;
}

/** Mapa manual revisado com o Wellington: codigo da linha → raiz (8 dígitos) ou 'NAO_EMISSOR'. */
export type MapaManual = Record<string, string>;

export interface EntradaPlano {
  existentes: readonly InstituicaoCatalogo[];
  registros: readonly RegistroBacen[];
  participantes: ReadonlyMap<string, ParticipanteStr>;
  mapaManual?: MapaManual;
  apelidosPorRaiz?: Readonly<Record<string, readonly string[]>>;
}

export interface LinhaNova {
  codigo: string;
  nome: string;
  cnpj: string;
  cnpjCalculado: true;
  tipoBacen: string;
  conglomeradoBacen: string | null;
  apelidos: string | null;
  status: 'ATIVA';
}

export interface Preenchimento {
  id: string;
  codigo: string;
  nome: string;
  valor: string;
}

export interface PreenchimentoApelidos {
  id: string;
  codigo: string;
  nome: string;
  antes: string | null;
  depois: string;
}

export type RegraCasamento = 'mapa' | 'cnpj' | 'codigo-bcb' | 'compe' | 'nome';

export interface Casamento {
  id: string;
  codigo: string;
  nome: string;
  raiz: string;
  regra: RegraCasamento;
  nomeBacen: string | null;
  tcb: string | null;
  /** Nome da linha tem token forte em comum com o do Bacen (false = conferir no relatório). */
  nomeEmComum: boolean;
}

export interface Conflito {
  id: string;
  codigo: string;
  nome: string;
  campo: 'cnpj' | 'tipoBacen' | 'conglomeradoBacen';
  atual: string;
  bacen: string;
  raiz: string;
}

export interface Ambiguo {
  id: string;
  codigo: string;
  nome: string;
  motivo: string;
  raizes: string[];
}

export interface MarcaNaoEmissor {
  id: string;
  codigo: string;
  nome: string;
  motivo: 'mapa' | 'prefixo' | 'nome-corretora' | 'reserva';
}

export interface CandidatoDuplicata {
  id: string | null;
  codigo: string;
  nome: string;
  motivo: 'nome-contido' | 'tokens';
  tokens: string[];
}

export interface PossivelDuplicata {
  id: string;
  codigo: string;
  nome: string;
  candidatos: CandidatoDuplicata[];
  totalCandidatos: number;
}

export interface PlanoImportacao {
  criar: LinhaNova[];
  preencherCnpj: Preenchimento[];
  preencherTipo: Preenchimento[];
  preencherConglomerado: Preenchimento[];
  preencherApelidos: PreenchimentoApelidos[];
  marcarNaoEmissor: MarcaNaoEmissor[];
  conflitos: Conflito[];
  ambiguos: Ambiguo[];
  possiveisDuplicatas: PossivelDuplicata[];
  casamentos: Casamento[];
  /** Raízes do mapa de apelidos sem registro ativo no IF.data (conferir à mão). */
  apelidosSemRegistro: string[];
  resumo: {
    registrosBacen: number;
    existentes: number;
    casados: number;
    casadosPorRegra: Record<RegraCasamento, number>;
    criar: number;
    criarPorTipo: Record<string, number>;
    preencherCnpj: number;
    preencherTipo: number;
    preencherConglomerado: number;
    preencherApelidos: number;
    marcarNaoEmissor: number;
    conflitos: number;
    ambiguos: number;
    possiveisDuplicatas: number;
    totalMudancas: number;
  };
}

/** Palavras que não identificam uma instituição (tipo societário, ramo, geografia genérica). */
const PALAVRAS_FRACAS = new Set(
  (
    'a o e de do da dos das em na no the of and sa ltda me epp cia companhia banco bank ' +
    'brasil brasileiro brazil br multiplo comercial central cooperativa cooperativas coop ' +
    'credito mutuo economia livre admissao associados servidores funcionarios financeira ' +
    'financeiro financeiros financiamento financas investimento investimentos invest ctvm ' +
    'dtvm cctvm corretora distribuidora titulos valores mobiliarios cambio instituicao ' +
    'pagamento pagamentos ip sociedade scfi cfi scd servicos digital grupo group ex legado ' +
    'conta global internacional international holding asset securities capital gestao ' +
    'participacoes seguros seguradora previdencia vida leasing arrendamento mercantil direto ' +
    'imobiliario nacional regional estado acesso solucoes plataforma com exchange brokers'
  ).split(' '),
);

/** Tokens que identificam a instituição ('morgan', 'pine', 'c6'...). */
export function tokensFortes(nome: string | null | undefined): string[] {
  const vistos = new Set<string>();
  for (const t of normalizarNomeInstituicao(nome).split(' ')) {
    if (t.length < 2 || PALAVRAS_FRACAS.has(t)) continue;
    vistos.add(t);
  }
  return [...vistos];
}

function contemFrase(maior: string, menor: string): boolean {
  return !!menor && ` ${maior} `.includes(` ${menor} `);
}

const MAX_CANDIDATOS_DUPLICATA = 8;

/** Motivo de marcar a linha que sobrou como não emissora, ou null. */
function motivoNaoEmissor(inst: InstituicaoCatalogo): MarcaNaoEmissor['motivo'] | null {
  const codigo = inst.codigo.trim().toUpperCase();
  if (CODIGO_PREFIXOS_NAO_EMISSOR.some((p) => codigo.startsWith(p))) return 'prefixo';
  const nome = normalizarNomeInstituicao(inst.nome);
  if (nome === 'reserva') return 'reserva';
  if (NOME_DE_CORRETORA.test(nome)) return 'nome-corretora';
  return null;
}

export function planejarImportacao(entrada: EntradaPlano): PlanoImportacao {
  const { existentes, participantes } = entrada;
  const mapaManual = entrada.mapaManual ?? {};
  const apelidosPorRaiz = entrada.apelidosPorRaiz ?? APELIDOS_POR_RAIZ;

  const registroPorRaiz = new Map<string, RegistroBacen>();
  for (const r of entrada.registros)
    if (!registroPorRaiz.has(r.raiz)) registroPorRaiz.set(r.raiz, r);

  const raizPorCompe = new Map<string, string>();
  for (const [raiz, p] of participantes) {
    if (p.compe && !raizPorCompe.has(p.compe)) raizPorCompe.set(p.compe, raiz);
  }

  // Nome normalizado → raízes (IF.data e nome extenso do STR), para a regra (c).
  const raizesPorNome = new Map<string, Set<string>>();
  const indexarNome = (nome: string, raiz: string) => {
    const n = normalizarNomeInstituicao(nome);
    if (!n) return;
    const s = raizesPorNome.get(n) ?? new Set<string>();
    s.add(raiz);
    raizesPorNome.set(n, s);
  };
  for (const r of registroPorRaiz.values()) {
    indexarNome(r.nome, r.raiz);
    const p = participantes.get(r.raiz);
    if (p?.nomeExtenso) indexarNome(p.nomeExtenso, r.raiz);
  }

  const plano: PlanoImportacao = {
    criar: [],
    preencherCnpj: [],
    preencherTipo: [],
    preencherConglomerado: [],
    preencherApelidos: [],
    marcarNaoEmissor: [],
    conflitos: [],
    ambiguos: [],
    possiveisDuplicatas: [],
    casamentos: [],
    apelidosSemRegistro: Object.keys(apelidosPorRaiz)
      .filter((r) => !registroPorRaiz.has(r))
      .sort(),
    resumo: undefined as unknown as PlanoImportacao['resumo'],
  };

  const raizesCasadas = new Set<string>();
  const comCnpjNoFim = new Set<string>(); // ids de existentes que terminam com cnpj
  const sobras: InstituicaoCatalogo[] = [];

  const ordenados = [...existentes].sort((a, b) => a.codigo.localeCompare(b.codigo));

  /** Tokens fortes do nome da linha que aparecem no Bacen (IF.data, STR e apelidos da raiz). */
  const tokensEmComum = (nome: string, raiz: string): string[] => {
    const p = participantes.get(raiz);
    const nomesBacen = [
      registroPorRaiz.get(raiz)?.nome ?? '',
      p?.nomeExtenso ?? '',
      p?.nomeReduzido ?? '',
      ...(apelidosPorRaiz[raiz] ?? []),
    ];
    const tokensBacen = new Set(nomesBacen.flatMap((n) => tokensFortes(n)));
    return tokensFortes(nome).filter((t) => tokensBacen.has(t));
  };

  /** Token forte em comum ou um nome normalizado contido no outro ('Banco do Brasil'). */
  const nomeBate = (nome: string, raiz: string): boolean => {
    if (tokensEmComum(nome, raiz).length > 0) return true;
    const n = normalizarNomeInstituicao(nome);
    const p = participantes.get(raiz);
    return [registroPorRaiz.get(raiz)?.nome, p?.nomeExtenso, p?.nomeReduzido].some((b) => {
      const nb = normalizarNomeInstituicao(b);
      return !!nb && (contemFrase(nb, n) || contemFrase(n, nb));
    });
  };

  const aplicarCasamento = (inst: InstituicaoCatalogo, raiz: string, regra: RegraCasamento) => {
    const reg = registroPorRaiz.get(raiz) ?? null;
    const base = { id: inst.id, codigo: inst.codigo, nome: inst.nome };

    if (inst.cnpj) {
      comCnpjNoFim.add(inst.id);
      const atual = cnpjRaiz(inst.cnpj);
      if (atual !== raiz) {
        // Só acontece via mapa manual: o cnpj gravado manda; nada é preenchido nesta linha.
        plano.conflitos.push({ ...base, campo: 'cnpj', atual: inst.cnpj, bacen: raiz, raiz });
        return;
      }
    } else {
      plano.preencherCnpj.push({ ...base, valor: cnpjMatriz(raiz) });
      comCnpjNoFim.add(inst.id);
    }

    raizesCasadas.add(raiz);
    plano.casamentos.push({
      ...base,
      raiz,
      regra,
      nomeBacen: reg?.nome ?? participantes.get(raiz)?.nomeExtenso ?? null,
      tcb: reg?.tcb ?? null,
      nomeEmComum: nomeBate(inst.nome, raiz),
    });

    if (reg) {
      if (!inst.tipoBacen) plano.preencherTipo.push({ ...base, valor: reg.tcb });
      else if (inst.tipoBacen !== reg.tcb) {
        plano.conflitos.push({
          ...base,
          campo: 'tipoBacen',
          atual: inst.tipoBacen,
          bacen: reg.tcb,
          raiz,
        });
      }
      if (reg.conglomerado) {
        if (!inst.conglomeradoBacen) {
          plano.preencherConglomerado.push({ ...base, valor: reg.conglomerado });
        } else if (inst.conglomeradoBacen !== reg.conglomerado) {
          plano.conflitos.push({
            ...base,
            campo: 'conglomeradoBacen',
            atual: inst.conglomeradoBacen,
            bacen: reg.conglomerado,
            raiz,
          });
        }
      }
    }

    const frases = frasesDeApelido(
      raiz,
      participantes.get(raiz)?.nomeReduzido,
      inst.nome,
      apelidosPorRaiz,
    );
    const depois = juntarApelidos(inst.apelidos, frases);
    if (depois && depois !== normalizarBusca(inst.apelidos)) {
      plano.preencherApelidos.push({ ...base, antes: inst.apelidos, depois });
    }
  };

  const ambiguo = (inst: InstituicaoCatalogo, motivo: string, raizes: string[]) => {
    plano.ambiguos.push({ id: inst.id, codigo: inst.codigo, nome: inst.nome, motivo, raizes });
  };

  for (const inst of ordenados) {
    const codigo = inst.codigo.trim();

    // (d) mapa manual sempre vence.
    const manual = mapaManual[codigo]?.trim();
    if (manual) {
      if (manual.toUpperCase() === TIPO_BACEN_NAO_EMISSOR) {
        if (inst.cnpj) comCnpjNoFim.add(inst.id);
        if (!inst.tipoBacen) {
          plano.marcarNaoEmissor.push({
            id: inst.id,
            codigo: inst.codigo,
            nome: inst.nome,
            motivo: 'mapa',
          });
        } else if (inst.tipoBacen !== TIPO_BACEN_NAO_EMISSOR) {
          plano.conflitos.push({
            id: inst.id,
            codigo: inst.codigo,
            nome: inst.nome,
            campo: 'tipoBacen',
            atual: inst.tipoBacen,
            bacen: TIPO_BACEN_NAO_EMISSOR,
            raiz: '',
          });
        }
        continue;
      }
      if (/^\d{8}$/.test(manual)) {
        aplicarCasamento(inst, manual, 'mapa');
        continue;
      }
      ambiguo(
        inst,
        `mapa manual inválido: "${manual}" (esperado raiz de 8 dígitos ou NAO_EMISSOR)`,
        [],
      );
      if (inst.cnpj) comCnpjNoFim.add(inst.id);
      sobras.push(inst);
      continue;
    }

    const nomeNorm = normalizarNomeInstituicao(inst.nome);
    const nomeDeCorretora = NOME_DE_CORRETORA.test(nomeNorm);

    // (a) já tem cnpj: casa pela raiz; sem registro ativo, fica como está. Trava: linha com nome
    // de corretora cujo cnpj aponta para um EMISSOR sem nenhum nome em comum (cnpj errado no
    // seed, ex. 'Avenue Securities DTVM' com a raiz do BB-BI) vai para ambíguos.
    if (inst.cnpj) {
      comCnpjNoFim.add(inst.id);
      const raiz = cnpjRaiz(inst.cnpj);
      const reg = raiz ? registroPorRaiz.get(raiz) : undefined;
      if (!raiz || !reg) {
        sobras.push(inst);
        continue;
      }
      if (
        nomeDeCorretora &&
        (TIPOS_BACEN_EMISSORES as readonly string[]).includes(reg.tcb) &&
        !nomeBate(inst.nome, raiz)
      ) {
        ambiguo(
          inst,
          `cnpj do catálogo é de ${reg.nome} (${reg.tcb}), sem nome em comum com a corretora`,
          [raiz],
        );
        sobras.push(inst);
        continue;
      }
      aplicarCasamento(inst, raiz, 'cnpj');
      continue;
    }

    // Linha criada por um import anterior (cnpj apagado por uma reversão).
    const bcb = /^BCB-(\d{8})$/.exec(codigo);
    if (bcb && registroPorRaiz.has(bcb[1])) {
      aplicarCasamento(inst, bcb[1], 'codigo-bcb');
      continue;
    }

    let motivoCompe: { motivo: string; raiz: string } | null = null;

    // (b) COMPE de 3 dígitos → STR → raiz do IF.data, com token forte em comum.
    if (/^\d{3}$/.test(codigo)) {
      const raiz = raizPorCompe.get(codigo);
      const reg = raiz ? registroPorRaiz.get(raiz) : undefined;
      if (raiz && reg) {
        if (nomeBate(inst.nome, raiz)) {
          if (nomeDeCorretora && (reg.tcb === 'B1' || reg.tcb === 'B2')) {
            ambiguo(
              inst,
              `COMPE ${codigo} é de ${reg.nome} (${reg.tcb}), mas o nome da linha é de corretora`,
              [raiz],
            );
            sobras.push(inst);
            continue;
          }
          aplicarCasamento(inst, raiz, 'compe');
          continue;
        }
        motivoCompe = {
          motivo: `COMPE ${codigo} é de ${reg.nome} (${reg.tcb}), sem nome em comum`,
          raiz,
        };
      }
    }

    // (c) nome normalizado idêntico ao de exatamente um registro.
    const candidatas = [...(raizesPorNome.get(nomeNorm) ?? [])];
    if (candidatas.length === 1) {
      aplicarCasamento(inst, candidatas[0], 'nome');
      continue;
    }
    if (candidatas.length > 1) {
      ambiguo(
        inst,
        `nome igual ao de ${candidatas.length} instituições do Bacen`,
        candidatas.sort(),
      );
      sobras.push(inst);
      continue;
    }
    if (motivoCompe) ambiguo(inst, motivoCompe.motivo, [motivoCompe.raiz]);
    sobras.push(inst);
  }

  // Sobras: marca as que não emitem (só se o tipo for nulo).
  for (const inst of sobras) {
    if (inst.tipoBacen) continue;
    const motivo = motivoNaoEmissor(inst);
    if (motivo) {
      plano.marcarNaoEmissor.push({ id: inst.id, codigo: inst.codigo, nome: inst.nome, motivo });
    }
  }

  // Linhas novas: toda raiz ativa que nenhuma linha existente casou.
  const codigosExistentes = new Set(existentes.map((e) => e.codigo.trim()));
  for (const reg of [...registroPorRaiz.values()].sort((a, b) => a.raiz.localeCompare(b.raiz))) {
    if (raizesCasadas.has(reg.raiz)) continue;
    const codigo = `BCB-${reg.raiz}`;
    if (codigosExistentes.has(codigo)) continue; // linha BCB- com cnpj de outra raiz: conflito já listado
    const p = participantes.get(reg.raiz);
    const nome = p?.nomeExtenso || reg.nome;
    const apelidos = juntarApelidos(
      null,
      frasesDeApelido(reg.raiz, p?.nomeReduzido, nome, apelidosPorRaiz),
    );
    plano.criar.push({
      codigo,
      nome,
      cnpj: cnpjMatriz(reg.raiz),
      cnpjCalculado: true,
      tipoBacen: reg.tcb,
      conglomeradoBacen: reg.conglomerado,
      apelidos: apelidos || null,
      status: 'ATIVA',
    });
  }

  plano.possiveisDuplicatas = acharPossiveisDuplicatas(existentes, comCnpjNoFim, plano.criar);
  plano.resumo = resumir(plano, entrada);
  return plano;
}

/**
 * Linhas existentes que terminam SEM cnpj contra todas as linhas do plano final que têm cnpj
 * (existentes, preenchidas e novas): nome normalizado contido (com token forte) ou token forte
 * em comum. Ex.: '655-IC BV Investimentos (Banco Votorantim)' × '655 Banco Votorantim'.
 */
function acharPossiveisDuplicatas(
  existentes: readonly InstituicaoCatalogo[],
  comCnpjNoFim: ReadonlySet<string>,
  criar: readonly LinhaNova[],
): PossivelDuplicata[] {
  interface Alvo {
    id: string | null;
    codigo: string;
    nome: string;
    norm: string;
    tokens: Set<string>;
  }
  const alvos: Alvo[] = [
    ...existentes
      .filter((e) => comCnpjNoFim.has(e.id))
      .map((e) => ({ id: e.id, codigo: e.codigo, nome: e.nome })),
    ...criar.map((c) => ({ id: null, codigo: c.codigo, nome: c.nome })),
  ].map((a) => ({
    ...a,
    norm: normalizarNomeInstituicao(a.nome),
    tokens: new Set(tokensFortes(a.nome)),
  }));

  // Índice token → alvos, para não comparar cada linha com ~2 mil.
  const porToken = new Map<string, Alvo[]>();
  for (const a of alvos) {
    for (const t of a.tokens) {
      const l = porToken.get(t) ?? [];
      l.push(a);
      porToken.set(t, l);
    }
  }

  const resultado: PossivelDuplicata[] = [];
  const semCnpj = [...existentes]
    .filter((e) => !comCnpjNoFim.has(e.id))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
  for (const inst of semCnpj) {
    const norm = normalizarNomeInstituicao(inst.nome);
    const tokens = tokensFortes(inst.nome);
    if (tokens.length === 0) continue;
    const vistos = new Map<Alvo, CandidatoDuplicata & { peso: number }>();
    for (const t of tokens) {
      for (const a of porToken.get(t) ?? []) {
        if (a.id === inst.id) continue;
        const atual = vistos.get(a);
        if (atual) {
          atual.tokens.push(t);
          atual.peso += 1;
          continue;
        }
        const contido = contemFrase(norm, a.norm) || contemFrase(a.norm, norm);
        vistos.set(a, {
          id: a.id,
          codigo: a.codigo,
          nome: a.nome,
          motivo: contido ? 'nome-contido' : 'tokens',
          tokens: [t],
          peso: contido ? 100 : 1,
        });
      }
    }
    if (vistos.size === 0) continue;
    const candidatos = [...vistos.values()]
      .sort((x, y) => y.peso - x.peso || x.codigo.localeCompare(y.codigo))
      .map(({ peso: _peso, ...c }) => c);
    resultado.push({
      id: inst.id,
      codigo: inst.codigo,
      nome: inst.nome,
      candidatos: candidatos.slice(0, MAX_CANDIDATOS_DUPLICATA),
      totalCandidatos: candidatos.length,
    });
  }
  return resultado;
}

function resumir(plano: PlanoImportacao, entrada: EntradaPlano): PlanoImportacao['resumo'] {
  const casadosPorRegra: Record<RegraCasamento, number> = {
    mapa: 0,
    cnpj: 0,
    'codigo-bcb': 0,
    compe: 0,
    nome: 0,
  };
  for (const c of plano.casamentos) casadosPorRegra[c.regra] += 1;
  const criarPorTipo: Record<string, number> = {};
  for (const c of plano.criar) criarPorTipo[c.tipoBacen] = (criarPorTipo[c.tipoBacen] ?? 0) + 1;
  const totalMudancas =
    plano.criar.length +
    plano.preencherCnpj.length +
    plano.preencherTipo.length +
    plano.preencherConglomerado.length +
    plano.preencherApelidos.length +
    plano.marcarNaoEmissor.length;
  return {
    registrosBacen: entrada.registros.length,
    existentes: entrada.existentes.length,
    casados: plano.casamentos.length,
    casadosPorRegra,
    criar: plano.criar.length,
    criarPorTipo,
    preencherCnpj: plano.preencherCnpj.length,
    preencherTipo: plano.preencherTipo.length,
    preencherConglomerado: plano.preencherConglomerado.length,
    preencherApelidos: plano.preencherApelidos.length,
    marcarNaoEmissor: plano.marcarNaoEmissor.length,
    conflitos: plano.conflitos.length,
    ambiguos: plano.ambiguos.length,
    possiveisDuplicatas: plano.possiveisDuplicatas.length,
    totalMudancas,
  };
}
