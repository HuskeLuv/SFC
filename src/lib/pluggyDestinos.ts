/**
 * Escolher o destino na importação Open Finance (out/2026) — CONTRATOS
 * compartilhados pelas fatias A-D. Desenho: docs/pluggy-importar-destino/
 * (decisoes.md prevalece sobre spec-desenho.json e prototipo.html).
 *
 * Puro: roda no cliente e no servidor (sem Prisma, sem fetch). NÃO tem regra de
 * destino nem texto de motivo: só LÊ o que a regra do mover devolve
 * (`ResumoDestinos` de resumoDestinos e `MoverOpcoesResponse` de obterOpcoesMover,
 * em src/services/portfolio/moverInvestimento.ts, sobre src/lib/carteiraMover.ts).
 *
 * Modelo ("entra e confere", decisão 1): a importação continua automática e o
 * investimento entra no lugar sugerido. Não há status novo de importação: a
 * coluna aditiva `BankInvestment.destinoConfirmadoEm` significa "o usuário
 * confirmou ou não há o que escolher". O destino continua morando em
 * Portfolio.categoriaOverride e nas colunas de subgrupo do mover.
 *
 * Situação de cada item (calculada SÓ no servidor, `SituacaoDestino`):
 *  - 'para-revisar'    importado, ativo, Portfolio existe, destinoConfirmadoEm null
 *                      e revisável (`revisavelDoResumo`).
 *  - 'confirmado'      revisável com a coluna preenchida → "Na Carteira em <aba › seção>".
 *  - 'fixo'            importado e não revisável (previdência, não movível) → "Fica em <aba>".
 *  - 'ja-estava'       vinculado → "Já estava na Carteira — continua onde está".
 *  - 'sem-suporte'     → "Cadastre à mão" (mantém as ações de hoje, como Ignorar).
 *  - 'fora-da-carteira' a posição foi apagada; não entra na fila nem na contagem.
 *
 * Chave PLUGGY_DESTINOS_HABILITADO (`pluggyDestinosHabilitado`), DESLIGADA por
 * padrão. Desligada: nada visível muda (payloads de hoje, sem campos novos); a
 * classificação (fatia A) roda mesmo assim e só grava a coluna. A UI decide
 * pelos dados que recebe, NUNCA pela env. Desligar não perde escolhas feitas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRATOS HTTP. Rotas em src/app/api/pluggy/** (runtime nodejs, force-dynamic,
 * withErrorHandler). Auth: requireProprioUsuarioPluggyAuth (fatia B) — 503 com
 * a integração Pluggy desligada, 403 para consultor agindo por cliente (decisão
 * 10: ajusta pelo Mover na Carteira). Posse por targetUserId. POST passa pelo
 * CSRF do middleware: o cliente chama com csrfFetch e, no sucesso, invalida
 * queryKeys.pluggy.destinos(), pluggy.carteira(), historicoAlteracoes.all e
 * invalidatePortfolioDerivedQueries(queryClient).
 *
 * 1) GET /api/pluggy/carteira/destinos?connectionId=<uuid>&paraRevisar=1  (B → A)
 *    query: `destinosQuerySchema` (400 se inválida) → 200 `DestinosImportadosResponse`,
 *    Cache-Control no-store. Chave desligada → { habilitado:false, itens:[], paraRevisar:0 }.
 *    Serviço: listarDestinosImportados(userId, {connectionId?, somenteParaRevisar?})
 *    (src/services/pluggy/destinosImportacao.ts). Itens ativos em importado/vinculado/
 *    sem-suporte, ordem GRUPOS_DESTINO e saldo desc; `opcoes` (obterOpcoesMover,
 *    comSaude false) só em 'para-revisar'; `via`/`confira` só em 'para-revisar'
 *    sem override; marca de passagem os não revisáveis (como classificarDestinos).
 *
 * 2) POST /api/pluggy/carteira/destinos                                     (B → A)
 *    body: `aplicarDestinosSchema` — { itens:[{id, categoria, subgrupo?}], confirmarIds }.
 *      itens = só o que mudou; confirmarIds = os 'para-revisar' que o usuário VIU
 *      (inclusive os mantidos), NUNCA "todos do escopo" (decisão 7).
 *    JSON inválido / zod → 400. Chave desligada → 404 'Recurso indisponível'.
 *    Fase 1 (valida TUDO antes de gravar): posse + situação 'para-revisar' +
 *      planejarMover (mesmas checagens 409/400 do POST /api/carteira/mover, sem
 *      gravar). Qualquer falha → 409 `AplicarDestinosErro409` e NADA muda
 *      ("Nenhum investimento mudou de lugar"). Situação: 'Este investimento já
 *      foi conferido ou não está mais na Carteira'.
 *    Fase 2: moverInvestimento por item (revalida). Sucesso/noop → destinoConfirmadoEm=now.
 *      Falha aqui (só por concorrência) → 200 com parcial:true e erros[] por item.
 *    Depois: confirma confirmarIds (do usuário, ainda null, fora dos itens com erro).
 *    → 200 `AplicarDestinosResponse`. Com aplicados>0: invalidateCaixaCaches +
 *      invalidarContextoUsuario e, por item aplicado (não noop), UserChangeLog
 *      { section:'carteira', action: ACAO_DESTINO_IMPORTACAO, entity:'portfolio',
 *        entityId: portfolioId, changes: moverChanges, snapshot: buildMoverSnapshot }
 *      — FORA de MOVER_ACTIONS_LIST (sem selo "movido"). Rótulo no Histórico:
 *      "Escolheu onde fica <ativo>, importado do banco" ("lugar que você escolheu",
 *      nunca "destino original": o "Voltar ao original" do Mover segue o catálogo).
 *
 * 3) POST /api/historico-alteracoes/{id}/undo (rota existente)               (B)
 *    Handler destinoImportacaoDesfazer = lógica de moverDesfazer + zera
 *    destinoConfirmadoEm do BankInvestment (userId, portfolioId=entityId, importado):
 *    o item volta à sugestão E à fila. Linha movida de novo → 409 sem zerar.
 *    O toast "Desfazer" chama um undo por historicoId, em ordem reversa.
 *
 * 4) GET /api/pluggy/carteira (rota existente)                              (B)
 *    Chave ligada: cada investimento ganha `destino: DestinoAtualResumo | null` e
 *    `situacaoDestino: SituacaoDestino`; a resposta ganha `paraRevisar: number`.
 *    Chave desligada: payload idêntico ao de hoje.
 *
 * 5) POST /api/pluggy/carteira/importar (rota existente)                    (B)
 *    Depois de importarPendentes chama classificarDestinos e responde
 *    { ...resultado, paraRevisar } (0 com a chave desligada).
 *
 * 6) Resumo da 1ª conexão (sync.ts, fatia A): ResumoImportado ganha
 *    `investimentosParaRevisar: number` (contarParaRevisar; 0 com a chave desligada).
 *    "Conexão realizada" continua a 1ª tela (texto jurídico intacto) e ganha
 *    "Escolher onde ficam (N)" (fatia D); voltar/salvar volta ao resumo.
 *
 * Cliente (fatias C/D): useDestinosImportacao.ts com queryKeys.pluggy.destinos(connectionId?);
 * a revisão monta o POST com `escolhaValeParaItem` e o lote com `intersecaoDestinos`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';
import {
  CATEGORIAS_MOVIVEIS_TODAS,
  type CategoriaMovivel,
  type DestinoOpcao,
  type MoverOpcoesResponse,
} from '@/lib/carteiraMover';
import type { CategoriaCarteira } from '@/services/portfolio/itemValuation';

// ── Chave ────────────────────────────────────────────────────────────────────

/**
 * PLUGGY_DESTINOS_HABILITADO="true" libera a escolha do destino. Mesmo regime de
 * MOVER_CAIXA_RF_HABILITADO / PLUGGY_HABILITADO: env lida em RUNTIME no servidor;
 * desligar = mudar a env + restart, sem PR. No CLIENTE devolve sempre false (a
 * env não é NEXT_PUBLIC): a UI decide pelos dados do servidor.
 */
export function pluggyDestinosHabilitado(): boolean {
  if (typeof process === 'undefined' || !process.env) return false;
  return process.env.PLUGGY_DESTINOS_HABILITADO === 'true';
}

// ── Constantes ───────────────────────────────────────────────────────────────

/** Ação do histórico da escolha na importação (fora de MOVER_ACTIONS_LIST: sem selo). */
export const ACAO_DESTINO_IMPORTACAO = 'investimento.destinoImportacao' as const;

/** Limite por chamada: itens do POST, confirmarIds e classificação por usuário. */
export const MAX_ITENS_DESTINO = 200;

export const SITUACOES_DESTINO = [
  'para-revisar',
  'confirmado',
  'fixo',
  'ja-estava',
  'sem-suporte',
  'fora-da-carteira',
] as const;

export type SituacaoDestino = (typeof SITUACOES_DESTINO)[number];

/**
 * De onde veio a sugestão (só em 'para-revisar' sem override):
 * FII → catalogo | nome | padrao (origemTipoFiiImportado); RF → indexador | titulo
 * (secaoRendaFixaDoItem.via); fundo → tipoFundo; ação/ETF/usd → padrao.
 */
export type ViaSugestao = 'catalogo' | 'nome' | 'padrao' | 'indexador' | 'titulo' | 'tipoFundo';

const ROTULO_VIA: Record<ViaSugestao, string> = {
  catalogo: 'pelo catálogo da CVM',
  nome: 'pelo nome',
  padrao: 'estratégia padrão',
  indexador: 'pelo indexador',
  titulo: 'pelo tipo do título',
  tipoFundo: 'pelo tipo do fundo',
};

/** Linha de origem da sugestão ("Entra na Carteira em … · pelo nome"). */
export const rotuloVia = (via: ViaSugestao): string => ROTULO_VIA[via];

/**
 * Faixas da revisão (protótipo: grupos pela aba sugerida), na ordem de exibição.
 * 'rf' = Renda Fixa ou uma das Reservas; 'previdencia' = itens fixos (sem escolha).
 */
export const GRUPOS_DESTINO = [
  'acoes',
  'fiis',
  'etfs',
  'stocks',
  'reits',
  'rf',
  'fundos',
  'previdencia',
  'ja-estava',
  'sem-suporte',
] as const;

export type GrupoDestino = (typeof GRUPOS_DESTINO)[number];

export const ROTULO_GRUPO_DESTINO: Record<GrupoDestino, string> = {
  acoes: 'Ações',
  fiis: "FII's",
  etfs: "ETF's",
  stocks: 'Stocks',
  reits: "REIT's",
  rf: 'Renda fixa',
  fundos: 'Fundos',
  previdencia: 'Previdência',
  'ja-estava': 'Já estavam na Carteira',
  'sem-suporte': 'Para cadastrar à mão',
};

// ── Resumo da regra do mover (produzido por resumoDestinos, fatia A) ─────────

export interface ResumoDestinoAba {
  categoria: CategoriaMovivel;
  permitido: boolean;
  motivo?: string;
  /** SUBGRUPO_EDITAVEL[categoria] — independente da chave da fase 2. */
  subgrupoEditavel: boolean;
  /** SUBGRUPOS_POR_CATEGORIA[categoria].length */
  qtdSubgrupos: number;
}

/**
 * Forma devolvida por resumoDestinos(item) em moverInvestimento.ts: o miolo de
 * obterOpcoesMover, sem I/O, sem valor/Saúde/original.
 */
export interface ResumoDestinos {
  movivel: boolean;
  motivo?: string;
  atual: {
    /** Aba exibida (com override; para item fixo, a de categorizarAsset). */
    categoria: CategoriaCarteira;
    /** Aba base do catálogo (null = item fixo). */
    base: CategoriaMovivel | null;
    subgrupo: string | null;
    override: boolean;
  };
  destinos: ResumoDestinoAba[];
}

/**
 * Revisável = movível E (há outra aba permitida OU a aba atual tem mais de uma
 * seção escolhível). Única regra de "para conferir" — vem toda do mover.
 */
export function revisavelDoResumo(r: ResumoDestinos): boolean {
  if (!r.movivel) return false;
  const trocaAba = r.destinos.some((d) => d.permitido && d.categoria !== r.atual.categoria);
  if (trocaAba) return true;
  const daAba = r.destinos.find((d) => d.categoria === r.atual.categoria);
  return !!daAba && daAba.subgrupoEditavel && daAba.qtdSubgrupos > 1;
}

// ── Zod ──────────────────────────────────────────────────────────────────────

const uuidSchema = z.string().uuid();

/** GET /api/pluggy/carteira/destinos */
export const destinosQuerySchema = z.object({
  connectionId: uuidSchema.optional(),
  paraRevisar: z.enum(['1']).optional(),
});

export type DestinosQuery = z.infer<typeof destinosQuerySchema>;

/** POST /api/pluggy/carteira/destinos */
export const aplicarDestinosSchema = z
  .object({
    itens: z
      .array(
        z.object({
          /** BankInvestment.id */
          id: uuidSchema,
          categoria: z.enum(CATEGORIAS_MOVIVEIS_TODAS),
          subgrupo: z.string().trim().min(1).max(32).optional(),
        }),
      )
      .max(MAX_ITENS_DESTINO),
    confirmarIds: z.array(uuidSchema).max(MAX_ITENS_DESTINO).default([]),
  })
  .refine((b) => b.itens.length + b.confirmarIds.length > 0, {
    message: 'Nada para salvar',
  })
  .refine((b) => new Set(b.itens.map((i) => i.id)).size === b.itens.length, {
    message: 'Investimento repetido',
    path: ['itens'],
  });

/** Corpo já validado (confirmarIds com default). */
export type AplicarDestinosInput = z.infer<typeof aplicarDestinosSchema>;
/** Corpo que o cliente envia (confirmarIds opcional). */
export type AplicarDestinosBody = z.input<typeof aplicarDestinosSchema>;

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface DestinoAtualResumo {
  categoria: CategoriaCarteira;
  abaId: string;
  /** rotuloCategoria */
  label: string;
  subgrupoLabel: string | null;
  /** "FII's › Tijolo" (ou só a aba, sem seção). */
  rotulo: string;
}

export interface DestinoImportadoItem {
  bankInvestmentId: string;
  portfolioId: string | null;
  connectionId: string;
  banco: string;
  nome: string;
  ticker: string | null;
  saldo: number;
  /** Faixa da revisão. */
  grupo: GrupoDestino;
  situacao: SituacaoDestino;
  atual: DestinoAtualResumo | null;
  via: ViaSugestao | null;
  /** Baixa confiança: via 'padrao' na aba FII's (ex.: Fiagro caindo em Tijolo). */
  confira: boolean;
  /** Só em 'para-revisar' (GET /api/carteira/mover, comSaude false). */
  opcoes: MoverOpcoesResponse | null;
  /** Frase dos itens sem escolha ("Fica em …", "Já estava na Carteira…", "Cadastre à mão"). */
  texto?: string;
}

export interface DestinosImportadosResponse {
  habilitado: boolean;
  itens: DestinoImportadoItem[];
  paraRevisar: number;
}

export interface ErroDestinoItem {
  /** BankInvestment.id */
  id: string;
  nome: string;
  motivo: string;
}

export interface AplicarDestinosResponse {
  aplicados: number;
  semMudanca: number;
  confirmados: number;
  parcial: boolean;
  erros: ErroDestinoItem[];
  historicoIds: string[];
}

export interface AplicarDestinosErro409 {
  error: string;
  erros: ErroDestinoItem[];
}

// ── Leitura das opções do mover (cliente e serviço) ──────────────────────────

/**
 * ok:true → `subgrupo` a enviar (null = a aba não tem seção escolhível: Reservas
 * e Renda Fixa, onde o servidor deriva a seção). ok:false → `motivo` vindo do
 * servidor (null quando a aba nem foi oferecida para o item).
 */
export type EscolhaDestino =
  | { ok: true; subgrupo: string | null }
  | { ok: false; motivo: string | null };

/**
 * A escolha (aba + seção) vale para este item? Lê só `opcoes.destinos`; uma
 * seção inexistente na aba cai em `subgrupoSugerido`.
 */
export function escolhaValeParaItem(
  opcoes: MoverOpcoesResponse,
  categoria: CategoriaMovivel,
  subgrupo?: string | null,
): EscolhaDestino {
  if (!opcoes.movivel) return { ok: false, motivo: opcoes.motivo ?? null };
  const destino = opcoes.destinos.find((d) => d.categoria === categoria);
  if (!destino) return { ok: false, motivo: null };
  if (!destino.permitido) return { ok: false, motivo: destino.motivo ?? null };
  if (destino.subgrupoEditavel === false || destino.subgrupos.length === 0) {
    return { ok: true, subgrupo: null };
  }
  const existe = subgrupo != null && destino.subgrupos.some((s) => s.id === subgrupo);
  return { ok: true, subgrupo: existe ? subgrupo : destino.subgrupoSugerido };
}

export interface DestinoComum {
  categoria: CategoriaMovivel;
  label: string;
  /** Seções comuns a todos ([] quando a aba não tem seção escolhível). */
  subgrupos: { id: string; label: string }[];
}

/**
 * Destinos do lote: abas com `permitido` em TODOS os itens (na ordem do 1º) e,
 * em cada uma, só as seções que existem em todos. Lista vazia = sem destino em
 * comum (a barra pede troca item a item).
 */
export function intersecaoDestinos(lista: readonly MoverOpcoesResponse[]): DestinoComum[] {
  if (lista.length === 0) return [];
  const [primeiro, ...resto] = lista;
  const comuns: DestinoComum[] = [];
  for (const d of primeiro.destinos) {
    if (!d.permitido) continue;
    const dosOutros = resto.map((o) => o.destinos.find((x) => x.categoria === d.categoria));
    if (dosOutros.some((x) => !x || !x.permitido)) continue;
    const todos = [d, ...dosOutros.filter((x): x is DestinoOpcao => x !== undefined)];
    const semSecao = todos.some((x) => x.subgrupoEditavel === false || x.subgrupos.length === 0);
    const subgrupos = semSecao
      ? []
      : d.subgrupos
          .filter((s) => todos.every((x) => x.subgrupos.some((y) => y.id === s.id)))
          .map((s) => ({ id: s.id, label: s.label }));
    comuns.push({ categoria: d.categoria, label: d.label, subgrupos });
  }
  return comuns;
}
